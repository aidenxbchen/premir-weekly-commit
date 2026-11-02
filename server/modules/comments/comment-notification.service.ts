import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AuthNPaasService } from '@lark-apaas/fullstack-nestjs-core';
import { firstValueFrom, from, timeout } from 'rxjs';
import { createHash } from 'node:crypto';
import { buildCommentCard } from './comment-card';

interface FeishuResult {
  code: number;
  msg?: string;
  tenant_access_token?: string;
  expire?: number;
  data?: { message_id?: string };
}

interface NotificationError extends Error {
  stage?: 'identity' | 'credentials' | 'token' | 'message';
  feishuCode?: number;
}

export interface CommentNotice {
  id: string;
  recipientId: string;
  authorId: string;
  authorName: string;
  subject: string;
  body: string;
  isReply?: boolean;
  page?: 'commitments' | 'milestones';
}

// 使用既有飞书自建应用。凭据留在服务端，收件人必须由内容归属推导。
@Injectable()
export class CommentNotificationService {
  private readonly logger = new Logger(CommentNotificationService.name);
  private token?: { value: string; expiresAt: number };

  constructor(private readonly http: HttpService, private readonly authn: AuthNPaasService) {}

  private async accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now() + 60_000) return this.token.value;
    const appId: string | undefined = process.env.FEISHU_APP_ID;
    const appSecret: string | undefined = process.env.FEISHU_APP_SECRET;
    if (!appId || !appSecret) {
      const error = new Error('missing_feishu_app_credentials') as NotificationError;
      error.stage = 'credentials';
      throw error;
    }
    const { data } = await firstValueFrom(this.http.post<FeishuResult>(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      { app_id: appId, app_secret: appSecret }, { timeout: 3000 },
    ));
    if (data.code !== 0 || !data.tenant_access_token) {
      const error = new Error('feishu_token_failed') as NotificationError;
      error.stage = 'token';
      error.feishuCode = data.code;
      throw error;
    }
    this.token = { value: data.tenant_access_token, expiresAt: Date.now() + (data.expire ?? 7200) * 1000 };
    return this.token.value;
  }

  async send(notice: CommentNotice): Promise<string | undefined> {
    if (notice.recipientId === notice.authorId) return undefined;
    try {
      const [recipient] = await firstValueFrom(
        // 限时，避免身份服务异常时一直卡住评论提交。
        from(this.authn.getBatchLarkUserIds([notice.recipientId])).pipe(timeout(3000)),
      );
      if (!recipient) {
        const error = new Error('recipient_has_no_feishu_identity') as NotificationError;
        error.stage = 'identity';
        throw error;
      }
      const token: string = await this.accessToken();
      const card = buildCommentCard(notice);
      // 一条评论可能通知多个人；去重键必须包含收件人。
      const deliveryId = createHash('sha256').update(`${notice.id}:${notice.recipientId}`).digest('hex').slice(0, 32);
      const response = await firstValueFrom(this.http.post<FeishuResult>(
        'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=user_id',
        { receive_id: recipient, msg_type: 'interactive', content: JSON.stringify(card), uuid: deliveryId },
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 5000,
          // 飞书的业务错误通常也是 4xx；保留响应体才能记录准确错误码。
          validateStatus: () => true,
        },
      ));
      const data = response.data;
      if (data.code !== 0 || !data.data?.message_id) {
        const error = new Error('feishu_message_failed') as NotificationError;
        error.stage = 'message';
        error.feishuCode = data.code;
        throw error;
      }
      this.logger.log(`Comment ${notice.id}: notification sent recipient=${notice.recipientId} messageId=${data.data.message_id}`);
      return undefined;
    } catch (error: unknown) {
      // 只记录阶段和飞书业务码，既能排错，也不会把 token/secret 写入日志。
      const known = error as NotificationError;
      const stage = known.stage ?? 'network';
      const code = known.feishuCode === undefined ? 'none' : String(known.feishuCode);
      this.logger.warn(`Comment ${notice.id}: notification failed stage=${stage} feishuCode=${code}`);
      return '评论已保存，但飞书通知未送达，请联系管理员检查机器人权限与应用配置。';
    }
  }
}
