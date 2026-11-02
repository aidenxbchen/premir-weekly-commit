import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin } from '@lark-apaas/fullstack-nestjs-core';
import { DepartmentsService } from './departments.service';
import { RosterService } from '../roster/roster.service';
import { canSetLevels } from '@shared/permissions';
import type { ScopeHolder } from '@shared/permissions';
import type {
  CreateDepartmentRequest,
  DepartmentRecord,
  ListDepartmentsResponse,
  RenameDepartmentRequest,
} from '@shared/api.interface';

@Controller('api/departments')
export class DepartmentsController {
  constructor(
    private readonly departmentsService: DepartmentsService,
    private readonly rosterService: RosterService,
  ) {}

  @Get()
  @NeedLogin()
  async list(): Promise<ListDepartmentsResponse> {
    return { items: await this.departmentsService.list() };
  }

  @Post()
  @NeedLogin()
  async create(@Req() req: Request, @Body() dto: CreateDepartmentRequest): Promise<{ record: DepartmentRecord }> {
    await this.assertCanEditDepartments(req);
    const record: DepartmentRecord = await this.departmentsService.create(dto.name, dto.hasMilestone, dto.ranked);
    return { record };
  }

  @Patch(':id')
  @NeedLogin()
  async rename(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: RenameDepartmentRequest,
  ): Promise<{ record: DepartmentRecord }> {
    await this.assertCanEditDepartments(req);
    const record: DepartmentRecord = await this.departmentsService.rename(id, dto.name);
    return { record };
  }

  @Delete(':id')
  @NeedLogin()
  async remove(@Req() req: Request, @Param('id') id: string): Promise<{ ok: true }> {
    await this.assertCanEditDepartments(req);
    await this.departmentsService.remove(id);
    return { ok: true };
  }

  // 增删组别是全局性的组织架构变更，和"给别人定级别"同级：只有 L1 能做。
  private async assertCanEditDepartments(req: Request): Promise<void> {
    const actor: ScopeHolder = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    if (!canSetLevels(actor)) throw new ForbiddenException('只有 L1 能增删组别');
  }
}
