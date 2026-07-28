import type { RichText } from "./lib/richText";

export type Role = "admin" | "lead" | "member";

export interface Me {
  openId: string;
  name: string;
  avatarUrl?: string;
  role: Role;
  module?: string;
  week: string;
}

export interface BitableRecord<F = Record<string, unknown>> {
  record_id?: string;
  fields: F;
}

// Field shapes below are as confirmed against the real Bitable API
// (not assumed from lark-cli's markdown display, which formats things
// differently for readability):
//   - select fields (周次/模块/评级 etc.) → plain string
//   - text fields (交付物/验收标准/备注 etc.) → array of {text} runs, or
//     plain string right after this app writes it and re-reads within the
//     same request — always use plainText() from lib/richText to display
//   - user fields (姓名/模块负责人 etc.) → array of {id, name, ...}
//   - datetime fields (开始时间/截止时间) → epoch milliseconds (number)

export interface MilestoneFields {
  "里程碑描述"?: RichText;
  "周次"?: string;
  "模块"?: string;
  "B 验收标准"?: RichText;
  "B+ 验收标准"?: RichText;
  // Per-item checklist for a numbered criteria blob — encoded string, see
  // lib/criteria.ts. Text-type field, so RichText on read like other text.
  "B达标"?: RichText;
  "B+达标"?: RichText;
  "模块负责人"?: Array<{ id?: string; name?: string; avatar_url?: string }>;
  // Two grades, set once each — see server/src/routes/grade.ts for the
  // immutability enforcement (frontend disabling alone isn't a real lock).
  "周末评级"?: string;
  "周一评级"?: string;
  "备注"?: RichText;
}

export interface CommitmentFields {
  "交付物"?: RichText;
  "验收标准"?: RichText;
  "依赖与风险"?: RichText;
  "姓名"?: Array<{ id?: string; name?: string; avatar_url?: string }>;
  "周次"?: string;
  "模块"?: string;
  "开始时间"?: number;
  "截止时间"?: number;
  // Per-deliverable met/not-met mark — lead/admin only, plain select value
  // (not the itemized encoding milestones use, since one commitment = one
  // checkbox here).
  "达标"?: "✅" | "❌";
  // Two grades, set once each — see server/src/routes/grade.ts for the
  // immutability enforcement (frontend disabling alone isn't a real lock).
  "周末评级"?: string;
  "周一评级"?: string;
  "评级说明"?: RichText;
  "考核人已确认"?: boolean;
}

export interface RatingFields {
  "成员姓名"?: Array<{ id?: string; name?: string; avatar_url?: string }>;
  "周次"?: string;
  "模块"?: string;
  "周一评级"?: string;
  "周一备注"?: RichText;
  "周五评级"?: string;
  "周五备注"?: RichText;
}

export interface RosterItem {
  openId: string;
  name: string;
  role: Role;
  module?: string;
  avatarUrl?: string;
}

export type Grade = "A" | "B+" | "B" | "C";

// A Feishu directory search result — not yet (or no longer) in the roster,
// so no role/module.
export interface DirectoryPerson {
  openId: string;
  name: string;
  avatarUrl?: string;
}
