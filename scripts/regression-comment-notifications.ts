import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { buildCommentCard } from '../server/modules/comments/comment-card';
import { Global, Module } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { Test } from '@nestjs/testing';
import { AuthNPaasService, DRIZZLE_DATABASE, AuthorizationSDK } from '@lark-apaas/fullstack-nestjs-core';
import { of } from 'rxjs';
import { CommentsModule } from '../server/modules/comments/comments.module';
import { CommitmentsModule } from '../server/modules/commitments/commitments.module';
import { FeishuTaskService } from '../server/modules/feishu-task/feishu-task.service';
import { GlobalExceptionFilter } from '../server/common/filters/exception.filter';

async function main() {
  process.env.LOCAL_PG_DIR = mkdtempSync(join(tmpdir(), 'anever-comments-'));
  // Transport test only: these values never reach a real HTTP client.
  process.env.FEISHU_APP_ID = 'test-only'; process.env.FEISHU_APP_SECRET = 'test-only';
  const { openDatabase } = await import('../local/database');
  const { pg, db } = await openDatabase();
  const sent: Array<{ receive_id: string; content: string; uuid: string }> = [];
  let failSend = false;
  let failRecipient = '';
  @Global()
  @Module({ providers: [
    { provide: DRIZZLE_DATABASE, useValue: db },
    { provide: AuthorizationSDK, useValue: {} },
    { provide: AuthNPaasService, useValue: { getBatchLarkUserIds: async (ids: string[]) => ids.map((id) => 'feishu-' + id) } },
  ], exports: [DRIZZLE_DATABASE, AuthorizationSDK, AuthNPaasService] })
  class Platform {}
  const builder = Test.createTestingModule({ imports: [Platform, CommentsModule, CommitmentsModule] });
  builder.overrideProvider(FeishuTaskService).useValue({ createDeliverableTask: async () => undefined });
  builder.overrideProvider(HttpService).useValue({ post: (url: string, body: typeof sent[number]) => {
    if (url.includes('/auth/')) return of({ data: { code: 0, tenant_access_token: 'test-token', expire: 7200 } });
    if (failSend || body.receive_id === failRecipient) return of({ data: { code: 99991672 } });
    assert.ok(url.endsWith('receive_id_type=user_id'));
    sent.push(body);
    return of({ data: { code: 0, data: { message_id: 'test-message' } } });
  } });
  const testing = await builder.compile();
  const app = testing.createNestApplication({ logger: false });
  app.use((req: any, _res: unknown, next: () => void) => {
    req.userContext = { userId: req.headers['x-test-actor'], roles: ['member'], appId: 'test' }; next();
  });
  app.useGlobalFilters(new GlobalExceptionFilter());
  await app.listen(0, '127.0.0.1');
  const url = await app.getUrl();
  let cases = 0;
  async function api(path: string, actor: string, method = 'GET', body?: unknown, status = 200) {
    const response = await fetch(url + '/api/' + path, { method, headers: { 'x-test-actor': actor, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    const result = await response.json();
    assert.equal(response.status, status, JSON.stringify(result)); cases++; return result;
  }
  try {
    await pg.exec(`INSERT INTO department(name) VALUES ('通知测试组');
      UPDATE app_state SET value='W99' WHERE key='current_week';
      INSERT INTO roster(member_profile,name,role,level,module,can_grade) VALUES
      (ROW('owner')::user_profile,'Owner','member','member','通知测试组',true),
      (ROW('peer')::user_profile,'Peer','member','member','通知测试组',true),
      (ROW('lead')::user_profile,'Lead','admin','L3','通知测试组',true),
      (ROW('admin')::user_profile,'Admin','admin','L1',NULL,true);`);
    const commitment = (await api('commitments', 'owner', 'POST', { week: 'W99', deliverable: '交付物', criteria: '标准' }, 201)).record;
    const post = (type: string, id: string, actor = 'peer') => api('comments', actor, 'POST', { targetType: type, targetId: id, body: '评论内容 <b>保持原文</b>' }, 201);
    const first = (await post('commitment', commitment.id)).record;
    assert.equal(sent[0].receive_id, 'feishu-owner'); assert.equal(sent[0].uuid, createHash('sha256').update(`${first.id}:owner`).digest('hex').slice(0,32));
    assert.match(JSON.parse(sent[0].content).header.title.content, /Peer 给你留言了/);
    assert.equal(JSON.parse(sent[0].content).schema, '2.0');
    const buttonUrl = JSON.parse(sent[0].content).body.elements.at(-1).behaviors[0].default_url;
    assert.ok(buttonUrl.startsWith('https://applink.feishu.cn/client/web_url/open?mode=appCenter&url='));
    assert.equal(new URL(buttonUrl).searchParams.get('url'), `https://lwnmuwghgr.feishuapp.com/app/app_17b0qs50x8v?comment=${first.id}`);
    const behavior = JSON.parse(sent[0].content).body.elements.at(-1).behaviors[0];
    for (const platform of ['pc_url', 'ios_url', 'android_url']) assert.equal(behavior[platform], buttonUrl);
    assert.ok(!JSON.stringify(JSON.parse(sent[0].content).body).includes('<b>'));
    // Per-user receipts survive reload, never notify the author, and mark only supplied IDs.
    let inbox = await api('comments/inbox', 'owner');
    assert.deepEqual(inbox.items[0].unreadIds, [first.id]);
    assert.equal(inbox.items[0].week, 'W99');
    assert.equal((await api('comments/inbox', 'peer')).items.length, 0);
    await api('comments/read', 'peer', 'POST', { commentIds: [first.id] }, 201);
    assert.equal((await api('comments/inbox', 'owner')).items[0].unreadIds.length, 1);
    const located = await api(`comments/locate/${first.id}`, 'owner');
    assert.equal(located.targetId, commitment.id);
    await api('comments/read', 'owner', 'POST', { commentIds: [first.id] }, 201);
    await api('comments/read', 'owner', 'POST', { commentIds: [first.id] }, 201);
    assert.equal((await api('comments/inbox', 'owner')).items.length, 0);
    await api('comments/read', 'owner', 'POST', { commentIds: ['bad-id'] }, 400);
    await api('comments/locate/bad-id', 'owner', 'GET', undefined, 400);
    await post('commitment', commitment.id, 'owner'); assert.equal(sent.length, 2);
    assert.equal(sent[1].receive_id, 'feishu-peer');
    assert.match(JSON.parse(sent[1].content).header.title.content, /回复了你参与的讨论/);
    const beforeThird = sent.length;
    await post('commitment', commitment.id, 'admin');
    assert.equal(sent.length, beforeThird + 2);
    assert.deepEqual(new Set(sent.slice(-2).map(x => x.receive_id)), new Set(['feishu-owner','feishu-peer']));
    assert.notEqual(sent.at(-1)?.uuid, sent.at(-2)?.uuid);
    await post('commitment', commitment.id, 'owner');
    assert.deepEqual(new Set(sent.slice(-2).map(x => x.receive_id)), new Set(['feishu-admin','feishu-peer']));
    const bplus = await pg.query<{ id: string }>(`INSERT INTO weekly_b_plus(week,owner_profile,criteria) VALUES ('W99',ROW('owner')::user_profile,'标准') RETURNING id`);
    await post('weekly_b_plus', bplus.rows[0].id); assert.equal(sent.at(-1)?.receive_id, 'feishu-owner');
    const milestones = await pg.query<{ id: string }>(`INSERT INTO milestone(week,module,description,lead_profile) VALUES ('W99','通知测试组','里程碑',ROW('old-lead')::user_profile) RETURNING id`);
    for (const type of ['milestone_description', 'milestone_b', 'milestone_b_plus']) {
      await post(type, milestones.rows[0].id); assert.equal(sent.at(-1)?.receive_id, 'feishu-lead');
    }
    const before = sent.length;
    await post('milestone_description', milestones.rows[0].id, 'lead'); assert.equal(sent.length, before + 1);
    assert.equal(sent.at(-1)?.receive_id, 'feishu-peer');
    failSend = true;
    const failed = (await post('commitment', commitment.id)).record;
    assert.match(failed.notificationWarning, /评论已保存/);
    const list = await api(`comments?targetType=commitment&targetId=${commitment.id}`, 'owner');
    assert.ok(list.items.some((item: { id: string }) => item.id === failed.id));
    failSend = false;
    failRecipient = 'feishu-peer';
    const beforePartial = sent.length;
    const partial = (await post('commitment', commitment.id, 'owner')).record;
    assert.match(partial.notificationWarning, /1 位/);
    assert.equal(sent.length, beforePartial + 1);
    assert.equal(sent.at(-1)?.receive_id, 'feishu-admin');
    failRecipient = '';
    const hostile = buildCommentCard({ id:'id', recipientId:'r', authorId:'a', authorName:'伙伴', subject:'W37', body:'<at id=all></at> **hello** & [x](https://example.com)' });
    assert.ok(!JSON.stringify(hostile.body).includes('<at'));
    assert.ok(JSON.stringify(hostile).includes('&#60;'));
    await pg.exec(`UPDATE roster SET can_grade=false WHERE (member_profile).user_id='lead'`);
    assert.match((await post('milestone_b', milestones.rows[0].id)).record.notificationWarning, /未指定负责人/);
    await api('comments', 'peer', 'POST', { targetType: 'commitment', targetId: '00000000-0000-0000-0000-000000000000', body: '不存在' }, 404);
    const earlierUnread = (await api('comments/inbox', 'owner')).items.find((item: any) => item.targetId === commitment.id).unreadIds;
    const late = (await post('commitment', commitment.id)).record;
    await api('comments/read', 'owner', 'POST', { commentIds: earlierUnread }, 201);
    inbox = await api('comments/inbox', 'owner');
    assert.deepEqual(inbox.items.find((item: any) => item.targetId === commitment.id).unreadIds, [late.id]);
    assert.ok((await api('comments/inbox', 'peer')).items.length > 0, 'another recipient is still unread');
    await api(`comments/${late.id}`, 'peer', 'DELETE');
    assert.ok(!(await api('comments/inbox', 'owner')).items.some((item: any) => item.unreadIds.includes(late.id)));
    await api(`comments/locate/${late.id}`, 'owner', 'GET', undefined, 404);
    assert.equal((await api('comments/inbox', 'owner')).items.filter((item: any) => item.targetType === 'weekly_b_plus').length, 1);
    // 审批不带 note：同意可编辑，拒绝保持锁定，重复处理和越权仍被拒绝。
    let record = (await api(`commitments/${commitment.id}/edit-requests`, 'owner', 'POST', { reason: '调整内容' }, 201)).record;
    await api(`commitments/edit-requests/${record.editRequest.id}`, 'peer', 'PATCH', { action: 'approve' }, 403);
    record = (await api(`commitments/edit-requests/${record.editRequest.id}`, 'admin', 'PATCH', { action: 'reject' })).record;
    assert.equal(record.editRequest.status, 'rejected'); assert.equal(record.editAuthorized, false);
    await api(`commitments/edit-requests/${record.editRequest.id}`, 'admin', 'PATCH', { action: 'approve' }, 409);
    record = (await api(`commitments/${commitment.id}/edit-requests`, 'owner', 'POST', { reason: '重新申请' }, 201)).record;
    record = (await api(`commitments/edit-requests/${record.editRequest.id}`, 'admin', 'PATCH', { action: 'approve' })).record;
    assert.equal(record.editAuthorized, true); assert.equal(record.editRequest.reviewerUserId, 'admin');
    // Mirror Miaoda's actual runtime role: author inserts, only recipient reads/updates.
    await pg.exec('CREATE ROLE service_role; CREATE ROLE authenticated; CREATE ROLE anon;');
    await pg.exec(readFileSync('scripts/migration-0007-comment-receipts.sql', 'utf8'));
    await pg.exec(readFileSync('scripts/migration-0008-comment-receipt-insert-policy.sql', 'utf8'));
    await pg.exec('GRANT SELECT ON comment TO authenticated; GRANT ALL ON comment_receipt TO authenticated;');
    try {
      await pg.exec("SET ROLE authenticated; SET app.user_id='peer';");
      await pg.query("INSERT INTO comment_receipt(comment_id,recipient_profile) VALUES ($1,ROW('admin')::user_profile) ON CONFLICT DO NOTHING", [first.id]);
      assert.equal((await pg.query('SELECT id FROM comment_receipt WHERE comment_id=$1', [first.id])).rows.length, 0, 'sender cannot read another recipient receipt');
      await pg.exec("SET app.user_id='owner';");
      assert.equal((await pg.query('SELECT id FROM comment_receipt WHERE comment_id=$1', [first.id])).rows.length, 1, 'recipient can read own receipt');
      const updated = await pg.query("UPDATE comment_receipt SET read_at=now() WHERE comment_id=$1 AND (recipient_profile).user_id='admin' RETURNING id", [first.id]);
      assert.equal(updated.rows.length, 0, 'cannot mark another recipient as read');
      await assert.rejects(pg.query("INSERT INTO comment_receipt(comment_id,recipient_profile) VALUES ($1,ROW('someone-else')::user_profile)", [first.id]), /row-level security/i);
      cases += 4;
    } finally { await pg.exec('RESET ROLE;'); }
    console.log(`PASS: ${cases} HTTP scenarios; all five comment types, identity conversion, self/no-owner/failure handling, and reason-free review. No real messages sent.`);
  } finally { await app.close(); await pg.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
