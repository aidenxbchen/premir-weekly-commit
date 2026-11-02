import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { RosterService } from './roster.service';
import { canManageModule, canManagePerson, canSetLevels } from '@shared/permissions';
import type { ScopeHolder } from '@shared/permissions';
import type {
  AddRosterMemberRequest,
  AdminLevel,
  ListRosterResponse,
  ModuleName,
  UpdateRosterMemberRequest,
} from '@shared/api.interface';

@Controller('api/roster')
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

  @Get()
  @NeedLogin()
  async list(@Query('week') week?: string): Promise<ListRosterResponse> {
    const items = await this.rosterService.listRoster(week);
    return { items };
  }

  // 加人 / 把人放进某个部门。网关侧不再用 @CanRole 卡死——三级管理员在平台侧都是
  // admin，真正的边界是"管理半径"，由下面的服务层判定。
  @Post('members')
  @NeedLogin()
  async addMember(@Req() req: Request, @Body() dto: AddRosterMemberRequest): Promise<{ ok: true }> {
    const actor: ScopeHolder = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    if (actor.level !== 'L1') throw new ForbiddenException('仅限 L1 管理员');
    const existing = (await this.rosterService.listRoster()).find((item) => item.userId === dto.userId);
    if (existing && !canManagePerson(actor, existing)) throw new ForbiddenException('超出你的管理半径');
    if (existing && dto.level !== existing.level && !canSetLevels(actor)) {
      throw new ForbiddenException('只有 L1 能调整管理员级别');
    }
    assertCanPlaceMember(actor, dto.level, dto.module, dto.managedModules);
    await this.rosterService.addMember(dto.userId, dto.level, dto.module, dto.managedModules, dto.name, dto.email);
    return { ok: true };
  }

  // 改级别 / 换部门 / 调 L2 半径。级别只有 L1 能动——提级是全局性的权力，下放的话
  // L2 就能给自己人提级来扩张势力范围。换部门和调半径则受操作者自己的半径约束。
  @Patch('members/:userId')
  @NeedLogin()
  async updateMember(
    @Req() req: Request,
    @Param('userId') userId: string,
    @Body() dto: UpdateRosterMemberRequest,
  ): Promise<{ ok: true }> {
    const actor: ScopeHolder = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    if (actor.level !== 'L1') throw new ForbiddenException('仅限 L1 管理员');
    const target: ScopeHolder = await this.rosterService.scopeHolderForUser(userId);
    if (!canManagePerson(actor, target)) throw new ForbiddenException('超出你的管理半径');
    if (dto.level !== undefined && !canSetLevels(actor)) {
      throw new ForbiddenException('只有 L1 能调整管理员级别');
    }
    const nextLevel: AdminLevel = dto.level ?? target.level;
    const nextModule: ModuleName | undefined = dto.module !== undefined ? dto.module : target.module;
    const nextManaged: ModuleName[] | undefined =
      dto.managedModules !== undefined ? dto.managedModules : target.managedModules;
    assertCanPlaceMember(actor, nextLevel, nextModule, nextManaged);
    await this.rosterService.updateMember(userId, dto);
    return { ok: true };
  }

  @Delete('members/:userId')
  @NeedLogin()
  async removeMember(@Req() req: Request, @Param('userId') userId: string): Promise<{ ok: true }> {
    const actor: ScopeHolder = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    if (actor.level !== 'L1') throw new ForbiddenException('仅限 L1 管理员');
    const target: ScopeHolder = await this.rosterService.scopeHolderForUser(userId);
    if (!canManagePerson(actor, target)) throw new ForbiddenException('超出你的管理半径');
    await this.rosterService.removeMember(userId);
    return { ok: true };
  }
}

// 一次"安置"是否越权：目标部门要在半径内；级别只有 L1 能定；L2 的管辖范围本身
// 也不能超出操作者的半径，否则就是借他人之手扩权。
function assertCanPlaceMember(
  actor: ScopeHolder,
  level: AdminLevel,
  module: ModuleName | undefined,
  managedModules: ModuleName[] | undefined,
): void {
  if (level !== 'member' && !canSetLevels(actor)) {
    throw new ForbiddenException('只有 L1 能设置管理员级别');
  }
  // L1 的半径是全局，本身不挂在任何部门下（module 为空是正常状态）；其余级别都必须
  // 归属于一个"操作者半径内"的部门。历史上这里对 L1 也走了 canManageModule，而
  // canManageModule(actor, undefined) 恒为 false，导致"把某人设为 L1"必然被拒。
  if (level !== 'L1' && (!module || !canManageModule(actor, module))) {
    throw new ForbiddenException('目标部门超出你的管理半径');
  }
  if (level === 'L2') {
    const outside: ModuleName[] = (managedModules ?? []).filter((m: ModuleName) => !canManageModule(actor, m));
    if (outside.length > 0) throw new ForbiddenException('L2 的管辖部门超出你的管理半径');
  }
}
