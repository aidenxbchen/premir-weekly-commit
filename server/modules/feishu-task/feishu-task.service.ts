import { Injectable, Logger } from '@nestjs/common';
import { AuthNPaasService } from '@lark-apaas/fullstack-nestjs-core';

interface TenantAccessTokenResponse {
  code: number;
  msg: string;
  tenant_access_token?: string;
  expire?: number;
}

interface CreateTaskResponse {
  code: number;
  msg: string;
  data?: { task?: { guid?: string } };
}

// 每条交付物保存时同步创建一条飞书任务，方便负责人/管理员在飞书里直接跟进——
// 这是妙搭平台目前没有原生"创建任务"插件覆盖的能力，直接调飞书开放 API，
// 用旧项目那套自建应用凭据（FEISHU_APP_ID/FEISHU_APP_SECRET，走 tenant_access_token）。
@Injectable()
export class FeishuTaskService {
  private readonly logger = new Logger(FeishuTaskService.name);
  private cachedToken: { token: string; expiresAt: number } | undefined;

  constructor(private readonly authnService: AuthNPaasService) {}

  private async getTenantAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.cachedToken && this.cachedToken.expiresAt > now + 60_000) {
      return this.cachedToken.token;
    }
    const appId = process.env.FEISHU_APP_ID;
    const appSecret = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) throw new Error('missing_feishu_app_credentials');

    const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    });
    const body: TenantAccessTokenResponse = await res.json();
    if (body.code !== 0 || !body.tenant_access_token) {
      throw new Error(`feishu_token_failed:${body.code}:${body.msg}`);
    }
    this.cachedToken = { token: body.tenant_access_token, expiresAt: now + (body.expire ?? 7200) * 1000 };
    return this.cachedToken.token;
  }

  // 妙搭 userId -> 飞书 user_id（employee_id）。转换失败（该用户没有关联飞书账号）
  // 时返回 null，调用方应跳过任务创建而不是抛错阻塞主流程。
  private async resolveLarkUserId(miaodaUserId: string): Promise<string | null> {
    const [larkUserId] = await this.authnService.getBatchLarkUserIds([miaodaUserId]);
    return larkUserId ?? null;
  }

  // week 落在的自然周一 00:00 / 周日 23:59:59（毫秒时间戳字符串），供 due/start 使用。
  // 逻辑和 week.service.ts 的 TEAM_WEEK_OFFSET 换算保持一致——团队的 "Wxx" 编号比
  // 标准 ISO 周数少 1。
  private weekDateRangeMs(week: string, now: Date = new Date()): { startMs: number; endMs: number } {
    const teamWeekNumber = Number(week.slice(1));
    const isoWeek = teamWeekNumber + 1;
    const year = now.getUTCFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4Day = jan4.getUTCDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
    const monday = new Date(week1Monday);
    monday.setUTCDate(week1Monday.getUTCDate() + (isoWeek - 1) * 7);
    const sunday = new Date(monday);
    sunday.setUTCDate(monday.getUTCDate() + 6);
    sunday.setUTCHours(23, 59, 59, 0);
    return { startMs: monday.getTime(), endMs: sunday.getTime() };
  }

  // 交付物保存时调用；失败只记录日志，不抛给调用方——飞书任务是辅助跟进手段，
  // 不应该因为飞书那边偶发问题就拦住团队成员保存自己的周承诺。
  async createDeliverableTask(params: {
    ownerMiaodaUserId: string;
    week: string;
    moduleLabel: string;
    deliverable: string;
    criteria?: string;
    // 交付物自己填的开始/截止时间（ISO 字符串）——有就必须用这个，不能用整周
    // 的时间兜底：之前一直只按 week 算"周一到周日"当任务起止时间，完全没看
    // 交付物本身填的时间，导致飞书任务显示的时间跟系统里录入的对不上。
    startTime?: string;
    endTime?: string;
  }): Promise<void> {
    try {
      const larkUserId = await this.resolveLarkUserId(params.ownerMiaodaUserId);
      if (!larkUserId) {
        this.logger.log(`skip task creation, no lark user for ${params.ownerMiaodaUserId}`);
        return;
      }
      const token = await this.getTenantAccessToken();
      const { startMs, endMs } =
        params.startTime && params.endTime
          ? { startMs: new Date(params.startTime).getTime(), endMs: new Date(params.endTime).getTime() }
          : this.weekDateRangeMs(params.week);

      const res = await fetch('https://open.feishu.cn/open-apis/task/v2/tasks?user_id_type=user_id', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          summary: `[${params.moduleLabel}] ${params.deliverable}`.slice(0, 3000),
          description: (params.criteria ? `验收标准：${params.criteria}` : '').slice(0, 3000),
          start: { timestamp: String(startMs) },
          due: { timestamp: String(endMs) },
          members: [{ id: larkUserId, type: 'user', role: 'assignee' }],
        }),
      });
      const body: CreateTaskResponse = await res.json();
      if (body.code !== 0) {
        this.logger.error(`create feishu task failed: ${JSON.stringify(body)}`);
        return;
      }
      this.logger.log(`created feishu task ${body.data?.task?.guid} for ${params.ownerMiaodaUserId}`);
    } catch (err) {
      this.logger.error(`create feishu task threw: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
