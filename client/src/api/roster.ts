import type { AddRosterMemberRequest, ListRosterResponse, UpdateRosterMemberRequest } from '@shared/api.interface';
import { apiRequest } from './http';

export async function listRoster(week?: string): Promise<ListRosterResponse> {
  const query = week ? `?week=${encodeURIComponent(week)}` : '';
  return apiRequest<ListRosterResponse>('GET', `/api/roster${query}`);
}

/** 加人 / 把人放进某个部门（同一个人已在 roster 里就是更新）。 */
export async function addRosterMember(dto: AddRosterMemberRequest): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('POST', '/api/roster/members', dto);
}

/** 改级别 / 换部门 / 调 L2 管辖半径。级别只有 L1 能改。 */
export async function updateRosterMember(userId: string, dto: UpdateRosterMemberRequest): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('PATCH', `/api/roster/members/${encodeURIComponent(userId)}`, dto);
}

export async function removeRosterMember(userId: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('DELETE', `/api/roster/members/${encodeURIComponent(userId)}`);
}
