import { Injectable, Logger } from '@nestjs/common';

// 周承诺里经常直接粘飞书文档链接，一长串 URL 既占地方又看不出是什么。这里把链接
// 换成文档标题，前端再套上超链接——标题本身就是最好的链接文案。
//
// 沿用 feishu-task.service 那套自建应用凭据（tenant_access_token），没有引入新的
// 认证方式。标题按 (类型, token) 缓存，进程内即可——同一个文档在一页里往往出现
// 多次，缓存能省掉绝大部分请求。
type DocKind = 'docx' | 'wiki';

export interface DocRef {
  kind: DocKind;
  token: string;
}

const DOC_URL_RE = /https?:\/\/[\w.-]+\.(?:feishu\.cn|larksuite\.com)\/(docx|wiki)\/([A-Za-z0-9]+)/g;
// 前端现在把一整页的文本攒成一次请求发过来（见 client/src/components/DocLinkText.tsx），
// 所以这里按"一页最多有多少个不同文档"放宽。标题按 ref 缓存 6 小时，重复请求本来就不打
// 飞书接口；真正要防的是有人拿这个接口当爬虫，所以上限仍然存在。
const MAX_REFS_PER_REQUEST = 80;
// 飞书那边一次并行太多不太好，分批拉，每批 10 个。
const REF_FETCH_BATCH = 10;
const FAILED_CACHE_TTL_MS = 60_000;

// 从一段文本里抽出所有飞书文档引用。同一种 token 只留一份，避免重复请求。
export function extractDocRefs(text: string): DocRef[] {
  const found = new Map<string, DocRef>();
  for (const m of text.matchAll(DOC_URL_RE)) {
    const kind: DocKind = m[1] === 'wiki' ? 'wiki' : 'docx';
    const token: string = m[2];
    found.set(`${kind}:${token}`, { kind, token });
  }
  return [...found.values()];
}

@Injectable()
export class DocTitleService {
  private readonly logger = new Logger(DocTitleService.name);
  private cachedToken: { token: string; expiresAt: number } | undefined;
  private readonly titles = new Map<string, { title: string | null; expiresAt: number }>();

  private async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) return this.cachedToken.token;
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) throw new Error('missing_feishu_app_credentials');
    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const body = (await res.json()) as { code: number; msg: string; tenant_access_token?: string; expire?: number };
    if (body.code !== 0 || !body.tenant_access_token) throw new Error(`feishu_token_failed:${body.code}:${body.msg}`);
    this.cachedToken = { token: body.tenant_access_token, expiresAt: now + (body.expire ?? 7200) * 1000 };
    return this.cachedToken.token;
  }

  private async fetchTitle(ref: DocRef, token: string): Promise<string | null> {
    const auth = { Authorization: `Bearer ${token}` };
    try {
      if (ref.kind === 'wiki') {
        // wiki 链接给的是 node_token，要先换成真正承载内容的 obj_token 才能读标题。
        const nodeRes = await fetch(`https://open.feishu.cn/open-apis/wiki/v2/spaces/get_node?token=${ref.token}`, { headers: auth });
        const node = (await nodeRes.json()) as { code: number; data?: { node?: { title?: string } } };
        if (node.code !== 0) return null;
        return node.data?.node?.title ?? null;
      }
      const res = await fetch(`https://open.feishu.cn/open-apis/docx/v1/documents/${ref.token}`, { headers: auth });
      const body = (await res.json()) as { code: number; data?: { document?: { title?: string } } };
      if (body.code !== 0) return null;
      return body.data?.document?.title ?? null;
    } catch (e) {
      this.logger.warn(`doc title failed for ${ref.kind}:${ref.token}: ${(e as Error).message}`);
      return null;
    }
  }

  // 返回 { "<kind>:<token>": title }。拿不到标题的不放进结果，前端仍会显示一个
  // 可点击的简短文档标签，既保留入口，也不会让长 URL 撑破布局。
  async resolve(refs: DocRef[]): Promise<Record<string, string>> {
    const uniqueRefs = refs.slice(0, MAX_REFS_PER_REQUEST);
    const now = Date.now();
    const missing: DocRef[] = uniqueRefs.filter((r: DocRef) => {
      const cached = this.titles.get(`${r.kind}:${r.token}`);
      return !cached || cached.expiresAt <= now;
    });
    if (missing.length > 0) {
      const token: string = await this.getTenantAccessToken();
      for (let i = 0; i < missing.length; i += REF_FETCH_BATCH) {
        await Promise.all(
          missing.slice(i, i + REF_FETCH_BATCH).map(async (r: DocRef) => {
            const title = await this.fetchTitle(r, token);
            this.titles.set(`${r.kind}:${r.token}`, {
              title,
              expiresAt: Date.now() + (title ? 6 * 60 * 60_000 : FAILED_CACHE_TTL_MS),
            });
          }),
        );
      }
    }
    const out: Record<string, string> = {};
    for (const r of uniqueRefs) {
      const key = `${r.kind}:${r.token}`;
      const cached = this.titles.get(key);
      if (cached?.title) out[key] = cached.title;
    }
    return out;
  }
}
