import { useEffect, useRef, useState, type RefObject } from 'react';
import { useCommentInbox } from '@/components/CommentInbox';
import type { CommentRecord, CommentTargetType } from '@shared/api.interface';
import { errorMessage } from '@/utils/error';

// A receipt is acknowledged only after its actual row stays visible in the foreground.
export function useVisibleComments(listRef: RefObject<HTMLDivElement | null>, items: CommentRecord[],
  targetType: CommentTargetType, targetId: string, ready: boolean, focusCommentId?: string) {
  const { items: inbox, markRead, refresh } = useCommentInbox();
  const [readError, setReadError] = useState('');
  const [highlighted, setHighlighted] = useState<string[]>(focusCommentId ? [focusCommentId] : []);
  const seenHighlights = useRef(new Set<string>());
  const unreadIds = inbox.find((item) => item.targetType === targetType && item.targetId === targetId)?.unreadIds ?? [];
  const unreadKey = unreadIds.join(',');
  const itemKey = items.map((item) => item.id).join(',');
  useEffect(() => {
    const fresh = unreadIds.filter((id) => !seenHighlights.current.has(id) && items.some((item) => item.id === id));
    if (fresh.length) {
      fresh.forEach((id) => seenHighlights.current.add(id));
      setHighlighted((current) => [...new Set([...current, ...fresh])]);
    }
  }, [unreadKey, itemKey]);
  useEffect(() => {
    const box = listRef.current;
    if (!box || !ready || !unreadIds.length) return;
    const visible = new Set<string>();
    let sending = false;
    let alive = true;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.commentId;
        if (!id) continue;
        if (entry.isIntersecting) visible.add(id); else visible.delete(id);
      }
    }, { root: box, threshold: 0.15 });
    box.querySelectorAll<HTMLElement>('[data-comment-id]').forEach((element) => {
      if (unreadIds.includes(element.dataset.commentId ?? '')) observer.observe(element);
    });
    const timer = window.setInterval(() => {
      if (sending || document.visibilityState !== 'visible' || !visible.size) return;
      const ids = [...visible].slice(0, 200);
      sending = true;
      void markRead(ids).then(() => { if (alive) setReadError(''); })
        .catch((cause: unknown) => { if (alive) setReadError(`已读状态未同步：${errorMessage(cause)}`); })
        .finally(() => { sending = false; });
    }, 1200);
    return () => { alive = false; clearInterval(timer); observer.disconnect(); };
  }, [itemKey, unreadKey, ready, markRead, listRef]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { highlighted, readError };
}
