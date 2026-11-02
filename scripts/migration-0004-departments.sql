-- ANEVER: 组别（部门）动态化——管理员可以在界面里增删组别，不再写死在代码里。
-- Run in the dev environment before previewing the new application code.

BEGIN;

CREATE TABLE department (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(50) NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  -- 有没有周里程碑：硬件模块有（走里程碑评级），嵌入式组没有（只有个人周承诺）。
  has_milestone boolean NOT NULL DEFAULT true,
  -- 是否参与硬件模块之间的排名比较（如全功能样机组就不参与）。
  ranked boolean NOT NULL DEFAULT false,
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
ALTER TABLE department ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON department TO service_role USING (true);
CREATE POLICY "修改全部数据" ON department
  AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON department
  AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON department
  AS PERMISSIVE FOR ALL TO authenticated USING (
    (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
    AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
  );
CREATE UNIQUE INDEX uk_department_name ON department (name);
COMMENT ON TABLE department IS '组别（部门）清单：管理员可增删，替代原先写死在代码里的 MODULE_NAMES';

INSERT INTO department (name, sort_order, has_milestone, ranked) VALUES
  ('全功能样机组', 1, true,  false),
  ('洗净模块',     2, true,  true),
  ('烘干模块',     3, true,  true),
  ('熨烫模块',     4, true,  true),
  ('净水模块',     5, true,  true),
  ('软件组',       6, false, false),
  ('MCU嵌入式',    7, false, false),
  ('Linux嵌入式',  8, false, false)
ON CONFLICT (name) DO NOTHING;

COMMIT;
