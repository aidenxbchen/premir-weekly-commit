import type { ActiveWeeksResponse, AdvanceWeekResponse, CurrentWeekResponse } from '@shared/api.interface';
import { apiRequest } from './http';

export async function getCurrentWeek(): Promise<CurrentWeekResponse> {
  return apiRequest<CurrentWeekResponse>('GET', '/api/week');
}

export async function advanceWeek(expectedWeek: string): Promise<AdvanceWeekResponse> {
  return apiRequest<AdvanceWeekResponse>('POST', '/api/week/advance', { expectedWeek });
}

export async function listActiveWeeks(): Promise<ActiveWeeksResponse> {
  return apiRequest<ActiveWeeksResponse>('GET', '/api/week/active');
}
