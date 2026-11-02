import { BadRequestException, Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RatingsService } from './ratings.service';
import { RosterService } from '../roster/roster.service';
import { canViewPersonalRating } from '@shared/permissions';
import type { ListModuleRatingsResponse, ListRatingsResponse, ModuleName } from '@shared/api.interface';

@Controller('api/ratings')
export class RatingsController {
  constructor(private readonly ratingsService: RatingsService, private readonly rosterService: RosterService) {}

  @Get()
  @NeedLogin()
  async list(@Req() req: Request, @Query('week') week: string): Promise<ListRatingsResponse> {
    if (!week) throw new BadRequestException('missing_week');
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    const items = await this.ratingsService.listByWeek(week);
    const currentRoster = await this.rosterService.listRoster();
    return { items: items.filter((item) => {
      const owner = currentRoster.find((person) => person.userId === item.memberUserId)
        ?? { userId: item.memberUserId, level: 'member' as const, module: undefined };
      return canViewPersonalRating(actor, owner, owner.module ?? item.module);
    }) };

  }

  @Get('mine')
  @NeedLogin()
  async mine(@Req() req: Request): Promise<ListRatingsResponse> {
    return { items: await this.ratingsService.listForMember(req.userContext.userId) };
  }

  // 模块自身的周里程碑评级历史，和"现在谁是负责人"无关；不传 module 时返回全部
  // 模块的历史，供"各模块周里程碑"页一次性拉取。
  @Get('module')
  @NeedLogin()
  async listModule(@Query('module') module?: ModuleName): Promise<ListModuleRatingsResponse> {
    return { items: await this.ratingsService.listModuleRatings(module) };
  }
}
