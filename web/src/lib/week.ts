// The team started running this process at W28 — nothing before that has
// data, so week pickers shouldn't offer it.
const DATA_START_WEEK = 28;

// Returns `count` week labels ending at (and including) `week`, oldest first.
export function weeksUpTo(week: string, count: number): string[] {
  const n = Number(week.slice(1));
  const weeks: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const wn = n - i;
    if (wn >= 1) weeks.push(`W${wn}`);
  }
  return weeks;
}

// Week numbers are no longer calendar-derived — the "current" week is
// durable server state, only ever advanced by an explicit admin action
// (see the +NEW button / POST /api/week/advance), so this needs the
// caller's authoritative current week rather than computing one itself.
export function weekOptions(currentWeek: string): string[] {
  const current = Number(currentWeek.slice(1));
  const opts: string[] = [];
  for (let n = DATA_START_WEEK; n <= current; n++) opts.push(`W${n}`);
  return opts;
}

// Every week from the data start through `endWeek`, inclusive — for history
// rows that should never show pre-data blank slots. Unlike weeksUpTo, this
// isn't a fixed lookback count: since every person's data starts at the same
// week, every card ends up with the same (unpadded) number of slots anyway.
export function weeksSinceStart(endWeek: string): string[] {
  const end = Number(endWeek.slice(1));
  const opts: string[] = [];
  for (let n = DATA_START_WEEK; n <= end; n++) opts.push(`W${n}`);
  return opts;
}
