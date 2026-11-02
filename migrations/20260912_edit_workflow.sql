BEGIN;
CREATE TABLE IF NOT EXISTS commitment_edit_request (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id uuid NOT NULL,
  requester_profile user_profile NOT NULL,
  reason text NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'pending',
  reviewer_profile user_profile,
  review_note text,
  reviewed_at TIMESTAMP(3) WITH TIME ZONE,
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END)
);
CREATE INDEX IF NOT EXISTS idx_commitment_edit_request_commitment ON commitment_edit_request (commitment_id);
CREATE INDEX IF NOT EXISTS idx_commitment_edit_request_status ON commitment_edit_request (status);
ALTER TABLE commitment_edit_request ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON commitment_edit_request TO service_role USING (true);
CREATE POLICY "修改全部数据" ON commitment_edit_request AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON commitment_edit_request AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON commitment_edit_request AS PERMISSIVE FOR ALL TO authenticated USING ((current_setting('app.user_id'::text) = ANY (ARRAY[]::text[])) AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text));

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
  _created_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _created_by user_profile DEFAULT (CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END),
  _updated_at TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  _updated_by user_profile DEFAULT (CASE WHEN current_setting('app.user_id', TRUE) = '' THEN NULL ELSE concat('(', current_setting('app.user_id', TRUE), ')')::user_profile END)
);
CREATE INDEX IF NOT EXISTS idx_rating_change_log_subject ON rating_change_log (subject_type, subject_id, week);
ALTER TABLE rating_change_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_bypass_policy ON rating_change_log TO service_role USING (true);
CREATE POLICY "修改全部数据" ON rating_change_log AS PERMISSIVE FOR ALL TO authenticated USING (true);
CREATE POLICY "查看全部数据" ON rating_change_log AS PERMISSIVE FOR SELECT TO authenticated, anon USING (true);
CREATE POLICY "修改本人数据" ON rating_change_log AS PERMISSIVE FOR ALL TO authenticated USING ((current_setting('app.user_id'::text) = ANY (ARRAY[]::text[])) AND (current_setting('app.user_id'::text) = ((_created_by).user_id)::text));
COMMIT;
