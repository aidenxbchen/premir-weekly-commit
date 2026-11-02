import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MessageSquare, X } from 'lucide-react';
import { commentsApi } from '@/api';
import { useCommentInbox } from './CommentInbox';
import { CommentThreadPanel } from './CommentThread';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { errorMessage } from '@/utils/error';
import type { CommentDiscussion } from '@shared/api.interface';

export function PersonalCommentInbox({ meUserId, onSelectWeek }: {
  meUserId: string; onSelectWeek: (week: string) => void;
}) {
  const { items, error, refresh } = useCommentInbox();
  const location = useLocation();
  const commentId = new URLSearchParams(location.search).get('comment');
  const [selected, setSelected] = useState<CommentDiscussion | null>(null);
  const [open, setOpen] = useState(false);
  const [linkError, setLinkError] = useState('');
  const request = useRef(0);
  const selectWeek = useRef(onSelectWeek);
  selectWeek.current = onSelectWeek;
  const total = items.reduce((sum, item) => sum + item.unreadIds.length, 0);

  function select(item: CommentDiscussion) {
    setSelected(item); setOpen(true);
    if (item.ownerUserId === meUserId && !item.targetType.startsWith('milestone_')) {
      selectWeek.current(item.week);
    }
  }
  useEffect(() => {
    if (!commentId) return;
    const version = ++request.current;
    setLinkError('');
    void commentsApi.locateComment(commentId).then((item) => {
      if (request.current === version) select(item);
    }).catch((cause: unknown) => {
      if (request.current === version) setLinkError(errorMessage(cause));
    });
    return () => { request.current++; };
  }, [location.key, commentId]);
  useEffect(() => {
    if (commentId) return;
    let alive = true;
    void refresh().then((fresh) => {
      if (alive && fresh?.[0]) select(fresh[0]);
    });
    return () => { alive = false; };
  // Open once per visit, never reopen over someone's draft as polling updates arrive.
  }, [location.key, commentId, refresh]);

  if (!total && !selected && !error && !linkError) return null;
  return <div className="personal-discussion-inbox">
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="inbox-summary" onClick={() => { if (!selected && items[0]) select(items[0]); }}>
          <MessageSquare className="size-4" />
          {total > 0 && <span className="comment-unread-dot" />}
          <span>{total ? `${total} 条未读留言` : '刚刚的讨论'}</span>
          <span className="inbox-summary-hint">{total ? '伙伴有话对你说' : '继续交流'}</span>
        </button>
      </PopoverTrigger>
      {selected && <PopoverContent align="start" collisionPadding={14} sideOffset={10}
        onOpenAutoFocus={(event) => event.preventDefault()} className="comment-popover inbox-popover">
        <div className="inbox-topic"><div><small>伙伴间的对话</small><p>{selected.subject}</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="关闭讨论"><X className="size-4" /></button>
        </div>
        {items.length > 0 && <div className="inbox-thread-tabs" aria-label="其他未读讨论">
          {items.map((item) => <button key={`${item.targetType}:${item.targetId}`}
            className={item.targetType === selected.targetType && item.targetId === selected.targetId ? 'is-selected' : ''}
            onClick={() => select(item)} title={item.subject}>
            <span className="comment-unread-dot" />{item.subject}<b>{item.unreadIds.length}</b>
          </button>)}
        </div>}
        {open && <CommentThreadPanel key={`${selected.targetType}:${selected.targetId}:${selected.latestCommentId}`}
          targetType={selected.targetType} targetId={selected.targetId} meUserId={meUserId}
          focusCommentId={selected.latestCommentId} />}
      </PopoverContent>}
    </Popover>
    {(error || linkError) && <p className="comment-error">{linkError || `未读提醒暂时未同步：${error}`}
      {!linkError && <button onClick={() => void refresh()}>重新同步</button>}
    </p>}
  </div>;
}
