import { Inject, Injectable, Logger } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { count, desc } from 'drizzle-orm';
import { backupRun, commitment, milestone, rating } from '@server/database/schema';
import type { BackupRunRecord } from '@shared/api.interface';

type BackupRunRow = typeof backupRun.$inferSelect;

function toRecord(row: BackupRunRow): BackupRunRecord {
  return {
    id: row.id,
    ranAt: row.ranAt.toISOString(),
    milestoneCount: row.milestoneCount,
    commitmentCount: row.commitmentCount,
    ratingCount: row.ratingCount,
    status: row.status,
    errorMessage: row.errorMessage ?? undefined,
  };
}

// Postgres 本身已经有平台托管的备份 / 变更追溯 / 时间点恢复能力（见
// lark-cli apps +db-recovery-*），这里的"每晚快照"延续旧项目的审计习惯，
// 只做一次轻量的行数快照记录，不再像过去那样把整份数据写到另一个 Bitable。
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async runBackup(): Promise<BackupRunRecord> {
    try {
      const [milestoneCountRes, commitmentCountRes, ratingCountRes] = await Promise.all([
        this.db.select({ value: count() }).from(milestone),
        this.db.select({ value: count() }).from(commitment),
        this.db.select({ value: count() }).from(rating),
      ]);
      const inserted = await this.db
        .insert(backupRun)
        .values({
          milestoneCount: Number(milestoneCountRes[0]?.value ?? 0),
          commitmentCount: Number(commitmentCountRes[0]?.value ?? 0),
          ratingCount: Number(ratingCountRes[0]?.value ?? 0),
          status: 'success',
        })
        .returning();
      this.logger.log(`[backup] run recorded: ${JSON.stringify(toRecord(inserted[0]))}`);
      return toRecord(inserted[0]);
    } catch (error) {
      const message: string = error instanceof Error ? error.message : String(error);
      this.logger.error(`[backup] run failed: ${message}`);
      const inserted = await this.db
        .insert(backupRun)
        .values({ milestoneCount: 0, commitmentCount: 0, ratingCount: 0, status: 'failed', errorMessage: message })
        .returning();
      return toRecord(inserted[0]);
    }
  }

  async listRuns(limit: number): Promise<BackupRunRecord[]> {
    const rows: BackupRunRow[] = await this.db.select().from(backupRun).orderBy(desc(backupRun.ranAt)).limit(limit);
    return rows.map(toRecord);
  }
}
