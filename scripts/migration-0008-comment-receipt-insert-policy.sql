-- Runtime SQL uses the authenticated author, not service_role.
-- Authors may create receipts for their own comments; reading/marking stays recipient-only.
CREATE POLICY "评论作者创建提醒" ON comment_receipt FOR INSERT TO authenticated
WITH CHECK (EXISTS (
 SELECT 1 FROM comment
 WHERE comment.id = comment_receipt.comment_id
 AND (comment.author_profile).user_id = current_setting('app.user_id', TRUE)
));
