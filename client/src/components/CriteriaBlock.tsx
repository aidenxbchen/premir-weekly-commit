import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSavable } from '@/hooks/useSavable';
import { errorMessage } from '@/utils/error';
import {
  encodeChecklist,
  encodeCriteria,
  parseChecklist,
  setChecklistAt,
  splitCriteria,
  stripNumberPrefix,
  hasStructuredCriteria,
} from '@/utils/criteria';
import type { CheckMark } from '@shared/api.interface';
import { CheckSelect } from './CheckSelect';
import { ConfirmDialog } from './ConfirmDialog';
import { RichTextEditor } from './RichTextEditor';
import { DocLinkText } from './DocLinkText';

function ItemEditor({
  draft,
  setDraft,
  saving,
  error,
  onSave,
  onCancel,
  onDelete,
}: {
  draft: string;
  setDraft: (v: string) => void;
  saving: boolean;
  error: string;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="border border-border rounded-lg p-2">
      <RichTextEditor value={draft} onChange={setDraft} rows={2} autoFocus aria-label="验收标准内容" disabled={saving} />
      <div className="flex gap-2 mt-1.5">
        <Button size="sm" onClick={onSave} disabled={saving || !draft.trim()}>
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={saving}>
          取消
        </Button>
        {onDelete && (
          <Button size="sm" variant="destructive" onClick={onDelete} disabled={saving} className="ml-auto">
            删除
          </Button>
        )}
      </div>
      {error && <div className="text-xs text-destructive mt-1">{error}</div>}
    </div>
  );
}

export function CriteriaBlock({
  label,
  text,
  checklistRaw,
  canEditText,
  canCheck,
  actions,
  onSaveText,
  onSaveChecklist,
}: {
  label: string;
  text: string;
  checklistRaw?: string;
  canEditText: boolean;
  canCheck: boolean;
  // 标签行右侧的额外操作（目前是评论入口）
  actions?: React.ReactNode;
  onSaveText: (next: string) => Promise<void>;
  onSaveChecklist: (next: string) => Promise<void>;
}) {
  const [editingKey, setEditingKey] = useState<number | 'new' | null>(null);
  const [draft, setDraft] = useState('');
  const { saving, error, setError, run } = useSavable();
  const [toggleError, setToggleError] = useState('');
  const [confirmingAdd, setConfirmingAdd] = useState(false);
  const [confirmingDeleteIndex, setConfirmingDeleteIndex] = useState<number | null>(null);

  const items: string[] = splitCriteria(text);
  const cleanItem = (item: string): string => hasStructuredCriteria(text) ? item : stripNumberPrefix(item);
  const checks: Array<CheckMark | undefined> = parseChecklist(checklistRaw, items.length);

  function startEditItem(index: number): void {
    setDraft(cleanItem(items[index]));
    setError('');
    setEditingKey(index);
  }

  function startAddItem(): void {
    setDraft('');
    setError('');
    setEditingKey('new');
  }

  function cancelEdit(): void {
    setEditingKey(null);
    setDraft('');
    setError('');
  }

  async function saveItem(): Promise<void> {
    // 项内保留完整 Markdown；独立的边界标记确保内部列表不改变验收项数量。
    const value: string = draft.trim();
    if (!value) return;
    const ok = await run(async () => {
      const clean: string[] = items.map(cleanItem);
      const nextItems: string[] = editingKey === 'new' ? [...clean, value] : clean.map((it: string, i: number) => (i === editingKey ? value : it));
      await onSaveText(encodeCriteria(nextItems));
    });
    if (ok) {
      setEditingKey(null);
      setDraft('');
    }
  }

  function handleSaveClick(): void {
    if (editingKey === 'new') {
      setConfirmingAdd(true);
    } else {
      saveItem();
    }
  }

  async function confirmAdd(): Promise<void> {
    await saveItem();
    setConfirmingAdd(false);
  }

  async function confirmDelete(): Promise<void> {
    if (confirmingDeleteIndex === null) return;
    await removeItem(confirmingDeleteIndex);
    setConfirmingDeleteIndex(null);
  }

  async function removeItem(index: number): Promise<void> {
    const ok = await run(async () => {
      const nextItems: string[] = items.filter((_unused: string, i: number) => i !== index).map(cleanItem);
      const nextChecks: Array<CheckMark | undefined> = checks.filter((_unused, i: number) => i !== index);
      await onSaveText(encodeCriteria(nextItems));
      await onSaveChecklist(encodeChecklist(nextChecks));
    });
    if (ok) setEditingKey(null);
  }

  async function toggle(index: number, value: CheckMark): Promise<void> {
    setToggleError('');
    try {
      await onSaveChecklist(setChecklistAt(checks, index, value));
    } catch (e) {
      setToggleError(errorMessage(e));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        {actions}
      </div>

      {items.length === 0 && editingKey !== 'new' ? (
        canEditText ? (
          <button
            type="button"
            onClick={startAddItem}
            className="w-full border-2 border-dashed border-border rounded-lg py-2 text-muted-foreground enabled:hover:text-primary enabled:hover:border-primary transition-colors text-lg font-bold leading-none"
            title={`填写${label}`}
          >
            +
          </button>
        ) : (
          <div className="text-sm text-muted-foreground">未填写</div>
        )
      ) : (
        <div className="space-y-1.5">
          {items.map((item: string, i: number) =>
            editingKey === i ? (
              <ItemEditor
                key={i}
                draft={draft}
                setDraft={setDraft}
                saving={saving}
                error={error}
                onSave={handleSaveClick}
                onCancel={cancelEdit}
                onDelete={() => setConfirmingDeleteIndex(i)}
              />
            ) : (
              <div key={i} className="group flex items-start gap-1">
                <CheckSelect value={checks[i]} canEdit={canCheck} onChange={(v: CheckMark) => toggle(i, v)} />
                <div className="text-sm flex-1 min-w-0 pt-0.5"><DocLinkText text={cleanItem(item)} /></div>
                {canEditText && (
                  <button
                    type="button"
                    onClick={() => startEditItem(i)}
                    className="text-muted-foreground enabled:hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity shrink-0 pt-0.5"
                    title="编辑这一条"
                    aria-label="编辑这一条"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                )}
              </div>
            ),
          )}

          {canEditText &&
            (editingKey === 'new' ? (
              <ItemEditor draft={draft} setDraft={setDraft} saving={saving} error={error} onSave={handleSaveClick} onCancel={cancelEdit} />
            ) : (
              <button
                type="button"
                onClick={startAddItem}
                className="w-full border-2 border-dashed border-border rounded-lg py-1.5 text-muted-foreground enabled:hover:text-primary enabled:hover:border-primary transition-colors text-xs"
              >
                + 添加一条验收标准
              </button>
            ))}

          {toggleError && <div className="text-xs text-destructive">{toggleError}</div>}
        </div>
      )}

      <ConfirmDialog
        open={confirmingAdd}
        title="确认添加这条验收标准？"
        message={`将新增一条${label}：\n${draft.trim()}`}
        confirmLabel="确认添加"
        busy={saving}
        onConfirm={confirmAdd}
        onCancel={() => setConfirmingAdd(false)}
      />
      <ConfirmDialog
        open={confirmingDeleteIndex !== null}
        title="删除这条验收标准？"
        message={`将删除${label}第 ${confirmingDeleteIndex !== null ? confirmingDeleteIndex + 1 : ''} 条，且不可撤销。`}
        confirmLabel="确认删除"
        busy={saving}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmingDeleteIndex(null)}
      />
    </div>
  );
}
