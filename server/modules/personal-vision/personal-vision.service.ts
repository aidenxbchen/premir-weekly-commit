import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { eq } from 'drizzle-orm';
import { appState } from '@server/database/schema';
import type { PersonalVisionRecord } from '@shared/api.interface';
import { visionSources } from './source';

const keyFor = (userId: string): string => `personal_vision:${userId}`;
const emptyVision: PersonalVisionRecord = { nearFuture: '', northStar: '' };

@Injectable()
export class PersonalVisionService {
  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase) {}

  async mine(userId: string): Promise<PersonalVisionRecord> {
    const [saved] = await this.db.select({ value: appState.value }).from(appState)
      .where(eq(appState.key, keyFor(userId))).limit(1);
    if (saved) {
      try {
        const value: unknown = JSON.parse(saved.value ?? '{}');
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const record = value as Record<string, unknown>;
          return {
            nearFuture: typeof record.nearFuture === 'string' ? record.nearFuture : '',
            northStar: typeof record.northStar === 'string' ? record.northStar : '',
          };
        }
      } catch {
        // 数据异常不能暴露其他人的愿景或悄悄覆盖存量；交给前端明确提示。
      }
      throw new BadRequestException('personal_vision_data_invalid');
    }
    const source = visionSources.find((item) => item.ownerUserId === userId);
    return source ? { nearFuture: source.nearFuture, northStar: source.northStar } : emptyVision;
  }

  async saveMine(userId: string, input: PersonalVisionRecord): Promise<PersonalVisionRecord> {
    if (typeof input?.nearFuture !== 'string' || typeof input?.northStar !== 'string') {
      throw new BadRequestException('personal_vision_text_required');
    }
    const record: PersonalVisionRecord = {
      nearFuture: input.nearFuture.trim(),
      northStar: input.northStar.trim(),
    };
    if (record.nearFuture.length > 1000 || record.northStar.length > 1000) {
      throw new BadRequestException('personal_vision_text_too_long');
    }
    await this.db.insert(appState).values({ key: keyFor(userId), value: JSON.stringify(record) })
      .onConflictDoUpdate({
        target: appState.key,
        set: { value: JSON.stringify(record), updatedAt: new Date() },
      });
    return record;
  }
}
