import { BadRequestException, ConflictException, ForbiddenException, GoneException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { commitment, commitmentEditRequest, department } from '@server/database/schema';
import { FeishuTaskService } from '../feishu-task/feishu-task.service';
import { RatingsService } from '../ratings/ratings.service';
import { RosterService } from '../roster/roster.service';
import { CommentsService } from '../comments/comments.service';
import { WeekService } from '../week/week.service';
import { isMondayInShanghai } from '@server/common/utils/week.util';
import { canManageRecord } from '@shared/permissions';
import type { ScopeHolder } from '@shared/permissions';
import type {
  CheckMark,
  CommitmentRecord,
  CreateCommitmentRequest,
  Grade,
  GradeWhich,
  ModuleName,
  UpdateCommitmentRequest,
  CommitmentEditRequestRecord,
  EditRequestStatus,
} from '@shared/api.interface';

type CommitmentRow = typeof commitment.$inferSelect;
type EditRequestRow = typeof commitmentEditRequest.$inferSelect;

function toEditRequest(row: EditRequestRow): CommitmentEditRequestRecord {
  return {
    id: row.id,
    commitmentId: row.commitmentId,
    requesterUserId: row.requesterProfile,
    reason: row.reason,
    status: row.status as EditRequestStatus,
    reviewerUserId: row.reviewerProfile ?? undefined,
    reviewNote: row.reviewNote ?? undefined,
    createdAt: row.createdAt.toISOString(),
    reviewedAt: row.reviewedAt?.toISOString(),
  };
}

function toRecord(row: CommitmentRow): CommitmentRecord {
  return {
    id: row.id,
    week: row.week,
    module: row.module as ModuleName,
    ownerUserId: row.ownerProfile,
    name: row.name ?? undefined,
    deliverable: row.deliverable ?? undefined,
    criteria: row.criteria ?? undefined,
    risk: row.risk ?? undefined,
    startTime: row.startTime ? row.startTime.toISOString() : undefined,
    endTime: row.endTime ? row.endTime.toISOString() : undefined,
    checked: (row.checked as CheckMark) ?? undefined,
    weekendGrade: (row.weekendGrade as Grade) ?? undefined,
    weekendNote: row.weekendNote ?? undefined,
    mondayGrade: (row.mondayGrade as Grade) ?? undefined,
    mondayNote: row.mondayNote ?? undefined,
    locked: row.locked,
    editAuthorized: row.editAuthorized,
  };
}

@Injectable()
export class CommitmentsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly feishuTaskService: FeishuTaskService,
    private readonly ratingsService: RatingsService,
    private readonly rosterService: RosterService,
    private readonly commentsService: CommentsService,
    private readonly weekService: WeekService,
  ) {}

  // 除评级（含验收打钩，是评级的前置条件，不锁）外，过去的周只能查看，不能再
  // 新增/编辑/删除——只有最新一周允许改动。
  private async assertCurrentWeek(week: string): Promise<void> {
    const current: string = await this.weekService.currentWeekLabel();
    if (week !== current) throw new ConflictException('past_week_locked');
  }

  async listByModuleWeek(module: string, week: string): Promise<CommitmentRecord[]> {
    const rows: CommitmentRow[] = await this.db
      .select()
      .from(commitment)
      .where(and(eq(commitment.module, module), eq(commitment.week, week)));
    return this.withEditRequests(rows.map((row) => toRecord(row)));
  }

  // 一次取多个部门的周承诺。里程碑页/周承诺页本来是一个部门发一次请求，一个页面上
  // 七次往返；合并成一次之后，服务端也只需要一轮查询。
  async listByModulesWeek(modules: string[], week: string): Promise<CommitmentRecord[]> {
    if (modules.length === 0) return [];
    const rows: CommitmentRow[] = await this.db
      .select()
      .from(commitment)
      .where(and(inArray(commitment.module, modules), eq(commitment.week, week)));
    return this.withEditRequests(rows.map((row) => toRecord(row)));
  }

  async listMine(ownerUserId: string, week: string): Promise<CommitmentRecord[]> {
    const rows: CommitmentRow[] = await this.db
      .select()
      .from(commitment)
      .where(and(eq(commitment.ownerProfile, ownerUserId), eq(commitment.week, week)));
    return this.withEditRequests(rows.map((row) => toRecord(row)));
  }

  async getById(id: string): Promise<CommitmentRecord | undefined> {
    const rows: CommitmentRow[] = await this.db.select().from(commitment).where(eq(commitment.id, id)).limit(1);
    return rows[0] ? this.withEditRequest(toRecord(rows[0])) : undefined;
  }

  // 单条记录（创建/更新之后返回）用这个。
  private async withEditRequest(record: CommitmentRecord): Promise<CommitmentRecord> {
    const rows: EditRequestRow[] = await this.db
      .select()
      .from(commitmentEditRequest)
      .where(eq(commitmentEditRequest.commitmentId, record.id))
      .orderBy(desc(commitmentEditRequest.createdAt))
      .limit(1);
    return rows[0] ? { ...record, editRequest: toEditRequest(rows[0]) } : record;
  }

  // 列表用这个：一次把这一批承诺的最新修改申请查出来，而不是每条一次查询。
  // 列表接口原先对每条记录查一次修改申请、再查两次 roster（见 CommitmentsController
  // 的批量档位），一个模块几十条就是几十次查询——线上 GET /api/commitments 的
  // p50 1.4s、p95 3s 就是这么堆出来的，而里程碑页还会按部门并发调用它。
  private async withEditRequests(records: CommitmentRecord[]): Promise<CommitmentRecord[]> {
    if (records.length === 0) return records;
    const rows: EditRequestRow[] = await this.db
      .select()
      .from(commitmentEditRequest)
      .where(inArray(commitmentEditRequest.commitmentId, records.map((record) => record.id)))
      .orderBy(desc(commitmentEditRequest.createdAt));
    // 已按创建时间倒序，每条承诺取第一份就是最新的那一份。
    const latest = new Map<string, EditRequestRow>();
    for (const row of rows) {
      if (!latest.has(row.commitmentId)) latest.set(row.commitmentId, row);
    }
    return records.map((record) => {
      const row = latest.get(record.id);
      return row ? { ...record, editRequest: toEditRequest(row) } : record;
    });
  }

  // 组别现在是数据驱动的（department 表）：module 必须是表里真实存在的一个组别。
  // 所有小组都用这套周承诺，硬件模块和嵌入式组只是 module 值不同，没有别的特判。
  private async assertSupported(module: string): Promise<void> {
    if (!module) throw new BadRequestException('missing_module');
    const rows: Array<{ name: string }> = await this.db
      .select({ name: department.name })
      .from(department)
      .where(eq(department.name, module))
      .limit(1);
    if (rows.length === 0) throw new GoneException(`unknown_module:${module}`);
  }

  async isModuleReady(module: ModuleName, week: string): Promise<boolean> {
    const items: CommitmentRecord[] = await this.listByModuleWeek(module, week);
    return items.length > 0 && items.every((c: CommitmentRecord) => c.checked === '✅' || c.checked === '❌' || c.checked === '⏹️');
  }

  async create(ownerUserId: string, module: ModuleName, req: CreateCommitmentRequest): Promise<CommitmentRecord> {
    await this.assertSupported(module);
    const deliverable = req.deliverable?.trim();
    const criteria = req.criteria?.trim();
    if (!req.week || !deliverable || !criteria) throw new BadRequestException('missing_fields');
    if (deliverable.length > 2000 || criteria.length > 5000 || (req.risk?.length ?? 0) > 5000) throw new BadRequestException('text_too_long');
    this.assertTimeRange(req.startTime, req.endTime);
    await this.assertCurrentWeek(req.week);
    if (await this.ratingsService.hasGrade(ownerUserId, req.week)) throw new ConflictException('rating_requires_reopen');
    const name: string | undefined = await this.rosterService.getNameForUser(ownerUserId);
    const inserted = await this.db
      .insert(commitment)
      .values({
        week: req.week,
        module,
        ownerProfile: ownerUserId,
        name: name ?? null,
        deliverable,
        criteria,
        risk: req.risk ?? '',
        startTime: req.startTime ? new Date(req.startTime) : null,
        endTime: req.endTime ? new Date(req.endTime) : null,
        locked: true,
      })
      .returning();
    const record: CommitmentRecord = toRecord(inserted[0]);
    await this.feishuTaskService.createDeliverableTask({
      ownerMiaodaUserId: ownerUserId,
      week: req.week,
      moduleLabel: module,
      deliverable: req.deliverable,
      criteria: req.criteria,
      startTime: record.startTime,
      endTime: record.endTime,
    });
    return record;
  }

  async update(
    id: string,
    actor: ScopeHolder,
    req: UpdateCommitmentRequest,
  ): Promise<CommitmentRecord> {
    const existing: CommitmentRow | undefined = (await this.db.select().from(commitment).where(eq(commitment.id, id)).limit(1))[0];
    if (!existing) throw new BadRequestException('not_found');
    // 权限判断一律用这条交付物真实所属的模块（existing.module），不用调用方传入的
    // req.module——协调人的 req.module 在 controller 侧会被强制收窄成他自己所在的
    // 模块（防止普通组员伪造模块越权），如果这里再信 req.module，协调人对"自己所在
    // 模块以外、但自己协调"的模块做验收打钩时，权限检查会查错模块。
    await this.assertSupported(existing.module);

    const wantsOwnerFields: boolean =
      req.deliverable !== undefined ||
      req.criteria !== undefined ||
      req.risk !== undefined ||
      req.startTime !== undefined ||
      req.endTime !== undefined;

    const set: Partial<CommitmentRow> = { updatedAt: new Date() };

    const isOwner: boolean = existing.ownerProfile === actor.userId;
    // 管理员在管理半径内可以代改下属的内容（"允许下属部门去进行一些内容上的修改"）。
    // 找上级/越级的人一律挡掉：canManagePerson 已经包含"半径内 + 不评自己 + 下级不评上级"。
    const ownerHolder: ScopeHolder = isOwner ? actor : await this.rosterService.scopeHolderForUser(existing.ownerProfile);
    const mayManageOwner: boolean = canManageRecord(actor, ownerHolder, existing.module as ModuleName);

    if (wantsOwnerFields) {
      if (!isOwner) {
        if (!mayManageOwner) throw new ForbiddenException('forbidden');
        throw new ForbiddenException('manager_must_return_for_edit');
      }
      await this.assertCurrentWeek(existing.week);
      // 每周一全天放开修改：本人不需要管理员逐条解锁；周二 0 点起恢复锁定。
      // 管理员代改时不看这条——下属的记录创建后一律是锁定的，否则这个能力等于没有。
      if (isOwner && existing.locked && !existing.editAuthorized && !isMondayInShanghai()) throw new ConflictException('locked');
      const nextDeliverable = req.deliverable !== undefined ? req.deliverable.trim() : existing.deliverable?.trim();
      const nextCriteria = req.criteria !== undefined ? req.criteria.trim() : existing.criteria?.trim();
      if (!nextDeliverable || !nextCriteria) throw new BadRequestException('missing_fields');
      if (nextDeliverable.length > 2000 || nextCriteria.length > 5000 || (req.risk?.length ?? existing.risk?.length ?? 0) > 5000) {
        throw new BadRequestException('text_too_long');
      }
      this.assertTimeRange(
        req.startTime !== undefined ? req.startTime : existing.startTime?.toISOString(),
        req.endTime !== undefined ? req.endTime : existing.endTime?.toISOString(),
      );
      if (req.deliverable !== undefined) set.deliverable = req.deliverable.trim();
      if (req.criteria !== undefined) set.criteria = req.criteria.trim();
      if (req.risk !== undefined) set.risk = req.risk.trim();
      if (req.startTime !== undefined) set.startTime = req.startTime ? new Date(req.startTime) : null;
      if (req.endTime !== undefined) set.endTime = req.endTime ? new Date(req.endTime) : null;
      set.locked = true;
      set.editAuthorized = false;
    }

    if (req.check !== undefined) {
      // 同一个判定：canManagePerson 本身就排除了"评自己"，所以本人给自己打钩依旧不行。
      if (!mayManageOwner) throw new ForbiddenException('forbidden');
      if (!['✅', '❌', '⏹️'].includes(req.check)) throw new BadRequestException('invalid_check');
      set.checked = req.check;
    }

    const checkInvalidatesRating = req.check !== undefined && await this.ratingsService.hasGrade(existing.ownerProfile, existing.week);
    await this.db.update(commitment).set(set).where(eq(commitment.id, id));
    if (wantsOwnerFields || checkInvalidatesRating) {
      await this.ratingsService.reopenForMember(existing.ownerProfile, existing.module as ModuleName, existing.week, actor.userId,
        wantsOwnerFields ? '承诺内容发生变更' : '完成状态发生变更');
    }
    if (wantsOwnerFields) {
      await this.db
        .update(commitmentEditRequest)
        .set({ status: 'consumed', updatedAt: new Date() })
        .where(and(eq(commitmentEditRequest.commitmentId, id), eq(commitmentEditRequest.status, 'approved')));
    }
    const updated = await this.getById(id);
    return updated!;
  }

  // 管理员一次性授权：解锁本人下次保存这条交付物的编辑，保存成功后自动重新锁定。
  async authorizeEdit(id: string, actor: ScopeHolder, reason = '管理员开放一次修改权限'): Promise<CommitmentRecord> {
    const existing: CommitmentRecord | undefined = await this.getById(id);
    if (!existing) throw new BadRequestException('not_found');
    await this.assertCurrentWeek(existing.week);
    const owner = await this.rosterService.scopeHolderForUser(existing.ownerUserId);
    if (!canManageRecord(actor, owner, existing.module)) throw new ForbiddenException('forbidden');
    const cleanReason = reason.trim() || '管理员开放一次修改权限';
    if (cleanReason.length > 500) throw new BadRequestException('text_too_long');
    const pending = (await this.db.select().from(commitmentEditRequest)
      .where(and(eq(commitmentEditRequest.commitmentId, id), eq(commitmentEditRequest.status, 'pending')))
      .orderBy(desc(commitmentEditRequest.createdAt)).limit(1))[0];
    if (pending) {
      await this.db.update(commitmentEditRequest).set({
        status: 'approved', reviewerProfile: actor.userId, reviewNote: cleanReason,
        reviewedAt: new Date(), updatedAt: new Date(),
      }).where(eq(commitmentEditRequest.id, pending.id));
    } else {
      await this.db.insert(commitmentEditRequest).values({
        commitmentId: id, requesterProfile: actor.userId, reason: cleanReason,
        status: 'approved', reviewerProfile: actor.userId, reviewNote: cleanReason, reviewedAt: new Date(),
      });
    }
    await this.db.update(commitment).set({ editAuthorized: true, updatedAt: new Date() }).where(eq(commitment.id, id));
    const updated = await this.getById(id);
    return updated!;
  }

  async requestEdit(id: string, actor: ScopeHolder, reason: string): Promise<CommitmentRecord> {
    const existing = await this.getById(id);
    if (!existing) throw new BadRequestException('not_found');
    if (existing.ownerUserId !== actor.userId) throw new ForbiddenException('forbidden');
    await this.assertCurrentWeek(existing.week);
    if (existing.editAuthorized) throw new ConflictException('edit_already_authorized');
    const clean = reason.trim();
    if (clean.length < 2) throw new BadRequestException('edit_reason_required');
    if (clean.length > 500) throw new BadRequestException('text_too_long');
    const pending = await this.db.select({ id: commitmentEditRequest.id }).from(commitmentEditRequest)
      .where(and(eq(commitmentEditRequest.commitmentId, id), eq(commitmentEditRequest.status, 'pending'))).limit(1);
    if (pending.length) throw new ConflictException('edit_request_pending');
    await this.db.insert(commitmentEditRequest).values({ commitmentId: id, requesterProfile: actor.userId, reason: clean });
    return (await this.getById(id))!;
  }

  async reviewEditRequest(requestId: string, actor: ScopeHolder, action: 'approve' | 'reject' | 'cancel', note = ''): Promise<CommitmentRecord> {
    const request = (await this.db.select().from(commitmentEditRequest).where(eq(commitmentEditRequest.id, requestId)).limit(1))[0];
    if (!request) throw new BadRequestException('not_found');
    if (request.status !== 'pending') throw new ConflictException('edit_request_resolved');
    const existing = await this.getById(request.commitmentId);
    if (!existing) throw new BadRequestException('not_found');
    await this.assertCurrentWeek(existing.week);
    if (action === 'cancel') {
      if (request.requesterProfile !== actor.userId) throw new ForbiddenException('forbidden');
      await this.db.update(commitmentEditRequest).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(commitmentEditRequest.id, requestId));
      return (await this.getById(existing.id))!;
    }
    const owner = await this.rosterService.scopeHolderForUser(existing.ownerUserId);
    if (!canManageRecord(actor, owner, existing.module)) throw new ForbiddenException('forbidden');
    const cleanNote = note.trim();
    if (cleanNote.length > 500) throw new BadRequestException('text_too_long');
    await this.db.update(commitmentEditRequest).set({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewerProfile: actor.userId,
      reviewNote: cleanNote || null,
      reviewedAt: new Date(),
      updatedAt: new Date(),
    }).where(eq(commitmentEditRequest.id, requestId));
    if (action === 'approve') {
      await this.db.update(commitment).set({ editAuthorized: true, updatedAt: new Date() }).where(eq(commitment.id, existing.id));
    }
    return (await this.getById(existing.id))!;
  }

  private assertTimeRange(start?: string, end?: string): void {
    const startDate = start ? new Date(start) : undefined;
    const endDate = end ? new Date(end) : undefined;
    if ((startDate && Number.isNaN(startDate.getTime())) || (endDate && Number.isNaN(endDate.getTime()))) {
      throw new BadRequestException('invalid_time');
    }
    if (startDate && endDate && startDate > endDate) throw new BadRequestException('invalid_time_range');
  }

  async applyGrade(id: string, which: GradeWhich, grade: Grade, note: string): Promise<CommitmentRecord> {
    const set: Partial<CommitmentRow> = { updatedAt: new Date() };
    if (which === 'weekend') {
      set.weekendGrade = grade;
      set.weekendNote = note;
    } else {
      set.mondayGrade = grade;
      set.mondayNote = note;
    }
    await this.db.update(commitment).set(set).where(eq(commitment.id, id));
    const updated = await this.getById(id);
    return updated!;
  }

  // 管理员重置工具：删掉一条交付物；如果这是该成员本周在本模块的最后一条
  // 交付物，一并清掉他这一周的评级行（评级是靠"全部交付物都勾选完"才评的，
  // 交付物都没了留着评级就是查无来处的孤儿数据）。
  // 但模块负责人自己的评级来自里程碑评级同步，不是靠这套"交付物勾完才评"的
  // 流程算出来的——删光负责人自己的周承诺不该连带清掉这份由里程碑同步过来的
  // 评级，那样会把一个仍然有效的里程碑评级变成查无来处的孤儿数据，且没有
  // 直接的办法补回来（里程碑本身没删，评级却已被清空，重新评一次会被
  // assertGradeNotSet 挡住）。
  async delete(id: string, actor: ScopeHolder): Promise<void> {
    const existing: CommitmentRecord | undefined = await this.getById(id);
    if (!existing) return;
    await this.assertCurrentWeek(existing.week);
    const owner = await this.rosterService.scopeHolderForUser(existing.ownerUserId);
    if (!canManageRecord(actor, owner, existing.module)) throw new ForbiddenException('forbidden');
    await this.db.delete(commitmentEditRequest).where(eq(commitmentEditRequest.commitmentId, id));
    await this.db.delete(commitment).where(eq(commitment.id, id));
    // 承诺整条没了，挂在它上面的讨论也一起清掉
    await this.commentsService.removeForTargets(['commitment'], [id]);
    const siblings: CommitmentRecord[] = await this.listByModuleWeek(existing.module, existing.week);
    const stillHasOther: boolean = siblings.some((c: CommitmentRecord) => c.ownerUserId === existing.ownerUserId);
    if (stillHasOther) return;
    const leadUserId: string | undefined = await this.rosterService.leadUserIdForModule(existing.module);
    if (existing.ownerUserId === leadUserId) return;
    await this.ratingsService.deleteForMember(existing.week, existing.ownerUserId);
  }
}
