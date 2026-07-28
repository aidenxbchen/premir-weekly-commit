// A = +3, B+ = +1, B = 0 (steady, no bonus/penalty), C = -1. The one scoring
// formula for a person's grade history — used both to rank people (全员
//评级表) and, since a module's displayed score is really just its lead's
// score, to rank modules (各模块周里程碑) too. These used to be two
// different weightings (module scoring double-counted B+/C at ±2), which
// meant the same person's same grade history scored differently depending
// on which page you looked at it from — unified to this single formula.
const PERSON_SCORE: Record<string, number> = { A: 3, "B+": 1, B: 0, C: -1 };

export function personRankScore(grades: Array<string | undefined>): number {
  return grades.reduce((sum: number, g) => sum + (g ? (PERSON_SCORE[g] ?? 0) : 0), 0);
}

// A week's "final" grade is its Monday grade, falling back to the Friday
// (weekend) grade when there's no Monday update yet.
export function finalGrade(monday?: string, weekend?: string): string | undefined {
  return monday ?? weekend;
}

// Counts consecutive "C" at the end of a chronologically-ordered
// (oldest -> newest) grade history.
export function trailingConsecutiveC(grades: Array<string | undefined>): number {
  let count = 0;
  for (let i = grades.length - 1; i >= 0; i--) {
    if (grades[i] === "C") count++;
    else break;
  }
  return count;
}

export interface HistoryEntry {
  week: string;
  grade?: string;
}

// Drops leading empty weeks so a medal row doesn't pad out with blank
// dots just because the team's history doesn't go back that far yet.
// Keeps at least one slot (the current week) even if everything is empty.
export function trimLeadingEmptyHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const idx = entries.findIndex((e) => e.grade !== undefined);
  return idx === -1 ? entries.slice(-1) : entries.slice(idx);
}

// 全员评级表 ranking, in order: (1) total score, (2) this week's grade —
// note this is the literal current week slot, which may still be blank if
// nobody's graded it yet, and blank ranks below even a C, (3) how many
// weeks they've actually been graded on — more graded weeks ranks higher,
// (4) anything still tied is left in whatever order it was already in
// (Array.sort is stable, so this is a no-op "don't care" tier, not a bug).
const GRADE_RANK: Record<string, number> = { A: 4, "B+": 3, B: 2, C: 1 };

export function comparePeopleForRanking(
  a: { score: number; history: HistoryEntry[] },
  b: { score: number; history: HistoryEntry[] }
): number {
  if (a.score !== b.score) return b.score - a.score;

  const aLast = GRADE_RANK[a.history[a.history.length - 1]?.grade ?? ""] ?? 0;
  const bLast = GRADE_RANK[b.history[b.history.length - 1]?.grade ?? ""] ?? 0;
  if (aLast !== bLast) return bLast - aLast;

  const aCount = a.history.filter((h) => h.grade).length;
  const bCount = b.history.filter((h) => h.grade).length;
  return bCount - aCount;
}
