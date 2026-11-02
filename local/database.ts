import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
const directory = process.env.LOCAL_SNAPSHOT_DIR || (existsSync('local-data/snapshot-2026-09-11/manifest.json') ? 'local-data/snapshot-2026-09-11' : 'local/fixtures');
// 默认用工作目录下的数据库；只有在验证迁移时才会用 LOCAL_PG_DIR 指向一份副本，
// 免得为了跑一遍迁移去动正在服务的那个库。
const databaseDir = process.env.LOCAL_PG_DIR || 'local-data/database';
const quote = (s: string) => '"' + s.replace(/"/g, '""') + '"';
export async function openDatabase() {
  mkdirSync(databaseDir, { recursive: true, mode: 0o700 });
  const pg = new PGlite(databaseDir);
  await pg.waitReady;
  const exists = await pg.query("SELECT to_regclass('public.roster') AS name");
  if (!(exists.rows[0] as any).name) {
    await pg.transaction(async tx => {
      await tx.exec('CREATE TYPE user_profile AS (user_id text); CREATE TYPE file_attachment AS (bucket_id text, file_path text)');
      const manifest = JSON.parse(readFileSync(`${directory}/manifest.json`, 'utf8'));
      for (const table of manifest.tables) {
        const schema = JSON.parse(readFileSync(`${directory}/${table.name}.schema.json`, 'utf8'));
        const columns = schema.columns.map((c: any) => {
          let d = c.default_value;
          if (c.name === '_created_by' || c.name === '_updated_by') d = '';
          if (d && !/^(gen_random_uuid\(\)|now\(\)|CURRENT_TIMESTAMP|true|false|\d+)$/i.test(d)) d = "'" + d.replace(/'/g, "''") + "'";
          return `${quote(c.name)} ${c.data_type}${c.is_array ? '[]' : ''}${c.is_allow_null ? '' : ' NOT NULL'}${d ? ' DEFAULT ' + d : ''}`;
        });
        for (const idx of schema.indexes.filter((i: any) => i.type === 'primary')) columns.push(`PRIMARY KEY (${idx.columns.map(quote).join(',')})`);
        await tx.exec(`CREATE TABLE ${quote(table.name)} (${columns.join(',')})`);
        const rows = JSON.parse(readFileSync(`${directory}/${table.name}.json`, 'utf8'));
        for (const row of rows) {
          // Preserve the complete export separately; live local DB must not hold usable mail credentials.
          if (table.name === 'app_state' && /oauth/i.test(row.key)) row.value = '{}';
          const keys = Object.keys(row);
          const values = keys.map(k => {
            const c = schema.columns.find((c: any) => c.name === k);
            return c.data_type === 'jsonb' && row[k] !== null && typeof row[k] !== 'string' ? JSON.stringify(row[k]) : row[k];
          });
          await tx.query(`INSERT INTO ${quote(table.name)} (${keys.map(quote)}) VALUES (${keys.map((_, i) => '$' + (i + 1))})`, values);
        }
        for (const idx of schema.indexes.filter((i: any) => i.definition)) await tx.exec(idx.definition);
        console.log(`Restored ${table.name}: ${rows.length}`);
      }
    });
  }
  const departments = await pg.query("SELECT to_regclass('public.department') AS name");
  if (!(departments.rows[0] as { name: string | null }).name) {
    const migration = readFileSync('scripts/migration-0004-departments.sql', 'utf8')
      .replace(/ALTER TABLE department ENABLE ROW LEVEL SECURITY;/g, '')
      .replace(/CREATE POLICY[\s\S]*?;/g, '');
    await pg.exec(migration);
  }
  await migrate(pg);
  await pg.exec(`
    ALTER TABLE weekly_b_plus ADD COLUMN IF NOT EXISTS edit_authorized boolean;
    ALTER TABLE weekly_b_plus ADD COLUMN IF NOT EXISTS edit_reason text;
    ALTER TABLE milestone ADD COLUMN IF NOT EXISTS b_plus_edit_authorized boolean;
    ALTER TABLE milestone ADD COLUMN IF NOT EXISTS b_plus_edit_reason text;
  `);
  const commentsMigration = readFileSync('scripts/migration-0006-comments.sql', 'utf8')
    .replace(/ALTER TABLE comment ENABLE ROW LEVEL SECURITY;/g, '')
    .replace(/CREATE POLICY[\s\S]*?;/g, '');
  await pg.exec(commentsMigration);
  const receiptsMigration = readFileSync('scripts/migration-0007-comment-receipts.sql', 'utf8')
    .replace(/ALTER TABLE comment_receipt ENABLE ROW LEVEL SECURITY;/g, '')
    .replace(/CREATE POLICY[\s\S]*?;/g, '');
  await pg.exec(receiptsMigration);
  return { pg, db: drizzle(pg) };
}

// 增量迁移。快照恢复只在空库时跑一次，之后所有结构变化都要走这里。
// 结构变更每次启动都执行（幂等语句）；数据迁移各自带一个 app_state 标记，只跑一次。
async function migrate(pg: PGlite): Promise<void> {
  // ① 结构（幂等，每次启动都过一遍）
  await pg.exec(`
    CREATE TABLE IF NOT EXISTS weekly_b_plus (
      id uuid NOT NULL DEFAULT gen_random_uuid(),
      week varchar NOT NULL,
      owner_profile user_profile NOT NULL,
      criteria text,
      name text,
      _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile,
      PRIMARY KEY (id)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS uk_weekly_b_plus_week_owner ON weekly_b_plus (week, ((owner_profile).user_id));
    CREATE INDEX IF NOT EXISTS idx_weekly_b_plus_week ON weekly_b_plus (week);
    CREATE TABLE IF NOT EXISTS commitment_edit_request (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      commitment_id uuid NOT NULL,
      requester_profile user_profile NOT NULL,
      reason text NOT NULL,
      status varchar(20) NOT NULL DEFAULT 'pending',
      reviewer_profile user_profile,
      review_note text,
      reviewed_at timestamptz,
      _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
    CREATE INDEX IF NOT EXISTS idx_commitment_edit_request_commitment ON commitment_edit_request (commitment_id);
    CREATE INDEX IF NOT EXISTS idx_commitment_edit_request_status ON commitment_edit_request (status);
    CREATE TABLE IF NOT EXISTS rating_change_log (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      subject_type varchar(20) NOT NULL,
      subject_id text NOT NULL,
      week varchar(10) NOT NULL,
      module varchar(50) NOT NULL,
      which varchar(20) NOT NULL,
      previous_grade varchar(5),
      previous_note text,
      next_grade varchar(5),
      next_note text,
      reason text NOT NULL,
      actor_profile user_profile NOT NULL,
      _created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _created_by user_profile,
      _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      _updated_by user_profile
    );
    CREATE INDEX IF NOT EXISTS idx_rating_change_log_subject ON rating_change_log (subject_type, subject_id, week);
    ALTER TABLE commitment_edit_request ADD COLUMN IF NOT EXISTS _created_by user_profile;
    ALTER TABLE commitment_edit_request ADD COLUMN IF NOT EXISTS _updated_by user_profile;
    ALTER TABLE rating_change_log ADD COLUMN IF NOT EXISTS _created_by user_profile;
    ALTER TABLE rating_change_log ADD COLUMN IF NOT EXISTS _updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE rating_change_log ADD COLUMN IF NOT EXISTS _updated_by user_profile;
  `);
  // ② 三级管理员：level 是权限判定的唯一依据，managed_modules 是 L2 的半径。
  await pg.exec(`
    ALTER TABLE roster ADD COLUMN IF NOT EXISTS level varchar(10) NOT NULL DEFAULT 'member';
    ALTER TABLE roster ADD COLUMN IF NOT EXISTS managed_modules text[];
    ALTER TABLE roster_snapshot ADD COLUMN IF NOT EXISTS level varchar(10);
  `);
  // ③ 不变式：三级管理员在妙搭授权体系里都必须是 admin。
  //    路由守卫（ProtectedRoute / @CanRole）读的是平台角色而不是 level，两者不一致
  //    会让"有管理半径却进不了组织页"——协调人转成 L2 时就踩到过这个坑。
  //    每次启动都跑，保证 role 不会和 level 脱节。
  await pg.exec(`UPDATE roster SET role = 'admin' WHERE level <> 'member' AND role <> 'admin';`);

  // ③ 软件组周承诺并入通用 commitment 表
  await runOnce(pg, 'migration:embedded-merge-v1', async () => {
    const merged = await pg.query(`
      INSERT INTO commitment (week, module, owner_profile, deliverable, criteria, risk,
                              start_time, end_time, checked, weekend_grade, weekend_note,
                              monday_grade, monday_note, locked, edit_authorized, name)
      SELECT week, '软件组', owner_profile, deliverable, b_criteria, risk,
             start_time, end_time, checked, weekend_grade, weekend_note,
             monday_grade, monday_note, locked, edit_authorized, name
      FROM software_commitment
      RETURNING id
    `);
    // 原 b_plus_criteria 按 (week, 人) 归并。极少数人一周内多条承诺写了不同的 B+
    // 文本，用换行拼在一起，宁可留着也不丢内容。
    const bplus = await pg.query(`
      INSERT INTO weekly_b_plus (week, owner_profile, criteria, name)
      SELECT week, owner_profile, string_agg(DISTINCT b_plus_criteria, E'\\n'), max(name)
      FROM software_commitment
      WHERE b_plus_criteria IS NOT NULL AND btrim(b_plus_criteria) <> ''
      GROUP BY week, owner_profile
      RETURNING id
    `);
    return `并入 ${merged.rows.length} 条周承诺，归并 ${bplus.rows.length} 条 B+`;
  });

  // ④ 旧的 role / 协调人 → 三级管理员
  await runOnce(pg, 'migration:admin-levels-v1', async () => {
    // admin → L1（全局）、lead → L3（本部门），其余都是组员
    const byRole = await pg.query(`
      UPDATE roster SET level = CASE
        WHEN role = 'admin' THEN 'L1'
        WHEN role = 'lead'  THEN 'L3'
        ELSE 'member' END
      WHERE level = 'member' AND role IN ('admin', 'lead')
      RETURNING id
    `);
    // 协调人语义正好就是 L2："不改主模块，但额外管这几个部门"，所以直接把
    // coordinating_modules 变成他的管理半径。
    const byCoord = await pg.query(`
      UPDATE roster SET level = 'L2', managed_modules = coordinating_modules
      WHERE coordinating_modules IS NOT NULL AND array_length(coordinating_modules, 1) > 0
      RETURNING id
    `);
    return `按 role 定级 ${byRole.rows.length} 人、协调人转 L2 ${byCoord.rows.length} 人`;
  });
}

async function runOnce(pg: PGlite, key: string, fn: () => Promise<string>): Promise<void> {
  const done = await pg.query('SELECT value FROM app_state WHERE key = $1', [key]);
  if (done.rows.length) return;
  const summary: string = await fn();
  await pg.query('INSERT INTO app_state (key, value) VALUES ($1, $2)', [key, summary]);
  console.log(`Migration ${key}: ${summary}`);
}
