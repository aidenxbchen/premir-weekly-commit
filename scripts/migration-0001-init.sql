-- ANEVER migration: roster, milestones, commitments, ratings, app state, backup log

CREATE TABLE IF NOT EXISTS roster (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_profile user_profile NOT NULL,
  module varchar(50),
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  )
);
ALTER TABLE roster ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON roster TO service_role USING (true);
CREATE POLICY "修改全部数据" ON roster AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON roster AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON roster AS PERMISSIVE FOR ALL TO authenticated USING (
  (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
  AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
);
CREATE UNIQUE INDEX uk_roster_member ON roster (((member_profile).user_id));
COMMENT ON TABLE roster IS '成员所属模块（角色本身来自平台真实角色，这里只存业务侧的模块归属）';

CREATE TABLE IF NOT EXISTS milestone (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week varchar(10) NOT NULL,
  module varchar(50) NOT NULL,
  description text,
  b_criteria text,
  b_plus_criteria text,
  b_check text,
  b_plus_check text,
  lead_profile user_profile,
  weekend_grade varchar(5),
  weekend_note text,
  monday_grade varchar(5),
  monday_note text,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  )
);
ALTER TABLE milestone ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON milestone TO service_role USING (true);
CREATE POLICY "修改全部数据" ON milestone AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON milestone AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON milestone AS PERMISSIVE FOR ALL TO authenticated USING (
  (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
  AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
);
CREATE UNIQUE INDEX uk_milestone_week_module ON milestone (week, module);
COMMENT ON TABLE milestone IS '各模块周里程碑：验收标准、达标勾选、周末/周一评级';

CREATE TABLE IF NOT EXISTS commitment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week varchar(10) NOT NULL,
  module varchar(50) NOT NULL,
  owner_profile user_profile NOT NULL,
  deliverable text,
  criteria text,
  risk text,
  start_time TIMESTAMP(3) WITH TIME ZONE,
  end_time TIMESTAMP(3) WITH TIME ZONE,
  checked varchar(5),
  weekend_grade varchar(5),
  weekend_note text,
  monday_grade varchar(5),
  monday_note text,
  locked boolean NOT NULL DEFAULT false,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  )
);
ALTER TABLE commitment ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON commitment TO service_role USING (true);
CREATE POLICY "修改全部数据" ON commitment AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON commitment AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON commitment AS PERMISSIVE FOR ALL TO authenticated USING (
  (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
  AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
);
CREATE INDEX idx_commitment_week_module ON commitment (week, module);
CREATE INDEX idx_commitment_owner ON commitment (((owner_profile).user_id));
COMMENT ON TABLE commitment IS '个人周承诺：交付物、验收标准、达标勾选、周末/周一评级';

CREATE TABLE IF NOT EXISTS rating (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week varchar(10) NOT NULL,
  module varchar(50) NOT NULL,
  member_profile user_profile NOT NULL,
  weekend_grade varchar(5),
  weekend_note text,
  monday_grade varchar(5),
  monday_note text,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  )
);
ALTER TABLE rating ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON rating TO service_role USING (true);
CREATE POLICY "修改全部数据" ON rating AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON rating AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON rating AS PERMISSIVE FOR ALL TO authenticated USING (
  (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
  AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
);
CREATE UNIQUE INDEX uk_rating_week_member ON rating (week, ((member_profile).user_id));
COMMENT ON TABLE rating IS '全员评级表：每人每周的周末/周一评级快照，用于排行榜';

CREATE TABLE IF NOT EXISTS app_state (
  key varchar(50) PRIMARY KEY,
  value text,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  )
);
ALTER TABLE app_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON app_state TO service_role USING (true);
CREATE POLICY "修改全部数据" ON app_state AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON app_state AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON app_state AS PERMISSIVE FOR ALL TO authenticated USING (
  (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
  AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
);
COMMENT ON TABLE app_state IS '单行/少量键值应用状态，如当前周次 current_week';

CREATE TABLE IF NOT EXISTS backup_run (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  milestone_count int NOT NULL DEFAULT 0,
  commitment_count int NOT NULL DEFAULT 0,
  rating_count int NOT NULL DEFAULT 0,
  status varchar(20) NOT NULL,
  error_message text,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  ),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (
    CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL
    ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END
  )
);
ALTER TABLE backup_run ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON backup_run TO service_role USING (true);
CREATE POLICY "修改全部数据" ON backup_run AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON backup_run AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON backup_run AS PERMISSIVE FOR ALL TO authenticated USING (
  (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
  AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
);
COMMENT ON TABLE backup_run IS '每晚（或手动触发）快照运行记录：各表行数与运行状态，用于审计';
