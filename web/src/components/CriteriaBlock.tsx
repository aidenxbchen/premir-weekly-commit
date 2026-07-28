import { useState } from "react";
import {
  encodeChecklist,
  encodeCriteria,
  parseChecklist,
  setChecklistAt,
  splitCriteria,
  stripNumberPrefix,
} from "../lib/criteria";
import { CheckSelect } from "./CheckSelect";
import { ImeTextarea } from "./ImeSafeText";

const inputCls =
  "w-full border border-brand-border rounded-lg px-3 py-2 text-sm leading-normal resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

// A criteria field is really a *list* of individually-verifiable standards
// stored as one text blob ("1.xxx 2.yyy" -> two items), so this edits each
// item on its own — add one, edit one, remove one — rather than making
// whoever's filling it in hand-format a whole numbered paragraph in a
// single textarea (which was the old design, and the actual bug report:
// there was no real way to build a list of several standards). The
// checklist stays index-aligned to the items; only removal needs to shift
// it, since add/edit don't change any other item's position.
export function CriteriaBlock({
  label,
  text,
  checklistRaw,
  canEditText,
  canCheck,
  onSaveText,
  onSaveChecklist,
}: {
  label: string;
  text: string;
  checklistRaw?: string;
  canEditText: boolean;
  canCheck: boolean;
  onSaveText: (next: string) => Promise<void>;
  onSaveChecklist: (next: string) => Promise<void>;
}) {
  // Which row is being edited: an item index, "new" for the add-item form,
  // or null when nothing's open.
  const [editingKey, setEditingKey] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const items = splitCriteria(text);
  const checks = parseChecklist(checklistRaw, items.length);

  function startEditItem(index: number) {
    setDraft(stripNumberPrefix(items[index]));
    setEditingKey(index);
  }

  function startAddItem() {
    setDraft("");
    setEditingKey("new");
  }

  function cancelEdit() {
    setEditingKey(null);
    setDraft("");
  }

  async function saveItem() {
    const value = draft.trim();
    if (!value) return;
    setSaving(true);
    try {
      // Every *other* item still carries its own "N." from the last time
      // splitCriteria read it back — strip that before re-encoding, or
      // encodeCriteria's own numbering doubles up ("1." + "1.xxx").
      const clean = items.map(stripNumberPrefix);
      const nextItems = editingKey === "new" ? [...clean, value] : clean.map((it, i) => (i === editingKey ? value : it));
      await onSaveText(encodeCriteria(nextItems));
      setEditingKey(null);
      setDraft("");
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(index: number) {
    setSaving(true);
    try {
      const nextItems = items.filter((_, i) => i !== index).map(stripNumberPrefix);
      const nextChecks = checks.filter((_, i) => i !== index);
      await onSaveText(encodeCriteria(nextItems));
      await onSaveChecklist(encodeChecklist(nextChecks));
      setEditingKey(null);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(index: number, value: "✅" | "❌") {
    await onSaveChecklist(setChecklistAt(checks, index, value));
  }

  function ItemEditor({ onDelete }: { onDelete?: () => void }) {
    return (
      <div className="border border-brand-border rounded-lg p-2">
        <ImeTextarea value={draft} onChange={setDraft} rows={2} autoFocus className={inputCls} />
        <div className="flex gap-2 mt-1.5">
          <button
            onClick={saveItem}
            disabled={saving || !draft.trim()}
            className="px-3 py-1 rounded-lg bg-brand-blue text-white text-xs disabled:opacity-50 hover:bg-brand-navy"
          >
            {saving ? "保存中…" : "保存"}
          </button>
          <button
            onClick={cancelEdit}
            disabled={saving}
            className="px-3 py-1 rounded-lg border border-brand-border text-brand-muted text-xs disabled:opacity-50"
          >
            取消
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={saving}
              className="px-3 py-1 rounded-lg border border-red-200 text-red-500 text-xs disabled:opacity-50 hover:bg-red-50 ml-auto"
            >
              删除
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-brand-label mb-1">{label}</div>

      {items.length === 0 && editingKey !== "new" ? (
        canEditText ? (
          <button
            onClick={startAddItem}
            className="w-full border-2 border-dashed border-brand-border rounded-lg py-2 text-brand-label hover:text-brand-blue hover:border-brand-blue transition-colors text-lg font-bold leading-none"
            title={`填写${label}`}
          >
            +
          </button>
        ) : (
          <div className="text-sm text-brand-label">未填写</div>
        )
      ) : (
        <div className="space-y-1.5">
          {items.map((item, i) =>
            editingKey === i ? (
              <ItemEditor key={i} onDelete={() => removeItem(i)} />
            ) : (
              <div key={i} className="group flex items-start gap-1">
                <CheckSelect value={checks[i]} canEdit={canCheck} onChange={(v) => toggle(i, v)} />
                <div className="text-sm text-brand-text flex-1 pt-0.5">{item}</div>
                {canEditText && (
                  <button
                    onClick={() => startEditItem(i)}
                    className="text-brand-label hover:text-brand-blue opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0 pt-0.5"
                    title="编辑这一条"
                  >
                    ✏️
                  </button>
                )}
              </div>
            )
          )}

          {canEditText &&
            (editingKey === "new" ? (
              <ItemEditor />
            ) : (
              <button
                onClick={startAddItem}
                className="w-full border-2 border-dashed border-brand-border rounded-lg py-1.5 text-brand-label hover:text-brand-blue hover:border-brand-blue transition-colors text-xs"
              >
                + 添加一条验收标准
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
