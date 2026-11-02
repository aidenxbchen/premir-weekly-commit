import { Module } from '@nestjs/common';
import { BackupController } from './backup.controller';
import { BackupService } from './backup.service';
import { BackupAutomationTasksService } from './backup.automation';
import { WeekModule } from '../week/week.module';

@Module({
  imports: [WeekModule],
  controllers: [BackupController],
  providers: [BackupService, BackupAutomationTasksService],
})
export class BackupModule {}
