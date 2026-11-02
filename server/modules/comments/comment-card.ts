import { ANEVER_APP_URL, feishuAppLink } from '../../common/utils/feishu-link.util';
import type { CommentNotice } from './comment-notification.service';

// 评论是用户原文，不允许被飞书 Markdown 解释成 @所有人、图片或伪造按钮。
export function escapeCardText(text: string): string {
  return text.replace(/[&<>*~\[\]()#:_`\\]/g, (character) => `&#${character.charCodeAt(0)};`);
}

export function buildCommentCard(notice: CommentNotice) {
  const action = notice.isReply ? '回复了你参与的讨论' : '给你留言了';
  const url = feishuAppLink(`${ANEVER_APP_URL}?comment=${encodeURIComponent(notice.id)}`);
  return {
    schema: '2.0',
    config: {
      width_mode: 'compact',
      summary: { content: `${notice.authorName}：${notice.body.replace(/\s+/g, ' ').slice(0, 100)}` },
      style: { color: { 'comment-bg': {
        light_mode: 'rgba(232,244,255,1)', dark_mode: 'rgba(30,49,68,1)',
      } } },
    },
    header: {
      template: 'blue',
      title: { tag: 'plain_text', content: `${notice.authorName} ${action}` },
      subtitle: { tag: 'plain_text', content: 'ANEVER · 伙伴间的对话' },
    },
    body: {
      direction: 'vertical', padding: '12px', vertical_spacing: '12px',
      elements: [
        {
          tag: 'column_set', flex_mode: 'none', background_style: 'comment-bg',
          columns: [{
            tag: 'column', width: 'weighted', weight: 1, padding: '12px',
            elements: [{ tag: 'markdown', text_size: 'heading-3', content: escapeCardText(notice.body) }],
          }],
        },
        { tag: 'markdown', text_size: 'notation', content: `<font color='grey'>${escapeCardText(notice.subject)}</font>` },
        {
          tag: 'button', type: 'primary_filled', width: 'fill',
          text: { tag: 'plain_text', content: '查看并回复' },
          behaviors: [{ type: 'open_url', default_url: url, pc_url: url, ios_url: url, android_url: url }],
        },
      ],
    },
  };
}
