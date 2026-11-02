import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq } from 'drizzle-orm';
import { commitment, milestone, moduleRating, rating, ratingChangeLog } from '@server/database/schema';
import { RosterService } from '../roster/roster.service';
import type { Grade, GradeWhich, ModuleName, ModuleRatingRecord, RatingRecord } from '@shared/api.interface';

type RatingRow = typeof rating.$inferSelect;
type ModuleRatingRow = typeof moduleRating.$inferSelect;

function toRecord(row: RatingRow): RatingRecord {
  return {
    id: row.id,
    week: row.week,
    module: row.module as ModuleName,
    memberUserId: row.memberProfile,
    name: row.name ?? undefined,
    weekendGrade: (row.weekendGrade as Grade) ?? undefined,
    weekendNote: row.weekendNote ?? undefined,
    mondayGrade: (row.mondayGrade as Grade) ?? undefined,
    mondayNote: row.mondayNote ?? undefined,
  };
}

function toModuleRecord(row: ModuleRatingRow): ModuleRatingRecord {
  return {
    id: row.id,
    week: row.week,
    module: row.module as ModuleName,
    weekendGrade: (row.weekendGrade as Grade) ?? undefined,
    weekendNote: row.weekendNote ?? undefined,
    mondayGrade: (row.mondayGrade as Grade) ?? undefined,
    mondayNote: row.mondayNote ?? undefined,
  };
}

