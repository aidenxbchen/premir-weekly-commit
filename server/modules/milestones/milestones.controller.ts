import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { MilestonesService } from './milestones.service';
import { RosterService } from '../roster/roster.service';
import type { ListMilestonesResponse, ReopenBPlusRequest, SaveMilestoneRequest } from '@shared/api.interface';

@Controller('api/milestones')
export class MilestonesController {
  constructor(
    private readonly milestonesService: MilestonesService,
    private readonly rosterService: RosterService,
  ) {}

  @Get()
  @NeedLogin()
  async list(@Query('week') week: string): Promise<ListMilestonesResponse> {
    if (!week) throw new BadRequestException('missing_week');
    return { items: await this.milestonesService.listByWeek(week) };
  }

  // 不再卡在 @CanRole(['admin','lead'])——协调人（role==='member'）也要能通过这个
  // 接口勾选验收，真正的权限判断（内容编辑 vs 勾选验收，各自谁能做）放在 service 层。
  @Post()
  @NeedLogin()
  async save(@Req() req: Request, @Body() dto: SaveMilestoneRequest) {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    const record = await this.milestonesService.saveFields(dto, actor);
    return { record };
  }

  @Delete(':id')
  @NeedLogin()
  async remove(@Req() req: Request, @Param('id') id: string): Promise<{ ok: true }> {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    await this.milestonesService.delete(id, actor);
    return { ok: true };
  }

  // B+ 验收标准的两个管理动作（只有 L1）：退回=清空勾选让负责人重做验收；
  // 删除=连标准一起清空。注意和上面删除整条里程碑是两件事。
  @Post(':id/b-plus/reopen')
  @NeedLogin()
  async reopenBPlus(@Req() req: Request, @Param('id') id: string, @Body() dto: ReopenBPlusRequest) {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    return { record: await this.milestonesService.reopenBPlus(id, actor, dto?.reason ?? '') };
  }

  @Delete(':id/b-plus')
  @NeedLogin()
  async deleteBPlus(@Req() req: Request, @Param('id') id: string) {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    return { record: await this.milestonesService.deleteBPlus(id, actor) };
  }
}
