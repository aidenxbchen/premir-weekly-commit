import { useEffect, useState } from 'react';
import { docTitleApi } from '@/api';
import { MarkdownContent } from './MarkdownContent';

// 和 server/modules/doc-title/doc-title.service.ts 里的正则保持一致：前端负责"找到
// 链接并替换"，后端负责"取标题"。两边拆开是因为标题必须由后端拿（要 access token），
// 而替换必须在前端做（要保持文本原有的换行与顺序）。
const DOC_URL_RE = /https?:\/\/[\w.-]+\.(?:feishu\.cn|larksuite\.com)\/(docx|wiki)\/([A-Za-z0-9]+)(?:\?[^\s)\]}>，。；、]*)?(?:#[^\s)\]}>，。；、]*)?/g;

function keyOf(kind: string, token: string): string {
  return `${kind === 'wiki' ? 'wiki' : 'docx'}:${token}`;
}

// 进程内共享一份标题缓存：同一页里多个承诺引用同一个文档时只请求一次。
const cache = new Map<string, string>();

// 攒请求：以前每个 DocLinkText 实例各发一次 POST /api/doc-titles，而一页上
// 「交付物 + 依赖与风险」这种字段动辄几十个，十几条文档链接就是十几次请求叠在
// 首屏上——内部页面"打开要等一秒"主要就是被这些请求拖的。现在同一轮挂载的所有
// 实例把文本并起来，只发一次；单次请求的文档上限也一并放宽了（服务端按 ref 去重）。
const pending = new Set<string>();
const listeners = new Set<() => void>();
let scheduled = false;

function hasUnresolvedRef(text: string): boolean {
  for (const m of text.matchAll(DOC_URL_RE)) {
    if (!cache.has(keyOf(m[1], m[2]))) return true;
  }
  return false;
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  // 让同一帧里挂载的实例都并进来，再发一次请求。
  setTimeout(() => {
    scheduled = false;
    void flush();
  }, 0);
}

async function flush(): Promise<void> {
  const batch = [...pending];
  pending.clear();
  const wanted = batch.filter(hasUnresolvedRef);
  if (wanted.length === 0) return;
  try {
    const { titles } = await docTitleApi.resolveDocTitles(wanted);
    const entries = Object.entries(titles);
    if (entries.length === 0) return;
    entries.forEach(([k, v]) => cache.set(k, v));
    listeners.forEach((notify) => notify());
  } catch {
    // 拿不到标题不是错误路径：正文照常显示原始链接即可。
  }
}

export function useDocTitles(texts: string[]): Map<string, string> {
  const [, force] = useState(0);
  const joined: string = texts.join('\n');

  useEffect(() => {
    const notify = (): void => force((n) => n + 1);
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  }, []);

  useEffect(() => {
    if (!joined || !hasUnresolvedRef(joined)) return;
    pending.add(joined);
    schedule();
  }, [joined]);

  return cache;
}

// 所有展示处使用同一份 Markdown 排版；飞书链接继续复用批量标题查询缓存。
export function DocLinkText({ text }: { text: string }) {
  useDocTitles([text]);
  return <MarkdownContent text={text} renderLink={(href, children, automaticLabel) => {
    const match = [...href.matchAll(DOC_URL_RE)][0];
    const title = match && automaticLabel ? cache.get(keyOf(match[1], match[2])) : undefined;
    return <a href={href} target="_blank" rel="noopener noreferrer" className="doc-link" title={href}>
      {title ?? children}
    </a>;
  }} />;
}
