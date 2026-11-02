-- ANEVER: 评论（每条可编辑内容一张讨论卡片）。
--
-- 挂在 five 种"可讨论对象"上：一份周承诺、某人本周的 B+ 验收标准、里程碑描述、
-- B 验收标准、B+ 验收标准。目标是多态的（target_type + target_id），因为后三者
-- 其实是同一行 milestone 的三个字段，用 target_type 区分就够了，不必三个表。
--
-- 谁都能看、谁都能说（和"团队彼此看见"的定位一致）；只有作者本人和 L1 能删。
-- 评论不按周冻结：它是"对内容的讨论"，翻到过去的周也应该能看见当时的讨论记录。
--
-- Run in the dev environment before previewing the new application code.

BEGIN;

CREATE TABLE IF NOT EXISTS comment (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- commitment / weekly_b_plus / milestone_description / milestone_b / milestone_b_plus
  target_type varchar(32) NOT NULL,
  target_id uuid NOT NULL,
  author_profile user_profile NOT NULL,
  -- 姓名快照：人离开团队、或者改了名字，历史评论里还看得到当时是谁说的
  author_name text,
  body text NOT NULL,
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

ALTER TABLE comment ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON comment TO service_role USING (true);
CREATE POLICY "修改全部数据" ON comment AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON comment AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON comment AS PERMISSIVE FOR ALL TO authenticated USING (
  (current_setting('app.user_id'::text) = ANY (ARRAY[]::text[]))
  AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text)
);

-- 取某个对象的整条讨论：按 (类型, 对象) 找，再按时间排
CREATE INDEX IF NOT EXISTS idx_comment_target ON comment (target_type, target_id, _created_at);

COMMENT ON TABLE comment IS '内容评论：挂在周承诺 / B+验收标准 / 里程碑描述 / B / B+ 上的讨论';
COMMENT ON COLUMN comment.target_type IS 'commitment | weekly_b_plus | milestone_description | milestone_b | milestone_b_plus';

COMMIT;
