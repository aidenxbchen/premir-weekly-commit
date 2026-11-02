import { Controller, ForbiddenException, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { BackupService } from './backup.service';
import { WeekService } from '../week/week.service';
import type { ListBackupRunsResponse } from '@shared/api.interface';

@Controller('api/backup')
export class BackupController {
  constructor(private readonly backupService: BackupService, private readonly weekService: WeekService) {}

  @Get('runs')
  @NeedLogin()
  async listRuns(@Req() req: Request): Promise<ListBackupRunsResponse> {
    if (!(await this.weekService.isL1(req.userContext.userId))) throw new ForbiddenException('forbidden');
    return { items: await this.backupService.listRuns(20) };
  }

  @Post('run-now')
  @NeedLogin()
  async runNow(@Req() req: Request) {
    if (!(await this.weekService.isL1(req.userContext.userId))) throw new ForbiddenException('forbidden');
    const record = await this.backupService.runBackup();
    return { record };
  }
}
