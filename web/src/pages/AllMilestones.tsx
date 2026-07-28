import { useEffect, useState } from "react";
import { api } from "../api";
import { MilestoneCard } from "../components/MilestoneCard";
import { finalGrade, personRankScore, trimLeadingEmptyHistory, type HistoryEntry } from "../lib/gradeScore";
import { weeksUpTo } from "../lib/week";
import type { BitableRecord, CommitmentFields, Me, MilestoneFields, RatingFields, RosterItem } from "../types";

const SUPPORTED_MODULES = ["洗净模块", "烘干模块", "熨烫模块", "净水模块"];
const HISTORY_WEEKS = 8;

export default function AllMilestones({
  me,
  week,
  onWeekChange,
}: {
  me: Me;
  week: string;
  onWeekChange: (week: string) => void;
}) {
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [items, setItems] = useState<BitableRecord<MilestoneFields>[]>([]);
  const [commitmentsByModule, setCommitmentsByModule] = useState<Map<string, BitableRecord<CommitmentFields>[]>>(
    new Map()
  );
  const [ratingsByWeek, setRatingsByWeek] = useState<Map<string, Map<string, BitableRecord<RatingFields>>>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  // Fixed to the true current week, NOT the week being viewed — the medal
  // row always shows the same full range; navigating just changes which
  // entry in it is highlighted.
  const historyWeeks = weeksUpTo(me.week, HISTORY_WEEKS);

  // `loading` only ever starts true (for the very first paint); every later
  // call (week change, or onSaved after an edit) swaps the data in
  // silently instead of blanking the page back to "加载中…" — see
  // ModuleCommitments.tsx for the same fix and the full reasoning.
  async function loadMilestones() {
    const [rosterRes, milestonesRes, ...commitmentsRes] = await Promise.all([
      api.get<{ items: RosterItem[] }>("/roster"),
      api.get<{ items: BitableRecord<MilestoneFields>[] }>(`/milestones?week=${week}`),
      ...SUPPORTED_MODULES.map((mod) =>
        api.get<{ items: BitableRecord<CommitmentFields>[] }>(
          `/commitments?module=${encodeURIComponent(mod)}&week=${week}`
        )
      ),
    ]);
    setRoster(rosterRes.items);
    setItems(milestonesRes.items);
    const cMap = new Map<string, BitableRecord<CommitmentFields>[]>();
    SUPPORTED_MODULES.forEach((mod, i) => cMap.set(mod, commitmentsRes[i].items));
    setCommitmentsByModule(cMap);
    setLoading(false);
  }

  async function loadHistory() {
    const ratingsRes = await Promise.all(
      historyWeeks.map((w) => api.get<{ items: BitableRecord<RatingFields>[] }>(`/ratings?week=${w}`))
    );
    const rMap = new Map<string, Map<string, BitableRecord<RatingFields>>>();
    historyWeeks.forEach((w, i) => {
      const byPerson = new Map<string, BitableRecord<RatingFields>>();
      ratingsRes[i].items.forEach((rec) => {
        const id = rec.fields["成员姓名"]?.[0]?.id;
        if (id) byPerson.set(id, rec);
      });
      rMap.set(w, byPerson);
    });
    setRatingsByWeek(rMap);
    setHistoryLoaded(true);
  }

  useEffect(() => {
    loadMilestones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.week]);

  if (loading || !historyLoaded) return <div className="text-brand-muted text-sm">加载中…</div>;

  const sections = SUPPORTED_MODULES.map((mod) => {
    const lead = roster.find((r) => r.module === mod && r.role === "lead");
    const rawHistory: HistoryEntry[] = historyWeeks.map((w) => {
      const f = lead ? ratingsByWeek.get(w)?.get(lead.openId)?.fields : undefined;
      return { week: w, grade: finalGrade(f?.["周一评级"], f?.["周五评级"]) };
    });
    const history = lead ? trimLeadingEmptyHistory(rawHistory) : [];
    const score = personRankScore(rawHistory.map((h) => h.grade));
    const record = items.find((i) => i.fields["模块"] === mod);
    const moduleCommitments = commitmentsByModule.get(mod) ?? [];
    const commitmentsReady =
      moduleCommitments.length > 0 &&
      moduleCommitments.every((c) => c.fields["达标"] === "✅" || c.fields["达标"] === "❌");

    return { module: mod, lead, history, score, record, commitmentsReady, leadAvatarUrl: lead?.avatarUrl };
  }).sort((a, b) => b.score - a.score);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {sections.map((s, rank) => (
        <MilestoneCard
          key={s.module}
          me={me}
          week={week}
          rank={rank}
          module={s.module}
          lead={s.lead}
          leadAvatarUrl={s.leadAvatarUrl}
          history={s.history}
          score={s.score}
          record={s.record}
          commitmentsReady={s.commitmentsReady}
          onSaved={loadMilestones}
          onWeekChange={onWeekChange}
        />
      ))}
    </div>
  );
}
