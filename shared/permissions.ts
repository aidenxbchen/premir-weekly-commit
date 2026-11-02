/* 管理权限：前后端共用同一套判定，避免两边各写一份规则后慢慢跑偏 */

import { LEVEL_RANK, type AdminLevel, type ModuleName } from './api.interface';

// 参与判定所需的最小信息。roster 的一行就能满足。
export interface ScopeHolder {
  userId: string;
  level: AdminLevel;
  canGrade?: boolean;
  module?: ModuleName;
  managedModules?: ModuleName[];
}

// 管理半径：这个人能管哪些部门。'ALL' 表示全局，只有 L1 是全局。
//   L1 → 全局
//   L2 → 显式勾选的清单（这就是唯一必须写死的半径）
//   L3 → 自己所在的部门（可评级）
//   L4 → 自己所在的部门（只能写里程碑内容，不能评级）
//   组员 → 空
export function adminScope(holder: ScopeHolder): ModuleName[] | 'ALL' {
  if (holder.level === 'L1') return 'ALL';
  if (holder.level === 'L2') return holder.managedModules ?? [];
  if (holder.level === 'L3') return holder.module ? [holder.module] : [];
  if (holder.level === 'L4') return holder.module ? [holder.module] : [];
  return [];
}

// L4 是"组内协调人"：有半径、能写本部门里程碑内容，但不参与任何人的评级/验收，
// 也不管组织架构。所有"管人 / 管记录 / 评级"的判定都要把它挡在外面。
export function isCoordinator(holder: ScopeHolder): boolean {
  return holder.level === 'L4';
}

// 能不能管（=验收打钩/评级/编辑内容/组织管理）某个人。三条规则：
//   1. 半径内（L1 无边界、L2 看清单、L3 看本部门）
//   2. 不评自己——包括 L1，谁都不能给自己评级
//   3. 下级不评上级——只比"级别高低"，同级可以，所以同一部门里多个管理员
//      的重叠半径不会互相遮挡
export function canManagePerson(actor: ScopeHolder, target: Omit<ScopeHolder, 'managedModules'>): boolean {
  if (actor.userId === target.userId) return false;
  if (isCoordinator(actor)) return false; // L4 只写内容，不评人
  if (LEVEL_RANK[target.level] > LEVEL_RANK[actor.level]) return false;
  const scope: ModuleName[] | 'ALL' = adminScope(actor);
  if (scope === 'ALL') return true;
  return !!target.module && scope.includes(target.module);
}

// 能不能写某个部门的内容（里程碑描述 / B / B+ 验收标准）。L3 和 L4 都在半径内可写，
// 所以这个判定**不区分**两者——要判断"谁能评级"用下面的 canGradeModule。
export function canManageModule(actor: ScopeHolder, module: ModuleName | undefined): boolean {
  if (!module) return false;
  const scope: ModuleName[] | 'ALL' = adminScope(actor);
  if (scope === 'ALL') return true;
  return scope.includes(module);
}

// 能不能评某部门的里程碑 / 打验收钩。和 canManageModule 的唯一区别就是 L4：
// 组内协调人写得了内容，但评级与验收打钩跟评级同权，L4 不做。
export function canGradeModule(actor: ScopeHolder, module: ModuleName | undefined): boolean {
  if (isCoordinator(actor)) return false;
  return canManageModule(actor, module);
}

// 全局管理员判定（L1）。组织架构、组别增删、B+ 验收标准的"退回/删除"都是这类
// 只有一个人能做的动作。单独起个名字，是为了让调用点读起来是它自己那件事，
// 判定逻辑仍然只有一处。
export function isGlobalAdmin(actor: ScopeHolder): boolean {
  return actor.level === 'L1';
}

// 能不能改组织架构：只有 L1 能给别人定级别和半径，L2/L3 只能在半径内加人移人。
export function canSetLevels(actor: ScopeHolder): boolean {
  return isGlobalAdmin(actor);
}

// 判断"能不能动某个人名下的某条记录"（周承诺、里程碑内容等）。
// 和 canManagePerson 的区别在"半径按谁的部门算"：
//   分级按「人现在的级别」——决定"下级不评上级"
//   半径按「记录所属的部门」——记录才是权限的上下文。人后来调了部门，不该让
//   他过去那条记录变成没人管得了的孤儿（实测踩到过：潘言宇从软件组调到 Linux 后，
//   彭阳就再也改不了软件组里潘言宇的历史承诺了）。
export function canManageRecord(
  actor: ScopeHolder,
  owner: { userId: string; level: AdminLevel },
  recordModule: ModuleName | undefined,
): boolean {
  if (actor.userId === owner.userId) return false;
  if (isCoordinator(actor)) return false; // L4 不评人（周承诺评级/验收打钩都走这里）
  if (LEVEL_RANK[owner.level] > LEVEL_RANK[actor.level]) return false;
  return canManageModule(actor, recordModule);
}

// 个人评级可见性与实际评级资格共用规则；内容管理资格不自动授予评级资格。
export function canGradeRecord(actor: ScopeHolder, owner: ScopeHolder, module: ModuleName | undefined): boolean {
  return (actor.level === 'L1' || actor.canGrade === true) && canManageRecord(actor, owner, module);
}

export function canViewPersonalRating(actor: ScopeHolder, owner: ScopeHolder, module: ModuleName | undefined): boolean {
  return actor.userId === owner.userId || actor.level === 'L1' || canGradeRecord(actor, owner, module);
}
