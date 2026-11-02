-- ANEVER: align Miaoda dev database with the current local data model.
-- Run in the dev environment before previewing the new application code.

BEGIN;

ALTER TABLE roster
  ADD COLUMN IF NOT EXISTS level varchar(10) NOT NULL DEFAULT 'member';
ALTER TABLE roster
  ADD COLUMN IF NOT EXISTS managed_modules text[];

CREATE TABLE weekly_b_plus (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week varchar(10) NOT NULL,
  owner_profile user_profile NOT NULL,
  criteria text,
  name text,
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
ALTER TABLE weekly_b_plus ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON weekly_b_plus TO service_role USING (true);
CREATE POLICY "修改全部数据" ON weekly_b_plus
  AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON weekly_b_plus
  AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON weekly_b_plus
  AS PERMISSIVE FOR ALL TO authenticated USING (
    (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
    AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
  );
CREATE UNIQUE INDEX uk_weekly_b_plus_week_owner
  ON weekly_b_plus (week, ((owner_profile).user_id));
CREATE INDEX idx_weekly_b_plus_week ON weekly_b_plus (week);
COMMENT ON TABLE weekly_b_plus IS '每位伙伴每周统一的 B+ 标准';

COMMIT;
