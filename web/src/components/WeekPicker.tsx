import { weekOptions } from "../lib/week";

export function WeekPicker({
  value,
  currentWeek,
  onChange,
}: {
  value: string;
  currentWeek: string;
  onChange: (week: string) => void;
}) {
  const options = weekOptions(currentWeek);
  if (!options.includes(value)) options.push(value);
  options.sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-brand-border rounded-lg px-3 py-1.5 text-sm font-medium text-brand-text bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
    >
      {options.map((w) => (
        <option key={w} value={w}>
          {w}
          {w === currentWeek ? "（本周）" : ""}
        </option>
      ))}
    </select>
  );
}
