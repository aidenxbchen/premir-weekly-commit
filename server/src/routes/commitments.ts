import { Router } from "express";
import { requireAuth } from "../lib/session.js";
import { config } from "../config.js";
import { createRecord, type Fields, updateRecord } from "../lib/bitable.js";
import { findRecordCached, queryCollection, upsertRecord, type StoredRecord } from "../lib/store.js";
import { wrap } from "../lib/asyncHandler.js";

export const commitmentsRouter = Router();

function tableFor(moduleName: string): string {
  const tableId = config.tables.commitmentsByModule[moduleName];
  if (!tableId) throw Object.assign(new Error("unknown_module"), { status: 400 });
  if (!config.commitmentsSupportedModules.includes(moduleName)) {
    throw Object.assign(new Error(`module_commitments_not_supported:${moduleName}`), { status: 501 });
  }
  return tableId;
}

// Both reads below are served from the local store (lib/sync.ts) rather
// than a live Feishu call — see milestones.ts for why.
commitmentsRouter.get("/mine", requireAuth, (req, res) => {
  const user = req.user!;
  if (!user.module) return res.json({ items: [] }); // admin with no module of their own
  const week = String(req.query.week ?? "");
  if (!week) return res.status(400).json({ error: "missing_week" });
  const items = queryCollection("commitments", (r) => {
    const owner = (r.fields["姓名"] as Array<{ id?: string }> | undefined)?.[0]?.id;
    return owner === user.openId && r.fields["周次"] === week;
  });
  res.json({ items });
});

// Whole-module view, open to any authenticated user (team-wide visibility,
// matches the culture described in the CEO letter — nothing here is
// per-person private). Write actions (POST/PATCH/grade) stay permission-gated.
commitmentsRouter.get("/", requireAuth, (req, res) => {
  const user = req.user!;
  const week = String(req.query.week ?? "");
  if (!week) return res.status(400).json({ error: "missing_week" });

  const moduleName = String(req.query.module ?? "") || user.module;
  if (!moduleName) return res.status(400).json({ error: "missing_module" });

  const items = queryCollection(
    "commitments",
    (r) => r.fields["模块"] === moduleName && r.fields["周次"] === week
  );
  res.json({ items });
});

commitmentsRouter.post(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const user = req.user!;
    if (!user.module) return res.status(400).json({ error: "no_module" });
    const { week, deliverable, criteria, risk, startTime, endTime } = req.body ?? {};
    if (!week || !deliverable || !criteria) {
      return res.status(400).json({ error: "missing_fields" });
    }

    const fields: Fields = {
      "交付物": deliverable,
      "验收标准": criteria,
      "依赖与风险": risk ?? "",
      "姓名": [{ id: user.openId }],
      "周次": week,
      "模块": user.module,
    };
    if (startTime !== undefined) fields["开始时间"] = startTime;
    if (endTime !== undefined) fields["截止时间"] = endTime;

    const record = await createRecord(tableFor(user.module), fields);
    if (record?.record_id) upsertRecord("commitments", record as StoredRecord);
    res.json({ record });
  })
);

// Two independent permission tiers on the same record:
//  - 交付物/验收标准/依赖与风险/起止时间: owner only (until locked), admin always
//  - 达标 (✅/❌ per-deliverable checkbox): module lead or admin only
commitmentsRouter.patch(
  "/:recordId",
  requireAuth,
  wrap(async (req, res) => {
    const user = req.user!;
    const moduleName = user.role === "admin" ? String(req.body?.module ?? "") : user.module;
    if (!moduleName) return res.status(400).json({ error: "no_module" });
    const { recordId } = req.params;

    const existing = await findRecordCached("commitments", tableFor(moduleName), recordId);
    if (!existing) return res.status(404).json({ error: "not_found" });

    const { deliverable, criteria, risk, startTime, endTime, check } = req.body ?? {};
    const fields: Fields = {};

    const wantsOwnerFields =
      deliverable !== undefined ||
      criteria !== undefined ||
      risk !== undefined ||
      startTime !== undefined ||
      endTime !== undefined;
    const owner = (existing.fields["姓名"] as Array<{ id?: string }> | undefined)?.[0]?.id;

    if (wantsOwnerFields) {
      // Content is strictly self-written — no admin override. Admin's role
      // here is evaluation (checking ✅/❌, grading), not editing anyone
      // else's deliverable text on their behalf.
      if (owner !== user.openId) {
        return res.status(403).json({ error: "forbidden" });
      }
      if (existing.fields["考核人已确认"] === true) {
        return res.status(423).json({ error: "locked" });
      }
      if (deliverable !== undefined) fields["交付物"] = deliverable;
      if (criteria !== undefined) fields["验收标准"] = criteria;
      if (risk !== undefined) fields["依赖与风险"] = risk;
      if (startTime !== undefined) fields["开始时间"] = startTime;
      if (endTime !== undefined) fields["截止时间"] = endTime;
    }

    if (check !== undefined) {
      // ✅/❌ is a completion-status marker a lead reports on their group's
      // *other* members — same "never on yourself" rule as grading (see
      // grade.ts). The 里程碑 page is where admin reviews each whole
      // module; this page is where the lead reviews their own team, so a
      // lead never marks their own card here either way.
      const isLeadOfModule = user.role === "lead" && user.module === moduleName;
      const isOwnCard = owner === user.openId;
      const allowed = user.role === "admin" || (isLeadOfModule && !isOwnCard);
      if (!allowed) return res.status(403).json({ error: "forbidden" });
      if (check !== "✅" && check !== "❌") return res.status(400).json({ error: "invalid_check" });
      fields["达标"] = check;
    }

    if (Object.keys(fields).length === 0) return res.status(400).json({ error: "no_fields" });

    const record = await updateRecord(tableFor(moduleName), recordId, fields);
    if (record?.record_id) upsertRecord("commitments", record as StoredRecord);
    res.json({ record });
  })
);
