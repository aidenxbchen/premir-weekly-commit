import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { UserDisplay } from '@/components/business-ui/user-display';
import { CheckSelect } from '@/components/CheckSelect';
import { CommitmentForm } from '@/components/CommitmentForm';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DeliverableFieldsEditor } from '@/components/DeliverableFieldsEditor';
import { GradeSection } from '@/components/GradeSection';
import { EditRequestActions } from '@/components/EditRequestActions';
import { MilestoneCard } from '@/components/MilestoneCard';
import type { LayoutContext } from '@/components/Layout';
import { commitmentsApi, gradingApi, milestonesApi, ratingsApi, rosterApi } from '@/api';
import { useSavable } from '@/hooks/useSavable';
import { useDepartments } from '@/hooks/useDepartments';
import { isMondayLocal } from '@/utils/datetime';
import { promiseFields } from '@/utils/criteria';
import { canManageModule, canManagePerson } from '@shared/permissions';
import { finalGrade, personRankScore, trimLeadingEmptyHistory, type HistoryEntry } from '@/utils/grade-score';
import { applySavedSignal, type SavedSignal } from '@/utils/saved-signal';
import { weeksUpTo } from '@/utils/week';
import type { CheckMark, CommitmentRecord, DepartmentRecord, Grade, MilestoneRecord, ModuleName, ModuleRatingRecord, RosterMember } from '@shared/api.interface';

const HISTORY_WEEKS = 8;
const VALID_GRADES: string[] = ['A', 'B+', 'B', 'C'];

