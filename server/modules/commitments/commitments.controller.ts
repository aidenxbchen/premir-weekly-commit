import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { CommitmentsService } from './commitments.service';
import { RosterService } from '../roster/roster.service';
import { canViewPersonalRating, canGradeRecord } from '@shared/permissions';
import type { ScopeHolder } from '@shared/permissions';
import type {
  CreateCommitmentRequest,
  CommitmentRecord,
  ListCommitmentsResponse,
  ModuleName,
  CreateEditRequest,
  ReviewEditRequest,
  UpdateCommitmentRequest,
} from '@shared/api.interface';

@Controller('api/commitments')
export class CommitmentsController {
  constructor(
    private readonly commitmentsService: CommitmentsService,
    private readonly rosterService: RosterService,
  ) {}

  // 单条记录（创建/更新之后的返回）用单查；列表走下面的批量入口，见 list()。
  private async visibleRecord(userId: string, item: CommitmentRecord): Promise<CommitmentRecord> {
    const holders = await this.rosterService.scopeHolderMapForUsers([userId, item.ownerUserId]);
    return this.decorateRecord(item, holders.get(userId)!, holders.get(item.ownerUserId)!);
  }

  // 可见性与评级资格都只依赖"本人档位 + 记录归属人档位"，所以列表里一次批量取齐后
  // 逐条算即可——不再逐条查 roster。
  private decorateRecord(item: CommitmentRecord, actor: ScopeHolder, owner: ScopeHolder): CommitmentRecord {
    const visible = canViewPersonalRating(actor, owner, item.module);
    const result = { ...item, canViewRating: visible, canGradeRating: canGradeRecord(actor, owner, item.module) };
    return visible ? result : {
      ...result, weekendGrade: undefined, weekendNote: undefined, mondayGrade: undefined, mondayNote: undefined,
    };
  }

  @Get('mine')
  @NeedLogin()
  async mine(@Req() req: Request, @Query('week') week: string): Promise<ListCommitmentsResponse> {
    if (!week) throw new BadRequestException('missing_week');
    const userId: string = req.userContext.userId;
    const module = await this.rosterService.getModuleForUser(userId);
    if (!module) return { items: [] };
    return { items: await this.commitmentsService.listMine(userId, week) };
  }

  @Get()
  @NeedLogin()
  async list(
    @Req() req: Request,
    @Query('module') moduleQuery: string,
    @Query('modules') modulesQuery: string,
    @Query('week') week: string,
  ): Promise<ListCommitmentsResponse> {
    if (!week) throw new BadRequestException('missing_week');
    const userId: string = req.userContext.userId;
    // 一次问多个部门：里程碑页、周承诺页要同时拿好几个组的承诺，本来是一个组一次
    // 往返（页面上七次请求），现在合成一次。
    const modules: string[] = (modulesQuery ?? '')
      .split(',')
      .map((name: string) => name.trim())
      .filter((name: string) => !!name);
    let items: CommitmentRecord[];
    if (modules.length > 0) {
      items = await this.commitmentsService.listByModulesWeek(modules, week);
    } else {
      const module: string | undefined = moduleQuery || (await this.rosterService.getModuleForUser(userId));
      if (!module) throw new BadRequestException('missing_module');
      items = await this.commitmentsService.listByModuleWeek(module, week);
    }
    // 一次取齐所有相关人的档位（原来每条记录查两次 roster，一页几十条就是
    // 几十次查询；线上实测这个接口 p50 1.4s、p95 3s）。
    const holders = await this.rosterService.scopeHolderMapForUsers([userId, ...items.map((item) => item.ownerUserId)]);
    const actor: ScopeHolder = holders.get(userId)!;
    const visible = items.map((item) => this.decorateRecord(item, actor, holders.get(item.ownerUserId)!));
    return { items: visible };
  }

  @Post()
  @NeedLogin()
  async create(@Req() req: Request, @Body() dto: CreateCommitmentRequest) {
    const userId: string = req.userContext.userId;
    const module = await this.rosterService.getModuleForUser(userId);
    if (!module) throw new BadRequestException('no_module');
    const record = await this.commitmentsService.create(userId, module, dto);
    return { record: await this.visibleRecord(req.userContext.userId, record) };
  }

  @Patch(':id')
  @NeedLogin()
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCommitmentRequest) {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    // module 只是给用户身份的兜底；真正生效的模块由 service 从记录本身取，避免
    // "没传 module" 变成一个莫名其妙的 400（L1 本来就没有自己的部门）。
    const targetModule: ModuleName | undefined = dto.module || actor.module;
    const record = await this.commitmentsService.update(id, actor, { ...dto, module: targetModule });
    return { record: await this.visibleRecord(req.userContext.userId, record) };
  }

  @Delete(':id')
  @NeedLogin()
  async remove(@Req() req: Request, @Param('id') id: string): Promise<{ ok: true }> {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    await this.commitmentsService.delete(id, actor);
    return { ok: true };
  }

  @Post(':id/authorize-edit')
  @NeedLogin()
  async authorizeEdit(@Req() req: Request, @Param('id') id: string, @Body() dto: Partial<CreateEditRequest>) {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    const record = await this.commitmentsService.authorizeEdit(id, actor, dto.reason);
    return { record: await this.visibleRecord(req.userContext.userId, record) };
  }

  @Post(':id/edit-requests')
  @NeedLogin()
  async requestEdit(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateEditRequest) {
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    return { record: await this.visibleRecord(actor.userId, await this.commitmentsService.requestEdit(id, actor, dto.reason ?? '')) };
  }

  @Patch('edit-requests/:requestId')
  @NeedLogin()
  async reviewEditRequest(@Req() req: Request, @Param('requestId') requestId: string, @Body() dto: ReviewEditRequest) {
    if (!['approve', 'reject', 'cancel'].includes(dto.action)) throw new BadRequestException('invalid_action');
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    return { record: await this.visibleRecord(actor.userId, await this.commitmentsService.reviewEditRequest(requestId, actor, dto.action, dto.note)) };
  }
}
