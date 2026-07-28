import { Router } from "express";
import { requireAuth, requireRole } from "../lib/session.js";
import { config } from "../config.js";
import { updateRecord, type Fields } from "../lib/bitable.js";
import { isChecklistComplete } from "../lib/checklist.js";
import { syncGradeToOwnCommitments, syncGradeToRatings } from "../lib/ratingsSync.js";
import { findRecordCached, queryCollection, upsertRecord, type StoredRecord } from "../lib/store.js";
import { leadOpenIdOf } from "../roster.js";
import { wrap } from "../lib/asyncHandler.js";

export const gradeRouter = Router();

const VALID_GRADES = ["A", "B+", "B", "C"];
const GRADE_FIELD = { weekend: "周末评级", monday: "周一评级" } as const;
type Which = keyof typeof GRADE_FIELD;

function assertGradeNotSet(fields: Fields, which: Which) {
  const currentValue = fields[GRADE_FIELD[which]];
  if (typeof currentValue === "string" && VALID_GRADES.includes(currentValue)) {
    throw Object.assign(new Error("already_graded"), { status: 409 });
  }
}

// A module lead grades one of their members' individual commitment cards —
// never their own. A lead's own card is never graded through this route at
// all anymore, not even by admin — that grade comes solely from the
// module's 里程碑 grade (see the /milestone route below and
// syncGradeToOwnCommitments), so there's exactly one place a lead gets
// graded instead of two channels that could disagree or race each other.
// 周末评级 and 周一评级 are two independent, one-shot grades: once either is
// set to a real grade, it's locked (checked server-side, not just disabled
// in the UI, since the grader has direct API access).
// Same two extra gates as milestone grading (below): every one of this
// person's deliverables must already have a ✅/❌ 达标 mark before ANY grade
// can be given, and 周一评级 needs 周末评级 to already exist.
gradeRouter.post(
  "/commitment/:module/:recordId",
  requireAuth,
  wrap(async (req, res) => {
    const user = req.user!;
    const { module: moduleName, recordId } = req.params;
    const { which, grade, note } = req.body ?? {};
    if (which !== "weekend" && which !== "monday") return res.status(400).json({ error: "invalid_which" });
    if (!VALID_GRADES.includes(grade)) return res.status(400).json({ error: "invalid_grade" });

    const tableId = config.tables.commitmentsByModule[moduleName];
    if (!tableId) return res.status(400).json({ error: "unknown_module" });
    if (!config.commitmentsSupportedModules.includes(moduleName)) {
      return res.status(501).json({ error: "module_commitments_not_supported", module: moduleName });
    }

    const existing = await findRecordCached("commitments", tableId, recordId);
    if (!existing) return res.status(404).json({ error: "not_found" });

    const ownerId = (existing.fields["姓名"] as Array<{ id?: string }> | undefined)?.[0]?.id;
    const isLeadOfModule = user.role === "lead" && user.module === moduleName;
    const isOwnCard = ownerId === user.openId;
    const allowed = user.role === "admin" || (isLeadOfModule && !isOwnCard);
    if (!allowed) return res.status(403).json({ error: "forbidden" });
    if (ownerId && ownerId === leadOpenIdOf(moduleName)) {
      return res.status(409).json({ error: "grade_via_milestone_instead" });
    }

    assertGradeNotSet(existing.fields, which);

    const week = existing.fields["周次"] as string | undefined;
    if (ownerId && week) {
      const allDeliverables = queryCollection("commitments", (r) => {
        const owner = (r.fields["姓名"] as Array<{ id?: string }> | undefined)?.[0]?.id;
        return owner === ownerId && r.fields["模块"] === moduleName && r.fields["周次"] === week;
      });
      const allChecked =
        allDeliverables.length > 0 &&
        allDeliverables.every((r) => r.fields["达标"] === "✅" || r.fields["达标"] === "❌");
      if (!allChecked) {
        return res.status(423).json({ error: "checklist_incomplete" });
      }
    }
    if (which === "monday") {
      const weekend = existing.fields[GRADE_FIELD.weekend];
      if (typeof weekend !== "string" || !VALID_GRADES.includes(weekend)) {
        return res.status(423).json({ error: "weekend_not_graded_yet" });
      }
    }

    const record = await updateRecord(tableId, recordId, {
      [GRADE_FIELD[which as Which]]: grade,
      "评级说明": note ?? "",
    });
    if (record?.record_id) upsertRecord("commitments", record as StoredRecord);
    res.json({ record });

    // 成员的最新评级直接同步到全员评级表，保持"最新版本为准"的原则 — fired
    // after responding, not awaited: it's a secondary mirror write (its own
    // live Bitable call), not something the user should wait on to see
    // their grade confirmed.
    if (ownerId && week) {
      syncGradeToRatings(ownerId, moduleName, week, which, grade, note ?? "").catch((err) =>
        console.error("[grade] syncGradeToRatings failed:", err)
      );
    }
  })
);

