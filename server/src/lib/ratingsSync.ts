import { config } from "../config.js";
import { createRecord, updateRecord, type Fields } from "./bitable.js";
import { queryCollection, upsertRecord, type StoredRecord } from "./store.js";

// 全员评级表's own "模块" field uses short labels ("洗净"), unlike every
// other table's "模块" field ("洗净模块") or roster.json's module names.
export const RATINGS_MODULE_LABEL: Record<string, string> = {
  洗净模块: "洗净",
  烘干模块: "烘干",
  熨烫模块: "熨烫",
  净水模块: "净水",
  软件组: "软件",
};

const RATING_GRADE_FIELD = { weekend: "周五评级", monday: "周一评级" } as const;
const RATING_NOTE_FIELD = { weekend: "周五备注", monday: "周一备注" } as const;

// Mirrors a milestone/commitment grade into 全员评级表 for the graded
// person: 周末评级 -> 周五评级, 周一评级 -> 周一评级. Each grade is written
// into its own field, not merged — the existing "latest version wins"
// display logic (finalGrade(): Monday if present, else Friday) already
// does the right thing once both fields are populated independently.
export async function syncGradeToRatings(
  targetOpenId: string,
  moduleName: string,
  week: string,
  which: "weekend" | "monday",
  grade: string,
  note: string
): Promise<void> {
  const ratingsModule = RATINGS_MODULE_LABEL[moduleName];
  if (!ratingsModule) return;

  const existing = queryCollection("ratings", (r) => {
    const id = (r.fields["成员姓名"] as Array<{ id?: string }> | undefined)?.[0]?.id;
    return id === targetOpenId && r.fields["周次"] === week;
  });

  const fields: Fields = {
    "成员姓名": [{ id: targetOpenId }],
    "周次": week,
    "模块": ratingsModule,
    [RATING_GRADE_FIELD[which]]: grade,
    [RATING_NOTE_FIELD[which]]: note,
  };

  const record = existing[0]?.record_id
    ? await updateRecord(config.tables.ratings, existing[0].record_id, fields)
    : await createRecord(config.tables.ratings, fields);
  if (record?.record_id) upsertRecord("ratings", record as StoredRecord);
}

const COMMITMENT_GRADE_FIELD = { weekend: "周末评级", monday: "周一评级" } as const;

// A module lead is graded once, at the module/milestone level — not
// separately on their own 周承诺 page (that grading UI is hidden for a
// lead's own card, see ModuleCommitments.tsx's PersonCard), since a
// second independent grading channel for the same person just risked the
// two disagreeing or racing each other. This fills the lead's own
// commitment records in automatically from the SAME milestone grade admin
// gives that module each week, applied to every one of their commitment
// records for the week (matching the grouped-write pattern the frontend
// uses for person-level grading elsewhere).
export async function syncGradeToOwnCommitments(
  leadOpenId: string,
  moduleName: string,
  week: string,
  which: "weekend" | "monday",
  grade: string,
  note: string
): Promise<void> {
  const tableId = config.tables.commitmentsByModule[moduleName];
  if (!tableId || !config.commitmentsSupportedModules.includes(moduleName)) return;

  const records = queryCollection("commitments", (r) => {
    const owner = (r.fields["姓名"] as Array<{ id?: string }> | undefined)?.[0]?.id;
    return owner === leadOpenId && r.fields["模块"] === moduleName && r.fields["周次"] === week;
  });

  await Promise.all(
    records.map(async (r) => {
      const updated = await updateRecord(tableId, r.record_id, {
        [COMMITMENT_GRADE_FIELD[which]]: grade,
        "评级说明": note,
      });
      if (updated?.record_id) upsertRecord("commitments", updated as StoredRecord);
    })
  );
}
