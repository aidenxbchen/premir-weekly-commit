import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { BPlusAdminActions } from '@/components/BPlusAdminActions';
import { CommentThread } from '@/components/CommentThread';
import { UserDisplay } from '@/components/business-ui/user-display';
import { CheckSelect } from '@/components/CheckSelect';
import { DocLinkText } from '@/components/DocLinkText';
import { GradeSection } from '@/components/GradeSection';
import { EditRequestActions } from '@/components/EditRequestActions';
import type { LayoutContext } from '@/components/Layout';
import { commentsApi, commitmentsApi, gradingApi, rosterApi, weeklyBPlusApi } from '@/api';
import { useDepartments } from '@/hooks/useDepartments';
import { invalidateApiCache, useApiCache } from '@/utils/api-cache';
import { promiseDisplayFields, type PromiseField } from '@/utils/criteria';
import { canManagePerson, isGlobalAdmin } from '@shared/permissions';
import type { CheckMark, CommentCountsResponse, CommentTargetType, CommitmentRecord, Grade, ModuleName, RosterMember, WeeklyBPlusRecord } from '@shared/api.interface';

type CommitmentGroup = { label: string; modules: ModuleName[] };

// 烘熨组在历史数据里有过两种存法：早期拆成“烘干模块”和“熨烫模块”，
// 也有环境直接使用“烘熨模块”。页面标签统一叫烘熨组，但请求和成员筛选
// 必须以 department 表里实际存在的名称为准。
const GROUP_ALIASES: Array<{ label: string; names: string[] }> = [
  { label: '全功能样机组', names: ['全功能样机组'] },
  { label: '洗净组', names: ['洗净模块', '洗净组'] },
  { label: '烘熨组', names: ['烘熨模块', '烘熨组', '烘干模块', '熨烫模块'] },
  { label: '净水组', names: ['净水模块', '净水组'] },
  { label: '软件组', names: ['软件组'] },
  { label: 'MCU嵌入式', names: ['MCU嵌入式'] },
  { label: 'Linux嵌入式', names: ['Linux嵌入式'] },
];

const FALLBACK_GROUPS: CommitmentGroup[] = [
  { label: '全功能样机组', modules: ['全功能样机组'] },
  { label: '洗净组', modules: ['洗净模块'] },
  { label: '烘熨组', modules: ['烘熨模块', '烘熨组', '烘干模块', '熨烫模块'] },
  { label: '净水组', modules: ['净水模块'] },
  { label: '软件组', modules: ['软件组'] },
  { label: 'MCU嵌入式', modules: ['MCU嵌入式'] },
  { label: 'Linux嵌入式', modules: ['Linux嵌入式'] },
];

function buildCommitmentGroups(departmentNames: string[]): CommitmentGroup[] {
  if (departmentNames.length === 0) return FALLBACK_GROUPS;
  const known = new Set<string>();
  const groups: CommitmentGroup[] = [];
  GROUP_ALIASES.forEach((alias) => {
    const modules = alias.names.filter((name) => departmentNames.includes(name));
    modules.forEach((name) => known.add(name));
    if (modules.length > 0) groups.push({ label: alias.label, modules });
  });
  // 管理员新增的组别也要能在周承诺页正常出现，不被写死的标签清单吞掉。
  departmentNames.filter((name) => !known.has(name)).forEach((name) => groups.push({ label: name, modules: [name] }));
  return groups;
}

