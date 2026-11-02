// 2026-10-02 从「团队成员表」的两列原文导入。飞书 open_id 仅用于追溯来源；
// ownerUserId 来自当日妙搭 roster 的精确姓名匹配，缺席者保持未绑定，避免误认领。
export interface VisionSource {
  name: string;
  sourceOpenId: string;
  ownerUserId?: string;
  nearFuture: string;
  northStar: string;
}

// Public repository ships no member identities or personal goals.
export const visionSources: VisionSource[] = [];
