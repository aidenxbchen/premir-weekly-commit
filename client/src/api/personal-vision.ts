import type { PersonalVisionRecord } from '@shared/api.interface';
import { apiRequest } from './http';

export function getMine(): Promise<{ item: PersonalVisionRecord }> {
  return apiRequest('GET', '/api/personal-vision/mine');
}

export function saveMine(item: PersonalVisionRecord): Promise<{ item: PersonalVisionRecord }> {
  return apiRequest('PUT', '/api/personal-vision/mine', item);
}
