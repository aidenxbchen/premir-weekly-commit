import type { ListMilestonesResponse, MilestoneRecord, ReopenBPlusRequest, SaveMilestoneRequest } from '@shared/api.interface';
import { apiRequest } from './http';

export async function listMilestones(week: string): Promise<ListMilestonesResponse> {
  return apiRequest<ListMilestonesResponse>('GET', '/api/milestones', undefined, { week });
}

export async function saveMilestone(dto: SaveMilestoneRequest): Promise<{ record: MilestoneRecord }> {
  return apiRequest<{ record: MilestoneRecord }>('POST', '/api/milestones', dto);
}

export async function deleteMilestone(id: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('DELETE', `/api/milestones/${id}`);
}

/** L1 退回 B+ 验收标准：清空勾选并记下原因，负责人可以改标准、重新验收。 */
export async function reopenMilestoneBPlus(id: string, reason: string): Promise<{ record: MilestoneRecord }> {
  const dto: ReopenBPlusRequest = { reason };
  return apiRequest<{ record: MilestoneRecord }>('POST', `/api/milestones/${id}/b-plus/reopen`, dto);
}

/** L1 删除 B+ 验收标准（含勾选），负责人可以重新写一条。 */
export async function deleteMilestoneBPlus(id: string): Promise<{ record: MilestoneRecord }> {
  return apiRequest<{ record: MilestoneRecord }>('DELETE', `/api/milestones/${id}/b-plus`);
}
