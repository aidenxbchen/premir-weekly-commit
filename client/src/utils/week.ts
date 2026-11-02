// 团队从 W28 开始跑这套流程，周次选择器不该往更早的周次里选。
const DATA_START_WEEK = 28;

export function weeksUpTo(week: string, count: number): string[] {
  const n: number = Number(week.slice(1));
  const weeks: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const wn: number = n - i;
    if (wn >= 1) weeks.push(`W${wn}`);
  }
  return weeks;
}

export function weekOptions(currentWeek: string): string[] {
  const current: number = Number(currentWeek.slice(1));
  const opts: string[] = [];
  for (let n = DATA_START_WEEK; n <= current; n += 1) opts.push(`W${n}`);
  return opts;
}

export function weeksSinceStart(endWeek: string): string[] {
  const end: number = Number(endWeek.slice(1));
  const opts: string[] = [];
  for (let n = DATA_START_WEEK; n <= end; n += 1) opts.push(`W${n}`);
  return opts;
}
