import { api } from "../api";
import { isChecklistComplete } from "../lib/criteria";
import type { HistoryEntry } from "../lib/gradeScore";
import { plainText } from "../lib/richText";
import type { BitableRecord, Grade, Me, MilestoneFields, RosterItem } from "../types";
import { Avatar } from "./Avatar";
import { CriteriaBlock } from "./CriteriaBlock";
import { EditableField } from "./EditableField";
import { GradeSection } from "./GradeSection";
import { WeekMedal } from "./WeekMedal";

const VALID_GRADES = ["A", "B+", "B", "C"];

// Shared between AllMilestones (4-up ranked grid) and each module's
// ModuleCommitments page (single full-width instance, no rank/crown —
// pass rank={undefined}, compact={true} to show only the module name and
// 里程碑描述, dropping lead badge / history / criteria / grading).
export function MilestoneCard({
  me,
  week,
  rank,
  module,
  lead,
  leadAvatarUrl,
  history,
  score,
  record,
  // Whether every one of this module's 周承诺 deliverables has already
  // been marked ✅/❌ this week — the lead's per-person review has to
  // finish before admin's module-level 验收标准 checkboxes unlock. Server
  // enforces the same gate (see milestones.ts); this just drives the UI.
  commitmentsReady,
  onSaved,
  onWeekChange,
  compact = false,
}: {
  me: Me;
  week: string;
  rank?: number;
  module: string;
  lead?: RosterItem;
  leadAvatarUrl?: string;
  history: HistoryEntry[];
  score: number;
  record?: BitableRecord<MilestoneFields>;
  commitmentsReady: boolean;
  onSaved: () => void;
  onWeekChange: (week: string) => void;
  compact?: boolean;
}) {
  const f = record?.fields;
  const canEditText = (me.role === "lead" && me.module === module) || me.role === "admin";
  const baseCanGrade = me.role === "admin" && !!record?.record_id;

  // Two extra gates on top of the base admin permission, matching the
  // server-side enforcement in grade.ts: every B/B+ checklist item must be
  // decided before either grade can be given, and 周一评级 needs 周末评级
  // to already exist (a possible revision, not an independent first grade).
  const bDone = isChecklistComplete(plainText(f?.["B 验收标准"]), plainText(f?.["B达标"]));
  const bPlusDone = isChecklistComplete(plainText(f?.["B+ 验收标准"]), plainText(f?.["B+达标"]));
  const checklistDone = bDone && bPlusDone;
  const weekendGraded = !!f?.["周末评级"] && VALID_GRADES.includes(f["周末评级"]);

  const canGradeWeekend = baseCanGrade && checklistDone;
  const canGradeMonday = baseCanGrade && checklistDone && weekendGraded;
  const weekendBlockedReason = baseCanGrade && !checklistDone ? "请先完成所有复选框" : undefined;
  const mondayBlockedReason = !baseCanGrade
    ? undefined
    : !checklistDone
      ? "请先完成所有复选框"
      : !weekendGraded
        ? "请先完成周末评级"
        : undefined;

  async function saveField(field: "description" | "bCriteria" | "bPlusCriteria", value: string) {
    await api.post("/milestones", { week, module, [field]: value });
    onSaved();
  }

  async function saveChecklist(field: "bCheck" | "bPlusCheck", value: string) {
    await api.post("/milestones", { week, module, [field]: value });
    onSaved();
  }

  async function submitGrade(which: "weekend" | "monday", grade: Grade, note: string) {
    if (!record?.record_id) return;
    await api.post(`/grade/milestone/${record.record_id}`, { which, grade, note });
    onSaved();
  }

  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-[0_2px_16px_rgba(22,41,107,0.08)] overflow-hidden flex flex-col">
      <div className="p-4 flex items-stretch gap-2">
        <div className="relative bg-brand-blue rounded-xl px-4 py-3 flex-1 flex flex-col justify-center min-w-0">
          {rank === 0 && (
            <span
              className="absolute -top-3 -left-3 text-2xl rotate-[-12deg] drop-shadow-md select-none"
              aria-hidden
            >
              👑
            </span>
          )}
          <div className="text-white font-semibold text-base truncate">{module}</div>
          {!compact && lead && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 bg-white/15 rounded-full pl-0.5 pr-2.5 py-0.5 w-fit max-w-full">
              <Avatar name={lead.name} avatarUrl={leadAvatarUrl} size={18} />
              <span className="text-white text-xs truncate">{lead.name}</span>
            </div>
          )}
        </div>
        {!compact && rank === 0 && (
          <div className="bg-gradient-to-br from-[#ffd76a] to-[#c98600] rounded-xl px-3 py-3 flex flex-col items-center justify-center shrink-0 shadow-sm">
            <span className="text-base leading-none">🏆</span>
            <span className="text-white font-bold text-[11px] whitespace-nowrap mt-1">全场最佳</span>
          </div>
        )}
      </div>

      <div className="px-5 py-4 space-y-4 flex-1">
        {!compact && lead && history.length > 0 && (
          <div className="flex items-end gap-2 flex-wrap pb-4 border-b border-brand-borderLight">
            {history.map((h) => (
              <WeekMedal
                key={h.week}
                week={h.week}
                grade={h.grade}
                size={h.week === week ? "lg" : "sm"}
                active={h.week === week}
                onClick={() => onWeekChange(h.week)}
              />
            ))}
            <span className="eyebrow ml-1 self-center">
              积分 {score >= 0 ? "+" : ""}
              {score}
            </span>
          </div>
        )}

        <div className="border border-brand-border rounded-xl p-3">
          <EditableField
            label="里程碑描述"
            value={plainText(f?.["里程碑描述"])}
            canEdit={canEditText}
            onSave={(v) => saveField("description", v)}
            valueClassName="text-lg font-bold text-brand-text whitespace-pre-wrap mt-0.5"
          />
        </div>

        {!compact && (
          <>
            {me.role === "admin" && !commitmentsReady && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                本模块本周的周承诺复选框还没有全部勾选，暂时不能勾选验收标准
              </div>
            )}

            <div className="border border-brand-border rounded-xl p-3">
              <CriteriaBlock
                label="B 验收标准"
                text={plainText(f?.["B 验收标准"])}
                checklistRaw={plainText(f?.["B达标"])}
                canEditText={canEditText}
                canCheck={me.role === "admin" && commitmentsReady}
                onSaveText={(v) => saveField("bCriteria", v)}
                onSaveChecklist={(v) => saveChecklist("bCheck", v)}
              />
            </div>

            <div className="border border-brand-border rounded-xl p-3">
              <CriteriaBlock
                label="B+ 验收标准"
                text={plainText(f?.["B+ 验收标准"])}
                checklistRaw={plainText(f?.["B+达标"])}
                canEditText={canEditText}
                canCheck={me.role === "admin" && commitmentsReady}
                onSaveText={(v) => saveField("bPlusCriteria", v)}
                onSaveChecklist={(v) => saveChecklist("bPlusCheck", v)}
              />
            </div>

            <div className="pt-1 border-t border-brand-borderLight" />

            <GradeSection
              label="周末评级"
              currentGrade={f?.["周末评级"]}
              canGrade={canGradeWeekend}
              blockedReason={weekendBlockedReason}
              onSubmit={(g, n) => submitGrade("weekend", g, n)}
            />
            <GradeSection
              label="周一评级"
              currentGrade={f?.["周一评级"]}
              canGrade={canGradeMonday}
              blockedReason={mondayBlockedReason}
              onSubmit={(g, n) => submitGrade("monday", g, n)}
            />
          </>
        )}
      </div>
    </div>
  );
}
