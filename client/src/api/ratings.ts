import type { ListModuleRatingsResponse, ListRatingsResponse, ModuleName } from '@shared/api.interface';
import { apiRequest } from './http';

export async function listRatings(week: string): Promise<ListRatingsResponse> {
  return apiRequest<ListRatingsResponse>('GET', '/api/ratings', undefined, { week });
}

export async function listMyRatings(): Promise<ListRatingsResponse> {
  return apiRequest<ListRatingsResponse>('GET', '/api/ratings/mine');
}

export async function listModuleRatings(module?: ModuleName): Promise<ListModuleRatingsResponse> {
  return apiRequest<ListModuleRatingsResponse>('GET', '/api/ratings/module', undefined, module ? { module } : undefined);
}
