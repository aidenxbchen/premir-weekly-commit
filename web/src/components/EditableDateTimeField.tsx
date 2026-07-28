import { useState } from "react";
import { formatTime } from "../lib/datetime";

const inputCls =
  "w-full border border-brand-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

function toLocalInput(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): number | undefined {
  if (!s) return undefined;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? undefined : t;
}

export function EditableDateTimeField({
  label,
  valueMs,
  canEdit,
  onSave,
}: {
  label: string;
  valueMs?: number;
  canEdit: boolean;
  onSave: (nextMs: number | undefined) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(toLocalInput(valueMs));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await onSave(fromLocalInput(draft));
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div>
        <div className="text-xs text-brand-label mb-1">{label}</div>
        <input type="datetime-local" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus className={inputCls} />
        <div className="flex gap-2 mt-1.5">
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-1 rounded-lg bg-brand-blue text-white text-xs disabled:opacity-50 hover:bg-brand-navy"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          <button
            onClick={() => {
              setDraft(toLocalInput(valueMs));
              setEditing(false);
            }}
            className="px-3 py-1 rounded-lg border border-brand-border text-brand-muted text-xs"
          >
            取消
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-brand-label">{label}</div>
        {canEdit && (
          <button
            onClick={() => {
              setDraft(toLocalInput(valueMs));
              setEditing(true);
            }}
            className="text-brand-label hover:text-brand-blue opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
            title="编辑"
          >
            ✏️
          </button>
        )}
      </div>
      <div className="text-sm text-brand-text mt-0.5">
        {formatTime(valueMs) || <span className="text-brand-label">未填写</span>}
      </div>
    </div>
  );
}
