import { config } from "../config.js";
import { client } from "../feishu.js";
import type { Fields, FieldValue } from "./bitable.js";
import { queryCollection } from "./store.js";

// One-way nightly snapshot: local store -> the backup Bitable named in
// config.backup. The local store is already the read side of a
// write-through cache against the real production base (see sync.ts /
// store.ts), so it's the source of truth here — this job never reads
// anything back from the backup base. Each table is fully wiped and
// rewritten every run rather than diffed/merged, so the backup can never
// silently drift from the local store (a stale record that got deleted at
// the source would otherwise linger forever).

function plainText(value: FieldValue | undefined): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value || undefined;
  if (Array.isArray(value)) {
    const s = value
      .map((seg) => (typeof seg === "object" && seg && "text" in seg ? (seg as { text?: string }).text ?? "" : ""))
      .join("");
    return s || undefined;
  }
  return undefined;
}

function userField(value: FieldValue | undefined): Array<{ id: string }> | undefined {
  const arr = value as Array<{ id?: string }> | undefined;
  const id = Array.isArray(arr) ? arr[0]?.id : undefined;
  return id ? [{ id }] : undefined;
}

function mapMilestone(f: Fields): Fields {
  const out: Fields = {};
  const desc = plainText(f["里程碑描述"]);
  if (desc) out["里程碑描述"] = desc;
  if (typeof f["周次"] === "string") out["周次"] = f["周次"];
  if (typeof f["模块"] === "string") out["模块"] = f["模块"];
  const b = plainText(f["B 验收标准"]);
  if (b) out["B 验收标准"] = b;
  const bPlus = plainText(f["B+ 验收标准"]);
  if (bPlus) out["B+ 验收标准"] = bPlus;
  const bCheck = plainText(f["B达标"]);
  if (bCheck) out["B达标"] = bCheck;
  const bPlusCheck = plainText(f["B+达标"]);
  if (bPlusCheck) out["B+达标"] = bPlusCheck;
  const lead = userField(f["模块负责人"]);
  if (lead) out["模块负责人"] = lead;
  if (typeof f["周末评级"] === "string") out["周末评级"] = f["周末评级"];
  if (typeof f["周一评级"] === "string") out["周一评级"] = f["周一评级"];
  const note = plainText(f["备注"]);
  if (note) out["备注"] = note;
  return out;
}

function mapRating(f: Fields): Fields {
  const out: Fields = {};
  const name = userField(f["成员姓名"]);
  if (name) out["成员姓名"] = name;
  if (typeof f["周次"] === "string") out["周次"] = f["周次"];
  if (typeof f["模块"] === "string") out["模块"] = f["模块"];
  if (typeof f["周一评级"] === "string") out["周一评级"] = f["周一评级"];
  const monNote = plainText(f["周一备注"]);
  if (monNote) out["周一备注"] = monNote;
  if (typeof f["周五评级"] === "string") out["周五评级"] = f["周五评级"];
  const friNote = plainText(f["周五备注"]);
  if (friNote) out["周五备注"] = friNote;
  return out;
}

function mapCommitment(f: Fields): Fields {
  const out: Fields = {};
  if (typeof f["周次"] === "string") out["周次"] = f["周次"];
  if (typeof f["模块"] === "string") out["模块"] = f["模块"];
  const owner = userField(f["姓名"]);
  if (owner) out["姓名"] = owner;
  const deliverable = plainText(f["交付物"]);
  if (deliverable) out["交付物"] = deliverable;
  const criteria = plainText(f["验收标准"]);
  if (criteria) out["验收标准"] = criteria;
  const risk = plainText(f["依赖与风险"]);
  if (risk) out["依赖与风险"] = risk;
  if (typeof f["开始时间"] === "number") out["开始时间"] = f["开始时间"];
  if (typeof f["截止时间"] === "number") out["截止时间"] = f["截止时间"];
  if (typeof f["考核人已确认"] === "boolean") out["考核人已确认"] = f["考核人已确认"];
  if (typeof f["达标"] === "string") out["达标"] = f["达标"];
  if (typeof f["周末评级"] === "string") out["周末评级"] = f["周末评级"];
  const note = plainText(f["评级说明"]);
  if (note) out["评级说明"] = note;
  if (typeof f["周一评级"] === "string") out["周一评级"] = f["周一评级"];
  return out;
}

