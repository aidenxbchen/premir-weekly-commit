import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq } from 'drizzle-orm';
import { milestone } from '@server/database/schema';
import { CommitmentsService } from '../commitments/commitments.service';
import { RatingsService } from '../ratings/ratings.service';
import { WeekService } from '../week/week.service';
import { RosterService } from '../roster/roster.service';
import { CommentsService } from '../comments/comments.service';
import { canGradeModule, canManageModule, isGlobalAdmin } from '@shared/permissions';
import type { ScopeHolder } from '@shared/permissions';
import type { Grade, GradeWhich, MilestoneRecord, ModuleName, SaveMilestoneRequest, TeamRole } from '@shared/api.interface';

// 验收勾选三种状态：✅ 达标 / ❌ 未达标 / ⏹️ 无法评（依赖的前置工作未完成），
// 未勾选用 · 占位。之前用字符类正则漏了 ⏹️，导致选"无法评"会被当成非法输入；
// 而且 ⏹️ 是组合字符，塞进字符类会触发 no-misleading-character-class 报错，
// 改成按逗号拆开逐项校验更清晰。
const CHECK_VALUES: ReadonlySet<string> = new Set(['✅', '❌', '⏹️', '·', '']);

function isValidChecklist(value: string): boolean {
  return value.split(',').every((part: string) => CHECK_VALUES.has(part));
}

type MilestoneRow = typeof milestone.$inferSelect;

function toRecord(row: MilestoneRow): MilestoneRecord {
  return {
    id: row.id,
    week: row.week,
    module: row.module as ModuleName,
    description: row.description ?? undefined,
    bCriteria: row.bCriteria ?? undefined,
    bPlusCriteria: row.bPlusCriteria ?? undefined,
    bCheck: row.bCheck ?? undefined,
    bPlusCheck: row.bPlusCheck ?? undefined,
    bPlusEditAuthorized: row.bPlusEditAuthorized === true,
    bPlusEditReason: row.bPlusEditReason ?? undefined,
    leadUserId: row.leadProfile ?? undefined,
    weekendGrade: (row.weekendGrade as Grade) ?? undefined,
    weekendNote: row.weekendNote ?? undefined,
    mondayGrade: (row.mondayGrade as Grade) ?? undefined,
    mondayNote: row.mondayNote ?? undefined,
  };
}

