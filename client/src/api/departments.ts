import type {
  CreateDepartmentRequest,
  DepartmentRecord,
  ListDepartmentsResponse,
  RenameDepartmentRequest,
} from '@shared/api.interface';
import { apiRequest } from './http';

export async function listDepartments(): Promise<ListDepartmentsResponse> {
  return apiRequest<ListDepartmentsResponse>('GET', '/api/departments');
}

export async function createDepartment(dto: CreateDepartmentRequest): Promise<{ record: DepartmentRecord }> {
  return apiRequest<{ record: DepartmentRecord }>('POST', '/api/departments', dto);
}

export async function renameDepartment(id: string, dto: RenameDepartmentRequest): Promise<{ record: DepartmentRecord }> {
  return apiRequest<{ record: DepartmentRecord }>('PATCH', `/api/departments/${id}`, dto);
}

export async function removeDepartment(id: string): Promise<{ ok: true }> {
  return apiRequest<{ ok: true }>('DELETE', `/api/departments/${id}`);
}
