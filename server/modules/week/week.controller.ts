import { Body, Controller, ForbiddenException, Get, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { WeekService } from './week.service';
import type { ActiveWeeksResponse, AdvanceWeekRequest, AdvanceWeekResponse, CurrentWeekResponse } from '@shared/api.interface';

@Controller('api/week')
export class WeekController {
  constructor(private readonly weekService: WeekService) {}

  @Get()
  @NeedLogin()
  async current(): Promise<CurrentWeekResponse> {
    return { week: await this.weekService.currentWeekLabel() };
  }

  @Get('active')
  @NeedLogin()
  async active(): Promise<ActiveWeeksResponse> {
    return { weeks: await this.weekService.activeWeekLabels() };
  }

  @Post('advance')
  @NeedLogin()
  async advance(@Req() req: Request, @Body() dto: AdvanceWeekRequest): Promise<AdvanceWeekResponse> {
    if (!(await this.weekService.isL1(req.userContext.userId))) throw new ForbiddenException('only_L1_can_advance_week');
    return { week: await this.weekService.advanceWeek(dto.expectedWeek) };
  }
}
