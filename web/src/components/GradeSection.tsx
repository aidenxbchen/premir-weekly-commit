import { useState } from "react";
import type { Grade } from "../types";
import { ImeTextarea } from "./ImeSafeText";
import { MedalCoin, TIER_METAL } from "./MedalCoin";

const GRADES: Grade[] = ["A", "B+", "B", "C"];

// Same per-grade colors as the medal badges (TIER_METAL's core hue), so
// picking a grade here and seeing it as a badge afterward is the same
// color, not a mismatched palette.
const GRADE_COLOR: Record<Grade, string> = {
  A: TIER_METAL.A.core,
  "B+": TIER_METAL["B+"].core,
  B: TIER_METAL.B.core,
  C: TIER_METAL.C.core,
};

// Select an option -> note appears -> confirm-submit button -> locked.
// Caller owns what "submit" actually does (which endpoint/entity); this
// component only owns the interaction and the "already submitted" display.
export function GradeSection({
  label,
  currentGrade,
  canGrade,
  blockedReason,
  onSubmit,
}: {
  label: string;
  currentGrade?: string;
  canGrade: boolean;
  // Shown instead of the generic "待评" when the grader has the base
  // permission but is blocked by a specific precondition (checklist not
  // done, weekend not graded yet) — lets them know why, not just that.
  blockedReason?: string;
  onSubmit: (grade: Grade, note: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Grade | null>(null);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState("");
  const isSet = !!currentGrade && GRADES.includes(currentGrade as Grade);
  const isGrading = !isSet && canGrade;

  async function submit() {
    if (!selected) return;
    setSubmitting(true);
    setErr("");
    try {
      await onSubmit(selected, note);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-brand-label">{label}</div>
        {isSet && (
          <div className="flex items-center gap-1.5">
            <MedalCoin grade={currentGrade!} size="sm" />
            <span className="text-[10px] text-brand-label">已提交</span>
          </div>
        )}
        {!isSet && !isGrading && (
          <span className="text-xs text-brand-label">{blockedReason ?? "待评"}</span>
        )}
      </div>

      {isGrading && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex gap-1">
            {GRADES.map((g) => (
              <button
                key={g}
                disabled={submitting}
                onClick={() => setSelected(g)}
                style={
                  selected === g
                    ? { backgroundColor: GRADE_COLOR[g], borderColor: GRADE_COLOR[g] }
                    : { borderColor: GRADE_COLOR[g], color: GRADE_COLOR[g] }
                }
                className="px-2 py-0.5 rounded-md text-xs border font-medium disabled:opacity-50 hover:opacity-80"
              >
                {selected === g ? <span className="text-white">{g}</span> : g}
              </button>
            ))}
          </div>
          {selected && (
            <>
              <ImeTextarea
                placeholder="备注（选填）"
                value={note}
                onChange={setNote}
                rows={2}
                className="w-full border border-brand-border rounded-lg px-2 py-1.5 text-xs leading-normal resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
              />
              <button
                onClick={submit}
                disabled={submitting}
                style={{ backgroundColor: GRADE_COLOR[selected] }}
                className="px-3 py-1 rounded-md text-xs text-white disabled:opacity-50 hover:opacity-85"
              >
                {submitting ? "提交中…" : `确认提交 ${selected}`}
              </button>
            </>
          )}
          {err && <div className="text-[10px] text-red-500">{err}</div>}
        </div>
      )}
    </div>
  );
}
