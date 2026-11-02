import type { BackupRunRecord, ListBackupRunsResponse } from '@shared/api.interface';
import { apiRequest } from './http';

export async function listBackupRuns(): Promise<ListBackupRunsResponse> {
  return apiRequest<ListBackupRunsResponse>('GET', '/api/backup/runs');
}

export async function runBackupNow(): Promise<{ record: BackupRunRecord }> {
  return apiRequest<{ record: BackupRunRecord }>('POST', '/api/backup/run-now');
}
