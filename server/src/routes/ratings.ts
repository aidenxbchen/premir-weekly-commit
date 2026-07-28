import { Router } from "express";
import { requireAuth } from "../lib/session.js";
import { config } from "../config.js";
import { createRecord, type Fields, updateRecord } from "../lib/bitable.js";
import { queryCollection, upsertRecord, type StoredRecord } from "../lib/store.js";
import { RATINGS_MODULE_LABEL } from "../lib/ratingsSync.js";
import { wrap } from "../lib/asyncHandler.js";
import { lookupUser } from "../roster.js";

export const ratingsRouter = Router();

const VALID_GRADES = ["A", "B+", "B", "C"];

// Open read: 全员评级表 is meant to be visible team-wide. Served from the
// local store (lib/sync.ts) — see milestones.ts for why.
ratingsRouter.get("/", requireAuth, (req, res) => {
  const week = String(req.query.week ?? "");
  if (!week) return res.status(400).json({ error: "missing_week" });
  const items = queryCollection("ratings", (r) => r.fields["周次"] === week);
  res.json({ items });
});

// Upsert one person's row for a week. A lead may only rate their own
// module's members; admin may rate anyone.
ratingsRouter.post(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    const user = req.user!;
    const { targetOpenId, week, mondayGrade, mondayNote, fridayGrade, fridayNote } = req.body ?? {};
    if (!targetOpenId || !week) return res.status(400).json({ error: "missing_fields" });
    if (mondayGrade !== undefined && !VALID_GRADES.includes(mondayGrade)) {
      return res.status(400).json({ error: "invalid_monday_grade" });
    }
    if (fridayGrade !== undefined && !VALID_GRADES.includes(fridayGrade)) {
      return res.status(400).json({ error: "invalid_friday_grade" });
    }

    const target = lookupUser(targetOpenId);
    if (!target?.module) return res.status(400).json({ error: "target_has_no_module" });
    const ratingsModule = RATINGS_MODULE_LABEL[target.module];
    if (!ratingsModule) return res.status(400).json({ error: "unknown_module" });

    const isLeadOfTarget = user.role === "lead" && user.module === target.module;
    if (!isLeadOfTarget && user.role !== "admin") return res.status(403).json({ error: "forbidden" });

    const existing = queryCollection("ratings", (r) => {
      const id = (r.fields["成员姓名"] as Array<{ id?: string }> | undefined)?.[0]?.id;
      return id === targetOpenId && r.fields["周次"] === week;
    });

    const fields: Fields = {
      "成员姓名": [{ id: targetOpenId }],
      "周次": week,
      "模块": ratingsModule,
    };
    if (mondayGrade !== undefined) fields["周一评级"] = mondayGrade;
    if (mondayNote !== undefined) fields["周一备注"] = mondayNote;
    if (fridayGrade !== undefined) fields["周五评级"] = fridayGrade;
    if (fridayNote !== undefined) fields["周五备注"] = fridayNote;

    const record = existing[0]?.record_id
      ? await updateRecord(config.tables.ratings, existing[0].record_id, fields)
      : await createRecord(config.tables.ratings, fields);
    if (record?.record_id) upsertRecord("ratings", record as StoredRecord);
    res.json({ record });
  })
);
