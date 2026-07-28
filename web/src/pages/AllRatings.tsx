import { useEffect, useState } from "react";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { Card } from "../components/Card";
import { RankCrown } from "../components/RankCrown";
import { WeekMedal } from "../components/WeekMedal";
import { trailingConsecutiveC, type HistoryEntry } from "../lib/gradeScore";
import { rankPeople } from "../lib/ranking";
import { weeksSinceStart } from "../lib/week";
import type { BitableRecord, Me, RatingFields, RosterItem } from "../types";

type RatingsByWeek = Map<string, Map<string, BitableRecord<RatingFields>>>;

// Pure presentation — no editing, and no week picker: every card always
// shows the person's full history (data start through today), so there's
// no "week" to navigate on this page itself.
export default function AllRatings({ me }: { me: Me }) {
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [byWeek, setByWeek] = useState<RatingsByWeek>(new Map());
  const [loading, setLoading] = useState(true);

  // Fixed to the true current week, NOT the week being viewed — every card
  // shows the same set of week slots (data start through now) so cards come
  // out the same size regardless of which week is being navigated to.
  const historyWeeks = weeksSinceStart(me.week);

  // `loading` only ever starts true (for the very first paint); a later
  // week change swaps the data in silently instead of blanking the page —
  // see ModuleCommitments.tsx for the same fix and the full reasoning.
  async function load() {
    const [r, ...perWeek] = await Promise.all([
      api.get<{ items: RosterItem[] }>("/roster"),
      ...historyWeeks.map((w) => api.get<{ items: BitableRecord<RatingFields>[] }>(`/ratings?week=${w}`)),
    ]);
    const map: RatingsByWeek = new Map();
    historyWeeks.forEach((w, i) => {
      const byPerson = new Map<string, BitableRecord<RatingFields>>();
      perWeek[i].items.forEach((rec) => {
        const id = rec.fields["成员姓名"]?.[0]?.id;
        if (id) byPerson.set(id, rec);
      });
      map.set(w, byPerson);
    });
    setRoster(r.items);
    setByWeek(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.week]);

  if (loading) return <div className="text-brand-muted text-sm">加载中…</div>;

  const people = rankPeople(roster, byWeek, historyWeeks);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {people.map((p, i) => (
        <RatingCard
          key={p.person.openId}
          person={p.person}
          avatarUrl={p.avatarUrl}
          history={p.history}
          rank={i < 3 ? ((i + 1) as 1 | 2 | 3) : undefined}
        />
      ))}
    </div>
  );
}

// Full-replacement border classes (width + color) for the top-3 cards — kept
// as literal strings so Tailwind's static scanner picks them up; the hex
// values mirror RankCrown's RANK_METAL border colors.
const RANK_CARD_BORDER: Record<1 | 2 | 3, string> = {
  1: "border-2 border-[#a97400]",
  2: "border-2 border-[#7c8894]",
  3: "border-2 border-[#5e3512]",
};

// Gradient + nickname for the top-3 label badge — gold/silver/bronze,
// mirroring RANK_CARD_BORDER's palette.
const RANK_LABEL: Record<1 | 2 | 3, { gradient: string; title: string }> = {
  1: { gradient: "bg-gradient-to-br from-[#ffd76a] to-[#c98600]", title: "金角大王" },
  2: { gradient: "bg-gradient-to-br from-[#e8edf2] to-[#8a97a3]", title: "银角大王" },
  3: { gradient: "bg-gradient-to-br from-[#e3a97a] to-[#8a4b1f]", title: "铜角大王" },
};

function RatingCard({
  person,
  avatarUrl,
  history,
  rank,
}: {
  person: RosterItem;
  avatarUrl?: string;
  history: HistoryEntry[];
  rank?: 1 | 2 | 3;
}) {
  // Weeks with no grade yet just aren't shown at all — no dashed
  // placeholder reserving a spot for them. The last (most recent) graded
  // week doubles as "latest grade," shown larger, instead of repeating it
  // a second time in a separate section below.
  const graded = history.filter((h): h is HistoryEntry & { grade: string } => !!h.grade);
  const consecutiveC = trailingConsecutiveC(history.map((h) => h.grade));

  return (
    <Card className="flex flex-col" border={rank ? RANK_CARD_BORDER[rank] : undefined}>
      {/* top: avatar + name */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <Avatar name={person.name} avatarUrl={avatarUrl} size={44} />
            {rank && (
              <span className="absolute -top-2 -left-2">
                <RankCrown rank={rank} />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{person.name}</div>
            <div className="eyebrow mt-0.5">{person.module}</div>
          </div>
        </div>
        {rank && (
          <div
            className={`shrink-0 rounded-lg px-2.5 py-1.5 text-center leading-tight shadow-sm ${RANK_LABEL[rank].gradient}`}
          >
            <div className="text-white font-bold text-[11px] whitespace-nowrap">算你厉害</div>
            <div className="text-white text-[10px] whitespace-nowrap mt-0.5">{RANK_LABEL[rank].title}</div>
          </div>
        )}
      </div>

      {/* history + latest, merged into one row — earlier weeks small and
          left-aligned, the most recent graded week enlarged and pinned to
          the right, so it doubles as the hero "latest grade" display
          without repeating it in a separate section. `items-stretch` on the
          row plus `justify-between` on the left column makes the "历史评级"
          label top-align with the big badge's top, and the small-badge row
          bottom-align with the big badge's bottom, with no extra height
          needed for either. */}
      <div className="mt-3 pt-3 border-t border-brand-borderLight flex-1">
        {graded.length > 0 ? (
          <div className="flex items-stretch justify-between gap-2">
            <div className="flex flex-col justify-between">
              <div className="text-[10px] text-brand-label">历史评级</div>
              <div className="flex items-end gap-1.5 flex-wrap">
                {graded.slice(0, -1).map((h) => (
                  <WeekMedal key={h.week} week={h.week} grade={h.grade} size="sm" />
                ))}
              </div>
            </div>
            <WeekMedal
              key={graded[graded.length - 1].week}
              week={graded[graded.length - 1].week}
              grade={graded[graded.length - 1].grade}
              size="lg"
            />
          </div>
        ) : (
          <>
            <div className="text-[10px] text-brand-label mb-1.5">历史评级</div>
            <div className="text-xs text-brand-label">暂无评级</div>
          </>
        )}
      </div>

      {consecutiveC >= 2 && (
        <div className="mt-2 flex items-start gap-1.5 bg-[#fff4e5] border border-[#f5d9a8] text-[#8a5a12] text-xs px-2.5 py-1.5 rounded-lg">
          <span>🔥</span>
          <span>连续 {consecutiveC} 周待突破 · 一起想办法翻盘</span>
        </div>
      )}
    </Card>
  );
}
