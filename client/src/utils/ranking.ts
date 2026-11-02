import type { RatingRecord, RosterMember } from '@shared/api.interface';
import { comparePeopleForRanking, finalGrade, personRankScore, type HistoryEntry } from './grade-score';

export interface RankedPerson {
  person: RosterMember;
  history: HistoryEntry[];
  score: number;
}

export function rankPeople(
  roster: RosterMember[],
  byWeek: Map<string, Map<string, RatingRecord>>,
  historyWeeks: string[],
): RankedPerson[] {
  return roster
    .filter((p: RosterMember) => p.module)
    .map((person: RosterMember) => {
      const history: HistoryEntry[] = historyWeeks.map((w: string) => {
        const record: RatingRecord | undefined = byWeek.get(w)?.get(person.userId);
        return { week: w, grade: finalGrade(record?.mondayGrade, record?.weekendGrade) };
      });
      const score: number = personRankScore(history.map((h: HistoryEntry) => h.grade));
      return { person, history, score };
    })
    .sort(comparePeopleForRanking);
}
