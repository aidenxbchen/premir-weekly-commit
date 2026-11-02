import { BadRequestException, Body, Controller, Delete, Get, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { WeeklyBPlusService } from './weekly-b-plus.service';
import { RosterService } from '../roster/roster.service';
import type {
  ListWeeklyBPlusResponse,
  ReopenWeeklyBPlusRequest,
  SaveWeeklyBPlusRequest,
  WeeklyBPlusRecord,
} from '@shared/api.interface';

@Controller('api/weekly-b-plus')
export class WeeklyBPlusController {
  constructor(
    private readonly weeklyBPlusService: WeeklyBPlusService,
    private readonly rosterService: RosterService,
  ) {}

  @Get('mine')
  @NeedLogin()
  async mine(@Req() req: Request, @Query('week') week: string): Promise<{ item?: WeeklyBPlusRecord }> {
    if (!week) throw new BadRequestException('missing_week');
    return { item: await this.weeklyBPlusService.findMine(req.userContext.userId, week) };
  }

  @Get()
  @NeedLogin()
  async list(@Query('week') week: string): Promise<ListWeeklyBPlusResponse> {
    if (!week) throw new BadRequestException('missing_week');
    return { items: await this.weeklyBPlusService.listByWeek(week) };
  }

  @Put()
  @NeedLogin()
  async save(@Req() req: Request, @Body() dto: SaveWeeklyBPlusRequest): Promise<{ item?: WeeklyBPlusRecord }> {
    const item = await this.weeklyBPlusService.save(req.userContext.userId, dto.week, dto.criteria ?? '');
    return { item };
  }

  // 只有 L1 的两个管理动作：退回（解锁让本人再改）与删除（写错了直接删）。
  // 真正的权限判定在 service 层，和别处一样保持"controller 只取身份"。
  @Post('reopen')
  @NeedLogin()
  async reopen(@Req() req: Request, @Body() dto: ReopenWeeklyBPlusRequest): Promise<{ item?: WeeklyBPlusRecord }> {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    const item = await this.weeklyBPlusService.reopen(dto.ownerUserId, dto.week, actor, dto.reason ?? '');
    return { item };
  }

  @Delete()
  @NeedLogin()
  async remove(
    @Req() req: Request,
    @Query('week') week: string,
    @Query('ownerUserId') ownerUserId: string,
  ): Promise<{ ok: boolean }> {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    return { ok: await this.weeklyBPlusService.remove(ownerUserId, week, actor) };
  }
}
