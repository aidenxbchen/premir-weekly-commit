import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { and, asc, desc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { comment, commentReceipt, commitment, milestone, weeklyBPlus } from '@server/database/schema';
import { RosterService } from '../roster/roster.service';
import { CommentNotificationService } from './comment-notification.service';
import { isGlobalAdmin, type ScopeHolder } from '@shared/permissions';
import type { CommentDiscussion, CommentRecord, CommentTargetType } from '@shared/api.interface';

type CommentRow = typeof comment.$inferSelect;

const TARGET_TYPES: readonly CommentTargetType[] = [
  'commitment',
  'weekly_b_plus',
  'milestone_description',
  'milestone_b',
  'milestone_b_plus',
];

// 里程碑的三种目标（描述 / B / B+）指向同一行 milestone
const MILESTONE_TARGET_TYPES: readonly CommentTargetType[] = [
  'milestone_description',
  'milestone_b',
  'milestone_b_plus',
];

const MAX_BODY_LENGTH = 2000;

function isTargetType(value: string): value is CommentTargetType {
  return (TARGET_TYPES as readonly string[]).includes(value);
}

export function countsKey(targetType: string, targetId: string): string {
  return `${targetType}:${targetId}`;
}

// 内容评论：谁都能看、谁都能说（"团队彼此看见"的定位），只有作者本人和 L1 能删。
// 不按周冻结——它是对内容的讨论，翻到过去的周也应该看得到当时的对话。
@Injectable()
export class CommentsService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
    private readonly rosterService: RosterService,
    private readonly notifications: CommentNotificationService,
  ) {}

  private toRecord(row: CommentRow, actor: ScopeHolder): CommentRecord {
    return {
      id: row.id,
      targetType: row.targetType as CommentTargetType,
      targetId: row.targetId,
      authorUserId: row.authorProfile,
      authorName: row.authorName ?? undefined,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      canDelete: row.authorProfile === actor.userId || isGlobalAdmin(actor),
    };
  }

  private normalise(targetType: string, targetId: string): { targetType: CommentTargetType; targetId: string } {
    if (!isTargetType(targetType)) throw new BadRequestException('invalid_target_type');
    if (!targetId) throw new BadRequestException('missing_target');
    return { targetType, targetId };
  }

  // 目标必须真的存在，否则评论会挂在空气上（前端传错 id 时最容易发生）。
  private async notificationTarget(targetType: CommentTargetType, targetId: string): Promise<{ recipientId?: string; subject: string; week: string } | undefined> {
    if (targetType === 'commitment') {
      const [row] = await this.db.select().from(commitment).where(eq(commitment.id, targetId)).limit(1);
      return row ? { week: row.week, recipientId: row.ownerProfile, subject: `${row.week} · 周承诺：${row.deliverable ?? ''}` } : undefined;
    }
    if (targetType === 'weekly_b_plus') {
      const [row] = await this.db.select().from(weeklyBPlus).where(eq(weeklyBPlus.id, targetId)).limit(1);
      return row ? { week: row.week, recipientId: row.ownerProfile, subject: `${row.week} · 个人 B+ 验收标准` } : undefined;
    }
    const [row] = await this.db.select().from(milestone).where(eq(milestone.id, targetId)).limit(1);
    if (!row) return undefined;
    const recipientId: string | undefined = await this.rosterService.leadUserIdForModule(row.module);
    const label: string = targetType === 'milestone_description' ? '里程碑' : targetType === 'milestone_b' ? '里程碑 B 标准' : '里程碑 B+ 标准';
    return { week: row.week, recipientId, subject: `${row.week} · ${row.module} · ${label}` };
  }

  async list(targetType: string, targetId: string, actor: ScopeHolder): Promise<CommentRecord[]> {
    const target = this.normalise(targetType, targetId);
    const rows: CommentRow[] = await this.db
      .select()
      .from(comment)
      .where(and(eq(comment.targetType, target.targetType), eq(comment.targetId, target.targetId)))
      .orderBy(asc(comment.createdAt));
    return rows.map((row: CommentRow) => this.toRecord(row, actor));
  }

  async create(targetType: string, targetId: string, body: string, actor: ScopeHolder): Promise<CommentRecord> {
    const target = this.normalise(targetType, targetId);
    const clean: string = body.trim();
    if (!clean) throw new BadRequestException('missing_body');
    if (clean.length > MAX_BODY_LENGTH) throw new BadRequestException('text_too_long');
    const notificationTarget = await this.notificationTarget(target.targetType, target.targetId);
    if (!notificationTarget) throw new NotFoundException('not_found');
    // 姓名存一份快照：人离开团队之后，历史评论里还看得到当时是谁说的
    const name: string | undefined = await this.rosterService.getNameForUser(actor.userId);
    const inserted = await this.db
      .insert(comment)
      .values({
        targetType: target.targetType,
        targetId: target.targetId,
        authorProfile: actor.userId,
        authorName: name ?? null,
        body: clean,
      })
      .returning();
    // 同一内容下的讨论者都会收到后续消息；不能跨承诺或跨里程碑字段通知。
    const participants = await this.db.selectDistinct({ userId: comment.authorProfile })
      .from(comment).where(and(eq(comment.targetType, target.targetType), eq(comment.targetId, target.targetId)));
    const recipients = [...new Set([
      ...(notificationTarget.recipientId ? [notificationTarget.recipientId] : []),
      ...participants.map((participant) => participant.userId),
    ])].filter((userId) => userId !== actor.userId);
    // Persist before external delivery: a failed Feishu send still leaves an in-app reminder.
    if (recipients.length) {
      await this.db.insert(commentReceipt).values(recipients.map((recipientId: string) => ({
        commentId: inserted[0].id, recipientProfile: recipientId,
      }))).onConflictDoNothing();
    }
    const warnings: string[] = [];
    // 限制并发，单个收件人失败也不会阻断其他伙伴的通知。
    for (let offset = 0; offset < recipients.length; offset += 5) {
      const results = await Promise.all(recipients.slice(offset, offset + 5).map((recipientId) =>
        this.notifications.send({
          id: inserted[0].id, recipientId, authorId: actor.userId,
          authorName: name ?? '伙伴', subject: notificationTarget.subject, body: clean,
          isReply: participants.some((participant) => participant.userId === recipientId),
          page: target.targetType.startsWith('milestone_') ? 'milestones' : 'commitments',
        })));
      warnings.push(...results.filter((warning): warning is string => Boolean(warning)));
    }
    const notificationWarning = warnings.length
      ? `评论已保存，但有 ${warnings.length} 位伙伴的飞书通知未送达，请联系管理员检查通知配置。`
      : !notificationTarget.recipientId
        ? '评论已保存；该组尚未指定负责人，未发送负责人通知。'
        : undefined;
    return { ...this.toRecord(inserted[0], actor), notificationWarning };
  }

  async inbox(actor: ScopeHolder): Promise<CommentDiscussion[]> {
    // One indexed query across all weeks, rather than one metadata request per discussion.
    const rows = await this.db.select({ entry: comment,
      promiseWeek: commitment.week, deliverable: commitment.deliverable, owner: commitment.ownerProfile,
      bPlusWeek: weeklyBPlus.week, bPlusOwner: weeklyBPlus.ownerProfile,
      milestoneWeek: milestone.week, module: milestone.module,
    }).from(commentReceipt)
      .innerJoin(comment, eq(comment.id, commentReceipt.commentId))
      .leftJoin(commitment, and(eq(comment.targetType, 'commitment'), eq(comment.targetId, commitment.id)))
      .leftJoin(weeklyBPlus, and(eq(comment.targetType, 'weekly_b_plus'), eq(comment.targetId, weeklyBPlus.id)))
      .leftJoin(milestone, and(inArray(comment.targetType, [...MILESTONE_TARGET_TYPES]), eq(comment.targetId, milestone.id)))
      .where(and(eq(commentReceipt.recipientProfile, actor.userId), isNull(commentReceipt.readAt)))
      .orderBy(desc(comment.createdAt), desc(comment.id));
    const groups = new Map<string, CommentDiscussion>();
    for (const row of rows) {
      const { entry } = row;
      const week = row.promiseWeek ?? row.bPlusWeek ?? row.milestoneWeek;
      if (!week) continue; // Deleted content must never leave a phantom unread reminder.
      const key = countsKey(entry.targetType, entry.targetId);
      const existing = groups.get(key);
      if (existing) { existing.unreadIds.push(entry.id); continue; }
      const label = entry.targetType === 'milestone_description' ? '里程碑'
        : entry.targetType === 'milestone_b' ? '里程碑 B 标准' : '里程碑 B+ 标准';
      const subject = row.promiseWeek ? `${week} · 周承诺：${row.deliverable ?? ''}`
        : row.bPlusWeek ? `${week} · 个人 B+ 验收标准` : `${week} · ${row.module} · ${label}`;
      groups.set(key, { targetType: entry.targetType as CommentTargetType, targetId: entry.targetId,
        subject, week, ownerUserId: row.owner ?? row.bPlusOwner ?? undefined,
        latestCommentId: entry.id, latestAt: entry.createdAt.toISOString(), unreadIds: [entry.id] });
    }
    return [...groups.values()];
  }

  async locate(id: string, actor: ScopeHolder): Promise<CommentDiscussion> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException('无效的评论链接');
    const [entry] = await this.db.select().from(comment).where(eq(comment.id, id)).limit(1);
    if (!entry) throw new NotFoundException('这条评论已删除');
    const targetType = entry.targetType as CommentTargetType;
    const target = await this.notificationTarget(targetType, entry.targetId);
    if (!target) throw new NotFoundException('这份内容已删除');
    const unread = await this.db.select({ id: comment.id }).from(commentReceipt)
      .innerJoin(comment, eq(comment.id, commentReceipt.commentId))
      .where(and(eq(commentReceipt.recipientProfile, actor.userId), isNull(commentReceipt.readAt),
        eq(comment.targetId, entry.targetId), eq(comment.targetType, entry.targetType)));
    return { targetType, targetId: entry.targetId, subject: target.subject, week: target.week,
      ownerUserId: target.recipientId, latestCommentId: entry.id,
      latestAt: entry.createdAt.toISOString(), unreadIds: unread.map((row) => row.id) };
  }

  async markRead(ids: string[], actor: ScopeHolder): Promise<void> {
    if (!Array.isArray(ids) || ids.length > 200 || ids.some((id) => typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
      throw new BadRequestException('无效的已读记录');
    }
    if (!ids.length) return;
    // Exact comment IDs, not "read until now": simultaneous new messages stay unread.
    await this.db.update(commentReceipt).set({ readAt: new Date() }).where(and(
      eq(commentReceipt.recipientProfile, actor.userId), isNull(commentReceipt.readAt),
      sql`${commentReceipt.commentId} = ANY(ARRAY[${sql.join(ids.map((id) => sql`${id}`), sql`, `)}]::uuid[])`,
    ));
  }

  async remove(id: string, actor: ScopeHolder): Promise<boolean> {
    const rows: CommentRow[] = await this.db.select().from(comment).where(eq(comment.id, id)).limit(1);
    const existing: CommentRow | undefined = rows[0];
    if (!existing) return false;
    // 只有作者本人和 L1 能删：别人没法替你收回说过的话
    if (existing.authorProfile !== actor.userId && !isGlobalAdmin(actor)) {
      throw new ForbiddenException('只能删除自己的评论');
    }
    await this.db.delete(comment).where(eq(comment.id, id));
    return true;
  }

  // 本周各对象的评论条数：每个卡片都要知道"有没有人在说"，但不能一个卡片发一次
  // 请求，所以按周一次算完（三条带 join 的分组统计）。
  async countsForWeek(week: string): Promise<Record<string, number>> {
    if (!week) throw new BadRequestException('missing_week');
    const out: Record<string, number> = {};

    const commitmentRows = await this.db
      .select({ targetId: comment.targetId, n: count() })
      .from(comment)
      .innerJoin(commitment, eq(commitment.id, comment.targetId))
      .where(and(eq(comment.targetType, 'commitment'), eq(commitment.week, week)))
      .groupBy(comment.targetId);
    commitmentRows.forEach((row) => {
      out[countsKey('commitment', row.targetId)] = Number(row.n);
    });

    const bPlusRows = await this.db
      .select({ targetId: comment.targetId, n: count() })
      .from(comment)
      .innerJoin(weeklyBPlus, eq(weeklyBPlus.id, comment.targetId))
      .where(and(eq(comment.targetType, 'weekly_b_plus'), eq(weeklyBPlus.week, week)))
      .groupBy(comment.targetId);
    bPlusRows.forEach((row) => {
      out[countsKey('weekly_b_plus', row.targetId)] = Number(row.n);
    });

    const milestoneRows = await this.db
      .select({ targetType: comment.targetType, targetId: comment.targetId, n: count() })
      .from(comment)
      .innerJoin(milestone, eq(milestone.id, comment.targetId))
      .where(and(
        inArray(comment.targetType, [...MILESTONE_TARGET_TYPES]),
        eq(milestone.week, week),
      ))
      .groupBy(comment.targetType, comment.targetId);
    milestoneRows.forEach((row) => {
      out[countsKey(row.targetType, row.targetId)] = Number(row.n);
    });

    return out;
  }

  // 内容被整行删掉时（目前是里程碑和承诺），连带清掉挂在上面的讨论，避免孤儿评论。
  async removeForTargets(targetTypes: CommentTargetType[], targetIds: string[]): Promise<void> {
    if (targetTypes.length === 0 || targetIds.length === 0) return;
    await this.db
      .delete(comment)
      .where(and(inArray(comment.targetType, [...targetTypes]), inArray(comment.targetId, targetIds)));
  }
}
