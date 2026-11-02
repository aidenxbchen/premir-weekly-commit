import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { UserDisplay } from '@/components/business-ui/user-display';
import { gradingApi, milestonesApi } from '@/api';
import { useSavable } from '@/hooks/useSavable';
import { isChecklistComplete } from '@/utils/criteria';
import type { HistoryEntry } from '@/utils/grade-score';
import type { SavedSignal } from '@/utils/saved-signal';
import { canGradeModule, canManageModule, isGlobalAdmin } from '@shared/permissions';
import type { Grade, MeResponse, MilestoneRecord, ModuleName, RosterMember } from '@shared/api.interface';
import { BPlusAdminActions } from './BPlusAdminActions';
import { CommentThread } from './CommentThread';
import { ConfirmDialog } from './ConfirmDialog';
import { CriteriaBlock } from './CriteriaBlock';
import { EditableField } from './EditableField';
import { GradeSection } from './GradeSection';
import { WeekMedal } from './WeekMedal';

const VALID_GRADES: string[] = ['A', 'B+', 'B', 'C'];

export function MilestoneCard({
  me,
  week,
  rank,
  module,
  lead,
  history,
  score,
  record,
  commitmentsReady,
  commentCounts,
  onSaved,
  onWeekChange,
  compact = false,
}: {
  me: MeResponse;
  week: string;
  rank?: number;
  module: ModuleName;
  lead?: RosterMember;
  history: HistoryEntry[];
  score: number;
  record?: MilestoneRecord;
  commitmentsReady: boolean;
  // 本周各对象的讨论条数（`<type>:<id>` → 条数），页面一次取回后传进来
  commentCounts?: Record<string, number>;
  onSaved: (signal?: SavedSignal<MilestoneRecord>) => void;
  onWeekChange: (week: string) => void;
  compact?: boolean;
}) {
  // 除评级（含验收打钩，是评级的前置条件）外，过去的周只能查看——编辑文字、
  // 删除都只在最新一周开放，跟后端 assertCurrentWeek 的口径保持一致。
  const isCurrentWeek: boolean = week === me.week;
  // 里程碑是部门级内容，按半径判定：L1 全局、L2 看勾选的清单、L3/L4 看本部门。
  const canManageThisModule: boolean = canManageModule(me, module);
  const canEditText: boolean = canManageThisModule && isCurrentWeek;
  // 评级（含验收打钩，是评级的前置条件）比"写内容"更严：L4 组内协调人排除在外。
  const canGradeThisModule: boolean = canGradeModule(me, module);
  const baseCanGrade: boolean = canGradeThisModule && !!record?.id;
  // B+ 标准的退回/删除只有 L1（全局管理员），且只针对已经存在的那条本周里程碑。
  const canAdminBPlus: boolean = isGlobalAdmin(me) && isCurrentWeek && !!record?.id;
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const deleteSave = useSavable();

  async function handleDelete(): Promise<void> {
    if (!record?.id) return;
    const ok = await deleteSave.run(async () => {
      await milestonesApi.deleteMilestone(record!.id);
      onSaved({ deletedId: record!.id });
    });
    if (ok) setConfirmingDelete(false);
  }

  const bDone: boolean = isChecklistComplete(record?.bCriteria ?? '', record?.bCheck);
  const bPlusDone: boolean = isChecklistComplete(record?.bPlusCriteria ?? '', record?.bPlusCheck);
  const checklistDone: boolean = bDone && bPlusDone;
  const weekendGraded: boolean = !!record?.weekendGrade && VALID_GRADES.includes(record.weekendGrade);

  const canGradeWeekend: boolean = baseCanGrade && checklistDone;
  const canGradeMonday: boolean = baseCanGrade && checklistDone && weekendGraded;
  const weekendBlockedReason: string | undefined = baseCanGrade && !checklistDone ? '请先完成所有复选框' : undefined;
  const mondayBlockedReason: string | undefined = !baseCanGrade
    ? undefined
    : !checklistDone
      ? '请先完成所有复选框'
      : !weekendGraded
        ? '请先完成周末评级'
        : undefined;

  async function saveField(field: 'description' | 'bCriteria' | 'bPlusCriteria', value: string): Promise<void> {
    const { record: updated } = await milestonesApi.saveMilestone({ week, module, [field]: value });
    onSaved({ record: updated });
  }

  async function saveChecklist(field: 'bCheck' | 'bPlusCheck', value: string): Promise<void> {
    const { record: updated } = await milestonesApi.saveMilestone({ week, module, [field]: value });
    onSaved({ record: updated });
  }

  // B+ 标准的退回 / 删除：都是改字段，返回的还是一条完整记录，直接替换即可。
  async function reopenBPlus(reason: string): Promise<void> {
    if (!record?.id) return;
    const { record: updated } = await milestonesApi.reopenMilestoneBPlus(record.id, reason);
    onSaved({ record: updated });
  }

  async function deleteBPlus(): Promise<void> {
    if (!record?.id) return;
    const { record: updated } = await milestonesApi.deleteMilestoneBPlus(record.id);
    onSaved({ record: updated });
  }

  async function submitGrade(which: 'weekend' | 'monday', grade: Grade, note: string, correctionReason?: string): Promise<void> {
    if (!record?.id) return;
    // 提交报错时也退回整页刷新兜底：请求可能已经在服务端落库成功，手上又没有
    // 可信的最新数据，不刷新的话卡片会一直停在"还能提交"的旧状态。
    try {
      const { record: updated } = await gradingApi.gradeMilestone(record.id, { which, grade, note, correctionReason });
      onSaved({ record: updated });
    } catch (e) {
      onSaved();
      throw e;
    }
  }

  return (
    <div className="glass-panel milestone-card overflow-hidden flex flex-col">
      <div className="person-strip milestone-card-head flex items-stretch gap-2">
        <div className="relative flex-1 flex flex-col justify-center min-w-0">
          {rank === 0 && (
            <span className="absolute -top-3 -left-3 text-2xl rotate-[-12deg] drop-shadow-md select-none" aria-hidden>
              👑
            </span>
          )}
          <div className="text-slate-800 font-semibold text-base truncate">{module.replace('模块', '')}</div>
          {!compact && lead && (
            <div className="mt-1.5 inline-flex items-center gap-1.5 bg-white/60 rounded-full pl-0.5 pr-2.5 py-0.5 w-fit max-w-full">
              <UserDisplay value={[lead.userId]} size="small" />
            </div>
          )}
        </div>
        {!compact && rank === 0 && (
          <div className="bg-gradient-to-br from-[#ffd76a] to-[#c98600] rounded-xl px-3 py-3 flex flex-col items-center justify-center shrink-0 shadow-sm">
            <span className="text-base leading-none">🏆</span>
            <span className="text-white font-bold text-[11px] whitespace-nowrap mt-1">全场最佳</span>
          </div>
        )}
        {canGradeModule(me, module) && record?.id && isCurrentWeek && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            title="删除本模块本周里程碑（含同步过去的负责人评级）"
            className="self-start text-muted-foreground/60 hover:text-destructive transition-colors shrink-0 p-1"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmingDelete}
        title="删除本周里程碑？"
        message={`将删除 ${module} 在 ${week} 的里程碑记录${lead ? '，以及负责人这一周被同步过去的评级记录' : ''}，且不可撤销。`}
        confirmLabel="确认删除"
        busy={deleteSave.saving}
        onConfirm={handleDelete}
        onCancel={() => setConfirmingDelete(false)}
      />
      {deleteSave.error && <div className="px-4 text-xs text-destructive">{deleteSave.error}</div>}

      <div className="px-5 py-4 space-y-4 flex-1">
        {!compact && lead && history.length > 0 && (
          <div className="flex items-end gap-2 flex-wrap pb-4 border-b">
            {history.map((h: HistoryEntry) => (
              <WeekMedal key={h.week} week={h.week} grade={h.grade} size={h.week === week ? 'lg' : 'sm'} active={h.week === week} onClick={() => onWeekChange(h.week)} />
            ))}
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground ml-1 self-center">
              积分 {score >= 0 ? '+' : ''}
              {score}
            </span>
          </div>
        )}

        <div className="border rounded-xl p-3">
          <EditableField
            label="里程碑描述"
            value={record?.description ?? ''}
            canEdit={canEditText}
            onSave={(v) => saveField('description', v)}
            valueClassName="text-lg font-bold whitespace-pre-wrap mt-0.5"
            actions={record?.id ? (
              <CommentThread
                targetType="milestone_description"
                targetId={record.id}
                meUserId={me.userId}
                count={commentCounts?.[`milestone_description:${record.id}`] ?? 0}
              />
            ) : undefined}
          />
        </div>

        {!compact && (
          <>
            {canGradeThisModule && !commitmentsReady && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                本模块本周的周承诺复选框还没有全部勾选，暂时不能勾选验收标准
              </div>
            )}

            <div className="border rounded-xl p-3">
              <CriteriaBlock
                label="B 验收标准"
                text={record?.bCriteria ?? ''}
                checklistRaw={record?.bCheck}
                actions={record?.id ? (
                  <CommentThread
                    targetType="milestone_b"
                    targetId={record.id}
                    meUserId={me.userId}
                    count={commentCounts?.[`milestone_b:${record.id}`] ?? 0}
                  />
                ) : undefined}
                canEditText={canEditText}
                canCheck={canGradeThisModule && commitmentsReady}
                onSaveText={(v) => saveField('bCriteria', v)}
                onSaveChecklist={(v) => saveChecklist('bCheck', v)}
              />
            </div>

            <div className="border rounded-xl p-3 space-y-2">
              <CriteriaBlock
                label="B+ 验收标准"
                text={record?.bPlusCriteria ?? ''}
                checklistRaw={record?.bPlusCheck}
                actions={record?.id ? (
                  <CommentThread
                    targetType="milestone_b_plus"
                    targetId={record.id}
                    meUserId={me.userId}
                    count={commentCounts?.[`milestone_b_plus:${record.id}`] ?? 0}
                  />
                ) : undefined}
                canEditText={canEditText}
                canCheck={canGradeThisModule && commitmentsReady}
                onSaveText={(v) => saveField('bPlusCriteria', v)}
                onSaveChecklist={(v) => saveChecklist('bPlusCheck', v)}
              />
              {/* 负责人看得到"被退回过、为什么"，改完标准或重新勾一次验收这个提示就消失；
                  L1 自己的视图里由下面的操作行显示同样的状态。 */}
              {record?.bPlusEditAuthorized && !canAdminBPlus && (
                <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  管理员已退回重做本模块的 B+ 验收{record.bPlusEditReason ? `：${record.bPlusEditReason}` : ''}
                </div>
              )}
              {/* L1 的两个管理动作：退回=清空勾选让负责人重做验收；删除=连标准一起清空。
                  里程碑文本本来只有模块负责人/协调人能写，所以"退回"退的就是验收这一步。 */}
              {canAdminBPlus && (
                <>
                  <div className="pt-2 border-t" />
                  <BPlusAdminActions
                    reopened={record?.bPlusEditAuthorized === true}
                    onReopen={reopenBPlus}
                    onDelete={deleteBPlus}
                    reopenTitle={`退回 ${module} 本周的 B+ 验收？`}
                    reopenMessage={`已勾选的 B+ 验收会被清空，负责人可以修改标准或重新验收。已经评过的模块评级不会自动撤回——重新评级时系统会要求填写更正理由。`}
                    deleteTitle={`删除 ${module} 本周的 B+ 验收标准？`}
                    deleteMessage={`将清空 ${module} 在 ${week} 的 B+ 验收标准（含已勾选的验收），且不可撤销。清空后负责人可以重新写一条。`}
                  />
                </>
              )}
            </div>

            <div className="pt-1 border-t" />

            <GradeSection
              label="周末评级"
              currentGrade={record?.weekendGrade}
              currentNote={record?.weekendNote}
              canGrade={canGradeWeekend}
              blockedReason={weekendBlockedReason}
              onSubmit={(g, n, reason) => submitGrade('weekend', g, n, reason)}
            />
            <GradeSection
              label="周一评级"
              currentGrade={record?.mondayGrade}
              currentNote={record?.mondayNote}
              canGrade={canGradeMonday}
              blockedReason={mondayBlockedReason}
              onSubmit={(g, n, reason) => submitGrade('monday', g, n, reason)}
            />
          </>
        )}
      </div>
    </div>
  );
}
