import { useState } from 'react';
import type { Grade } from '@shared/api.interface';
import { errorMessage } from '@/utils/error';
import { ImeTextarea } from './ImeSafeText';
import { RichTextEditor } from './RichTextEditor';
import { DocLinkText } from './DocLinkText';
import { MedalCoin, TIER_METAL } from './MedalCoin';

const GRADES: Grade[] = ['A', 'B+', 'B', 'C'];

const GRADE_COLOR: Record<Grade, string> = {
  A: TIER_METAL.A.core,
  'B+': TIER_METAL['B+'].core,
  B: TIER_METAL.B.core,
  C: TIER_METAL.C.core,
};

export function GradeSection({
  label,
  currentGrade,
  currentNote,
  canGrade,
  blockedReason,
  onSubmit,
}: {
  label: string;
  currentGrade?: string;
  currentNote?: string;
  canGrade: boolean;
  blockedReason?: string;
  onSubmit: (grade: Grade, note: string, correctionReason?: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Grade | null>(null);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [correctionReason, setCorrectionReason] = useState('');
  const isSet: boolean = !!currentGrade && GRADES.includes(currentGrade as Grade);
  const isGrading: boolean = (!isSet && canGrade) || (isSet && canGrade && correcting);

  async function submit(): Promise<void> {
    if (!selected) return;
    setSubmitting(true);
    setErr('');
    try {
      await onSubmit(selected, note, correcting ? correctionReason : undefined);
      setCorrecting(false);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">{label}</div>
        {isSet && (
          <div className="flex items-center gap-1.5">
            <MedalCoin grade={currentGrade!} size="sm" />
            {canGrade && !correcting ? <button type="button" onClick={() => { setCorrecting(true); setSelected(currentGrade as Grade); setNote(currentNote ?? ''); }} className="text-[10px] text-primary hover:underline">更正</button> : <span className="text-[10px] text-muted-foreground">已提交</span>}
          </div>
        )}
        {!isSet && !isGrading && <span className="text-xs text-muted-foreground">{blockedReason ?? '待评'}</span>}
      </div>

      {isSet && !correcting && currentNote?.trim() && (
        <div className="mt-1.5 text-xs text-muted-foreground bg-muted/50 rounded-md px-2 py-1.5 whitespace-pre-wrap break-words">
          <DocLinkText text={currentNote} />
        </div>
      )}

      {isGrading && (
        <div className="mt-1.5 space-y-1.5">
          <div className="flex gap-1">
            {GRADES.map((g: Grade) => (
              <button
                key={g}
                type="button"
                disabled={submitting}
                onClick={() => setSelected(g)}
                style={
                  selected === g
                    ? { backgroundColor: GRADE_COLOR[g], borderColor: GRADE_COLOR[g] }
                    : { borderColor: GRADE_COLOR[g], color: GRADE_COLOR[g] }
                }
                className="px-2 py-0.5 rounded-md text-xs border font-medium disabled:opacity-50 enabled:hover:opacity-80"
              >
                {selected === g ? <span className="text-white">{g}</span> : g}
              </button>
            ))}
          </div>
          {selected && (
            <>
              <RichTextEditor placeholder="备注（选填）" value={note} onChange={setNote} rows={2} className="text-xs" />
              {correcting && <ImeTextarea placeholder="更正原因（必填，将记录在操作日志中）" value={correctionReason} onChange={setCorrectionReason} rows={2} className="text-xs" />}
              <button
                type="button"
                onClick={submit}
                disabled={submitting || (correcting && correctionReason.trim().length < 2)}
                style={{ backgroundColor: GRADE_COLOR[selected] }}
                className="px-3 py-1 rounded-md text-xs text-white disabled:opacity-50 enabled:hover:opacity-85"
              >
                {submitting ? '提交中…' : correcting ? `确认更正为 ${selected}` : `确认提交 ${selected}`}
              </button>
              {correcting && <button type="button" onClick={() => { setCorrecting(false); setSelected(null); setCorrectionReason(''); }} className="ml-2 text-xs text-muted-foreground hover:text-foreground">取消</button>}
            </>
          )}
          {err && <div className="text-[10px] text-destructive">{err}</div>}
        </div>
      )}
    </div>
  );
}
