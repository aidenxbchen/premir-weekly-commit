import { getAppState, setAppState } from "./store.js";

// The team's own "周次" numbering used to just track the real ISO calendar
// week (minus one, confirmed against 2026-07-27 = team W30 = ISO week 31).
// It no longer does: the current week is now durable state, advanced only
// by an explicit admin action (POST /api/week/advance), so a holiday or
// break never creates numbered-but-empty weeks — nobody presses the button,
// so no new week ever gets created. This calendar math now only supplies
// the one-time bootstrap value the very first time the app ever runs.
const TEAM_WEEK_OFFSET = -1;

function isoWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function bootstrapWeekLabel(date = new Date()): string {
  return `W${isoWeekNumber(date) + TEAM_WEEK_OFFSET}`;
}

const CURRENT_WEEK_KEY = "current_week";

export function currentWeekLabel(): string {
  const stored = getAppState(CURRENT_WEEK_KEY);
  if (stored) return stored;
  const bootstrapped = bootstrapWeekLabel();
  setAppState(CURRENT_WEEK_KEY, bootstrapped);
  return bootstrapped;
}

// Opens the next week — W30 -> W31, etc. Confirmation ("are you sure")
// lives entirely in the frontend UI, on every press; there's no
// once-per-week special-casing here, since a single uniform confirm
// dialog already covers both "don't fat-finger this" and "deliberately
// skip ahead after a long break" without needing two different rules.
export function advanceWeek(): string {
  const current = currentWeekLabel();
  const next = `W${Number(current.slice(1)) + 1}`;
  setAppState(CURRENT_WEEK_KEY, next);
  return next;
}
