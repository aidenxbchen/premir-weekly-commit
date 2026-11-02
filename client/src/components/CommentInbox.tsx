import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { commentsApi } from '@/api';
import { errorMessage } from '@/utils/error';
import type { CommentDiscussion } from '@shared/api.interface';

interface InboxState {
  items: CommentDiscussion[];
  loaded: boolean;
  error: string;
  refresh: () => Promise<CommentDiscussion[] | undefined>;
  markRead: (ids: string[]) => Promise<void>;
}
const InboxContext = createContext<InboxState | null>(null);

export function CommentInboxProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CommentDiscussion[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const mounted = useRef(true);
  const pending = useRef<Promise<CommentDiscussion[] | undefined> | null>(null);
  const location = useLocation();
  const refresh = useCallback(async () => {
    if (pending.current) return pending.current;
    const version = generation.current;
    const request = commentsApi.getCommentInbox().then((result) => {
      if (!mounted.current || version !== generation.current) return undefined;
      setItems(result.items); setLoaded(true); setError('');
      return result.items;
    }).catch((cause: unknown) => {
      if (mounted.current) setError(errorMessage(cause));
      return undefined;
    }).finally(() => { pending.current = null; });
    pending.current = request;
    return request;
  }, []);
  const markRead = useCallback(async (ids: string[]) => {
    await commentsApi.markCommentsRead(ids);
    if (!mounted.current) return;
    generation.current++;
    setItems((previous) => previous.map((item) => {
      const unreadIds = item.unreadIds.filter((id) => !ids.includes(id));
      return { ...item, unreadIds, latestCommentId: unreadIds[0] ?? item.latestCommentId };
    }).filter((item) => item.unreadIds.length));
  }, []);
  useEffect(() => {
    mounted.current = true;
    const visibleRefresh = () => { if (document.visibilityState === 'visible') void refresh(); };
    const timer = window.setInterval(visibleRefresh, 20_000);
    document.addEventListener('visibilitychange', visibleRefresh);
    window.addEventListener('focus', visibleRefresh);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', visibleRefresh);
      window.removeEventListener('focus', visibleRefresh);
    };
  }, [refresh]);
  useEffect(() => { void refresh(); }, [location.key, refresh]);
  return <InboxContext.Provider value={{ items, loaded, error, refresh, markRead }}>{children}</InboxContext.Provider>;
}
export function useCommentInbox(): InboxState {
  const state = useContext(InboxContext);
  if (!state) throw new Error('CommentInboxProvider is missing');
  return state;
}
export function PersonalUnreadDot() {
  const { items } = useCommentInbox();
  const count = items.reduce((sum, item) => sum + item.unreadIds.length, 0);
  return count ? <span className="comment-unread-dot nav-unread-dot" role="status" aria-label={`${count} 条未读评论`} /> : null;
}
