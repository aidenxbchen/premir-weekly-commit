// A = +3, B+ = +1, B = 0, C = -1 —— 排行和积分统一用这一套公式。
const PERSON_SCORE: Record<string, number> = { A: 3, 'B+': 1, B: 0, C: -1 };

export function personRankScore(grades: Array<string | undefined>): number {
  return grades.reduce((sum: number, g: string | undefined) => sum + (g ? (PERSON_SCORE[g] ?? 0) : 0), 0);
}

export function finalGrade(monday?: string, weekend?: string): string | undefined {
  return monday ?? weekend;
}

export function trailingConsecutiveC(grades: Array<string | undefined>): number {
  let count = 0;
  for (let i = grades.length - 1; i >= 0; i -= 1) {
    if (grades[i] === 'C') count += 1;
    else break;
  }
  return count;
}

export interface HistoryEntry {
  week: string;
  grade?: string;
}

export function trimLeadingEmptyHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const idx: number = entries.findIndex((e: HistoryEntry) => e.grade !== undefined);
  return idx === -1 ? entries.slice(-1) : entries.slice(idx);
}

const GRADE_RANK: Record<string, number> = { A: 4, 'B+': 3, B: 2, C: 1 };

export function comparePeopleForRanking(
  a: { score: number; history: HistoryEntry[] },
  b: { score: number; history: HistoryEntry[] },
): number {
  if (a.score !== b.score) return b.score - a.score;

  const aLast: number = GRADE_RANK[a.history[a.history.length - 1]?.grade ?? ''] ?? 0;
  const bLast: number = GRADE_RANK[b.history[b.history.length - 1]?.grade ?? ''] ?? 0;
  if (aLast !== bLast) return bLast - aLast;

  const aCount: number = a.history.filter((h: HistoryEntry) => h.grade).length;
  const bCount: number = b.history.filter((h: HistoryEntry) => h.grade).length;
  return bCount - aCount;
}
