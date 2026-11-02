import { BadRequestException, Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { NeedLogin, CanRole } from '@lark-apaas/fullstack-nestjs-core';
import { GradingService } from './grading.service';
import { RosterService } from '../roster/roster.service';
import type { GradeRequest, ModuleName } from '@shared/api.interface';

@Controller('api/grade')
export class GradingController {
  constructor(
    private readonly gradingService: GradingService,
    private readonly rosterService: RosterService,
  ) {}

  // 里程碑评级不再只属于 admin——协调人（roster.coordinatingModules 包含目标模块）
  // 也能评，实际权限判断放到 service 层做（和另外两个评级入口一致），这里只做
  // 登录门禁。
  @Post('milestone/:id')
  @NeedLogin()
  async gradeMilestone(@Req() req: Request, @Param('id') id: string, @Body() dto: GradeRequest) {
    if (dto.which !== 'weekend' && dto.which !== 'monday') throw new BadRequestException('invalid_which');
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    const record = await this.gradingService.gradeMilestone(id, dto.which, dto.grade, dto.note ?? '', actor, dto.correctionReason);
    return { record };
  }

  @Post('commitment/:module/:id')
  @NeedLogin()
  async gradeCommitment(
    @Req() req: Request,
    @Param('module') module: ModuleName,
    @Param('id') id: string,
    @Body() dto: GradeRequest,
  ) {
    if (dto.which !== 'weekend' && dto.which !== 'monday') throw new BadRequestException('invalid_which');
    const actor = await this.rosterService.scopeHolderForUser(req.userContext.userId);
    const record = await this.gradingService.gradeCommitment(module, id, dto.which, dto.grade, dto.note ?? '', actor, dto.correctionReason);
    return { record };
  }
}
