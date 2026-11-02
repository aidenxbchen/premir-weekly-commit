-- ANEVER: B+ 验收标准支持管理员（L1）"退回 / 删除"。
--
-- 背景：周承诺的 B+ 验收标准保存后即锁定，本人不能再改；实际使用中有人写错内容后
-- 谁都改不了——只有 L1 能处理，所以给他两个动作：
--   退回：开放一次修改（本人改完重新保存即回到锁定），并把退回原因记下来给对方看；
--   删除：直接把写错的那份删掉，让他重新写。
--
-- 字段命名沿用 commitment 表已有的 edit_authorized / edit_reason：两处语义相同，
-- 都是"这一次开放修改"。milestone 侧同理，只作用于 B+ 验收标准（B 标准不动）：
--   b_plus_edit_authorized / b_plus_edit_reason 记录"这份 B+ 验收被退回重做"，
--   退回时同时清空 b_plus_check，负责人重新验收或改完标准后由他自己的保存清掉。
--
-- 全部是"加可空列"，不动既有数据；ADD COLUMN IF NOT EXISTS 保证可重复执行。
-- Run in the dev environment before previewing the new application code.

BEGIN;

ALTER TABLE weekly_b_plus ADD COLUMN IF NOT EXISTS edit_authorized boolean;
ALTER TABLE weekly_b_plus ADD COLUMN IF NOT EXISTS edit_reason text;
ALTER TABLE milestone ADD COLUMN IF NOT EXISTS b_plus_edit_authorized boolean;
ALTER TABLE milestone ADD COLUMN IF NOT EXISTS b_plus_edit_reason text;

COMMENT ON COLUMN weekly_b_plus.edit_authorized IS
  'L1 退回该份 B+ 标准后置 true（本人可再编辑）；本人保存成功后回到 false，重新锁定';
COMMENT ON COLUMN weekly_b_plus.edit_reason IS '退回原因，展示给本人';
COMMENT ON COLUMN milestone.b_plus_edit_authorized IS
  'L1 把本模块本周的 B+ 验收退回重做后置 true（同时清空 b_plus_check）';
COMMENT ON COLUMN milestone.b_plus_edit_reason IS '退回原因，展示给模块负责人';

COMMIT;
