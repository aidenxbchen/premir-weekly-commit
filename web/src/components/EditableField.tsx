import { useState } from "react";
import { ImeTextarea } from "./ImeSafeText";

const inputCls =
  "w-full border border-brand-border rounded-lg px-3 py-2 text-sm leading-normal resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

// Presentation by default; click the pencil to edit just this one field,
// save/cancel apply only to it. Used for the "card is read-only until you
// open it, then each field edits independently" pattern.
export function EditableField({
  label,
  value,
  canEdit,
  onSave,
  valueClassName,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onSave: (next: string) => Promise<void>;
  valueClassName?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  function startEditing() {
    setDraft(value);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    try {
      await onSave(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div>
        <div className="text-xs text-brand-label mb-1">{label}</div>
        <ImeTextarea value={draft} onChange={setDraft} rows={2} autoFocus className={inputCls} />
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
              setDraft(value);
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

  if (!value && canEdit) {
    return (
      <div>
        <div className="text-xs text-brand-label mb-1">{label}</div>
        <button
          onClick={startEditing}
          className="w-full border-2 border-dashed border-brand-border rounded-lg py-2 text-brand-label hover:text-brand-blue hover:border-brand-blue transition-colors text-lg font-bold leading-none"
          title={`填写${label}`}
        >
          +
        </button>
      </div>
    );
  }

  return (
    <div className="group">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs text-brand-label">{label}</div>
        {canEdit && (
          <button
            onClick={startEditing}
            className="text-brand-label hover:text-brand-blue opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
            title="编辑"
          >
            ✏️
          </button>
        )}
      </div>
      <div className={valueClassName ?? "text-sm text-brand-text whitespace-pre-wrap mt-0.5"}>
        {value || <span className="text-brand-label">未填写</span>}
      </div>
    </div>
  );
}
