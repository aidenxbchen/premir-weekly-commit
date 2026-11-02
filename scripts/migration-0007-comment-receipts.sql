-- Per-recipient unread state, created only for new comments after this release.
CREATE TABLE IF NOT EXISTS comment_receipt (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 comment_id uuid NOT NULL,
 recipient_profile user_profile NOT NULL,
 read_at TIMESTAMP(3) WITH TIME ZONE,
 _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
 _created_by user_profile DEFAULT (CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END),
 _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
 _updated_by user_profile DEFAULT (CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END)
);
ALTER TABLE comment_receipt ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON comment_receipt TO service_role USING (true);
CREATE POLICY "修改全部数据" ON comment_receipt AS PERMISSIVE FOR ALL TO authenticated USING ((recipient_profile).user_id = current_setting('app.user_id', TRUE));
CREATE POLICY "查看全部数据" ON comment_receipt AS PERMISSIVE FOR SELECT TO authenticated, anon USING ((recipient_profile).user_id = current_setting('app.user_id', TRUE));
CREATE POLICY "修改本人数据" ON comment_receipt AS PERMISSIVE FOR ALL TO authenticated USING ((recipient_profile).user_id = current_setting('app.user_id', TRUE));
CREATE UNIQUE INDEX IF NOT EXISTS uk_comment_receipt_recipient ON comment_receipt (comment_id, ((recipient_profile).user_id));
CREATE INDEX IF NOT EXISTS idx_comment_receipt_unread ON comment_receipt (((recipient_profile).user_id)) WHERE read_at IS NULL;
COMMENT ON TABLE comment_receipt IS '每位收件人的评论未读状态；只标记实际展示过的评论，跨设备同步';
