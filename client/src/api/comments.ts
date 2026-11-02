import type {
  CommentDiscussion,
  CommentInboxResponse,
  CommentCountsResponse,
  CommentRecord,
  CommentTargetType,
  CreateCommentRequest,
  ListCommentsResponse,
} from '@shared/api.interface';
import { apiRequest } from './http';

/** 一条内容下面的全部讨论（按时间正序）。 */
export async function listComments(
  targetType: CommentTargetType,
  targetId: string,
): Promise<ListCommentsResponse> {
  return apiRequest<ListCommentsResponse>('GET', '/api/comments', undefined, { targetType, targetId });
}

/** 本周各对象的评论条数，用于卡片右上角的角标。 */
export async function listCommentCounts(week: string): Promise<CommentCountsResponse> {
  return apiRequest<CommentCountsResponse>('GET', '/api/comments/counts', undefined, { week });
}

export async function createComment(dto: CreateCommentRequest): Promise<{ record: CommentRecord }> {
  return apiRequest<{ record: CommentRecord }>('POST', '/api/comments', dto);
}

/** 只有作者本人和 L1 能删。 */
export async function deleteComment(id: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('DELETE', `/api/comments/${id}`);
}

export function getCommentInbox(): Promise<CommentInboxResponse> {
  return apiRequest<CommentInboxResponse>('GET', '/api/comments/inbox');
}
export function locateComment(id: string): Promise<CommentDiscussion> {
  return apiRequest<CommentDiscussion>('GET', `/api/comments/locate/${encodeURIComponent(id)}`);
}
export function markCommentsRead(commentIds: string[]): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('POST', '/api/comments/read', { commentIds });
}
