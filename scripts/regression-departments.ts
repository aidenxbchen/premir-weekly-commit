import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import type { PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { DepartmentsService } from '../server/modules/departments/departments.service';

// 组别改名会同时改业务表里的 module 值，但 L2/L4 的管理半径是独立数组。
// 这里锁住两件事：改名要同步数组；有历史记录的组别不能被删成“界面失踪”。
async function main(): Promise<void> {
  const pg = new PGlite();
  await pg.exec(`
    CREATE TYPE user_profile AS (user_id text);
    CREATE TABLE department (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(50) NOT NULL,
      sort_order int NOT NULL DEFAULT 0,
      has_milestone boolean NOT NULL DEFAULT true,
      ranked boolean NOT NULL DEFAULT false,
      _created_at timestamptz NOT NULL DEFAULT now(),
      _created_by user_profile,
      _updated_at timestamptz NOT NULL DEFAULT now(),
      _updated_by user_profile
    );
    CREATE TABLE roster (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      member_profile user_profile NOT NULL,
      module varchar(50),
      managed_modules text[],
      coordinating_modules text[],
      _updated_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE roster_snapshot (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), through_week varchar(10), module varchar(50));
    CREATE TABLE milestone (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week varchar(10), module varchar(50), _updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE module_rating (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week varchar(10), module varchar(50));
    CREATE TABLE commitment (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week varchar(10), module varchar(50), _updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE rating (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), week varchar(10), module varchar(50), _updated_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE rating_change_log (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), module varchar(50));
    INSERT INTO department (name, sort_order, has_milestone, ranked) VALUES ('软件组', 1, true, false);
    INSERT INTO roster (member_profile, module, managed_modules, coordinating_modules)
      VALUES (ROW('l2')::user_profile, '软件组', ARRAY['软件组'], ARRAY['软件组']);
    INSERT INTO milestone (week, module) VALUES ('W44', '软件组');
  `);
  const svc = new DepartmentsService(drizzle(pg) as unknown as PostgresJsDatabase);
  const dept = (await svc.list()).find((item) => item.name === '软件组');
  assert.ok(dept);
  await svc.rename(dept.id, '软件组RENAMED');
  const roster = (await pg.query(
    `SELECT module, managed_modules, coordinating_modules FROM roster WHERE (member_profile).user_id = 'l2'`,
  )).rows[0] as { module: string; managed_modules: string[]; coordinating_modules: string[] };
  assert.equal(roster.module, '软件组RENAMED');
  assert.deepEqual(roster.managed_modules, ['软件组RENAMED']);
  assert.deepEqual(roster.coordinating_modules, ['软件组RENAMED']);
  // 历史记录还在时拒绝删除，避免删完以后页面再也找不到这些记录。
  await assert.rejects(() => svc.remove(dept.id), /department_not_empty/);
  await pg.exec(`DELETE FROM roster`);
  await assert.rejects(() => svc.remove(dept.id), /department_has_history/);
  await pg.exec(`DELETE FROM milestone`);
  await svc.remove(dept.id);
  assert.equal((await svc.list()).length, 0);
  await pg.close();
  console.log('PASS: department rename updates management scopes; history blocks deletion');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
