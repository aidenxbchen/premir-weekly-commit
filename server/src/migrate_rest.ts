import { client } from "./feishu.js";

const SRC_APP = "NjAjb72CNameg5sHhBbcmvcan4d";
const DST_APP = "FwnZbdY6faFocqs9HBacuYNinWc";

function plainText(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value.map((seg) => (seg && typeof seg === "object" && "text" in seg ? (seg as any).text ?? "" : "")).join("");
  }
  return undefined;
}

async function fetchAll(tableId: string) {
  const items: any[] = [];
  let pageToken: string | undefined;
  do {
    const res = await client.bitable.v1.appTableRecord.search({
      path: { app_token: SRC_APP, table_id: tableId },
      params: { page_size: 100, page_token: pageToken },
      data: {},
    });
    items.push(...(res.data?.items ?? []));
    pageToken = res.data?.page_token;
    if (!res.data?.has_more) break;
  } while (pageToken);
  return items;
}

async function migrate(label: string, srcTable: string, dstTable: string, mapFields: (f: Record<string, any>) => Record<string, unknown>) {
  const items = await fetchAll(srcTable);
  let ok = 0;
  let failed = 0;
  for (const r of items) {
    const fields = mapFields(r.fields as Record<string, any>);
    try {
      const created = await client.bitable.v1.appTableRecord.create({
        path: { app_token: DST_APP, table_id: dstTable },
        data: { fields },
      });
      if (created.code === 0) ok++;
      else {
        console.error(`[${label}] create failed:`, created.code, created.msg, JSON.stringify(fields));
        failed++;
      }
    } catch (err: any) {
      console.error(`[${label}] create error:`, JSON.stringify(err?.response?.data ?? err), JSON.stringify(fields));
      failed++;
    }
  }
  console.log(`[${label}] source=${items.length} ok=${ok} failed=${failed}`);
}

function mapMilestone(f: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    "周次": f["周次"],
    "模块": f["模块"],
  };
  const desc = plainText(f["里程碑描述"]);
  if (desc) out["里程碑描述"] = desc;
  const b = plainText(f["B 验收标准"]);
  if (b) out["B 验收标准"] = b;
  const bPlus = plainText(f["B+ 验收标准"]);
  if (bPlus) out["B+ 验收标准"] = bPlus;
  const leadId = f["模块负责人"]?.[0]?.id;
  if (leadId) out["模块负责人"] = [{ id: leadId }];
  // Source predates the 周末/周一 split — one grade per record, mapped to
  // 周末评级 (the first of the two grades) since that's the closer analog.
  if (f["模块评级"]) out["周末评级"] = f["模块评级"];
  const note = plainText(f["备注"]);
  if (note) out["备注"] = note;
  return out;
}

function mapCommitment(f: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    "周次": f["周次"],
    "模块": f["模块"],
  };
  const ownerId = f["姓名"]?.[0]?.id;
  if (ownerId) out["姓名"] = [{ id: ownerId }];
  const deliverable = plainText(f["交付物"]);
  if (deliverable) out["交付物"] = deliverable;
  const criteria = plainText(f["验收标准"]);
  if (criteria) out["验收标准"] = criteria;
  const risk = plainText(f["依赖与风险"]);
  if (risk) out["依赖与风险"] = risk;
  if (typeof f["开始时间"] === "number") out["开始时间"] = f["开始时间"];
  if (typeof f["截止时间"] === "number") out["截止时间"] = f["截止时间"];
  if (typeof f["考核人已确认"] === "boolean") out["考核人已确认"] = f["考核人已确认"];
  // Source predates the 周末/周一 split — one grade per record, mapped to
  // 周末评级.
  if (f["个人评级"]) out["周末评级"] = f["个人评级"];
  const note = plainText(f["评级说明"]);
  if (note) out["评级说明"] = note;
  return out;
}

function mapSoftwareCommitment(f: Record<string, any>): Record<string, unknown> {
  const out: Record<string, unknown> = {
    "周次": f["周次"],
    "模块": f["模块"],
  };
  const ownerId = f["姓名"]?.[0]?.id;
  if (ownerId) out["姓名"] = [{ id: ownerId }];
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
  // Software's destination table already uses "个人评级" directly (its own
  // schema never had the 周末/周一 split even in production), so no rename
  // needed here unlike the other module tables.
  if (f["个人评级"]) out["个人评级"] = f["个人评级"];
  const note = plainText(f["评级说明"]);
  if (note) out["评级说明"] = note;
  return out;
}

async function main() {
  await migrate("模块周里程碑", "tblGKR74qGaXCfdW", "tblS4cJ69sPRUcZZ", mapMilestone);
  await migrate("洗净周承诺", "tblIhR0i46uKbufp", "tblOBjYh91OKCiCS", mapCommitment);
  await migrate("烘干周承诺", "tblERKdJFZF6yoAF", "tblK7fBS4RcAbLMz", mapCommitment);
  await migrate("熨烫周承诺", "tblWHqGkbLUYHaPz", "tblNd1wTxpBrMfzo", mapCommitment);
  await migrate("净水周承诺", "tblLR81EjCqfuDIZ", "tblbSuBmY2SLPYuo", mapCommitment);
  await migrate("软件周承诺", "tblSf6nLeT9UfWoD", "tblU3Ps43AwQhH1C", mapSoftwareCommitment);
}

main().catch((err) => console.error("ERROR:", JSON.stringify(err?.response?.data ?? err, null, 2)));
