import type { BitableRecord, RatingFields, RosterItem } from "../types";
import { comparePeopleForRanking, finalGrade, personRankScore, type HistoryEntry } from "./gradeScore";

export interface RankedPerson {
  person: RosterItem;
  avatarUrl?: string;
  history: HistoryEntry[];
  score: number;
}

// Shared by AllRatings.tsx (the full table) and LoadingScreen.tsx (just the
// top 3, for the podium) — one ranking computation so the two can never
// disagree about who's in 1st/2nd/3rd.
export function rankPeople(
  roster: RosterItem[],
  byWeek: Map<string, Map<string, BitableRecord<RatingFields>>>,
  historyWeeks: string[]
): RankedPerson[] {
  return roster
    .filter((p) => p.module)
    .map((person) => {
      const history: HistoryEntry[] = historyWeeks.map((w) => {
        const f = byWeek.get(w)?.get(person.openId)?.fields;
        return { week: w, grade: finalGrade(f?.["周一评级"], f?.["周五评级"]) };
      });
      const score = personRankScore(history.map((h) => h.grade));
      return { person, avatarUrl: person.avatarUrl, history, score };
    })
    .sort(comparePeopleForRanking);
}