function mapSoftwareCommitment(f: Fields): Fields {
  const out: Fields = {};
  if (typeof f["周次"] === "string") out["周次"] = f["周次"];
  if (typeof f["模块"] === "string") out["模块"] = f["模块"];
  const owner = userField(f["姓名"]);
  if (owner) out["姓名"] = owner;
  const deliverable = plainText(f["交付物"]);
  if (deliverable) out["交付物"] = deliverable;
  const b = plainText(f["B 验收标准"]);
  if (b) out["B 验收标准"] = b;
  const bPlus = plainText(f["B+ 验收标准"]);
  if (bPlus) out["B+ 验收标准"] = bPlus;
  const a = plainText(f["A 验收标准"]);
  if (a) out["A 验收标准"] = a;
  const risk = plainText(f["依赖与风险"]);
  if (risk) out["依赖与风险"] = risk;
  if (typeof f["开始时间"] === "number") out["开始时间"] = f["开始时间"];
  if (typeof f["截止时间"] === "number") out["截止时间"] = f["截止时间"];
  if (typeof f["考核人已确认"] === "boolean") out["考核人已确认"] = f["考核人已确认"];
  if (typeof f["个人评级"] === "string") out["个人评级"] = f["个人评级"];
  const note = plainText(f["评级说明"]);
  if (note) out["评级说明"] = note;
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function wipeTable(tableId: string): Promise<void> {
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const res = await client.bitable.v1.appTableRecord.search({
      path: { app_token: config.backup.appToken, table_id: tableId },
      params: { page_size: 100, page_token: pageToken },
      data: {},
    });
    for (const r of res.data?.items ?? []) {
      if (r.record_id) ids.push(r.record_id);
    }
    pageToken = res.data?.page_token;
    if (!res.data?.has_more) break;
  } while (pageToken);

  for (const batch of chunk(ids, 500)) {
    await client.bitable.v1.appTableRecord.batchDelete({
      path: { app_token: config.backup.appToken, table_id: tableId },
      data: { records: batch },
    });
  }
}

async function fillTable(tableId: string, records: Fields[]): Promise<void> {
  for (const batch of chunk(records, 500)) {
    await client.bitable.v1.appTableRecord.batchCreate({
      path: { app_token: config.backup.appToken, table_id: tableId },
      data: { records: batch.map((fields) => ({ fields })) },
    });
  }
}

export async function runNightlyBackup(): Promise<void> {
  console.log("[backup] starting...");

  const milestones = queryCollection("milestones", () => true).map((r) => mapMilestone(r.fields));
  await wipeTable(config.backup.tables.milestones);
  await fillTable(config.backup.tables.milestones, milestones);
  console.log(`[backup] milestones: ${milestones.length} records`);

  const ratings = queryCollection("ratings", () => true).map((r) => mapRating(r.fields));
  await wipeTable(config.backup.tables.ratings);
  await fillTable(config.backup.tables.ratings, ratings);
  console.log(`[backup] ratings: ${ratings.length} records`);

  for (const [moduleName, tableId] of Object.entries(config.backup.tables.commitmentsByModule)) {
    const records = queryCollection("commitments", (r) => r.fields["模块"] === moduleName);
    const mapped = records.map((r) => (moduleName === "软件组" ? mapSoftwareCommitment(r.fields) : mapCommitment(r.fields)));
    await wipeTable(tableId);
    await fillTable(tableId, mapped);
    console.log(`[backup] ${moduleName}周承诺: ${mapped.length} records`);
  }

  console.log("[backup] done.");
}

// Beijing time (Asia/Shanghai) has been a fixed UTC+8 offset with no DST
// since 1991, so this can just be plain UTC arithmetic instead of relying
// on the host machine's local timezone or an Intl call.
function msUntilNextBeijing2am(): number {
  const now = Date.now();
  const nowBeijing = new Date(now + 8 * 3600_000);
  const targetBeijingMidnightPlus2 = Date.UTC(
    nowBeijing.getUTCFullYear(),
    nowBeijing.getUTCMonth(),
    nowBeijing.getUTCDate(),
    2,
    0,
    0
  );
  let targetUtc = targetBeijingMidnightPlus2 - 8 * 3600_000;
  if (targetUtc <= now) targetUtc += 24 * 3600_000;
  return targetUtc - now;
}

export function startNightlyBackupSchedule(): void {
  function scheduleNext() {
    const delay = msUntilNextBeijing2am();
    console.log(`[backup] next run in ${Math.round(delay / 60000)} min`);
    setTimeout(async () => {
      try {
        await runNightlyBackup();
      } catch (err) {
        console.error("[backup] run failed:", err);
      }
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}
