import { useEffect, useRef, useState } from 'react';
import { useCommentInbox } from './CommentInbox';
import { useVisibleComments } from '@/hooks/useVisibleComments';
import { ArrowUp, MessageSquare, Trash2 } from 'lucide-react';
import { commentsApi } from '@/api';
import { useApiCache, mutateApiCache, invalidateApiCache } from '@/utils/api-cache';
import { errorMessage } from '@/utils/error';
import { formatTime } from '@/utils/datetime';
import { ImeTextarea } from './ImeSafeText';
import { DocLinkText } from './DocLinkText';
import { UserDisplay } from './business-ui/user-display';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { CommentRecord, CommentTargetType, ListCommentsResponse } from '@shared/api.interface';

export function commentThreadKey(targetType: CommentTargetType, targetId: string): string {
  return `comments:${targetType}:${targetId}`;
}

// 卡片右上角那枚"消息气泡"：点开就是这条内容下面的讨论。
// 图标用线条消息气泡（和页面其它图标同一套线性风格）；有讨论时数字贴在旁边，
// 一眼能看出哪几条内容有人在说。没打开过的卡片不会发请求——讨论面板只在展开时挂载。
export function CommentThread({
  targetType,
  targetId,
  meUserId,
  count = 0,
  className,
}: {
  targetType: CommentTargetType;
  targetId: string;
  meUserId: string;
  count?: number;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { items: inbox } = useCommentInbox();
  const unread = inbox.find((item) => item.targetType === targetType && item.targetId === targetId)?.unreadIds.length ?? 0;
  const has: boolean = count > 0;
  const label = unread ? `${unread} 条未读评论，查看讨论` : has ? `查看讨论（${count} 条）` : '写下你的看法';
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={`comment-trigger${has ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
          title={label}
          aria-label={label}
        >
          {/* 线条消息气泡，和页面其它图标同一套风格；有讨论时数字贴在旁边 */}
          <MessageSquare className="size-3.5" aria-hidden="true" />
          {unread > 0 && <span className="comment-unread-dot trigger-unread-dot" />}
          {has && <span className="comment-count">{count > 99 ? '99+' : count}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} collisionPadding={14} className="comment-popover">
        {/* 面板只在打开时挂载，所以讨论内容也只在打开时请求 */}
        {open && <CommentThreadPanel targetType={targetType} targetId={targetId} meUserId={meUserId} />}
      </PopoverContent>
    </Popover>
  );
}

export function CommentThreadPanel({
  targetType,
  targetId,
  meUserId,
  focusCommentId,
}: {
  targetType: CommentTargetType;
  targetId: string;
  meUserId: string;
  focusCommentId?: string;
}) {
  const key = `${commentThreadKey(targetType, targetId)}:${meUserId}`;
  const { refresh } = useCommentInbox();
  const { data, loaded, error } = useApiCache<ListCommentsResponse>(key, () => commentsApi.listComments(targetType, targetId), 15_000);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [postError, setPostError] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const items: CommentRecord[] = data?.items ?? [];

  const { highlighted, readError } = useVisibleComments(listRef, items, targetType, targetId, loaded && !error, focusCommentId);
  const didPosition = useRef(false);
  const previousHeight = useRef(0);
  const previousCount = useRef(0);
  useEffect(() => {
    invalidateApiCache(key);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') invalidateApiCache(key);
    }, 20_000);
    return () => clearInterval(timer);
  }, [key]);

  // 新消息进来就滚到底——和聊天窗口一样，最新的永远在视线里
  useEffect(() => {
    const box = listRef.current;
    if (!box) return;
    const focusId = focusCommentId ?? highlighted[0];
    const row = [...box.querySelectorAll<HTMLElement>('[data-comment-id]')].find((element) => element.dataset.commentId === focusId);
    if (!didPosition.current && row) {
      box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - 20;
      didPosition.current = true;
    } else if (!didPosition.current && items.length) {
      box.scrollTop = box.scrollHeight;
      didPosition.current = true;
    } else if (items.length > previousCount.current && (
      items[items.length - 1]?.authorUserId === meUserId || box.scrollTop + box.clientHeight >= previousHeight.current - 50
    )) {
      box.scrollTop = box.scrollHeight;
    }
    previousHeight.current = box.scrollHeight;
    previousCount.current = items.length;
  }, [items.length, key, focusCommentId, highlighted, meUserId]);

  async function send(): Promise<void> {
    const body: string = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setPostError('');
    try {
      const { record } = await commentsApi.createComment({ targetType, targetId, body });
      // 就地并入缓存里的这一条讨论：界面立刻出现，不用重拉整条
      mutateApiCache<ListCommentsResponse>(key, (current) => ({ items: [...(current.items ?? []), record] }));
      invalidateApiCache('comment-counts:');
      void refresh();
      setDraft('');
      if (record.notificationWarning) setPostError(record.notificationWarning);
    } catch (e) {
      setPostError(errorMessage(e));
    } finally {
      setSending(false);
    }
  }

  async function remove(id: string): Promise<void> {
    try {
      await commentsApi.deleteComment(id);
      mutateApiCache<ListCommentsResponse>(key, (current) => ({ items: (current.items ?? []).filter((c) => c.id !== id) }));
      invalidateApiCache('comment-counts:');
      void refresh();
    } catch (e) {
      setPostError(errorMessage(e));
    }
  }

  return (
    <div className="comment-panel">
      <div className="comment-panel-head">
        <b>讨论</b>
        <span>{items.length > 0 ? `${items.length} 条` : '还没有人说话'}</span>
      </div>

      <div className="comment-list" ref={listRef}>
        {!loaded && <p className="comment-empty">正在读取…</p>}
        {loaded && items.length === 0 && <p className="comment-empty">这里还很安静。想到什么就直接说，团队都会看到。</p>}
        {items.map((item: CommentRecord) => {
          const mine: boolean = item.authorUserId === meUserId;
          return (
            <div key={item.id} data-comment-id={item.id} className={`comment-row${highlighted.includes(item.id) ? ' is-unread-highlight' : ''}${mine ? ' is-mine' : ''}`}>
              {!mine && (
                <span className="comment-avatar">
                  <UserDisplay value={[item.authorUserId]} size="small" showLabel={false} />
                </span>
              )}
              <div className="comment-body">
                <div className="comment-meta">
                  <span className="comment-author">{item.authorName ?? (mine ? '我' : '伙伴')}</span>
                  <span className="comment-time">{formatTime(item.createdAt)}</span>
                  {item.canDelete && (
                    <button type="button" className="comment-del" onClick={() => remove(item.id)} title="删除这条评论" aria-label="删除这条评论">
                      <Trash2 className="size-3" />
                    </button>
                  )}
                </div>
                <div className="comment-bubble"><DocLinkText text={item.body} /></div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="comment-compose">
        <ImeTextarea
          value={draft}
          onChange={setDraft}
          rows={2}
          className="comment-input"
          placeholder="写下你对这条内容的看法…"
          onKeyDown={(e) => {
            // 和聊天框一致：回车发送、Shift+回车换行。中文输入法组字时的回车要放过，
            // 那是"确认候选词"，不是发送（isComposing 由 IME 事件维护）。
            if (e.key !== 'Enter' || e.shiftKey) return;
            const native = e.nativeEvent as KeyboardEvent & { isComposing?: boolean };
            if (native.isComposing || (e as unknown as { keyCode?: number }).keyCode === 229) return;
            e.preventDefault();
            void send();
          }}
        />
        <button
          type="button"
          className="comment-send"
          onClick={() => void send()}
          disabled={sending || draft.trim().length === 0}
          title="发送"
          aria-label="发送"
        >
          <ArrowUp className="size-4" />
        </button>
      </div>
      {(postError || error || readError) && <div className="comment-error">{postError || error || readError}</div>}
    </div>
  );
}
