import { Router } from "express";
import { requireAuth, requireRole } from "../lib/session.js";
import { config } from "../config.js";
import { createRecord, type Fields, updateRecord } from "../lib/bitable.js";
import { queryCollection, upsertRecord, type StoredRecord } from "../lib/store.js";
import { wrap } from "../lib/asyncHandler.js";

export const milestonesRouter = Router();

// All modules' milestones for a given week — every role needs to see this
// to pick which milestone their commitment cards support. Served from the
// local store (see lib/sync.ts) rather than a live Feishu call, so this
// never fails or shows partial data because of a transient API hiccup.
milestonesRouter.get("/", requireAuth, (req, res) => {
  const week = String(req.query.week ?? "");
  if (!week) return res.status(400).json({ error: "missing_week" });
  const items = queryCollection("milestones", (r) => r.fields["周次"] === week);
  res.json({ items });
});

// Module leads create/update their own module's milestone for the week —
// partial update: only fields present in the body are touched, so a
// per-field edit (e.g. just "B 验收标准") never blanks out the others.
// Admin may specify a target module explicitly.
//
// bCheck/bPlusCheck hold a per-item checklist for a numbered criteria
// blob, encoded client-side (see web/src/lib/criteria.ts) as
// comma-joined "✅"/"❌"/"·" tokens aligned by index — validated here only
// loosely (right alphabet, not exact shape) since the encoding is a
// frontend concern.
const CHECKLIST_PATTERN = /^[✅❌·,]*$/;

milestonesRouter.post("/", requireAuth, requireRole("lead", "admin"), wrap(async (req, res) => {
  const user = req.user!;
  const { week, description, bCriteria, bPlusCriteria, bCheck, bPlusCheck } = req.body ?? {};
  const targetModule = user.role === "admin" ? req.body?.module || user.module : user.module;
  if (!week || !targetModule) {
    return res.status(400).json({ error: "missing_fields" });
  }
  // 达标 checkmarks are an evaluation aid, same permission as grading.
  if ((bCheck !== undefined || bPlusCheck !== undefined) && user.role !== "admin") {
    return res.status(403).json({ error: "forbidden" });
  }
  if (bCheck !== undefined && !CHECKLIST_PATTERN.test(bCheck)) return res.status(400).json({ error: "invalid_check" });
  if (bPlusCheck !== undefined && !CHECKLIST_PATTERN.test(bPlusCheck)) {
    return res.status(400).json({ error: "invalid_check" });
  }
  // A module's own 里程碑 checkboxes can't be touched until every one of
  // that module's 周承诺 deliverables has already been marked ✅/❌ — the
  // lead's per-person review has to happen first, admin's module-level
  // review happens after. Requires at least one commitment to exist (an
  // empty module has nothing checked yet either).
  if (bCheck !== undefined || bPlusCheck !== undefined) {
    const moduleCommitments = queryCollection(
      "commitments",
      (r) => r.fields["模块"] === targetModule && r.fields["周次"] === week
    );
    const commitmentsReady =
      moduleCommitments.length > 0 &&
      moduleCommitments.every((r) => r.fields["达标"] === "✅" || r.fields["达标"] === "❌");
    if (!commitmentsReady) return res.status(409).json({ error: "commitments_not_checked" });
  }

  const existing = queryCollection(
    "milestones",
    (r) => r.fields["周次"] === week && r.fields["模块"] === targetModule
  );

  const fields: Fields = {};
  if (description !== undefined) fields["里程碑描述"] = description;
  if (bCriteria !== undefined) fields["B 验收标准"] = bCriteria;
  if (bPlusCriteria !== undefined) fields["B+ 验收标准"] = bPlusCriteria;
  if (bCheck !== undefined) fields["B达标"] = bCheck;
  if (bPlusCheck !== undefined) fields["B+达标"] = bPlusCheck;

  const record = existing[0]?.record_id
    ? await updateRecord(config.tables.milestones, existing[0].record_id, fields)
    : await createRecord(config.tables.milestones, {
        ...fields,
        "模块负责人": [{ id: user.openId }],
        "周次": week,
        "模块": targetModule,
      });
  if (record?.record_id) upsertRecord("milestones", record as StoredRecord);
  res.json({ record });
}));
