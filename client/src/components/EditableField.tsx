import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSavable } from '@/hooks/useSavable';
import { RichTextEditor } from './RichTextEditor';
import { DocLinkText } from './DocLinkText';

export function EditableField({
  label,
  value,
  canEdit,
  onSave,
  valueClassName,
  actions,
}: {
  label: string;
  value: string;
  canEdit: boolean;
  onSave: (next: string) => Promise<void>;
  valueClassName?: string;
  // 标签行右侧的额外操作（目前是评论入口），和铅笔排在同一行
  actions?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const { saving, error, run } = useSavable();

  function startEditing(): void {
    setDraft(value);
    setEditing(true);
  }

  async function save(): Promise<void> {
    const ok = await run(() => onSave(draft));
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div>
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <RichTextEditor aria-label={label} disabled={saving} value={draft} onChange={setDraft} rows={2} autoFocus />
        <div className="flex gap-2 mt-1.5">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(value);
              setEditing(false);
            }}
          >
            取消
          </Button>
        </div>
        {error && <div className="text-xs text-destructive mt-1">{error}</div>}
      </div>
    );
  }

  if (!value && canEdit) {
    return (
      <div>
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <button
          type="button"
          onClick={startEditing}
          className="w-full border-2 border-dashed border-border rounded-lg py-2 text-muted-foreground enabled:hover:text-primary enabled:hover:border-primary transition-colors text-lg font-bold leading-none"
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
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="flex items-center gap-1 shrink-0">{actions}
        {canEdit && (
          <button
            type="button"
            onClick={startEditing}
            className="text-muted-foreground enabled:hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
            title="编辑"
            aria-label="编辑"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        </div>
      </div>
      <div className={valueClassName ?? 'text-sm whitespace-pre-wrap break-words mt-0.5'}>
        {value ? <DocLinkText text={value} /> : <span className="text-muted-foreground">未填写</span>}
      </div>
    </div>
  );
}