// CEO/COO grades a module's weekly milestone — same one-shot lock pattern,
// plus two extra gates that only apply here (not to individual commitment
// grading): every B/B+ 验收标准 checklist item must already be marked
// ✅/❌ before ANY grade can be given, and 周一评级 can't be given until
// 周末评级 already exists — 周一 is meant to be a possible revision of
// 周末's call, not an independent first grade.
gradeRouter.post(
  "/milestone/:recordId",
  requireAuth,
  requireRole("admin"),
  wrap(async (req, res) => {
    const { recordId } = req.params;
    const { which, grade, note } = req.body ?? {};
    if (which !== "weekend" && which !== "monday") return res.status(400).json({ error: "invalid_which" });
    if (!VALID_GRADES.includes(grade)) return res.status(400).json({ error: "invalid_grade" });

    const existing = await findRecordCached("milestones", config.tables.milestones, recordId);
    if (!existing) return res.status(404).json({ error: "not_found" });
    assertGradeNotSet(existing.fields, which);

    const bDone = isChecklistComplete(existing.fields["B 验收标准"], existing.fields["B达标"]);
    const bPlusDone = isChecklistComplete(existing.fields["B+ 验收标准"], existing.fields["B+达标"]);
    if (!bDone || !bPlusDone) {
      return res.status(423).json({ error: "checklist_incomplete" });
    }
    if (which === "monday") {
      const weekend = existing.fields[GRADE_FIELD.weekend];
      if (typeof weekend !== "string" || !VALID_GRADES.includes(weekend)) {
        return res.status(423).json({ error: "weekend_not_graded_yet" });
      }
    }

    const record = await updateRecord(config.tables.milestones, recordId, {
      [GRADE_FIELD[which as Which]]: grade,
      "备注": note ?? "",
    });
    if (record?.record_id) upsertRecord("milestones", record as StoredRecord);
    res.json({ record });

    // 模块负责人的里程碑评级，同步到 (1) 全员评级表里TA自己的那一行，
    // (2) TA自己在本模块周承诺表里的全部记录 — 负责人自己的卡片永远无法
    // 通过常规评分流程被评级（同样的"不能给自己打分"规则），这里补上。
    // Fired after responding, not awaited: these are secondary mirror
    // writes (each its own live Bitable call, and syncGradeToOwnCommitments
    // can be several), not something the user should wait on.
    const leadOpenId = (existing.fields["模块负责人"] as Array<{ id?: string }> | undefined)?.[0]?.id;
    const moduleName = existing.fields["模块"] as string | undefined;
    const week = existing.fields["周次"] as string | undefined;
    if (leadOpenId && moduleName && week) {
      Promise.all([
        syncGradeToRatings(leadOpenId, moduleName, week, which, grade, note ?? ""),
        syncGradeToOwnCommitments(leadOpenId, moduleName, week, which, grade, note ?? ""),
      ]).catch((err) => console.error("[grade] milestone sync failed:", err));
    }
  })
);