@Injectable()
export class RatingsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly rosterService: RosterService,
  ) {}

  async listByWeek(week: string): Promise<RatingRecord[]> {
    const rows: RatingRow[] = await this.db.select().from(rating).where(eq(rating.week, week));
    return rows.map(toRecord);
  }

  // 管理员历史统计需要完整记录；普通成员通过 listForMember 读取本人数据。
  async listAll(): Promise<RatingRecord[]> {
    const rows: RatingRow[] = await this.db.select().from(rating);
    return rows.map(toRecord);
  }

  async listForMember(memberUserId: string): Promise<RatingRecord[]> {
    const rows: RatingRow[] = await this.db.select().from(rating).where(eq(rating.memberProfile, memberUserId));
    return rows.map(toRecord);
  }

  async hasGrade(memberUserId: string, week: string): Promise<boolean> {
    const row = await this.getRow(week, memberUserId);
    return !!(row?.weekendGrade || row?.mondayGrade);
  }

  async applyPersonGrade(
    memberUserId: string,
    module: ModuleName,
    week: string,
    which: GradeWhich,
    grade: Grade,
    note: string,
    actorUserId: string,
    correctionReason?: string,
  ): Promise<RatingRecord> {
    const existing = await this.getRow(week, memberUserId);
    const previousGrade = (which === 'weekend' ? existing?.weekendGrade : existing?.mondayGrade) as Grade | null | undefined;
    const previousNote = which === 'weekend' ? existing?.weekendNote : existing?.mondayNote;
    const reason = correctionReason?.trim();
    if (previousGrade && (!reason || reason.length < 2)) throw new BadRequestException('correction_reason_required');
    if ((reason?.length ?? 0) > 500) throw new BadRequestException('text_too_long');
    const name = await this.rosterService.getNameForUser(memberUserId);

    await this.db.transaction(async (tx) => {
      if (previousGrade) {
        await tx.insert(ratingChangeLog).values({
          subjectType: 'person', subjectId: memberUserId, week, module, which,
          previousGrade, previousNote: previousNote ?? null, nextGrade: grade, nextNote: note,
          reason: reason!, actorProfile: actorUserId,
        });
      }
      const commitmentSet = which === 'weekend'
        ? { weekendGrade: grade, weekendNote: note, updatedAt: new Date() }
        : { mondayGrade: grade, mondayNote: note, updatedAt: new Date() };
      await tx.update(commitment).set(commitmentSet).where(and(
        eq(commitment.week, week), eq(commitment.module, module), eq(commitment.ownerProfile, memberUserId),
      ));
      const ratingSet = which === 'weekend'
        ? { weekendGrade: grade, weekendNote: note, module, name: name ?? null, updatedAt: new Date() }
        : { mondayGrade: grade, mondayNote: note, module, name: name ?? null, updatedAt: new Date() };
      if (existing) await tx.update(rating).set(ratingSet).where(eq(rating.id, existing.id));
      else await tx.insert(rating).values({ week, module, memberProfile: memberUserId, name: name ?? null, ...ratingSet });
    });
    return toRecord((await this.getRow(week, memberUserId))!);
  }

  async reopenForMember(memberUserId: string, module: ModuleName, week: string, actorUserId: string, reason: string): Promise<void> {
    const existing = await this.getRow(week, memberUserId);
    if (!existing || (!existing.weekendGrade && !existing.mondayGrade)) return;
    await this.db.transaction(async (tx) => {
      for (const which of ['weekend', 'monday'] as const) {
        const previousGrade = which === 'weekend' ? existing.weekendGrade : existing.mondayGrade;
        if (!previousGrade) continue;
        await tx.insert(ratingChangeLog).values({
          subjectType: 'person', subjectId: memberUserId, week, module, which,
          previousGrade, previousNote: which === 'weekend' ? existing.weekendNote : existing.mondayNote,
          nextGrade: null, nextNote: null, reason, actorProfile: actorUserId,
        });
      }
      await tx.update(rating).set({ weekendGrade: null, weekendNote: null, mondayGrade: null, mondayNote: null, updatedAt: new Date() })
        .where(eq(rating.id, existing.id));
      await tx.update(commitment).set({ weekendGrade: null, weekendNote: null, mondayGrade: null, mondayNote: null, updatedAt: new Date() })
        .where(and(eq(commitment.week, week), eq(commitment.module, module), eq(commitment.ownerProfile, memberUserId)));
    });
  }

  async applyModuleGrade(
    milestoneId: string, module: ModuleName, week: string, which: GradeWhich, grade: Grade, note: string,
    actorUserId: string, correctionReason?: string,
  ): Promise<ModuleRatingRecord> {
    const existing = await this.getModuleRow(week, module);
    const previousGrade = (which === 'weekend' ? existing?.weekendGrade : existing?.mondayGrade) as Grade | null | undefined;
    const previousNote = which === 'weekend' ? existing?.weekendNote : existing?.mondayNote;
    const reason = correctionReason?.trim();
    if (previousGrade && (!reason || reason.length < 2)) throw new BadRequestException('correction_reason_required');
    await this.db.transaction(async (tx) => {
      if (previousGrade) await tx.insert(ratingChangeLog).values({
        subjectType: 'module', subjectId: module, week, module, which,
        previousGrade, previousNote: previousNote ?? null, nextGrade: grade, nextNote: note,
        reason: reason!, actorProfile: actorUserId,
      });
      const set = which === 'weekend'
        ? { weekendGrade: grade, weekendNote: note, updatedAt: new Date() }
        : { mondayGrade: grade, mondayNote: note, updatedAt: new Date() };
      await tx.update(milestone).set(set).where(eq(milestone.id, milestoneId));
      if (existing) await tx.update(moduleRating).set(set).where(eq(moduleRating.id, existing.id));
      else await tx.insert(moduleRating).values({ week, module, ...set });
    });
    return toModuleRecord((await this.getModuleRow(week, module))!);
  }

  private async getRow(week: string, memberUserId: string): Promise<RatingRow | undefined> {
    const rows: RatingRow[] = await this.db
      .select()
      .from(rating)
      .where(and(eq(rating.week, week), eq(rating.memberProfile, memberUserId)))
      .limit(1);
    return rows[0];
  }

  async upsertForMember(
    memberUserId: string,
    module: ModuleName,
    week: string,
    fields: { mondayGrade?: Grade; mondayNote?: string; weekendGrade?: Grade; weekendNote?: string },
  ): Promise<RatingRecord> {
    const existing: RatingRow | undefined = await this.getRow(week, memberUserId);
    const set: Partial<RatingRow> = {};
    if (fields.mondayGrade !== undefined) set.mondayGrade = fields.mondayGrade;
    if (fields.mondayNote !== undefined) set.mondayNote = fields.mondayNote;
    if (fields.weekendGrade !== undefined) set.weekendGrade = fields.weekendGrade;
    if (fields.weekendNote !== undefined) set.weekendNote = fields.weekendNote;

    // 落一份姓名快照，历史评级不再依赖事后用 user_id 反查（人删了也还能看到名字）。
    const name: string | undefined = await this.rosterService.getNameForUser(memberUserId);

    if (existing) {
      await this.db
        .update(rating)
        .set({ ...set, module, name: name ?? null, updatedAt: new Date() })
        .where(eq(rating.id, existing.id));
      const updated = await this.getRow(week, memberUserId);
      return toRecord(updated!);
    }
    const inserted = await this.db
      .insert(rating)
      .values({ week, module, memberProfile: memberUserId, name: name ?? null, ...set })
      .returning();
    return toRecord(inserted[0]);
  }

  // 管理员重置工具：删掉一个人在某一周的评级行——由删除该周对应的里程碑/周承诺
  // 触发（这两处才是评级的唯一数据来源），不是独立的用户操作入口。
  async deleteForMember(week: string, memberUserId: string): Promise<void> {
    const existing: RatingRow | undefined = await this.getRow(week, memberUserId);
    if (!existing) return;
    await this.db.delete(rating).where(eq(rating.id, existing.id));
  }

  async syncGradeFromModule(
    memberUserId: string,
    module: ModuleName,
    week: string,
    which: GradeWhich,
    grade: Grade,
    note: string,
  ): Promise<RatingRecord> {
    if (which === 'weekend') {
      return this.upsertForMember(memberUserId, module, week, { weekendGrade: grade, weekendNote: note });
    }
    return this.upsertForMember(memberUserId, module, week, { mondayGrade: grade, mondayNote: note });
  }

  // 模块自身的周里程碑评级——和"谁是负责人"完全解耦，不产生任何人的个人评级，
  // 也不进全员排行榜，纯粹是这个模块自己的历史记录。
  async listModuleRatings(module?: ModuleName): Promise<ModuleRatingRecord[]> {
    const rows: ModuleRatingRow[] = module
      ? await this.db.select().from(moduleRating).where(eq(moduleRating.module, module))
      : await this.db.select().from(moduleRating);
    return rows.map(toModuleRecord);
  }

  private async getModuleRow(week: string, module: ModuleName): Promise<ModuleRatingRow | undefined> {
    const rows: ModuleRatingRow[] = await this.db
      .select()
      .from(moduleRating)
      .where(and(eq(moduleRating.week, week), eq(moduleRating.module, module)))
      .limit(1);
    return rows[0];
  }

  async syncModuleGrade(module: ModuleName, week: string, which: GradeWhich, grade: Grade, note: string): Promise<ModuleRatingRecord> {
    const existing: ModuleRatingRow | undefined = await this.getModuleRow(week, module);
    const set: Partial<ModuleRatingRow> =
      which === 'weekend' ? { weekendGrade: grade, weekendNote: note } : { mondayGrade: grade, mondayNote: note };
    if (existing) {
      await this.db.update(moduleRating).set({ ...set, updatedAt: new Date() }).where(eq(moduleRating.id, existing.id));
      const updated = await this.getModuleRow(week, module);
      return toModuleRecord(updated!);
    }
    const inserted = await this.db.insert(moduleRating).values({ week, module, ...set }).returning();
    return toModuleRecord(inserted[0]);
  }

  // 删里程碑时配套清掉——里程碑评级只落在这张表，删了里程碑却留着这条记录
  // 会变成查无来处的孤儿数据。
  async deleteModuleRating(week: string, module: ModuleName): Promise<void> {
    const existing: ModuleRatingRow | undefined = await this.getModuleRow(week, module);
    if (!existing) return;
    await this.db.delete(moduleRating).where(eq(moduleRating.id, existing.id));
  }
}