@Injectable()
export class MilestonesService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly commitmentsService: CommitmentsService,
    private readonly ratingsService: RatingsService,
    private readonly weekService: WeekService,
    private readonly rosterService: RosterService,
    private readonly commentsService: CommentsService,
  ) {}

  // 除评级（含验收打钩，是评级的前置条件，不锁）外，过去的周只能查看，不能再
  // 编辑里程碑描述/验收标准文字，也不能删除——只有最新一周允许改动。
  private async assertCurrentWeek(week: string): Promise<void> {
    const current: string = await this.weekService.currentWeekLabel();
    if (week !== current) throw new ConflictException('past_week_locked');
  }

  async listByWeek(week: string): Promise<MilestoneRecord[]> {
    const rows: MilestoneRow[] = await this.db.select().from(milestone).where(eq(milestone.week, week));
    return rows.map(toRecord);
  }

  async getById(id: string): Promise<MilestoneRecord | undefined> {
    const rows: MilestoneRow[] = await this.db.select().from(milestone).where(eq(milestone.id, id)).limit(1);
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  private async getRowByWeekModule(week: string, targetModule: string): Promise<MilestoneRow | undefined> {
    const rows: MilestoneRow[] = await this.db
      .select()
      .from(milestone)
      .where(and(eq(milestone.week, week), eq(milestone.module, targetModule)))
      .limit(1);
    return rows[0];
  }

  async saveFields(
    req: SaveMilestoneRequest,
    actor: ScopeHolder,
  ): Promise<MilestoneRecord> {
    // 目标模块：半径内的部门都可以指定（L1 全部、L2 勾选的清单、L3 自己部门）；
    // 指定了半径之外的模块直接拒绝，没指定就落到本人所在部门。
    const requested: ModuleName | undefined = (req.module ?? actor.module) as ModuleName | undefined;
    if (!req.week || !requested) throw new BadRequestException('missing_fields');
    // 里程碑文本（描述 / B / B+ 验收标准）：半径内即可写——L3 部门管理员和
    // L4 组内协调人都能写，所以这里用 canManageModule 而不是 canGradeModule。
    if (!canManageModule(actor, requested)) throw new ForbiddenException('forbidden');
    const targetModule: string = requested;

    const wantsTextEdit: boolean = req.description !== undefined || req.bCriteria !== undefined || req.bPlusCriteria !== undefined;
    if (wantsTextEdit) {
      await this.assertCurrentWeek(req.week);
    }

    const wantsCheck: boolean = req.bCheck !== undefined || req.bPlusCheck !== undefined;
    // 验收打钩是评级的前置动作，跟评级同权：L4 写得了里程碑内容，但不能打钩。
    if (wantsCheck && !canGradeModule(actor, requested)) throw new ForbiddenException('forbidden');
    if (req.bCheck !== undefined && !isValidChecklist(req.bCheck)) throw new BadRequestException('invalid_check');
    if (req.bPlusCheck !== undefined && !isValidChecklist(req.bPlusCheck)) {
      throw new BadRequestException('invalid_check');
    }
    if (wantsCheck) {
      const ready: boolean = await this.commitmentsService.isModuleReady(targetModule as ModuleName, req.week);
      if (!ready) throw new ConflictException('commitments_not_checked');
    }

    const existing: MilestoneRow | undefined = await this.getRowByWeekModule(req.week, targetModule);
    const fields: Partial<MilestoneRow> = {};
    if (req.description !== undefined) fields.description = req.description;
    if (req.bCriteria !== undefined) fields.bCriteria = req.bCriteria;
    if (req.bPlusCriteria !== undefined) fields.bPlusCriteria = req.bPlusCriteria;
    if (req.bCheck !== undefined) fields.bCheck = req.bCheck;
    if (req.bPlusCheck !== undefined) fields.bPlusCheck = req.bPlusCheck;
    // 被 L1 退回重做的 B+ 标准：负责人改了标准、或者重新勾了一次验收，退回状态就结束了。
    if (req.bPlusCriteria !== undefined || req.bPlusCheck !== undefined) {
      fields.bPlusEditAuthorized = false;
      fields.bPlusEditReason = null;
    }

    if (existing) {
      await this.db.update(milestone).set({ ...fields, updatedAt: new Date() }).where(eq(milestone.id, existing.id));
      const updated = await this.getById(existing.id);
      return updated!;
    }
    // leadProfile 决定这条里程碑评级最终同步给谁的个人成绩——必须是这个模块正式
    // 登记的组长，不能想当然用"谁先保存的"（比如 admin 代填，或者这个模块压根没有
    // 组长，如全功能样机组，此时就该是 undefined，评级不产生任何人的个人成绩）。
    const leadUserId: string | undefined = await this.rosterService.leadUserIdForModule(targetModule as ModuleName);
    const inserted = await this.db
      .insert(milestone)
      .values({ ...fields, week: req.week, module: targetModule, leadProfile: leadUserId ?? null })
      .returning();
    return toRecord(inserted[0]);
  }

  // 管理员重置工具：删掉本模块本周的里程碑，并清掉配套的模块评级记录——里程碑
  // 评级现在只落在 module_rating（和"谁是负责人"解耦，见 gradeMilestone），
  // 删了里程碑却留着这条记录会变成查无来处的孤儿数据。
  async delete(id: string, actor: ScopeHolder): Promise<void> {
    const existing: MilestoneRecord | undefined = await this.getById(id);
    if (!existing) return;
    await this.assertCurrentWeek(existing.week);
    // 删里程碑会连带清掉配套的模块评级，属于管理动作——L4 协调人不做。
    if (!canGradeModule(actor, existing.module)) throw new ForbiddenException('forbidden');
    await this.db.delete(milestone).where(eq(milestone.id, id));
    await this.ratingsService.deleteModuleRating(existing.week, existing.module);
    // 里程碑整行没了，挂在它上面的三处讨论也一起清掉，不留孤儿评论
    await this.commentsService.removeForTargets(
      ['milestone_description', 'milestone_b', 'milestone_b_plus'],
      [id],
    );
  }

  async applyGrade(id: string, which: GradeWhich, grade: Grade, note: string): Promise<MilestoneRecord> {
    const set: Partial<MilestoneRow> = { updatedAt: new Date() };
    if (which === 'weekend') {
      set.weekendGrade = grade;
      set.weekendNote = note;
    } else {
      set.mondayGrade = grade;
      set.mondayNote = note;
    }
    await this.db.update(milestone).set(set).where(eq(milestone.id, id));
    const updated = await this.getById(id);
    return updated!;
  }

  // 只有 L1 能做的两个管理动作，都只作用于 B+ 验收标准（B 标准不动）：
  //
  // 退回：把"验收"这一步退回去重做——B+ 的勾选全部清空，负责人可以改标准、重新验收，
  //       退回原因记在 b_plus_edit_reason 里，负责人重新验收时由他自己的下一次保存清掉。
  //       已经评过的模块评级不自动撤回：改了验收前提之后重新评级时，系统会要求填更正理由
  //       （见 applyModuleGrade），那比悄悄删掉一条评级记录更说得清。
  // 删除：写错了就直接把这份 B+ 标准（含勾选、以及退回状态）清空，负责人可以重新写一条。
  async reopenBPlus(id: string, actor: ScopeHolder, reason: string): Promise<MilestoneRecord> {
    const cleanReason: string = reason.trim();
    if (cleanReason.length < 2) throw new BadRequestException('edit_reason_required');
    if (cleanReason.length > 500) throw new BadRequestException('text_too_long');
    return this.clearBPlus(id, actor, false, cleanReason);
  }

  async deleteBPlus(id: string, actor: ScopeHolder): Promise<MilestoneRecord> {
    return this.clearBPlus(id, actor, true, '');
  }

  private async clearBPlus(id: string, actor: ScopeHolder, dropCriteria: boolean, reason: string): Promise<MilestoneRecord> {
    if (!isGlobalAdmin(actor)) {
      throw new ForbiddenException(dropCriteria ? '只有 L1 能删除 B+ 验收标准' : '只有 L1 能退回 B+ 验收标准');
    }
    const existing: MilestoneRecord | undefined = await this.getById(id);
    if (!existing) throw new BadRequestException('not_found');
    await this.assertCurrentWeek(existing.week);
    const set: Partial<MilestoneRow> = { bPlusCheck: null, updatedAt: new Date() };
    if (dropCriteria) {
      set.bPlusCriteria = null;
      set.bPlusEditAuthorized = false;
      set.bPlusEditReason = null;
    } else {
      set.bPlusEditAuthorized = true;
      set.bPlusEditReason = reason;
    }
    await this.db.update(milestone).set(set).where(eq(milestone.id, id));
    const updated = await this.getById(id);
    return updated!;
  }
}
