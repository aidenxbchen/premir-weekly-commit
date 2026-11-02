import { Controller, Get, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RosterService } from '../roster/roster.service';
import { WeekService } from '../week/week.service';
import type { MeResponse } from '@shared/api.interface';

@Controller('api/me')
export class MeController {
  constructor(
    private readonly rosterService: RosterService,
    private readonly weekService: WeekService,
  ) {}

  @Get()
  @NeedLogin()
  async me(@Req() req: Request): Promise<MeResponse> {
    const userId: string = req.userContext.userId;
    const platformRole = this.rosterService.resolveRole(req);
    const [holder, week, permissions] = await Promise.all([
      this.rosterService.scopeHolderForUser(userId),
      this.weekService.currentWeekLabel(),
      this.rosterService.gradingPermissionsForUser(userId),
    ]);
    return {
      userId,
      role: holder.level !== 'member' ? 'admin' : platformRole,
      level: holder.level,
      managedModules: holder.managedModules,
      module: holder.module,
      week,
      canGrade: permissions.canGrade,
      coordinatingModules: permissions.coordinatingModules,
    };
  }
}