export default function ModuleCommitments() {
  const { me, week } = useOutletContext<LayoutContext>();
  const params = useParams<{ module: string }>();
  const moduleName = decodeURIComponent(params.module ?? '') as ModuleName;
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [milestone, setMilestone] = useState<MilestoneRecord | undefined>();
  const [commitments, setCommitments] = useState<CommitmentRecord[]>([]);
  const [moduleRatingsByWeek, setModuleRatingsByWeek] = useState<Map<string, ModuleRatingRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  // 组别是数据驱动的：有没有周里程碑由 department 表的 has_milestone 决定。
  const { departments, loading: departmentsLoading } = useDepartments();

  const historyWeeks: string[] = weeksUpTo(me.week, HISTORY_WEEKS);
  const isMyModule: boolean = me.module === moduleName;
  // 能不能管这个部门（改里程碑、验收勾选、评级）走统一的半径判定。
  const canManageThisModule: boolean = canManageModule(me, moduleName);
  // 除评级（含验收打钩）外，过去的周只能查看——新增/编辑/删除都只在最新一周
  // 开放，跟后端 assertCurrentWeek 的口径保持一致。
  const isCurrentWeek: boolean = week === me.week;

  async function loadWeekData(): Promise<void> {
    const [rosterRes, milestonesRes, commitmentsRes] = await Promise.all([
      rosterApi.listRoster(week),
      milestonesApi.listMilestones(week),
      commitmentsApi.listCommitments(moduleName, week),
    ]);
    setRoster(rosterRes.items);
    setMilestone(milestonesRes.items.find((i: MilestoneRecord) => i.module === moduleName));
    setCommitments(commitmentsRes.items);
    setLoading(false);
  }

  // 里程碑的历史评级是"模块自己的"，和现在谁是负责人无关。
  async function loadHistory(): Promise<void> {
    const res = await ratingsApi.listModuleRatings(moduleName);
    const map = new Map<string, ModuleRatingRecord>();
    res.items.forEach((rec: ModuleRatingRecord) => map.set(rec.week, rec));
    setModuleRatingsByWeek(map);
    setHistoryLoaded(true);
  }

  useEffect(() => {
    loadWeekData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, moduleName]);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleName]);

  function handleMilestoneSaved(signal?: SavedSignal<MilestoneRecord>): void {
    if (!signal) {
      loadWeekData();
      return;
    }
    setMilestone('deletedId' in signal ? undefined : signal.record);
  }

  function handleCommitmentSaved(signal?: SavedSignal<CommitmentRecord>): void {
    if (!signal) {
      loadWeekData();
      return;
    }
    setCommitments((prev) => applySavedSignal(prev, signal));
  }

  if (loading || !historyLoaded || departmentsLoading) return <div className="text-muted-foreground text-sm">加载中…</div>;

  const lead: RosterMember | undefined = roster.find((r: RosterMember) => r.module === moduleName && r.level === 'L3');
  const members: RosterMember[] = roster
    .filter((r: RosterMember) => r.module === moduleName)
    .sort((a: RosterMember, b: RosterMember) => (a.level === 'L3' ? -1 : b.level === 'L3' ? 1 : 0));

  const rawHistory: HistoryEntry[] = historyWeeks.map((w: string) => {
    const rec: ModuleRatingRecord | undefined = moduleRatingsByWeek.get(w);
    return { week: w, grade: finalGrade(rec?.mondayGrade, rec?.weekendGrade) };
  });
  const history: HistoryEntry[] = trimLeadingEmptyHistory(rawHistory);
  const score: number = personRankScore(rawHistory.map((h: HistoryEntry) => h.grade));
  const commitmentsReady: boolean =
    commitments.length > 0 && commitments.every((c: CommitmentRecord) => c.checked === '✅' || c.checked === '❌' || c.checked === '⏹️');
  const hasMilestones: boolean =
    departments.find((d: DepartmentRecord) => d.name === moduleName)?.hasMilestone ?? false;

  const commitmentsByPerson = new Map<string, CommitmentRecord[]>();
  commitments.forEach((c: CommitmentRecord) => {
    if (!commitmentsByPerson.has(c.ownerUserId)) commitmentsByPerson.set(c.ownerUserId, []);
    commitmentsByPerson.get(c.ownerUserId)!.push(c);
  });

  return (
    <div className="space-y-6">
      {/* 只有 5 个硬件模块有周里程碑。三个嵌入式组（软件组/MCU/Linux）用同一个
          模块页，但不显示里程碑卡片——它们本来就没有里程碑。 */}
      {hasMilestones && (
        <MilestoneCard
          me={me}
          week={week}
          module={moduleName}
          lead={lead}
          history={history}
          score={score}
          record={milestone}
          commitmentsReady={commitmentsReady}
          onSaved={handleMilestoneSaved}
          onWeekChange={() => {}}
          compact
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {members.map((person: RosterMember) => {
          const isOwnCard: boolean = person.userId === me.userId;
          const personCommitments: CommitmentRecord[] = commitmentsByPerson.get(person.userId) ?? [];

          return (
            <PersonCard
              key={person.userId}
              person={person}
              moduleName={moduleName}
              week={week}
              commitments={personCommitments}
              isOwnCard={isOwnCard && isMyModule}
              isCurrentWeek={isCurrentWeek}
              canCheck={canManagePerson(me, { userId: person.userId, level: person.level, module: person.module })}
              canGrade={personCommitments[0]?.canGradeRating === true}
              canDelete={canManageThisModule && isCurrentWeek}
              showForm={isOwnCard && isMyModule && showForm}
              onToggleForm={setShowForm}
              onSaved={handleCommitmentSaved}
            />
          );
        })}
      </div>
    </div>
  );
}

function PersonCard({
  person,
  moduleName,
  week,
  commitments,
  isOwnCard,
  isCurrentWeek,
  canCheck,
  canGrade,
  canDelete,
  showForm,
  onToggleForm,
  onSaved,
}: {
  person: RosterMember;
  moduleName: ModuleName;
  week: string;
  commitments: CommitmentRecord[];
  isOwnCard: boolean;
  isCurrentWeek: boolean;
  canCheck: boolean;
  canGrade: boolean;
  canDelete: boolean;
  showForm: boolean;
  onToggleForm: (v: boolean) => void;
  onSaved: (signal?: SavedSignal<CommitmentRecord>) => void;
}) {
  return (
    <div className="bg-card rounded-2xl border shadow-sm overflow-hidden flex flex-col">
      <div className="p-4">
        <div className="bg-primary rounded-xl px-4 py-3 flex items-center gap-2.5">
          <UserDisplay value={[person.userId]} size="small" className="text-primary-foreground" />
          <div className="text-primary-foreground/70 text-[11px]">{person.level === 'L3' ? '负责人' : person.level === 'L4' ? '协调人' : '组员'}</div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3 flex-1">
        {commitments.map((c: CommitmentRecord) => (
          <DeliverableCard
            key={c.id}
            record={c}
            moduleName={moduleName}
            isOwner={isOwnCard}
            isCurrentWeek={isCurrentWeek}
            canCheck={canCheck}
            canDelete={canDelete}
            onSaved={onSaved}
          />
        ))}

        {isOwnCard &&
          isCurrentWeek &&
          (showForm ? (
            <CommitmentForm
              week={week}
              onSaved={(created) => {
                onToggleForm(false);
                onSaved({ record: created });
              }}
              onCancel={() => onToggleForm(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => onToggleForm(true)}
              className="w-full border-2 border-dashed border-border rounded-xl py-2.5 text-muted-foreground enabled:hover:text-primary enabled:hover:border-primary transition-colors text-sm"
            >
              + 添加一条承诺
            </button>
          ))}

        {commitments.length === 0 && !isOwnCard && <div className="text-xs text-muted-foreground">本周还没有承诺</div>}

        {(commitments[0]?.canViewRating === true) && commitments.length > 0 && !(person.level === 'L3' && person.canGrade !== false) && (
          <PersonGradeCards moduleName={moduleName} commitments={commitments} canGrade={canGrade} onSaved={onSaved} />
        )}
      </div>
    </div>
  );
}

function PersonGradeCards({
  moduleName,
  commitments,
  canGrade,
  onSaved,
}: {
  moduleName: ModuleName;
  commitments: CommitmentRecord[];
  canGrade: boolean;
  onSaved: (signal?: SavedSignal<CommitmentRecord>) => void;
}) {
  const first = commitments[0];

  const allChecked: boolean = commitments.every((c: CommitmentRecord) => c.checked === '✅' || c.checked === '❌' || c.checked === '⏹️');
  const weekendGraded: boolean = !!first.weekendGrade && VALID_GRADES.includes(first.weekendGrade);
  const canGradeWeekend: boolean = canGrade && allChecked;
  const canGradeMonday: boolean = canGrade && allChecked && weekendGraded;
  const weekendBlockedReason: string | undefined = canGrade && !allChecked ? '请先完成所有复选框' : undefined;
  const mondayBlockedReason: string | undefined = !canGrade
    ? undefined
    : !allChecked
      ? '请先完成所有复选框'
      : !weekendGraded
        ? '请先完成周末评级'
        : undefined;

  async function submit(which: 'weekend' | 'monday', grade: Grade, note: string, correctionReason?: string): Promise<void> {
    // 提交报错时退回整页刷新兜底：部分请求可能已经在服务端落库成功，手上又没有
    // 可信的最新数据，不刷新的话卡片会一直停在"还能提交"的旧状态。
    try {
      await gradingApi.gradeCommitment(moduleName, first.id, { which, grade, note, correctionReason });
      onSaved();
    } catch (e) {
      onSaved();
      throw e;
    }
  }

  return (
    <div className="pt-1 space-y-2">
      <div className="border rounded-xl p-3">
        <GradeSection
          label="周末评级"
          currentGrade={first.weekendGrade}
          currentNote={first.weekendNote}
          canGrade={canGradeWeekend}
          blockedReason={weekendBlockedReason}
          onSubmit={(g, n, reason) => submit('weekend', g, n, reason)}
        />
      </div>
      <div className="border rounded-xl p-3">
        <GradeSection
          label="周一评级"
          currentGrade={first.mondayGrade}
          currentNote={first.mondayNote}
          canGrade={canGradeMonday}
          blockedReason={mondayBlockedReason}
          onSubmit={(g, n, reason) => submit('monday', g, n, reason)}
        />
      </div>
    </div>
  );
}

function DeliverableCard({
  record,
  moduleName,
  isOwner,
  isCurrentWeek,
  canCheck,
  canDelete,
  onSaved,
}: {
  record: CommitmentRecord;
  moduleName: ModuleName;
  isOwner: boolean;
  isCurrentWeek: boolean;
  canCheck: boolean;
  canDelete: boolean;
  onSaved: (signal?: SavedSignal<CommitmentRecord>) => void;
}) {
  const canEditOwn: boolean = isOwner && isCurrentWeek && (!record.locked || record.editAuthorized || isMondayLocal());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const checkSave = useSavable();
  const deleteSave = useSavable();

  async function patch(fields: Record<string, unknown>): Promise<void> {
    const { record: updated } = await commitmentsApi.updateCommitment(record.id, { module: moduleName, ...fields });
    onSaved({ record: updated });
  }

  async function handleCheck(v: CheckMark): Promise<void> {
    await checkSave.run(() => patch({ check: v }));
  }

  async function handleDelete(): Promise<void> {
    const ok = await deleteSave.run(async () => {
      await commitmentsApi.deleteCommitment(record.id);
      onSaved({ deletedId: record.id });
    });
    if (ok) setConfirmingDelete(false);
  }

  const cardError: string = checkSave.error || deleteSave.error;

  return (
    <div className="border rounded-xl p-3">
      <div className="flex gap-2">
        <div className="pt-0.5">
          <CheckSelect value={record.checked} canEdit={canCheck} onChange={handleCheck} />
        </div>
        <div className="flex-1 min-w-0">
          <DeliverableFieldsEditor
            textFields={promiseFields(record)}
            startIso={record.startTime}
            endIso={record.endTime}
            canEdit={canEditOwn}
            onSave={patch}
          />
          {/* 这一页右边本来就有垃圾桶按钮，所以不再重复一个"删除"（showDelete=false） */}
          {canDelete && isCurrentWeek && <EditRequestActions record={record} mode="manager" showDelete={false} onChanged={(updated) => onSaved({ record: updated })} />}
        </div>
        <div className="self-start flex flex-col items-center gap-1 shrink-0">
          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              title="删除这条交付物"
              className="text-muted-foreground/60 hover:text-destructive transition-colors p-1"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {cardError && <div className="text-xs text-destructive mt-2">{cardError}</div>}

      <ConfirmDialog
        open={confirmingDelete}
        title="删除这条交付物？"
        message="删除后不可撤销；如果这是该成员本周唯一的交付物，会一并清掉他这一周的评级记录。"
        confirmLabel="确认删除"
        busy={deleteSave.saving}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
