import type {
  ListWeeklyBPlusResponse,
  ReopenWeeklyBPlusRequest,
  SaveWeeklyBPlusRequest,
  WeeklyBPlusRecord,
} from '@shared/api.interface';
import { apiRequest } from './http';

export async function listWeeklyBPlusMine(week: string): Promise<{ item?: WeeklyBPlusRecord }> {
  return apiRequest<{ item?: WeeklyBPlusRecord }>('GET', '/api/weekly-b-plus/mine', undefined, { week });
}

export async function listWeeklyBPlus(week: string): Promise<ListWeeklyBPlusResponse> {
  return apiRequest<ListWeeklyBPlusResponse>('GET', '/api/weekly-b-plus', undefined, { week });
}

/** criteria 传空串即表示这周没有 B+ 标准，服务端会把该行删掉。 */
export async function saveWeeklyBPlus(dto: SaveWeeklyBPlusRequest): Promise<{ item?: WeeklyBPlusRecord }> {
  return apiRequest<{ item?: WeeklyBPlusRecord }>('PUT', '/api/weekly-b-plus', dto);
}

/** L1 退回：解锁某人该周的 B+ 标准，他可以改完再存（存完重新锁定）。 */
export async function reopenWeeklyBPlus(dto: ReopenWeeklyBPlusRequest): Promise<{ item?: WeeklyBPlusRecord }> {
  return apiRequest<{ item?: WeeklyBPlusRecord }>('POST', '/api/weekly-b-plus/reopen', dto);
}

/** L1 删除：把写错的那份 B+ 标准整条删掉，本人可以重新写。 */
export async function deleteWeeklyBPlus(week: string, ownerUserId: string): Promise<{ ok: boolean }> {
  return apiRequest<{ ok: boolean }>('DELETE', '/api/weekly-b-plus', undefined, { week, ownerUserId });
}
