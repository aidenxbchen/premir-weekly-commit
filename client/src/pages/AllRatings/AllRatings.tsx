import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { usePersonInfo } from '@/hooks/usePersonInfo';
import { BigAvatar } from '@/components/BigAvatar';
import { RankCrown } from '@/components/RankCrown';
import { WeekMedal } from '@/components/WeekMedal';
import type { LayoutContext } from '@/components/Layout';
import { ratingsApi, rosterApi } from '@/api';
import { trailingConsecutiveC, type HistoryEntry } from '@/utils/grade-score';
import { rankPeople, type RankedPerson } from '@/utils/ranking';
import { weeksSinceStart } from '@/utils/week';
import { adminScope } from '@shared/permissions';
import type { RatingRecord, RosterMember } from '@shared/api.interface';

type RatingsByWeek = Map<string, Map<string, RatingRecord>>;

// 前三名的称号。作为标签安放在每一行最右侧——排行榜的主体是名次和历史徽章，
// 称号是锦上添花，不该抢走视觉重心。
const RANK_LABEL: Record<1 | 2 | 3, { gradient: string; title: string }> = {
  1: { gradient: 'bg-gradient-to-br from-[#ffd76a] to-[#c98600]', title: '金角大王' },
  2: { gradient: 'bg-gradient-to-br from-[#e8edf2] to-[#8a97a3]', title: '银角大王' },
  3: { gradient: 'bg-gradient-to-br from-[#e3a97a] to-[#8a4b1f]', title: '铜角大王' },
};

export default function AllRatings() {
  const { me } = useOutletContext<LayoutContext>();
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [byWeek, setByWeek] = useState<RatingsByWeek>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const historyWeeks: string[] = weeksSinceStart(me.week);

  async function load(): Promise<void> {
    setLoadError('');
    try { const [r, ...perWeek] = await Promise.all([rosterApi.listRoster(), ...historyWeeks.map((w: string) => ratingsApi.listRatings(w))]);
    const map: RatingsByWeek = new Map();
    historyWeeks.forEach((w: string, i: number) => {
      const byPerson = new Map<string, RatingRecord>();
      perWeek[i].items.forEach((rec: RatingRecord) => byPerson.set(rec.memberUserId, rec));
      map.set(w, byPerson);
    });
    // 和后端采用同一条规则：先按当前组织归属确定人员范围，再把这些人的完整历史
    // 评级带进排行榜。这样转岗保留成绩，也不会把管理半径外的人显示成空白行。
    const scope = adminScope(me);
    setRoster(scope === 'ALL' ? r.items : r.items.filter((person) => person.module && scope.includes(person.module)));
    setByWeek(map);
    } catch (e) { setLoadError(e instanceof Error ? e.message : '评级读取失败'); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.week]);

  if (loading) return <div className="text-muted-foreground text-sm">加载中…</div>;
  if (loadError) return <div className="text-sm text-destructive bg-red-50 border border-red-100 rounded-xl px-4 py-3">加载失败：{loadError} <button className="underline ml-2" onClick={() => { setLoading(true); load(); }}>重新加载</button></div>;

  const people: RankedPerson[] = rankPeople(roster, byWeek, historyWeeks);

  return (
    <div className="rating-board">
      {people.map((p: RankedPerson, i: number) => (
        <LeaderRow
          key={p.person.userId}
          person={p.person}
          history={p.history}
          place={i + 1}
          rank={i < 3 ? ((i + 1) as 1 | 2 | 3) : undefined}
        />
      ))}
    </div>
  );
}

function LeaderRow({
  person,
  history,
  place,
  rank,
}: {
  person: RosterMember;
  history: HistoryEntry[];
  place: number;
  rank?: 1 | 2 | 3;
}) {
  const { name, avatarUrl } = usePersonInfo(person.userId);
  // 历史徽章一字排开——最新的一周和更早的用同样尺寸，一行就能看出整条走势，
  // 不再把最近一周单独放大（那会打断"排开对比"的读法）。
  const graded = history.filter((h: HistoryEntry): h is HistoryEntry & { grade: string } => !!h.grade);
  const consecutiveC: number = trailingConsecutiveC(history.map((h: HistoryEntry) => h.grade));
  const displayName: string = person.name || name || person.userId.slice(-4);

  return (
    <div className={`leader-row ${rank ? `leader-row-top leader-row-${rank}` : ''}`}>
      {/* 名次。前三名的左上角挂一枚 45° 倾斜的金银铜皇冠。 */}
      <div className="leader-place">
        {rank && (
          <span className="leader-crown">
            <RankCrown rank={rank} size={44} />
          </span>
        )}
        <span className={`leader-place-no ${rank ? 'is-top' : ''}`}>{place}</span>
      </div>

      <div className="leader-avatar"><BigAvatar name={displayName} avatarUrl={avatarUrl} size={76} /></div>

      <div className="leader-who">
        <div className="leader-name" title={displayName}>{displayName}</div>
        <div className="leader-module">{person.module ?? '—'}</div>
      </div>

      <div className="leader-medals">
        {graded.length > 0 ? (
          graded.map((h: HistoryEntry & { grade: string }) => <WeekMedal key={h.week} week={h.week} grade={h.grade} size="xl" />)
        ) : (
          <span className="text-[11px] text-brand-label">暂无评级</span>
        )}
      </div>

      {consecutiveC >= 2 ? (
        <span className="leader-warn">🔥 连续 {consecutiveC} 周待突破</span>
      ) : (
        <span />
      )}

      <div className="leader-title">
        {rank && (
          <span className={`leader-title-badge ${RANK_LABEL[rank].gradient}`}>{RANK_LABEL[rank].title}</span>
        )}
      </div>
    </div>
  );
}
