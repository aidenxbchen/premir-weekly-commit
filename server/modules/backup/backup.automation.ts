import { Logger } from '@nestjs/common';
import { Automation, BindTrigger } from '@lark-apaas/fullstack-nestjs-core';
import { BackupService } from './backup.service';

@Automation()
export class BackupAutomationTasksService {
  private readonly logger = new Logger(BackupAutomationTasksService.name);

  constructor(private readonly backupService: BackupService) {}

  @BindTrigger('premir-nightly-backup')
  async runNightlyBackup(): Promise<void> {
    this.logger.log('[backup] nightly trigger fired');
    await this.backupService.runBackup();
  }
}
