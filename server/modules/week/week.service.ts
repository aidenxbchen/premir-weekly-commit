import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, eq, sql } from 'drizzle-orm';
import { appState, commitment, milestone, moduleRating, rating, roster, rosterSnapshot, weeklyBPlus } from '@server/database/schema';

const CURRENT_WEEK_KEY = 'current_week';

// 团队自己的 "Wxx" 编号比标准 ISO 周数少 1，仅用于首次启动时的引导值——
// 之后当前周是持久化状态，只能由管理员显式"进入下一周"推进。
const TEAM_WEEK_OFFSET = -1;

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum: number = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function bootstrapWeekLabel(date: Date = new Date()): string {
  return `W${isoWeekNumber(date) + TEAM_WEEK_OFFSET}`;
}

@Injectable()
export class WeekService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async currentWeekLabel(): Promise<string> {
    const rows: Array<{ value: string | null }> = await this.db
      .select({ value: appState.value })
      .from(appState)
      .where(eq(appState.key, CURRENT_WEEK_KEY))
      .limit(1);
    if (rows[0]?.value) return rows[0].value;
    const bootstrapped: string = bootstrapWeekLabel();
    await this.db.insert(appState).values({ key: CURRENT_WEEK_KEY, value: bootstrapped });
    return bootstrapped;
  }

  async isL1(userId: string): Promise<boolean> {
    const rows = await this.db.select({ level: roster.level }).from(roster)
      .where(sql`(${roster.memberProfile}).user_id = ${userId}`).limit(1);
    return rows[0]?.level === 'L1';
  }

  async activeWeekLabels(): Promise<string[]> {
    const sources = await Promise.all([
      this.db.selectDistinct({ week: commitment.week }).from(commitment),
      this.db.selectDistinct({ week: milestone.week }).from(milestone),
      this.db.selectDistinct({ week: rating.week }).from(rating),
      this.db.selectDistinct({ week: moduleRating.week }).from(moduleRating),
      this.db.selectDistinct({ week: weeklyBPlus.week }).from(weeklyBPlus),
    ]);
    return [...new Set(sources.flatMap((rows) => rows.map((row) => row.week)))]
      .filter((week): week is string => /^W\d+$/.test(week))
      .sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  }

  async advanceWeek(expectedWeek: string): Promise<string> {
    const current: string = await this.currentWeekLabel();
    if (!expectedWeek || current !== expectedWeek) throw new ConflictException('week_changed_refresh');
    const next = `W${Number(current.slice(1)) + 1}`;
    await this.db.transaction(async (tx) => {
      const people = await tx.select({
        userId: sql<string>`(${roster.memberProfile}).user_id`, module: roster.module,
        role: roster.role, level: roster.level, name: roster.name, email: roster.email,
      }).from(roster);
      await tx.delete(rosterSnapshot).where(eq(rosterSnapshot.throughWeek, current));
      if (people.length) await tx.insert(rosterSnapshot).values(people.map((person) => ({ ...person, throughWeek: current })));
      const changed = await tx.update(appState).set({ value: next, updatedAt: new Date() })
        .where(and(eq(appState.key, CURRENT_WEEK_KEY), eq(appState.value, current))).returning({ key: appState.key });
      if (!changed.length) throw new ConflictException('week_changed_refresh');
    });
    return next;
  }
}
