import 'reflect-metadata';
import { ForbiddenException, Global, Module, ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DRIZZLE_DATABASE, AuthorizationSDK } from '@lark-apaas/fullstack-nestjs-core';
import { openDatabase } from './database';
import { DepartmentsModule } from '../server/modules/departments/departments.module';
import { RosterModule } from '../server/modules/roster/roster.module';
import { WeekModule } from '../server/modules/week/week.module';
import { MeModule } from '../server/modules/me/me.module';
import { CommitmentsModule } from '../server/modules/commitments/commitments.module';
import { MilestonesModule } from '../server/modules/milestones/milestones.module';
import { RatingsModule } from '../server/modules/ratings/ratings.module';
import { WeeklyBPlusModule } from '../server/modules/weekly-b-plus/weekly-b-plus.module';
import { DocTitleService } from '../server/modules/doc-title/doc-title.service';
import { DocTitleModule } from '../server/modules/doc-title/doc-title.module';
import { PersonalVisionModule } from '../server/modules/personal-vision/personal-vision.module';
import { GradingModule } from '../server/modules/grading/grading.module';
import { BackupModule } from '../server/modules/backup/backup.module';
import { FeishuTaskService } from '../server/modules/feishu-task/feishu-task.service';
import { CommentNotificationService } from '../server/modules/comments/comment-notification.service';
import { GlobalExceptionFilter } from '../server/common/filters/exception.filter';
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
async function main() {
  const { pg, db } = await openDatabase();
  const localDocTitles = JSON.parse(readFileSync('local/doc-titles.json', 'utf8')) as Record<string, string>;
  const record = async (kind: string) => { appendFileSync('local-data/external-actions.ndjson', JSON.stringify({ kind, time: new Date().toISOString(), sent: false }) + '\n'); };
  const blocked = () => { throw new ServiceUnavailableException('本地副本未连接飞书外部服务'); };
  @Global()
  @Module({ providers: [
    { provide: DRIZZLE_DATABASE, useValue: db },
    { provide: AuthorizationSDK, useValue: { members: { add: () => record('role.add'), remove: () => record('role.remove') } } },
  ], exports: [DRIZZLE_DATABASE, AuthorizationSDK] })
  class LocalPlatform {}
  const builder = Test.createTestingModule({ imports: [LocalPlatform, DepartmentsModule, RosterModule, WeekModule, MeModule, CommitmentsModule, MilestonesModule, RatingsModule, WeeklyBPlusModule, DocTitleModule, GradingModule, BackupModule, PersonalVisionModule] });
  builder.overrideProvider(FeishuTaskService).useValue({ createDeliverableTask: () => record('feishu.task') });
  builder.overrideProvider(CommentNotificationService).useValue({ send: async () => {
    await record('feishu.commentNotification');
    return '评论已保存。本地预览未连接飞书通知，正式环境会通知内容所属人。';
  } });
  // 本地副本不在运行时调用飞书；使用开发前从飞书只读核验并保存的标题快照。
  // 线上环境仍由 DocTitleService 动态读取最新标题。
  builder.overrideProvider(DocTitleService).useValue({
    resolve: async (refs: { kind: string; token: string }[]) => {
      await record('feishu.docTitle');
      return Object.fromEntries(refs.flatMap((r) => {
        const key = `${r.kind}:${r.token}`;
        return localDocTitles[key] ? [[key, localDocTitles[key]]] : [];
      }));
    },
  });
  const module = await builder.compile();
  const app = module.createNestApplication();
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalGuards({ canActivate(context) {
    const requirement = Reflect.getMetadata('authzpaas:roles', context.getHandler());
    const roles = context.switchToHttp().getRequest().userContext?.roles || [];
    if (requirement && !requirement.roles.some((role: string) => roles.includes(role))) throw new ForbiddenException();
    return true;
  } });
  const avatars = JSON.parse(readFileSync(existsSync('local/avatars.json') ? 'local/avatars.json' : 'local/avatars.example.json', 'utf8'));
  const people = async () => (await pg.query('SELECT (member_profile).user_id AS user_id, name, role, email, level FROM roster ORDER BY level, name')).rows.map((r: any) => ({ ...r, userID: r.user_id, avatar: avatars[r.name] || '', userType: '_employee' }));
  app.use(async (req: any, res: any, next: any) => {
    const origin = req.headers.origin;
    if (origin && !['http://127.0.0.1:8787', 'http://localhost:8787'].includes(origin)) return res.status(403).json({ message: 'Local origin required' });
    const users = await people();
    const user = users.find((r: any) => r.user_id === process.env.LOCAL_PREVIEW_USER_ID) || users.find((r: any) => r.level === 'L1') || users[0];
    req.userContext = { userId: user.user_id, userName: user.name, roles: [user.role], appId: 'local-copy' };
    if (req.path === '/api/local/users') return res.json(users);
    if (req.path === '/api/local/identity') return res.json(user);
    next();
  });
  await app.listen(Number(process.env.LOCAL_API_PORT || 8788), '127.0.0.1');
  console.log(`Local API ready on 127.0.0.1:${process.env.LOCAL_API_PORT || 8788}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); await pg.close(); process.exit(0); });
}
main().catch(e => { console.error(e.message); process.exit(1); });
