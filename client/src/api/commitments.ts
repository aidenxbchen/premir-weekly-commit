import type {
  CommitmentRecord,
  CreateCommitmentRequest,
  ListCommitmentsResponse,
  ModuleName,
  UpdateCommitmentRequest,
  CreateEditRequest,
  ReviewEditRequest,
} from '@shared/api.interface';
import { apiRequest } from './http';

export async function listCommitmentsMine(week: string): Promise<ListCommitmentsResponse> {
  return apiRequest<ListCommitmentsResponse>('GET', '/api/commitments/mine', undefined, { week });
}

export async function listCommitments(module: ModuleName, week: string): Promise<ListCommitmentsResponse> {
  return apiRequest<ListCommitmentsResponse>('GET', '/api/commitments', undefined, { module, week });
}

/** 一次拿多个部门的承诺：一个页面本来要按部门发好几次请求，合并成一次。 */
export async function listCommitmentsForModules(
  modules: ModuleName[],
  week: string,
): Promise<ListCommitmentsResponse> {
  if (modules.length === 0) return { items: [] };
  return apiRequest<ListCommitmentsResponse>('GET', '/api/commitments', undefined, {
    modules: modules.join(','),
    week,
  });
}

export async function createCommitment(dto: CreateCommitmentRequest): Promise<{ record: CommitmentRecord }> {
  return apiRequest<{ record: CommitmentRecord }>('POST', '/api/commitments', dto);
}

export async function updateCommitment(
  id: string,
  dto: UpdateCommitmentRequest,
): Promise<{ record: CommitmentRecord }> {
  return apiRequest<{ record: CommitmentRecord }>('PATCH', `/api/commitments/${id}`, dto);
}

export async function deleteCommitment(id: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('DELETE', `/api/commitments/${id}`);
}

export async function authorizeEdit(id: string, reason?: string): Promise<{ record: CommitmentRecord }> {
  return apiRequest<{ record: CommitmentRecord }>('POST', `/api/commitments/${id}/authorize-edit`, { reason });
}

export async function requestEdit(id: string, dto: CreateEditRequest): Promise<{ record: CommitmentRecord }> {
  return apiRequest<{ record: CommitmentRecord }>('POST', `/api/commitments/${id}/edit-requests`, dto);
}

export async function reviewEditRequest(requestId: string, dto: ReviewEditRequest): Promise<{ record: CommitmentRecord }> {
  return apiRequest<{ record: CommitmentRecord }>('PATCH', `/api/commitments/edit-requests/${requestId}`, dto);
}
