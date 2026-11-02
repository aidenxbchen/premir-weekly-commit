import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Check, Circle, Minus, X } from 'lucide-react';
import type { CheckMark } from '@shared/api.interface';

const OPTIONS: CheckMark[] = ['✅', '❌', '⏹️'];
const STATUS = {
  '✅': { label: '已完成', icon: Check, tone: 'check-status-done' },
  '❌': { label: '未完成', icon: X, tone: 'check-status-missed' },
  '⏹️': { label: '受阻', icon: Minus, tone: 'check-status-blocked' },
} as const;

export function CheckSelect({
  value,
  canEdit,
  onChange,
}: {
  value?: CheckMark;
  canEdit: boolean;
  onChange: (next: CheckMark) => void;
}) {
  const [open, setOpen] = useState(false);

  const current = value ? STATUS[value] : undefined;
  const CurrentIcon = current?.icon ?? Circle;
  if (!canEdit) return <span className={`check-status ${current?.tone ?? 'check-status-empty'}`} title={current?.label ?? '待判断'}><CurrentIcon /><span>{current?.label ?? '待判断'}</span></span>;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={current?.label ?? '判断完成状态'}
          className={`check-status check-status-button ${current?.tone ?? 'check-status-empty'}`}
        >
          <CurrentIcon /><span>{current?.label ?? '待判断'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-36 p-1.5 grid gap-1">
        {OPTIONS.map((opt: CheckMark) => {
          const option = STATUS[opt]; const Icon = option.icon;
          return (
          <button
            key={opt}
            type="button"
            onClick={() => {
              onChange(opt);
              setOpen(false);
            }}
            className={`check-option ${option.tone}`}
          >
            <Icon /><span>{option.label}</span>
          </button>
        )})}
      </PopoverContent>
    </Popover>
  );
}
