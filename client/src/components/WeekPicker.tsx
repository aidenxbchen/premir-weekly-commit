import { useState } from 'react';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function WeekPicker({
  value,
  currentWeek,
  activeWeeks,
  onChange,
}: {
  value: string;
  currentWeek: string;
  activeWeeks: string[];
  onChange: (week: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const currentNumber = Number(currentWeek.slice(1));
  // 数据修复或测试可能留下“未来周”记录；在管理员真正推进到那一周前不应提前露出。
  const options: string[] = [...new Set([
    ...activeWeeks.filter((week) => Number(week.slice(1)) <= currentNumber),
    currentWeek,
  ])];
  if (!options.includes(value)) options.push(value);
  options.sort((a: string, b: string) => Number(b.slice(1)) - Number(a.slice(1)));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="week-picker-trigger" type="button" aria-label={`切换周次，当前 ${value}`}>
          <span className="week-picker-icon"><CalendarDays aria-hidden="true" /></span>
          <span className="week-picker-copy">
            <small>{value === currentWeek ? '当前周次' : '历史回看'}</small>
            <strong>{value}</strong>
          </span>
          {value === currentWeek && <span className="week-picker-current">本周</span>}
          <ChevronDown className={`week-picker-chevron ${open ? 'is-open' : ''}`} aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} className="week-picker-popover">
        <div className="week-picker-head">
          <div><small>WEEK ARCHIVE</small><strong>选择查看周次</strong></div>
          <span>{options.length} 周</span>
        </div>
        <div className="week-picker-grid" role="listbox" aria-label="周次">
          {options.map((w: string) => {
            const selected = w === value;
            return (
              <button
                key={w}
                type="button"
                role="option"
                aria-selected={selected}
                className="week-picker-option"
                onClick={() => {
                  onChange(w);
                  setOpen(false);
                }}
              >
                <span>{w}</span>
                {w === currentWeek && <small>本周</small>}
                {selected && <Check aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
