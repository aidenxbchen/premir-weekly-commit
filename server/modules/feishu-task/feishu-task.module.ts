import { Module } from '@nestjs/common';
import { FeishuTaskService } from './feishu-task.service';

@Module({
  providers: [FeishuTaskService],
  exports: [FeishuTaskService],
})
export class FeishuTaskModule {}
