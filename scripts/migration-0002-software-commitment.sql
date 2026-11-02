-- 软件组周承诺：结构和其他四个模块不一样，用 A/B/B+ 三档独立验收标准文本，
-- 评级是一次性单档（没有周末/周一两段式），单独建表。

CREATE TABLE IF NOT EXISTS software_commitment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week varchar(10) NOT NULL,
  owner_profile user_profile NOT NULL,
  deliverable text,
  a_criteria text,
  b_criteria text,
  b_plus_criteria text,
  risk text,
  start_time TIMESTAMP(3) WITH TIME ZONE,
  end_time TIMESTAMP(3) WITH TIME ZONE,
  grade varchar(5),
  note text,
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
ALTER TABLE software_commitment ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON software_commitment TO service_role USING (true);
CREATE POLICY "修改全部数据" ON software_commitment AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON software_commitment AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON software_commitment AS PERMISSIVE FOR ALL TO authenticated USING (
  (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
  AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
);
CREATE INDEX idx_software_commitment_week ON software_commitment (week);
CREATE INDEX idx_software_commitment_owner ON software_commitment (((owner_profile).user_id));
COMMENT ON TABLE software_commitment IS '软件组个人周承诺：A/B/B+ 三档验收标准 + 一次性单档评级，结构和其他四个模块的 commitment 表不同';
