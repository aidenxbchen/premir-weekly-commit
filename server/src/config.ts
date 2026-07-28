import "dotenv/config";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  feishu: {
    appId: required("FEISHU_APP_ID"),
    appSecret: required("FEISHU_APP_SECRET"),
  },
  sessionSecret: required("SESSION_SECRET"),
  baseToken: required("BASE_TOKEN"),
  tables: {
    // "模块周里程碑" — one row per module per week, filled by the module lead.
    milestones: required("TABLE_ID_MILESTONES"),
    // "全员评级表" — canonical roster of Monday/Friday grades, used for monthly payout.
    ratings: required("TABLE_ID_RATINGS"),
    // "【XX模块】周承诺" — one table per module, individual weekly commitments.
    commitmentsByModule: {
      洗净模块: required("TABLE_ID_WASH"),
      烘干模块: required("TABLE_ID_DRY"),
      熨烫模块: required("TABLE_ID_IRON"),
      净水模块: required("TABLE_ID_WATER"),
      软件组: required("TABLE_ID_SOFTWARE"),
    } as Record<string, string>,
  },
  // 软件组's "周承诺" table uses a different schema than the other four
  // (separate A/B/B+ 验收标准 fields instead of one generic 验收标准 field),
  // so individual-commitment read/write is disabled for it until that's
  // reconciled — see README. Module milestones are unaffected.
  commitmentsSupportedModules: ["洗净模块", "烘干模块", "熨烫模块", "净水模块"],
};

export type ModuleName = keyof typeof config.tables.commitmentsByModule;
