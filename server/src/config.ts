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
  // Nightly one-way backup destination — a separate Bitable built purely
  // as a snapshot target (see README), never read by the live app. The
  // local store (already the read side of a write-through cache against
  // the real production base) is the source of truth here; every night
  // the backup job wipes these tables and rewrites them to match the
  // local store exactly. Not bidirectional — nothing ever flows back from
  // this base into the app.
  backup: {
    appToken: "FwnZbdY6faFocqs9HBacuYNinWc",
    tables: {
      milestones: "tblS4cJ69sPRUcZZ",
      ratings: "tblTIxX3Id6V5dv7",
      commitmentsByModule: {
        洗净模块: "tblOBjYh91OKCiCS",
        烘干模块: "tblK7fBS4RcAbLMz",
        熨烫模块: "tblNd1wTxpBrMfzo",
        净水模块: "tblbSuBmY2SLPYuo",
        软件组: "tblU3Ps43AwQhH1C",
      } as Record<string, string>,
    },
  },
};

export type ModuleName = keyof typeof config.tables.commitmentsByModule;
