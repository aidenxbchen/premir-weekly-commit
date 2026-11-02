import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { formatTime, HOUR_OPTIONS } from '@/utils/datetime';
import type { PromiseField } from '@/utils/criteria';
import { useSavable } from '@/hooks/useSavable';
import { RichTextEditor } from './RichTextEditor';
import { DocLinkText } from './DocLinkText';

// 字段形态统一由 utils/criteria 的 PromiseField 定义，这里只做别名，
// 避免两处各写一份结构。
export type DeliverableTextField = PromiseField;

function toDateAndTime(iso?: string): { date: Date | undefined; time: string } {
  if (!iso) return { date: undefined, time: '' };
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return { date: d, time: `${pad(d.getHours())}:00` };
}

function combine(date: Date | undefined, time: string): string | undefined {
  if (!date) return undefined;
  const [h, m] = (time || '00:00').split(':').map((s: string) => Number(s));
  const combined = new Date(date);
  combined.setHours(h || 0, m || 0, 0, 0);
  return combined.toISOString();
}

// 交付物卡片里所有归属主本人的可编辑字段（交付物/各档验收标准/依赖与风险/开始
// 截止时间）合并成一次编辑、一次保存——这些字段共用同一个"锁定/管理员一次性
// 解锁"机制，一次解锁只够消耗一次成功保存；拆成多个各自独立保存的输入框时，
// 保存了第一个字段就会把授权用掉，后面的字段再保存必定被服务端拒绝。合并成
// 一次编辑会话、一次 PATCH，让"一次授权"和"一次编辑动作"重新对齐，从设计上
// 避免这类 bug，而不是逐个输入框加特判。
export function DeliverableFieldsEditor({
  textFields,
  startIso,
  endIso,
  canEdit,
  onSave,
}: {
  textFields: DeliverableTextField[];
  startIso?: string;
  endIso?: string;
  canEdit: boolean;
  onSave: (patch: Record<string, unknown>) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [endTime, setEndTime] = useState('');
  const { saving, error, run } = useSavable();

  function startEditing(): void {
    const nextDrafts: Record<string, string> = {};
    textFields.forEach((f) => {
      nextDrafts[f.key] = f.value;
    });
    setDrafts(nextDrafts);
    const s = toDateAndTime(startIso);
    const e = toDateAndTime(endIso);
    setStartDate(s.date);
    setStartTime(s.time);
    setEndDate(e.date);
    setEndTime(e.time);
    setEditing(true);
  }

  async function save(): Promise<void> {
    const patch: Record<string, unknown> = {
      ...drafts,
      startTime: combine(startDate, startTime),
      endTime: combine(endDate, endTime),
    };
    const ok = await run(() => onSave(patch));
    if (ok) setEditing(false);
  }

  if (editing) {
    return (
      <div className="space-y-2.5">
        {textFields.map((f) => (
          <div key={f.key}>
            <div className="text-xs text-muted-foreground mb-1">{f.label}</div>
            <RichTextEditor aria-label={f.label} disabled={saving} value={drafts[f.key] ?? ''} onChange={(v) => setDrafts((prev) => ({ ...prev, [f.key]: v }))} rows={2} />
          </div>
        ))}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="text-xs text-muted-foreground mb-1">开始时间</div>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    {startDate ? startDate.toLocaleDateString() : '选日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={startDate} onSelect={setStartDate} />
                </PopoverContent>
              </Popover>
              <NativeSelect value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-24">
                <NativeSelectOption value="">选时间</NativeSelectOption>
                {HOUR_OPTIONS.map((h) => (
                  <NativeSelectOption key={h} value={h}>
                    {h}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">截止时间</div>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    {endDate ? endDate.toLocaleDateString() : '选日期'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} />
                </PopoverContent>
              </Popover>
              <NativeSelect value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-24">
                <NativeSelectOption value="">选时间</NativeSelectOption>
                {HOUR_OPTIONS.map((h) => (
                  <NativeSelectOption key={h} value={h}>
                    {h}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}>
            取消
          </Button>
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 group">
      {textFields.map((f, i) => (
        <div key={f.key}>
          <div className="flex items-start justify-between gap-2">
            <div className="text-xs text-muted-foreground">{f.label}</div>
            {canEdit && i === 0 && (
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
          <div className="text-sm whitespace-pre-wrap break-words mt-0.5">
            {f.value ? <DocLinkText text={f.value} /> : <span className="text-muted-foreground">未填写</span>}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="text-xs text-muted-foreground">开始时间</div>
          <div className="text-sm mt-0.5">{formatTime(startIso) || <span className="text-muted-foreground">未填写</span>}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">截止时间</div>
          <div className="text-sm mt-0.5">{formatTime(endIso) || <span className="text-muted-foreground">未填写</span>}</div>
        </div>
      </div>
    </div>
  );
}
