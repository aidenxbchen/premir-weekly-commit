import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { commitmentsApi, milestonesApi, ratingsApi, rosterApi } from '@/api';
import { API_CACHE_TTL_MS, invalidateApiCache, mutateApiCache, useApiCache } from '@/utils/api-cache';
import { commentsApi } from '@/api';
import { MilestoneCard } from '@/components/MilestoneCard';
import type { LayoutContext } from '@/components/Layout';
import { useDepartments } from '@/hooks/useDepartments';
import { finalGrade, personRankScore, trimLeadingEmptyHistory, type HistoryEntry } from '@/utils/grade-score';
import { applySavedSignal, type SavedSignal } from '@/utils/saved-signal';
import { weeksUpTo } from '@/utils/week';
import type {
  CommitmentRecord,
  DepartmentRecord,
  MilestoneRecord,
  ModuleName,
  ModuleRatingRecord,
  RosterMember,
  CommentCountsResponse,
} from '@shared/api.interface';

const HISTORY_WEEKS = 8;

export default function AllMilestones() {
  const { me, week, setWeek: onWeekChange } = useOutletContext<LayoutContext>();
  // 组别是数据驱动的：哪些组别有周里程碑由 department 表的 has_milestone 决定，
  // 所以这里先取组别清单，再据此拉各组的里程碑与承诺。
  const { departments, loading: departmentsLoading } = useDepartments();
  const [tab, setTab] = useState(0);

  const milestoneDepartments: DepartmentRecord[] = departments.filter((d: DepartmentRecord) => d.hasMilestone);
  const milestoneKey: string = milestoneDepartments.map((d: DepartmentRecord) => d.name).join('|');

  const historyWeeks: string[] = weeksUpTo(me.week, HISTORY_WEEKS);

  // 四份数据都走缓存（"先用旧数据渲染、后台刷新"）：从周承诺页切过来、或者切回去，
  // 只要缓存还没过期就是瞬间出画面，不再每次都等一轮请求。
  const { data: rosterRes, loaded: rosterLoaded, error: rosterError } = useApiCache(
    `roster:${week}`,
    () => rosterApi.listRoster(week),
  );
  const milestonesKey = `milestones:${week}`;
  const { data: milestonesRes, loaded: milestonesLoaded, error: milestonesError } = useApiCache(
    milestonesKey,
    () => milestonesApi.listMilestones(week),
  );
  // 承诺按「全部组别」取，和周承诺页用同一个缓存键：两个页面互相切换时，这一份
  // 数据是直接命中的（多拿几个组的承诺没有代价，本来就是一个请求）。
  const allModules: string[] = departments.map((d: DepartmentRecord) => d.name);
  const commitmentsKey = `commitments:${week}:${allModules.join(',')}`;
  const { data: commitmentsRes, loaded: commitmentsLoaded, error: commitmentsError } = useApiCache(
    commitmentsKey,
    () => (allModules.length === 0
      ? Promise.resolve({ items: [] as CommitmentRecord[] })
      : commitmentsApi.listCommitmentsForModules(allModules, week)),
  );
  // 讨论条数按周一次取回，卡片上只是查表（不能每个卡片各发一次请求）
  const { data: commentCountsData } = useApiCache<CommentCountsResponse>(
    `comment-counts:${week}`,
    () => commentsApi.listCommentCounts(week),
  );
  const commentCounts: Record<string, number> = commentCountsData?.counts ?? {};
  const ratingsKey = 'module-ratings:all';
  const { data: ratingsRes, loaded: historyLoaded, error: ratingsError } = useApiCache(
    ratingsKey,
    () => ratingsApi.listModuleRatings(),
    API_CACHE_TTL_MS * 3,
  );

  const roster: RosterMember[] = rosterRes?.items ?? [];
  const items: MilestoneRecord[] = milestonesRes?.items ?? [];
  const moduleRatingsByModule: Map<ModuleName, Map<string, ModuleRatingRecord>> = (() => {
    const byModule = new Map<ModuleName, Map<string, ModuleRatingRecord>>();
    (ratingsRes?.items ?? []).forEach((rec: ModuleRatingRecord) => {
      if (!byModule.has(rec.module)) byModule.set(rec.module, new Map());
      byModule.get(rec.module)!.set(rec.week, rec);
    });
    return byModule;
  })();
  const commitmentsByModule: Map<ModuleName, CommitmentRecord[]> = (() => {
    const byModule = new Map<ModuleName, CommitmentRecord[]>();
    milestoneDepartments.forEach((d: DepartmentRecord) => byModule.set(d.name, []));
    (commitmentsRes?.items ?? []).forEach((item: CommitmentRecord) => {
      const list: CommitmentRecord[] | undefined = byModule.get(item.module);
      if (list) list.push(item);
    });
    return byModule;
  })();

  const loading: boolean = departmentsLoading || !rosterLoaded || !milestonesLoaded || !commitmentsLoaded;
  const loadError: string = rosterError || milestonesError || commitmentsError || ratingsError;

  function handleMilestoneSaved(signal?: SavedSignal<MilestoneRecord>): void {
    if (!signal) {
      // 拿不到可信结果：把这几份数据都标为过期，让页面重新拉一次。
      invalidateApiCache('milestones:');
      invalidateApiCache('commitments:');
      invalidateApiCache('module-ratings:');
      return;
    }
    // 就地更新缓存里的数据：界面立刻反映改动，也不用为每一次勾选再跑一趟接口。
    mutateApiCache<{ items: MilestoneRecord[] }>(milestonesKey, (data) => ({
      items: applySavedSignal(data.items, signal),
    }));
    // 评级（含验收勾选）会连带影响承诺的完成状态与历史评级，这两份置为过期。
    const graded: boolean = 'record' in signal
      ? Boolean(signal.record.weekendGrade || signal.record.mondayGrade)
      : true;
    if (graded) {
      invalidateApiCache('commitments:');
      invalidateApiCache(ratingsKey);
    }
  }

  // 默认落在自己所在的组别上；自己不在任何有里程碑的组里就退回第一个。
  useEffect(() => {
    const index: number = milestoneDepartments.findIndex((d: DepartmentRecord) => d.name === me.module);
    setTab(index >= 0 ? index : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.module, milestoneKey]);

  // 先展示错误：首次加载失败时没有旧缓存，loading 会一直为 true；如果先判断
  // loading，用户就只会看到永远转不完的“加载中”，错误块永远到不了。
  if (loadError) return <div className="text-sm text-destructive bg-red-50 border border-red-100 rounded-xl px-4 py-3">加载失败：{loadError} <button className="underline ml-2" onClick={() => { invalidateApiCache('milestones:'); invalidateApiCache('commitments:'); invalidateApiCache('roster:'); invalidateApiCache('module-ratings:'); }}>重新加载</button></div>;
  if (loading || !historyLoaded || departmentsLoading) return <div className="text-muted-foreground text-sm">加载中…</div>;

  function buildSection(mod: ModuleName) {
    const lead: RosterMember | undefined = roster.find((r: RosterMember) => r.module === mod && r.level === 'L3');
    const modByWeek = moduleRatingsByModule.get(mod);
    const rawHistory: HistoryEntry[] = historyWeeks.map((w: string) => {
      const rec: ModuleRatingRecord | undefined = modByWeek?.get(w);
      return { week: w, grade: finalGrade(rec?.mondayGrade, rec?.weekendGrade) };
    });
    const history: HistoryEntry[] = trimLeadingEmptyHistory(rawHistory);
    const score: number = personRankScore(rawHistory.map((h: HistoryEntry) => h.grade));
    // 积分相同时看 C 的数量：C 越少说明每周都更稳定地达成目标，排位更高。
    const cCount: number = rawHistory.filter((h: HistoryEntry) => h.grade === 'C').length;
    const record: MilestoneRecord | undefined = items.find((i: MilestoneRecord) => i.module === mod);
    const moduleCommitments: CommitmentRecord[] = commitmentsByModule.get(mod) ?? [];
    const commitmentsReady: boolean =
      moduleCommitments.length > 0 && moduleCommitments.every((c: CommitmentRecord) => c.checked === '✅' || c.checked === '❌' || c.checked === '⏹️');

    return { module: mod, lead, history, score, cCount, record, commitmentsReady };
  }

  const activeDept: DepartmentRecord | undefined = milestoneDepartments[tab];

  function renderCard(s: ReturnType<typeof buildSection>) {
    return <MilestoneCard key={s.module} me={me} week={week} module={s.module} lead={s.lead} history={s.history} score={s.score} record={s.record} commitmentsReady={s.commitmentsReady} commentCounts={commentCounts} onSaved={handleMilestoneSaved} onWeekChange={onWeekChange} />;
  }

  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Team milestones · {week}</p><h1 className="text-3xl font-semibold tracking-tight">这一周，我们要抵达哪里</h1><p className="text-sm text-muted-foreground mt-2">按工作组查看里程碑、验收标准和阶段评级。</p></div>
      {milestoneDepartments.length === 0 ? (
        <div className="text-sm text-muted-foreground">当前没有任何组别开启周里程碑。</div>
      ) : (
        <>
          <div className="group-tabs" role="tablist" aria-label="切换里程碑小组">
            {milestoneDepartments.map((d: DepartmentRecord, index: number) => (
              <button key={d.id} role="tab" aria-selected={tab === index} onClick={() => setTab(index)}>
                {d.name.replace('模块', '')}
              </button>
            ))}
          </div>
          {activeDept && (
            <div className="milestone-group-grid">
              {renderCard(buildSection(activeDept.name))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
