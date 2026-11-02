import type { MeResponse } from '@shared/api.interface';
import { apiRequest } from './http';

export async function getMe(): Promise<MeResponse> {
  return apiRequest<MeResponse>('GET', '/api/me');
}