export default function WeeklyCommitments() {
  const { me, week } = useOutletContext<LayoutContext>();
  const { departments, loading: departmentsLoading, error: departmentsError } = useDepartments();
  const groups: CommitmentGroup[] = buildCommitmentGroups(departments.map((department) => department.name));
  const ownGroupIndex = () => Math.max(0, groups.findIndex((group) => !!me.module && group.modules.includes(me.module)));
  const [tab, setTab] = useState(() => ownGroupIndex());
  const [actionError, setActionError] = useState('');
  const group = groups[tab] ?? groups[0];
  // 只在「组别清单本身」变化时（首次为空→异步加载完成）重新落到自己所在的组。
  // 注意这里用的是全部组别的键，不是当前选中组的键：用当前组的键会让「点其它页签」
  // 也触发本 effect，把刚切过去的页签又拽回自己的组——表现就是点哪个组都像在刷新当前页。
  const groupsKey = groups.map((item) => item.modules.join('|')).join(';');
  const allModules: string[] = departments.map((department) => department.name);

  useEffect(() => { setTab(ownGroupIndex()); }, [me.userId, me.module, groupsKey]);

  // 一次把「整周、所有组」的承诺取回来（一个请求），页签切换就只是本地筛选——
  // 以前每换一个页签都要重新等一轮请求，现在点哪个组都是立刻出来。
  // 走缓存，所以从里程碑页切回来也不用再等。
  const { data: rosterData, loaded: rosterLoaded, error: rosterError } = useApiCache(
    `roster:${week}`,
    () => rosterApi.listRoster(week),
  );
  const { data: bPlusData, loaded: bPlusLoaded, error: bPlusError } = useApiCache(
    `weekly-b-plus:${week}`,
    () => weeklyBPlusApi.listWeeklyBPlus(week),
  );
  // 讨论条数按周一次取回（一个请求），卡片上只是查表——不能每个卡片各发一次请求
  const { data: commentCountsData } = useApiCache<CommentCountsResponse>(
    `comment-counts:${week}`,
    () => commentsApi.listCommentCounts(week),
  );
  const commentCount = (targetType: CommentTargetType, targetId?: string): number =>
    (targetId ? commentCountsData?.counts?.[`${targetType}:${targetId}`] ?? 0 : 0);
  const commitmentsKey = `commitments:${week}:${allModules.join(',')}`;
  const { data: commitmentData, loaded: commitmentsLoaded, error: commitmentsError } = useApiCache(
    commitmentsKey,
    () => (allModules.length === 0
      ? Promise.resolve({ items: [] as CommitmentRecord[] })
      : commitmentsApi.listCommitmentsForModules(allModules, week)),
  );

  const roster: RosterMember[] = rosterData?.items ?? [];
  const bPlusItems: WeeklyBPlusRecord[] = bPlusData?.items ?? [];
  const [items, setItems] = useState<CommitmentRecord[]>([]);
  // 数据到齐（含缓存命中）之前按加载中处理；缓存命中时这里第一帧就是 false。
  const loading: boolean = departmentsLoading || !rosterLoaded || !bPlusLoaded || !commitmentsLoaded;
  useEffect(() => {
    // 依赖里带上 key：换周之后先把上一周的数据清掉，不能等新数据回来才发现是旧周。
    setItems(commitmentData?.items ?? []);
  }, [commitmentData, commitmentsKey]);
  useEffect(() => {
    const firstError: string = departmentsError || rosterError || bPlusError || commitmentsError;
    if (firstError) setActionError(firstError);
  }, [departmentsError, rosterError, bPlusError, commitmentsError]);

  const members = group ? roster.filter((person) => person.module && group.modules.includes(person.module)) : [];
  const bPlusRow = (userId: string): WeeklyBPlusRecord | undefined => bPlusItems.find((entry) => entry.ownerUserId === userId);
  const bPlusFor = (userId: string): string => bPlusRow(userId)?.criteria?.trim() ?? '';
  // B+ 标准的"退回/删除"只有 L1 能看到——这两动作都会动别人写下的内容。
  const canAdminBPlus: boolean = isGlobalAdmin(me);

  // B+ 标准来自缓存，所以改完就把它标为过期，页面会自动拉回最新的一份。
  async function reopenBPlus(person: RosterMember, reason: string) {
    await weeklyBPlusApi.reopenWeeklyBPlus({ week, ownerUserId: person.userId, reason });
    invalidateApiCache('weekly-b-plus:');
  }

  async function deleteBPlus(person: RosterMember) {
    await weeklyBPlusApi.deleteWeeklyBPlus(week, person.userId);
    invalidateApiCache('weekly-b-plus:');
  }

  function replaceItems(updated: CommitmentRecord[]) {
    const byId = new Map(updated.map((item) => [item.id, item]));
    setItems((previous) => previous.map((item) => byId.get(item.id) ?? item));
  }

  function removeItem(id: string) {
    setItems((previous) => previous.filter((item) => item.id !== id));
  }

  async function setCompleted(item: CommitmentRecord, mark: CheckMark) {
    setActionError('');
    try {
      const result = await commitmentsApi.updateCommitment(item.id, { module: item.module, check: mark });
      replaceItems([result.record]);
      // 承诺数据进了缓存，改完标记为过期，切到里程碑页也不会读到旧状态。
      invalidateApiCache('commitments:');
      invalidateApiCache(`commitments-mine:`);
    } catch (error) { setActionError(error instanceof Error ? error.message : '状态保存失败'); }
  }

  async function gradePerson(personItems: CommitmentRecord[], which: 'weekend' | 'monday', grade: Grade, note: string, correctionReason?: string) {
    setActionError('');
    try {
      await gradingApi.gradeCommitment(personItems[0].module, personItems[0].id, { which, grade, note, correctionReason });
      setItems((previous) => previous.map((item) => personItems.some((own) => own.id === item.id)
        ? { ...item, ...(which === 'weekend' ? { weekendGrade: grade, weekendNote: note } : { mondayGrade: grade, mondayNote: note }) }
        : item));
      invalidateApiCache('commitments:');
    } catch (error) { setActionError(error instanceof Error ? error.message : '评级保存失败'); throw error; }
  }
  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Team commitments · {week}</p><h1 className="text-3xl font-semibold tracking-tight">伙伴们这一周的约定</h1><p className="text-sm text-muted-foreground mt-2">承诺在个人中心完成编辑，这里用于团队彼此看见和协作。</p></div>
      <div className="group-tabs" role="tablist" aria-label="切换小组">
        {groups.map((item, index) => <button key={item.label} role="tab" aria-selected={tab === index} onClick={() => setTab(index)}>{item.label}</button>)}
      </div>
      {departmentsError && <div className="text-xs text-amber-700 bg-amber-50/80 border border-amber-100 rounded-xl px-4 py-3">组别清单读取失败，已使用兼容映射。</div>}
      {actionError && <div className="text-xs text-destructive bg-red-50/80 border border-red-100 rounded-xl px-4 py-3">{actionError}</div>}
      {loading ? <p className="text-sm text-muted-foreground">正在同步团队承诺…</p> : (
        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-5">
          {members.map((person) => {
            const own = items.filter((item) => item.ownerUserId === person.userId);
            // 统一判定：半径内 + 不评自己 + 下级不评上级。L1 全局、L2 看勾选的
            // 部门清单、L3 看本部门——规则只有这一条，页面不再按 role 分支。
            const canManage = canManagePerson(me, {
              userId: person.userId,
              level: person.level,
              module: person.module,
            });
            const first = own[0];
            const allChecked = own.length > 0 && own.every((item) => !!item.checked);
            const weekendSet = !!first?.weekendGrade;
            const mayGrade = first?.canGradeRating === true;
            const showReview = first?.canViewRating === true;
            const bPlus: string = bPlusFor(person.userId);
            return <article key={person.userId} className="glass-panel overflow-hidden">
              <header className="person-strip"><UserDisplay value={[person.userId]} size="medium" /><span>{person.module}</span></header>
              <div className="p-5 space-y-4">
                {own.map((item, index) => {
                  // 所有小组共用同一套展示模板：交付物（标题）/ 验收标准 / 依赖与风险。
                  // 交付物已经在标题位置，这里只渲染其余字段。
                  const fields: PromiseField[] = promiseDisplayFields(item).filter((field: PromiseField) => field.key !== 'deliverable');
                  return <div className="readonly-promise" key={item.id}>
                    <div className="promise-status-column"><span className="promise-no">{String(index + 1).padStart(2, '0')}</span><CheckSelect value={item.checked} canEdit={canManage} onChange={(mark) => setCompleted(item, mark)} /></div>
                    <div>
                      <div className="promise-title-row">
                        <div className="promise-title" role="heading" aria-level={3}>{item.deliverable ? <DocLinkText text={item.deliverable} /> : '未填写交付物'}</div>
                        <CommentThread targetType="commitment" targetId={item.id} meUserId={me.userId} count={commentCount('commitment', item.id)} />
                      </div>
                      {fields.map((field: PromiseField) => (
                        <div className="promise-field" key={field.key}>
                          <b>{field.label}</b>
                          <div className="promise-field-body">
                            {field.value.trim() ? <DocLinkText text={field.value} /> : <span className="promise-empty">未填写</span>}
                          </div>
                        </div>
                      ))}
                      {canManage && item.week === me.week && <EditRequestActions record={item} mode="manager" onChanged={(record) => replaceItems([record])} onDeleted={(id) => { removeItem(id); invalidateApiCache('commitments:'); }} />}
                    </div>
                  </div>;
                })}
                {!own.length && <p className="py-8 text-center text-sm text-muted-foreground">尚未写下本周承诺</p>}
                {/* B+验收标准是整周一份的独立判断，不属于某一条承诺，所以按人显示一次。
                    没写就不占位置。退回/删除只有 L1 看得到：有人写错了，只有他能处理。 */}
                {bPlus && <div className="readonly-promise bplus-week-card">
                  <div className="promise-status-column"><span className="promise-no">B+</span></div>
                  <div>
                    <div className="bplus-card-head">
                      <h3>B+验收标准</h3>
                      <div className="bplus-card-actions">
                        {bPlusRow(person.userId)?.id && (
                          <CommentThread
                            targetType="weekly_b_plus"
                            targetId={bPlusRow(person.userId)!.id}
                            meUserId={me.userId}
                            count={commentCount('weekly_b_plus', bPlusRow(person.userId)?.id)}
                          />
                        )}
                        {canAdminBPlus && (
                          <BPlusAdminActions
                            reopened={bPlusRow(person.userId)?.editAuthorized === true}
                            onReopen={(reason) => reopenBPlus(person, reason)}
                            onDelete={() => deleteBPlus(person)}
                            reopenTitle={`退回 ${person.name ?? '该伙伴'} 的 B+ 验收标准？`}
                            reopenMessage={`退回后他本人可以改动并重新保存，保存成功即重新锁定；退回本身不会改动内容。`}
                            deleteTitle={`删除 ${person.name ?? '该伙伴'} 的 B+ 验收标准？`}
                            deleteMessage={`将删除该伙伴在 ${week} 的 B+ 验收标准，且不可撤销。删除后他可以重新写一份。`}
                          />
                        )}
                      </div>
                    </div>
                    <div className="promise-field">
                      <b>整周标准</b>
                      <div className="promise-field-body"><DocLinkText text={bPlus} /></div>
                    </div>
                  </div>
                </div>}
                {showReview && first && <div className="commitment-review-grid">
                  <GradeSection label="周末评级" currentGrade={first.weekendGrade} currentNote={first.weekendNote} canGrade={mayGrade && allChecked} blockedReason={canManage && !allChecked ? '完成状态尚未全部判断' : undefined} onSubmit={(grade, note, reason) => gradePerson(own, 'weekend', grade, note, reason)} />
                  <GradeSection label="周一复评" currentGrade={first.mondayGrade} currentNote={first.mondayNote} canGrade={mayGrade && allChecked && weekendSet} blockedReason={canManage && !weekendSet ? '周末评级后开放' : undefined} onSubmit={(grade, note, reason) => gradePerson(own, 'monday', grade, note, reason)} />
                </div>}
              </div>
            </article>;
          })}
        </div>
      )}
    </div>
  );
}
