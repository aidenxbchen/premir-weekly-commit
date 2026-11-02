import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, sql } from 'drizzle-orm';
import { weeklyBPlus } from '@server/database/schema';
import { RosterService } from '../roster/roster.service';
import { WeekService } from '../week/week.service';
import { RatingsService } from '../ratings/ratings.service';
import { isGlobalAdmin, type ScopeHolder } from '@shared/permissions';
import type { WeeklyBPlusRecord } from '@shared/api.interface';

type WeeklyBPlusRow = typeof weeklyBPlus.$inferSelect;

function toRecord(row: WeeklyBPlusRow): WeeklyBPlusRecord {
  return {
    id: row.id,
    week: row.week,
    ownerUserId: row.ownerProfile,
    name: row.name ?? undefined,
    criteria: row.criteria ?? undefined,
    editAuthorized: row.editAuthorized === true,
    editReason: row.editReason ?? undefined,
  };
}

// B+验收标准是"每人每周一份"的独立判断，不属于某一条承诺，所以单独一张表、按
// (week, 人) 唯一。首次保存后锁定；清空请求不能删除已保存的标准。
// 锁定可以解除——L1 的"退回"就是本人唯一的第二次机会，保存成功后重新锁定。
@Injectable()
export class WeeklyBPlusService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly rosterService: RosterService,
    private readonly weekService: WeekService,
    private readonly ratingsService: RatingsService,
  ) {}

  // 除本人外，过去几周只能查看——和承诺、评级一样只允许改当前周。
  private async assertCurrentWeek(week: string): Promise<void> {
    const current: string = await this.weekService.currentWeekLabel();
    if (week !== current) throw new ConflictException('past_week_locked');
  }

  async listByWeek(week: string): Promise<WeeklyBPlusRecord[]> {
    const rows: WeeklyBPlusRow[] = await this.db.select().from(weeklyBPlus).where(eq(weeklyBPlus.week, week));
    return rows.map(toRecord);
  }

  async findMine(ownerUserId: string, week: string): Promise<WeeklyBPlusRecord | undefined> {
    const rows: WeeklyBPlusRow[] = await this.db
      .select()
      .from(weeklyBPlus)
      .where(and(eq(weeklyBPlus.ownerProfile, ownerUserId), eq(weeklyBPlus.week, week)))
      .limit(1);
    return rows[0] ? toRecord(rows[0]) : undefined;
  }

  async save(ownerUserId: string, week: string, criteria: string): Promise<WeeklyBPlusRecord | undefined> {
    if (!week) throw new BadRequestException('missing_week');
    await this.assertCurrentWeek(week);
    if (await this.ratingsService.hasGrade(ownerUserId, week)) throw new ConflictException('rating_requires_reopen');
    const clean = criteria.trim();
    if (clean.length > 5000) throw new BadRequestException('text_too_long');
    const existing: WeeklyBPlusRow | undefined = (
      await this.db
        .select()
        .from(weeklyBPlus)
        .where(and(eq(weeklyBPlus.ownerProfile, ownerUserId), eq(weeklyBPlus.week, week)))
        .limit(1)
    )[0];

    // 只有"还没写过"或"管理员已退回"这两种情况允许改动；退回后保存即重新锁定。
    const unlocked: boolean = existing?.editAuthorized === true;
    if (existing?.criteria?.trim() && !unlocked) {
      if (clean === existing.criteria.trim()) return toRecord(existing);
      throw new ConflictException('B+验收标准保存后已锁定，如需修改请让管理员退回');
    }
    // 退回后本人把内容清空 = 这周确实没有 B+ 标准，允许删掉这一条。
    if (!clean) {
      if (existing && unlocked) await this.db.delete(weeklyBPlus).where(eq(weeklyBPlus.id, existing.id));
      return undefined;
    }

    const name: string | undefined = await this.rosterService.getNameForUser(ownerUserId);
    if (existing) {
      const guard = unlocked ? undefined : sql`coalesce(trim(${weeklyBPlus.criteria}), '') = ''`;
      await this.db
        .update(weeklyBPlus)
        .set({ criteria: clean, name: name ?? null, editAuthorized: false, editReason: null, updatedAt: new Date() })
        .where(guard ? and(eq(weeklyBPlus.id, existing.id), guard) : eq(weeklyBPlus.id, existing.id));
    } else {
      await this.db.insert(weeklyBPlus).values({ week, ownerProfile: ownerUserId, criteria: clean, name: name ?? null }).onConflictDoNothing();
    }
    const saved = await this.findMine(ownerUserId, week);
    if (saved?.criteria?.trim() !== clean) throw new ConflictException('B+验收标准已由另一处保存，请刷新查看');
    return saved;
  }

  // 管理员（L1）退回：把这份 B+ 标准交回本人手里，他可以改完再保存，保存后重新锁定。
  // 退回本身不改内容，所以这一步是可逆的；只有"删除"不可撤销（见 remove）。
  // 退回要写明原因——本人看到的是"为什么退回来"，这句也是留痕。
  async reopen(ownerUserId: string, week: string, actor: ScopeHolder, reason: string): Promise<WeeklyBPlusRecord | undefined> {
    if (!ownerUserId) throw new BadRequestException('missing_owner');
    if (!week) throw new BadRequestException('missing_week');
    if (!isGlobalAdmin(actor)) throw new ForbiddenException('只有 L1 能退回 B+ 验收标准');
    const cleanReason: string = reason.trim();
    if (cleanReason.length < 2) throw new BadRequestException('edit_reason_required');
    if (cleanReason.length > 500) throw new BadRequestException('text_too_long');
    await this.assertCurrentWeek(week);
    const existing: WeeklyBPlusRow | undefined = (
      await this.db
        .select()
        .from(weeklyBPlus)
        .where(and(eq(weeklyBPlus.ownerProfile, ownerUserId), eq(weeklyBPlus.week, week)))
        .limit(1)
    )[0];
    // 没有内容就没什么可退回的——本人本来就能直接写。
    if (!existing?.criteria?.trim()) return existing ? toRecord(existing) : undefined;
    await this.db
      .update(weeklyBPlus)
      .set({ editAuthorized: true, editReason: cleanReason, updatedAt: new Date() })
      .where(eq(weeklyBPlus.id, existing.id));
    return this.findMine(ownerUserId, week);
  }

  // 管理员（L1）删除：写错了就直接删掉，本人可以重新写一份。不可撤销。
  async remove(ownerUserId: string, week: string, actor: ScopeHolder): Promise<boolean> {
    if (!ownerUserId) throw new BadRequestException('missing_owner');
    if (!week) throw new BadRequestException('missing_week');
    if (!isGlobalAdmin(actor)) throw new ForbiddenException('只有 L1 能删除 B+ 验收标准');
    await this.assertCurrentWeek(week);
    const deleted = await this.db
      .delete(weeklyBPlus)
      .where(and(eq(weeklyBPlus.ownerProfile, ownerUserId), eq(weeklyBPlus.week, week)))
      .returning({ id: weeklyBPlus.id });
    return deleted.length > 0;
  }
}
