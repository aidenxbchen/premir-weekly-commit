import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Card } from '@/components/ui/card';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { commitmentsApi } from '@/api';
import { HOUR_OPTIONS } from '@/utils/datetime';
import { errorMessage } from '@/utils/error';
import type { CommitmentRecord } from '@shared/api.interface';
import { RichTextEditor } from './RichTextEditor';

function combine(date: Date | undefined, time: string): string | undefined {
  if (!date) return undefined;
  const [h, m] = (time || '00:00').split(':').map((s: string) => Number(s));
  const combined = new Date(date);
  combined.setHours(h || 0, m || 0, 0, 0);
  return combined.toISOString();
}

function DateTimePicker({ label, date, time, onDate, onTime }: {
  label: string;
  date: Date | undefined;
  time: string;
  onDate: (d: Date | undefined) => void;
  onTime: (t: string) => void;
}) {
  return (
    <div className="block">
      <div className="text-sm font-medium">{label}</div>
      <div className="flex gap-2 mt-1">
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm">
              {date ? date.toLocaleDateString() : '选日期'}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0">
            <Calendar mode="single" selected={date} onSelect={onDate} />
          </PopoverContent>
        </Popover>
        <NativeSelect value={time} onChange={(e) => onTime(e.target.value)} className="w-24">
          <NativeSelectOption value="">选时间</NativeSelectOption>
          {HOUR_OPTIONS.map((h) => (
            <NativeSelectOption key={h} value={h}>
              {h}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

// 所有小组共用同一份录入表单：交付物 / 验收标准 / 起止时间 / 依赖与风险。
// 不随组别变化——嵌入式组（软件组/MCU/Linux）和硬件模块走同一张表、同一套字段。
// B+验收标准不在这里：它是"每人每周一份"的独立判断，由个人中心页面级的复选框录入。
export function CommitmentForm({
  week,
  onSaved,
  onCancel,
}: {
  week: string;
  onSaved: (created: CommitmentRecord) => void;
  onCancel: () => void;
}) {
  const [deliverable, setDeliverable] = useState('');
  const [criteria, setCriteria] = useState('');
  const [risk, setRisk] = useState('');
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [endTime, setEndTime] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function save(): Promise<void> {
    if (!deliverable.trim() || !criteria.trim()) {
      setErr('交付物和验收标准不能为空');
      return;
    }
    setSaving(true);
    setErr('');
    try {
      const { record: created } = await commitmentsApi.createCommitment({
        week,
        deliverable,
        criteria,
        risk,
        startTime: combine(startDate, startTime),
        endTime: combine(endDate, endTime),
      });
      onSaved(created);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 space-y-2">
      <div className="block">
        <div className="text-sm font-medium">交付物</div>
        <div className="text-xs text-muted-foreground mb-1">周五能放在桌上给人看的东西</div>
        <RichTextEditor aria-label="交付物" value={deliverable} onChange={setDeliverable} rows={2} />
      </div>
      <div className="block">
        <div className="text-sm font-medium">验收标准</div>
        <div className="text-xs text-muted-foreground mb-1">一个不了解细节的人能否对照判断完没完成？</div>
        <RichTextEditor aria-label="验收标准" value={criteria} onChange={setCriteria} rows={2} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <DateTimePicker label="开始时间（选填）" date={startDate} time={startTime} onDate={setStartDate} onTime={setStartTime} />
        <DateTimePicker label="截止时间（选填）" date={endDate} time={endTime} onDate={setEndDate} onTime={setEndTime} />
      </div>
      <div className="block">
        <div className="text-sm font-medium">依赖与风险（选填）</div>
        <RichTextEditor aria-label="依赖与风险" value={risk} onChange={setRisk} rows={2} />
      </div>
      {err && <div className="text-xs text-destructive">{err}</div>}
      <div className="flex gap-2 pt-1">
        <Button onClick={save} disabled={saving}>
          {saving ? '保存中…' : '保存'}
        </Button>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
      </div>
    </Card>
  );
}
