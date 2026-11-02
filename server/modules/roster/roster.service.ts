import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { DRIZZLE_DATABASE, type PostgresJsDatabase, AuthorizationSDK } from '@lark-apaas/fullstack-nestjs-core';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { commitment, roster, rosterSnapshot, weeklyBPlus } from '@server/database/schema';
import { parseWeekNumber } from '@server/common/utils/week.util';
import { WeekService } from '../week/week.service';
import type { AdminLevel, ModuleName, RosterMember, TeamRole } from '@shared/api.interface';
import type { ScopeHolder } from '@shared/permissions';

const ROLE_IDS: TeamRole[] = ['admin', 'lead', 'member'];

// `authzSDK.members.list()` 在当前环境下验证过是坏的：即便 lark-cli 的
// +role-member-list 和网关自己的 req.userContext.roles（@CanRole 用的就是它）
// 都能确认某个角色下真的有成员，SDK 这边查出来永远是空数组——包括查当前登录
// 管理员自己所在的 admin 角色。既然"谁在哪个角色"这个展示/业务判断没法指望平台
// 这个查询接口，roster 表本身就同时存 role + module 两列，业务侧完全按自己的
// 表读写；`authzSDK.members.add/remove`（写路径）仍然照常调用，保证 @CanRole
// 这个鉴权判断（走网关，不走 members.list）继续认得这个人。
@Injectable()
export class RosterService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly authzSDK: AuthorizationSDK,
    private readonly weekService: WeekService,
  ) {}

  // req.userContext.roles 由平台注入，未开启权限服务或无角色时为 null。
  // admin/lead/member 互斥，按优先级取第一个命中的角色；三个平台角色都没有
  // 命中——说明这个人根本不在组织架构名单里（团队还有一部分人没被加进来），
  // 归为 reader：纯浏览，没有任何编辑权限。之前这里直接兜底成 member，会让
  // 没被显式加过角色的人被当成"组员"，看起来像是有编辑权限（虽然大部分编辑
  // 操作还会因为没有 module 归属被服务层挡掉，但语义上是错的，也导致侧边栏
  // 一度把这类人显示成"管理员"）。
  resolveRole(req: Request): TeamRole {
    const roles: string[] | null = req.userContext?.roles ?? null;
    if (roles?.includes('admin')) return 'admin';
    if (roles?.includes('lead')) return 'lead';
    if (roles?.includes('member')) return 'member';
    return 'reader';
  }

  async getModuleForUser(userId: string): Promise<ModuleName | undefined> {
    const rows: Array<{ module: string | null }> = await this.db
      .select({ module: roster.module })
      .from(roster)
      .where(sql`(${roster.memberProfile}).user_id = ${userId}`)
      .limit(1);
    return (rows[0]?.module ?? undefined) as ModuleName | undefined;
  }

  // 传 week 时，若该周落在某次组织架构调整快照的覆盖范围内，返回那次快照，
  // 而不是当前实时 roster——人员归属没有按周版本化，直接改 roster 会让"已经
  // 定下来的过去几周"在页面上跟着变（比如已经卸任的组长从历史周的模块里消失）。
  // 没传 week，或 week 超出所有快照范围（属于快照建立之后的"当前"阶段），
  // 照常查实时 roster。
  async listRoster(week?: string): Promise<RosterMember[]> {
    if (week) {
      const snapshot = await this.listRosterFromSnapshot(week);
      if (snapshot) return snapshot;
    }
    const rows: Array<{
      userId: string;
      role: string;
      level: string;
      module: string | null;
      managedModules: string[] | null;
      name: string | null;
      email: string | null;
      canGrade: boolean;
      coordinatingModules: string[] | null;
    }> = await this.db
      .select({
        userId: sql<string>`(${roster.memberProfile}).user_id`,
        role: roster.role,
        level: roster.level,
        module: roster.module,
        managedModules: roster.managedModules,
        name: roster.name,
        email: roster.email,
        canGrade: roster.canGrade,
        coordinatingModules: roster.coordinatingModules,
      })
      .from(roster);
    return rows.map((r) => ({
      userId: r.userId,
      role: r.role as TeamRole,
      level: (r.level ?? 'member') as AdminLevel,
      module: (r.module ?? undefined) as ModuleName | undefined,
      managedModules: (r.managedModules ?? undefined) as ModuleName[] | undefined,
      name: r.name ?? undefined,
      email: r.email ?? undefined,
      canGrade: r.canGrade,
      coordinatingModules: (r.coordinatingModules ?? undefined) as ModuleName[] | undefined,
    }));
  }

  // 权限判定需要的全部信息（level + 本部门 + L2 半径），一处取齐。
  async scopeHolderForUser(userId: string): Promise<ScopeHolder> {
    const rows: Array<{ level: string; module: string | null; managedModules: string[] | null; canGrade: boolean }> = await this.db
      .select({ level: roster.level, module: roster.module, managedModules: roster.managedModules, canGrade: roster.canGrade })
      .from(roster)
      .where(sql`(${roster.memberProfile}).user_id = ${userId}`)
      .limit(1);
    const r = rows[0];
    return {
      userId,
      level: (r?.level ?? 'member') as AdminLevel,
      canGrade: r?.canGrade ?? false,
      module: (r?.module ?? undefined) as ModuleName | undefined,
      managedModules: (r?.managedModules ?? undefined) as ModuleName[] | undefined,
    };
  }

  // 一次取一批人的权限档位。列表接口原来对每一条记录各查两次 roster（本人 + 记录
  // 归属人），一页几十条就是几十次查询叠在同一个请求里——线上实测 GET /api/commitments
  // 的 p50 1.4s、p95 3s，"内部页面都要等一秒"主要就是它。这里改成整张 roster 查一次
  // （和 scopeHolderForUser 一样取实时 roster，口径不变），取不到的人按 'member' 兜底，
  // 与 scopeHolderForUser 的行为完全一致。
  async scopeHolderMapForUsers(userIds: string[]): Promise<Map<string, ScopeHolder>> {
    const wanted = new Set(userIds.filter((id: string) => !!id));
    const holders = new Map<string, ScopeHolder>();
    if (wanted.size === 0) return holders;
    const people: RosterMember[] = await this.listRoster();
    for (const person of people) {
      if (!wanted.has(person.userId)) continue;
      holders.set(person.userId, {
        userId: person.userId,
        level: person.level,
        canGrade: person.canGrade ?? false,
        module: person.module,
        managedModules: person.managedModules,
      });
    }
    for (const id of wanted) {
      if (!holders.has(id)) holders.set(id, { userId: id, level: 'member', canGrade: false });
    }
    return holders;
  }

  private async listRosterFromSnapshot(week: string): Promise<RosterMember[] | undefined> {
    const targetWeekNum = parseWeekNumber(week);
    if (Number.isNaN(targetWeekNum)) return undefined;

    const boundaries: Array<{ throughWeek: string }> = await this.db
      .selectDistinct({ throughWeek: rosterSnapshot.throughWeek })
      .from(rosterSnapshot);
    const candidate = boundaries
      .map((b) => ({ throughWeek: b.throughWeek, num: parseWeekNumber(b.throughWeek) }))
      .filter((b) => !Number.isNaN(b.num) && b.num >= targetWeekNum)
      .sort((a, b) => a.num - b.num)[0];
    if (!candidate) return undefined;

    const rows: Array<{
      userId: string;
      role: string;
      level: string | null;
      module: string | null;
      name: string | null;
      email: string | null;
    }> = await this.db
      .select({
        userId: rosterSnapshot.userId,
        role: rosterSnapshot.role,
        level: rosterSnapshot.level,
        module: rosterSnapshot.module,
        name: rosterSnapshot.name,
        email: rosterSnapshot.email,
      })
      .from(rosterSnapshot)
      .where(eq(rosterSnapshot.throughWeek, candidate.throughWeek));
    return rows.map((r) => ({
      userId: r.userId,
      role: r.role as TeamRole,
      // 新快照直接保存真实 level；旧快照没有该列值时，再用当时的 role 兼容推断。
      level: (r.level ?? (r.role === 'admin' ? 'L1' : r.role === 'lead' ? 'L3' : 'member')) as AdminLevel,
      module: (r.module ?? undefined) as ModuleName | undefined,
      name: r.name ?? undefined,
      email: r.email ?? undefined,
      canGrade: true,
      coordinatingModules: undefined,
    }));
  }

  // 只返回"评级来自里程碑"的组长——can_grade=false 的组长（内容组长）本人的
  // 评级走的是和普通组员一样的周承诺路径，不占这个语义。三处调用方都是靠这个
  // 区分"这个人的评级是不是由里程碑同步过来的"，改了这里三处一起生效：
  // ①周承诺评级要不要拦"应该走里程碑评"这条护栏 ②删空周承诺时要不要连带清空
  // 评级 ③新建里程碑时 leadProfile 该填谁（决定评这条里程碑算不算谁的个人成绩）。
  async leadUserIdForModule(module: ModuleName): Promise<string | undefined> {
    const rows: Array<{ userId: string }> = await this.db
      .select({ userId: sql<string>`(${roster.memberProfile}).user_id` })
      .from(roster)
      .where(and(eq(roster.level, 'L3'), eq(roster.module, module), eq(roster.canGrade, true)))
      .limit(1);
    return rows[0]?.userId;
  }

  // 评级相关权限判断的统一入口：既有的单一 module/role 只描述"归属"，评级能力
  // 还要看 canGrade（组长是否被削权）和 coordinatingModules（协调人跨模块权限）。
  async gradingPermissionsForUser(userId: string): Promise<{ canGrade: boolean; coordinatingModules: ModuleName[] }> {
    const rows: Array<{ canGrade: boolean; coordinatingModules: string[] | null }> = await this.db
      .select({ canGrade: roster.canGrade, coordinatingModules: roster.coordinatingModules })
      .from(roster)
      .where(sql`(${roster.memberProfile}).user_id = ${userId}`)
      .limit(1);
    return {
      canGrade: rows[0]?.canGrade ?? true,
      coordinatingModules: (rows[0]?.coordinatingModules ?? []) as ModuleName[],
    };
  }

  // 协调人权限和本人的主 role/module 完全独立——设置这个字段不会改动 authzSDK
  // 里的平台角色，也不会动这个人自己所在的模块。传空数组等于取消协调人身份。
  async setCoordinatingModules(userId: string, modules: ModuleName[]): Promise<void> {
    await this.db
      .update(roster)
      .set({ coordinatingModules: modules.length > 0 ? modules : null, updatedAt: new Date() })
      .where(sql`(${roster.memberProfile}).user_id = ${userId}`);
  }

  // 加人 / 改人：同一个人已在 roster 里就是更新（前端"加入某部门"和"改级别"走同一条路径）。
  //
  // level 决定权限，role 只是妙搭授权体系的桥：三级管理员在平台侧都是 admin，
  // 真正的边界由 level + managed_modules 在服务层判定。
  async addMember(
    userId: string,
    level: AdminLevel,
    module: ModuleName | undefined,
    managedModules: ModuleName[] | undefined,
    name?: string,
    email?: string,
  ): Promise<void> {
    // L2 的半径必须显式且非空——这是三级里唯一推不出来的边界。空着等于一个有管理员
    // 身份却管不到任何部门的人，属于配置错误，不是一种合法状态。
    const scope: ModuleName[] | null = level === 'L2' ? (managedModules ?? []).filter(Boolean) : null;
    if (level === 'L2' && (scope ?? []).length === 0) {
      throw new BadRequestException('L2 必须至少勾选一个管辖部门');
    }

    // 三级管理员（L1/L2/L3）在平台侧都是 admin；L4 是组内协调人，只写内容不评级，
    // 平台侧按普通成员授权（它真正的边界由 level 在服务层判定）。
    const role: TeamRole = level === 'member' || level === 'L4' ? 'member' : 'admin';
    for (const other of ROLE_IDS) {
      if (other === role) continue;
      await this.authzSDK.members.remove(other, { members: { userList: [{ userID: userId }] } }).catch(() => undefined);
    }
    await this.authzSDK.members.add(role, { members: { userList: [{ userID: userId }] } });

    const existing = await this.db
      .select({ id: roster.id })
      .from(roster)
      .where(sql`(${roster.memberProfile}).user_id = ${userId}`)
      .limit(1);
    if (existing.length > 0) {
      const set: Partial<typeof roster.$inferInsert> = {
        role,
        level,
        module: module ?? null,
        managedModules: scope,
        updatedAt: new Date(),
      };
      // 只在调用方真的带了姓名/邮箱时才覆盖，避免旧调用把已存在的姓名抹成 null。
      if (name !== undefined) set.name = name;
      if (email !== undefined) set.email = email;
      await this.db.update(roster).set(set).where(sql`(${roster.memberProfile}).user_id = ${userId}`);
    } else {
      await this.db.insert(roster).values({
        memberProfile: userId,
        role,
        level,
        module: module ?? null,
        managedModules: scope,
        name: name ?? null,
        email: email ?? null,
      });
    }
  }

  // 局部修改：读当前值补齐缺省字段后复用 addMember（它本身就是 upsert）。
  async updateMember(
    userId: string,
    patch: { level?: AdminLevel; module?: ModuleName; managedModules?: ModuleName[] },
  ): Promise<void> {
    const current: ScopeHolder = await this.scopeHolderForUser(userId);
    const level: AdminLevel = patch.level ?? current.level;
    const module: ModuleName | undefined = patch.module !== undefined ? patch.module : current.module;
    const managed: ModuleName[] | undefined =
      patch.managedModules !== undefined ? patch.managedModules : current.managedModules;
    await this.addMember(userId, level, module, managed);
  }

  // 把 user_id 解析成可展示的姓名，供评级/周承诺落姓名快照用。先查实时 roster，
  // 查不到（人已被删）再回退到最近一次组织架构快照——保证历史数据也能带名字。
  async getNameForUser(userId: string): Promise<string | undefined> {
    const rows: Array<{ name: string | null }> = await this.db
      .select({ name: roster.name })
      .from(roster)
      .where(sql`(${roster.memberProfile}).user_id = ${userId}`)
      .limit(1);
    if (rows[0]?.name) return rows[0].name;
    const snapRows: Array<{ name: string | null }> = await this.db
      .select({ name: rosterSnapshot.name })
      .from(rosterSnapshot)
      .where(eq(rosterSnapshot.userId, userId))
      .orderBy(desc(rosterSnapshot.throughWeek))
      .limit(1);
    return snapRows[0]?.name ?? undefined;
  }

  // 直接操作 commitment/weekly_b_plus 表而不是调用 CommitmentsService/
  // WeeklyBPlusService——那两个 module 都反过来 import 了 RosterModule
  // （拿 leadUserIdForModule 之类的方法），这里如果再依赖它们就会形成模块级
  // 循环依赖。RosterService 本来就直接持有 DB 连接，这里按同样方式直接读写。
  async removeMember(userId: string): Promise<void> {
    for (const role of ROLE_IDS) {
      await this.authzSDK.members.remove(role, { members: { userList: [{ userID: userId }] } }).catch(() => undefined);
    }
    // 被移除的人不再属于任何模块，页面上再也没有入口能展示/编辑他的周承诺卡片。
    // 本周还没勾选（未处理）的交付物如果留着，会变成一条谁都够不着、却仍然
    // 计入"本模块是否全部处理完"判断的孤儿记录，永久卡住整个模块的评级——
    // 已经勾选/评级过的记录不动，只清理确实还没人处理过的部分。
    const currentWeek: string = await this.weekService.currentWeekLabel();
    await this.db
      .delete(commitment)
      .where(and(sql`(${commitment.ownerProfile}).user_id = ${userId}`, eq(commitment.week, currentWeek), isNull(commitment.checked)));
    await this.db
      .delete(weeklyBPlus)
      .where(and(sql`(${weeklyBPlus.ownerProfile}).user_id = ${userId}`, eq(weeklyBPlus.week, currentWeek)));
    await this.db.delete(roster).where(sql`(${roster.memberProfile}).user_id = ${userId}`);
  }
}
