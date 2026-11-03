import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { count, eq, sql } from 'drizzle-orm';
import {
  commitment,
  department,
  milestone,
  moduleRating,
  rating,
  ratingChangeLog,
  roster,
  rosterSnapshot,
} from '@server/database/schema';
import type { DepartmentRecord } from '@shared/api.interface';

type DepartmentRow = typeof department.$inferSelect;

function toRecord(row: DepartmentRow): DepartmentRecord {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    hasMilestone: row.hasMilestone,
    ranked: row.ranked,
  };
}

// 组别（部门）清单从写死的常量改成一张表，管理员才能在界面上增删组别、
// 对组织架构做迭代。这里只负责这张表本身；"谁能改"由 controller 判定（只有 L1）。
@Injectable()
export class DepartmentsService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async list(): Promise<DepartmentRecord[]> {
    const rows: DepartmentRow[] = await this.db
      .select()
      .from(department)
      .orderBy(department.sortOrder, department.name);
    return rows.map(toRecord);
  }

  async create(name: string, hasMilestone?: boolean, ranked?: boolean): Promise<DepartmentRecord> {
    const trimmed: string = (name ?? '').trim();
    if (!trimmed) throw new BadRequestException('missing_name');
    if (trimmed.length > 50) throw new BadRequestException('name_too_long');
    const existing: DepartmentRow[] = await this.db
      .select()
      .from(department)
      .where(eq(department.name, trimmed))
      .limit(1);
    if (existing.length > 0) throw new ConflictException('department_exists');

    const maxRows: Array<{ maxOrder: number | null }> = await this.db
      .select({ maxOrder: sql<number | null>`max(${department.sortOrder})` })
      .from(department);
    const nextOrder: number = Number(maxRows[0]?.maxOrder ?? 0) + 1;

    const inserted: DepartmentRow[] = await this.db
      .insert(department)
      .values({
        name: trimmed,
        sortOrder: nextOrder,
        hasMilestone: hasMilestone ?? true,
        ranked: ranked ?? false,
      })
      .returning();
    return toRecord(inserted[0]);
  }

  // 重命名组别。组别名是各业务表里 module 字段的取值，所以改名必须把所有引用
  // 一起改掉——否则历史评级/里程碑会指向一个已经不存在于 department 表的名字，
  // 在按组别渲染的页面里直接消失。
  async rename(id: string, nextName: string): Promise<DepartmentRecord> {
    const trimmed: string = (nextName ?? '').trim();
    if (!trimmed) throw new BadRequestException('missing_name');
    if (trimmed.length > 50) throw new BadRequestException('name_too_long');

    const rows: DepartmentRow[] = await this.db.select().from(department).where(eq(department.id, id)).limit(1);
    const target: DepartmentRow | undefined = rows[0];
    if (!target) throw new NotFoundException('not_found');
    if (target.name === trimmed) return toRecord(target);

    const clash: DepartmentRow[] = await this.db
      .select()
      .from(department)
      .where(eq(department.name, trimmed))
      .limit(1);
    if (clash.length > 0) throw new ConflictException('department_exists');

    const oldName: string = target.name;
    await this.db.update(roster).set({ module: trimmed, updatedAt: new Date() }).where(eq(roster.module, oldName));
    // L2/L4 的管理半径是独立数组，组别改名时也必须一起改；否则改名后这些
    // 管理员仍指向旧组名，管理半径会静默失效。
    await this.db.update(roster).set({
      managedModules: sql`array_replace(${roster.managedModules}, ${oldName}, ${trimmed})`,
      coordinatingModules: sql`array_replace(${roster.coordinatingModules}, ${oldName}, ${trimmed})`,
      updatedAt: new Date(),
    }).where(sql`${oldName} = ANY(${roster.managedModules}) OR ${oldName} = ANY(${roster.coordinatingModules})`);
    await this.db.update(rosterSnapshot).set({ module: trimmed }).where(eq(rosterSnapshot.module, oldName));
    await this.db.update(milestone).set({ module: trimmed, updatedAt: new Date() }).where(eq(milestone.module, oldName));
    await this.db.update(moduleRating).set({ module: trimmed }).where(eq(moduleRating.module, oldName));
    await this.db.update(commitment).set({ module: trimmed, updatedAt: new Date() }).where(eq(commitment.module, oldName));
    await this.db.update(rating).set({ module: trimmed, updatedAt: new Date() }).where(eq(rating.module, oldName));
    await this.db.update(ratingChangeLog).set({ module: trimmed }).where(eq(ratingChangeLog.module, oldName));

    const updated: DepartmentRow[] = await this.db
      .update(department)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(eq(department.id, id))
      .returning();
    return toRecord(updated[0]);
  }

  // 组别里还有人就不给删：删掉之后这些人的归属会变成"查无此部门"，
  // 页面按组别渲染的入口会直接漏掉他们。
  // 已经有历史承诺/里程碑/评级时同样不给删：组别一旦从 department 表消失，
  // 这些历史记录就再也没有页面入口，等于在界面上丢失；需要调整时改名即可。
  async remove(id: string): Promise<void> {
    const rows: DepartmentRow[] = await this.db.select().from(department).where(eq(department.id, id)).limit(1);
    const target: DepartmentRow | undefined = rows[0];
    if (!target) return;
    const members: Array<{ n: number }> = await this.db
      .select({ n: count() })
      .from(roster)
      .where(eq(roster.module, target.name));
    if (Number(members[0]?.n ?? 0) > 0) throw new ConflictException('department_not_empty');
    const history: Array<{ n: number }> = await Promise.all([
      this.db.select({ n: count() }).from(commitment).where(eq(commitment.module, target.name)),
      this.db.select({ n: count() }).from(milestone).where(eq(milestone.module, target.name)),
      this.db.select({ n: count() }).from(rating).where(eq(rating.module, target.name)),
      this.db.select({ n: count() }).from(moduleRating).where(eq(moduleRating.module, target.name)),
      this.db.select({ n: count() }).from(ratingChangeLog).where(eq(ratingChangeLog.module, target.name)),
    ]).then((results: Array<Array<{ n: number }>>) => results.flat());
    if (history.some((row: { n: number }) => Number(row.n) > 0)) throw new ConflictException('department_has_history');
    await this.db.delete(department).where(eq(department.id, id));
  }
}
