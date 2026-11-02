import type { CommitmentRecord, GradeRequest, MilestoneRecord, ModuleName } from '@shared/api.interface';
import { apiRequest } from './http';

export async function gradeMilestone(id: string, dto: GradeRequest): Promise<{ record: MilestoneRecord }> {
  return apiRequest<{ record: MilestoneRecord }>('POST', `/api/grade/milestone/${id}`, dto);
}

// 所有小组的周承诺共用这一个评级入口，模块名走路径参数。
export async function gradeCommitment(
  module: ModuleName,
  id: string,
  dto: GradeRequest,
): Promise<{ record: CommitmentRecord }> {
  return apiRequest<{ record: CommitmentRecord }>('POST', `/api/grade/commitment/${module}/${id}`, dto);
}
