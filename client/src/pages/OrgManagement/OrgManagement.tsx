import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import { UserSelect } from '@/components/business-ui/user-select';
import { getI18nText } from '@/components/business-ui/utils/user';
import type { User } from '@/components/business-ui/types/user';
import { BigAvatar } from '@/components/BigAvatar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { departmentsApi, rosterApi } from '@/api';
import { usePersonInfo } from '@/hooks/usePersonInfo';
import { useDepartments } from '@/hooks/useDepartments';
import { errorMessage } from '@/utils/error';
import { ADMIN_LEVELS, LEVEL_LABEL, type AdminLevel, type DepartmentRecord, type ModuleName, type RosterMember } from '@shared/api.interface';
import { adminScope, canManageModule, canManagePerson, canSetLevels, type ScopeHolder } from '@shared/permissions';
import type { LayoutContext } from '@/components/Layout';

// 级别只用颜色区分层级高低，不做成大色块——一整页几十个成员徽章时，大色块会把
// 头像和姓名压下去，而这两者才是这个页面要让人一眼认出来的东西。
const LEVEL_TONE: Record<AdminLevel, string> = {
  L1: 'bg-rose-50 text-rose-700 ring-rose-200',
  L2: 'bg-amber-50 text-amber-700 ring-amber-200',
  L3: 'bg-sky-50 text-sky-700 ring-sky-200',
  L4: 'bg-violet-50 text-violet-700 ring-violet-200',
  member: 'bg-slate-50 text-slate-500 ring-slate-200',
};
const LEVEL_SHORT: Record<AdminLevel, string> = { L1: 'L1', L2: 'L2', L3: 'L3', L4: 'L4', member: '组员' };

type Patch = { level?: AdminLevel; module?: ModuleName; managedModules?: ModuleName[] };

export default function OrgManagement() {
  const { me } = useOutletContext<LayoutContext>();
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<RosterMember | null>(null);
  const [removeError, setRemoveError] = useState('');
  const [removeBusy, setRemoveBusy] = useState(false);
  const [error, setError] = useState('');
  // 组别清单来自 department 表，L1 可以在本页新增/删除组别。
  const [deptError, setDeptError] = useState('');
  const [addingDept, setAddingDept] = useState(false);
  const [removingDept, setRemovingDept] = useState<DepartmentRecord | null>(null);
  const [renamingDept, setRenamingDept] = useState<DepartmentRecord | null>(null);
  const [deptBusy, setDeptBusy] = useState(false);
  const {
    departments,
    moduleNames,
    loading: departmentsLoading,
    error: departmentsLoadError,
    reload: reloadDepartments,
  } = useDepartments();

  const actor: ScopeHolder = me;
  const scope = adminScope(actor);
  const iCanSetLevels: boolean = canSetLevels(actor);

  async function load(): Promise<void> {
    setError('');
    try { const res = await rosterApi.listRoster(); setRoster(res.items); }
    catch (e) { setError(errorMessage(e)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function patch(userId: string, dto: Patch): Promise<void> {
    setError('');
    try {
      await rosterApi.updateRosterMember(userId, dto);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function confirmRemove(): Promise<void> {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError('');
    try {
      await rosterApi.removeRosterMember(removing.userId);
      setRemoving(null);
      await load();
    } catch (e) {
      setRemoveError(errorMessage(e));
    } finally {
      setRemoveBusy(false);
    }
  }

  async function confirmRemoveDept(): Promise<void> {
    if (!removingDept) return;
    setDeptBusy(true);
    setDeptError('');
    try {
      await departmentsApi.removeDepartment(removingDept.id);
      setRemovingDept(null);
      await reloadDepartments();
      await load();
    } catch (e) {
      setDeptError(errorMessage(e));
    } finally {
      setDeptBusy(false);
    }
  }

  if (loading || departmentsLoading) return <div className="text-muted-foreground text-sm">加载中…</div>;

  const l1: RosterMember[] = roster.filter((r: RosterMember) => r.level === 'L1');
  const l2: RosterMember[] = roster.filter((r: RosterMember) => r.level === 'L2');
  const byModule = new Map<ModuleName, RosterMember[]>();
  moduleNames.forEach((mod: ModuleName) => byModule.set(mod, []));
  roster.forEach((r: RosterMember) => {
    // L1/L2 有专属卡片，不再重复出现在部门卡里
    if (r.level === 'L1' || r.level === 'L2') return;
    if (r.module && byModule.has(r.module)) byModule.get(r.module)!.push(r);
  });

  const shared = { actor, iCanSetLevels, moduleNames, onPatch: patch, onRemove: setRemoving, onAdded: load };

  return (
    <div className="space-y-4">
      <Card className="px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-mono tracking-wider ring-1 ${LEVEL_TONE[actor.level]}`}>
            {LEVEL_SHORT[actor.level]}
          </span>
          <span className="text-xs text-muted-foreground">
            我的管理半径：{scope === 'ALL' ? '全部部门' : scope.length ? scope.join('、') : '无管理权限'}
          </span>
          <span className="text-[11px] text-muted-foreground/70">规则：半径内 · 不能评自己 · 下级不评上级</span>
        </div>
      </Card>

      {error && <div className="text-xs text-destructive bg-red-50/80 border border-red-100 rounded-xl px-4 py-2.5">{error}</div>}
      {departmentsLoadError && <div className="text-xs text-destructive bg-red-50/80 border border-red-100 rounded-xl px-4 py-2.5">组别清单加载失败：{departmentsLoadError}</div>}
      {deptError && !removingDept && <div className="text-xs text-destructive bg-red-50/80 border border-red-100 rounded-xl px-4 py-2.5">{deptError}</div>}

      {/* 三层结构：L1（全局）→ L2（跨部门）→ 部门。层与层之间用不同的底色和
          左侧色条区分，让人一眼看出"这是三个层级"而不是九张并列的卡片。 */}
      <section className="org-tier org-tier-1">
        <TierHead index="第一层" title="全局管理员" note="半径＝全部部门，也是唯一能调整别人级别的层级" />
        <div className="org-cards">
          <DeptCard title="L1 · 全局管理员" people={l1} addLevel="L1" {...shared} />
        </div>
      </section>

      <section className="org-tier org-tier-2">
        <TierHead index="第二层" title="部门管理员" note="半径＝下面勾选的部门清单，可跨部门交叉管理" />
        <div className="org-cards">
          <DeptCard title="L2 · 部门管理员" people={l2} addLevel="L2" showRadius {...shared} />
        </div>
      </section>

      <section className="org-tier org-tier-3">
        <TierHead index="第三层" title="各部门" note="L3 半径＝本部门且可评级；L4 组内协调人只写里程碑不评级；嵌入式组无周里程碑" />
        {iCanSetLevels && (
          <div className="px-1 pb-2.5">
            {addingDept ? (
              <AddDepartmentInline
                onDone={() => setAddingDept(false)}
                onAdded={async () => {
                  setAddingDept(false);
                  await reloadDepartments();
                }}
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingDept(true)}
                className="inline-flex items-center gap-1 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
              >
                <Plus className="size-3" /> 新增组别
              </button>
            )}
          </div>
        )}
        <div className="org-cards">
          {departments.map((d: DepartmentRecord) => (
            <DeptCard
              key={d.id}
              title={d.name}
              people={byModule.get(d.name) ?? []}
              module={d.name}
              dept={d}
              canDeleteDept={iCanSetLevels}
              deleteBlockedReason={
                (byModule.get(d.name) ?? []).length > 0
                  ? `组内还有 ${(byModule.get(d.name) ?? []).length} 人，先把他们移出或调走才能删除`
                  : undefined
              }
              onDeleteDept={() => setRemovingDept(d)}
              isRenaming={renamingDept?.id === d.id}
              onRenameStart={() => setRenamingDept(d)}
              onRenameDone={() => setRenamingDept(null)}
              onRenamed={async () => {
                setRenamingDept(null);
                await Promise.all([reloadDepartments(), load()]);
              }}
              {...shared}
            />
          ))}
        </div>
      </section>

      <ConfirmDialog
        open={!!removing}
        title="移除这个人？"
        message={`确认将「${removing?.name ?? removing?.userId ?? ''}」从${removing?.module ?? '该部门'}移除吗？历史数据会保留，只解除当前归属。${removeError ? `\n\n上次操作失败：${removeError}` : ''}`}
        confirmLabel="确认移除"
        busy={removeBusy}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />

      <ConfirmDialog
        open={!!removingDept}
        title="删除这个组别？"
        message={`确认删除组别「${removingDept?.name ?? ''}」吗？只有组别里没有成员时才能删除；删除后该组别会从组织架构、周里程碑入口里消失（历史记录仍保留）。${deptError ? `\n\n上次操作失败：${deptError}` : ''}`}
        confirmLabel="确认删除"
        busy={deptBusy}
        onConfirm={confirmRemoveDept}
        onCancel={() => {
          setRemovingDept(null);
          setDeptError('');
        }}
      />
    </div>
  );
}

function TierHead({ index, title, note }: { index: string; title: string; note: string }) {
  return (
    <div className="org-tier-head">
      <span className="org-tier-index">{index}</span>
      <span className="org-tier-title">{title}</span>
      <span className="org-tier-note">{note}</span>
    </div>
  );
}

function DeptCard({
  title,
  hint,
  people,
  module,
  moduleNames,
  dept,
  addLevel = 'member',
  showRadius,
  canDeleteDept,
  deleteBlockedReason,
  onDeleteDept,
  isRenaming,
  onRenameStart,
  onRenameDone,
  onRenamed,
  actor,
  iCanSetLevels,
  onPatch,
  onRemove,
  onAdded,
}: {
  title: string;
  hint?: string;
  people: RosterMember[];
  module?: ModuleName;
  moduleNames: ModuleName[];
  dept?: DepartmentRecord;
  addLevel?: AdminLevel;
  showRadius?: boolean;
  canDeleteDept?: boolean;
  deleteBlockedReason?: string;
  onDeleteDept?: () => void;
  isRenaming?: boolean;
  onRenameStart?: () => void;
  onRenameDone?: () => void;
  onRenamed?: () => Promise<void>;
  actor: ScopeHolder;
  iCanSetLevels: boolean;
  onPatch: (userId: string, dto: Patch) => Promise<void>;
  onRemove: (p: RosterMember) => void;
  onAdded: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  // L1/L2 两张卡没有固定部门，能不能往里加人由"能否定级别"决定（只有 L1），
  // 部门卡则看该部门是否在自己的半径内。
  const canAddHere: boolean = module ? canManageModule(actor, module) : canSetLevels(actor);
  const l2People: RosterMember[] = people.filter((p: RosterMember) => p.level === 'L2');

  return (
    <Card className="p-3.5 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{title}</div>
          {hint && <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</div>}
        </div>
        <span className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] font-mono text-muted-foreground">{people.length}</span>
          {/* 组别操作（仅 L1，且只对真实组别卡片显示，不含 L1/L2 那两张虚拟卡）。
              删除按钮始终显示，但组里还有人时置灰并说明原因——规则可见比藏起来好。 */}
          {dept && onRenameStart && iCanSetLevels && (
            <button
              type="button"
              onClick={onRenameStart}
              title="重命名这个组别（引用该组别的历史记录会一起改名）"
              className="text-muted-foreground/50 hover:text-primary transition-colors"
            >
              <Pencil className="size-3" />
            </button>
          )}
          {dept && canDeleteDept && onDeleteDept && (
            <button
              type="button"
              onClick={deleteBlockedReason ? undefined : onDeleteDept}
              disabled={!!deleteBlockedReason}
              title={deleteBlockedReason ?? '删除这个组别'}
              className={`transition-colors ${deleteBlockedReason ? 'text-muted-foreground/20 cursor-not-allowed' : 'text-muted-foreground/50 hover:text-destructive'}`}
            >
              <Trash2 className="size-3" />
            </button>
          )}
        </span>
      </div>

      {dept && isRenaming && onRenamed && onRenameDone && (
        <RenameDepartmentInline dept={dept} onDone={onRenameDone} onRenamed={onRenamed} />
      )}

      {people.length > 0 ? (
        <div className="flex flex-wrap gap-x-1.5 gap-y-2.5">
          {people.map((p: RosterMember) => (
            <MemberTile
              key={p.userId}
              person={p}
              actor={actor}
              iCanSetLevels={iCanSetLevels}
              levelOptions={module ? (iCanSetLevels ? ['L3', 'L4', 'member'] : []) : iCanSetLevels ? ADMIN_LEVELS : []}
              onPatch={onPatch}
              onRemove={onRemove}
            />
          ))}
        </div>
      ) : (
        <div className="text-[11px] text-muted-foreground/70">暂无成员</div>
      )}

      {/* L2 的半径是唯一必须显式声明的边界，所以在它自己的卡片里单独给一块勾选区 */}
      {showRadius && l2People.map((p: RosterMember) => (
        <RadiusPicker key={p.userId} person={p} actor={actor} moduleNames={moduleNames} onPatch={onPatch} />
      ))}

      {canAddHere && (
        <div className="mt-auto pt-1">
          {adding ? (
            <AddMemberInline
              level={addLevel}
              fixedModule={module}
              moduleNames={moduleNames}
              actor={actor}
              iCanSetLevels={iCanSetLevels}
              onDone={() => setAdding(false)}
              onAdded={async () => { setAdding(false); await onAdded(); }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="w-full flex items-center justify-center gap-1 rounded-lg border border-dashed border-border py-1.5 text-[11px] text-muted-foreground hover:text-primary hover:border-primary/50 transition-colors"
            >
              <Plus className="size-3" /> 添加成员
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function MemberTile({
  person,
  actor,
  iCanSetLevels,
  levelOptions,
  onPatch,
  onRemove,
}: {
  person: RosterMember;
  actor: ScopeHolder;
  iCanSetLevels: boolean;
  levelOptions: AdminLevel[];
  onPatch: (userId: string, dto: Patch) => Promise<void>;
  onRemove: (p: RosterMember) => void;
}) {
  const { name, avatarUrl } = usePersonInfo(person.userId);
  const [editing, setEditing] = useState(false);
  const displayName: string = person.name || name || person.userId.slice(-4);
  const canManageThis: boolean = canManagePerson(actor, person);
  const canChangeLevel: boolean = iCanSetLevels && canManageThis && levelOptions.length > 0;

  // 改级别时就地换成下拉，避免再开弹层——一页几十个人，弹层会很重。
  if (editing && canChangeLevel) {
    return (
      <div className="w-[68px] flex flex-col items-center gap-1">
        <BigAvatar name={displayName} avatarUrl={avatarUrl} size={44} />
        <div className="text-[10px] leading-tight truncate w-full text-center">{displayName}</div>
        <Select
          value={person.level}
          onValueChange={(v) => { setEditing(false); void onPatch(person.userId, { level: v as AdminLevel }); }}
        >
          <SelectTrigger size="sm" className="h-6 text-[10px] w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {levelOptions.map((l: AdminLevel) => (
              <SelectItem key={l} value={l} className="text-xs">
                {LEVEL_LABEL[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  const badgeCls = `inline-flex items-center rounded-full px-1.5 py-px text-[9px] font-mono tracking-wider ring-1 ${LEVEL_TONE[person.level]}`;

  return (
    <div className="group w-[68px] flex flex-col items-center gap-1 relative">
      <BigAvatar name={displayName} avatarUrl={avatarUrl} size={44} />
      <div className="text-[10px] leading-tight truncate w-full text-center" title={displayName}>
        {displayName}
      </div>
      {canChangeLevel ? (
        <button type="button" onClick={() => setEditing(true)} className={`${badgeCls} transition hover:ring-primary/60`} title="点击调整级别">
          {LEVEL_SHORT[person.level]}
        </button>
      ) : (
        <span className={badgeCls}>{LEVEL_SHORT[person.level]}</span>
      )}
      {canManageThis && (
        <button
          type="button"
          onClick={() => onRemove(person)}
          title="移除"
          className="absolute -top-1 -right-1 hidden group-hover:grid place-items-center size-5 rounded-full bg-destructive text-white shadow-sm"
        >
          <Trash2 className="size-3" />
        </button>
      )}
    </div>
  );
}

function RadiusPicker({
  person,
  actor,
  moduleNames,
  onPatch,
}: {
  person: RosterMember;
  actor: ScopeHolder;
  moduleNames: ModuleName[];
  onPatch: (userId: string, dto: Patch) => Promise<void>;
}) {
  const current: ModuleName[] = person.managedModules ?? [];
  const canEditThis: boolean = canManagePerson(actor, person);
  return (
    <div className="rounded-lg bg-muted/40 px-2.5 py-2">
      <div className="text-[10px] text-muted-foreground mb-1.5">
        {person.name ?? person.userId.slice(-4)} 的管理半径（{current.length} 个部门）
        {current.length === 0 && <span className="text-destructive"> · 至少勾一个</span>}
      </div>
      <div className="flex flex-wrap gap-x-2.5 gap-y-1">
        {moduleNames.map((m: ModuleName) => {
          const editable: boolean = canEditThis && canManageModule(actor, m);
          return (
            <label key={m} className={`flex items-center gap-1 text-[10px] ${editable ? 'cursor-pointer' : 'opacity-50'}`}>
              <input
                type="checkbox"
                className="promise-optional-toggle"
                checked={current.includes(m)}
                disabled={!editable}
                onChange={(e) =>
                  void onPatch(person.userId, {
                    managedModules: e.target.checked ? [...current, m] : current.filter((x: ModuleName) => x !== m),
                  })
                }
              />
              {m}
            </label>
          );
        })}
      </div>
    </div>
  );
}

function AddMemberInline({
  level,
  fixedModule,
  moduleNames,
  actor,
  iCanSetLevels,
  onDone,
  onAdded,
}: {
  level: AdminLevel;
  fixedModule?: ModuleName;
  moduleNames: ModuleName[];
  actor: ScopeHolder;
  iCanSetLevels: boolean;
  onDone: () => void;
  onAdded: () => Promise<void>;
}) {
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [nextLevel, setNextLevel] = useState<AdminLevel>(level);
  const [module, setModule] = useState<ModuleName | ''>(fixedModule ?? '');
  const [managed, setManaged] = useState<ModuleName[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(): Promise<void> {
    if (!selectedUser?.user_id) return;
    setSaving(true);
    setErr('');
    try {
      await rosterApi.addRosterMember({
        userId: selectedUser.user_id,
        name: getI18nText(selectedUser.name) || undefined,
        email: selectedUser.email || undefined,
        level: nextLevel,
        module: fixedModule ?? (module || undefined),
        managedModules: nextLevel === 'L2' ? managed : undefined,
      });
      await onAdded();
    } catch (e) {
      setErr(errorMessage(e));
      setSaving(false);
    }
  }

  const levelOptions: AdminLevel[] = fixedModule
    ? (iCanSetLevels ? ['L3', 'L4', 'member'] : ['member'])
    : (iCanSetLevels ? ADMIN_LEVELS : ['member']);
  const needsScope: boolean = nextLevel === 'L2';
  const invalid: boolean =
    !selectedUser?.user_id || (needsScope && managed.length === 0) || (!fixedModule && nextLevel !== 'L1' && !module);

  return (
    <div className="rounded-lg border border-dashed p-2 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">添加成员</span>
        <button type="button" onClick={onDone} className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <UserSelect value={selectedUser} valueType="object" onChange={setSelectedUser} placeholder="搜索并选择一个人" />
      <div className="flex items-center gap-1.5">
        <Select value={nextLevel} onValueChange={(v) => setNextLevel(v as AdminLevel)}>
          <SelectTrigger size="sm" className="h-7 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {levelOptions.map((l: AdminLevel) => (
              <SelectItem key={l} value={l} className="text-xs">
                {LEVEL_LABEL[l]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!fixedModule && nextLevel !== 'L1' && (
          <Select value={module || undefined} onValueChange={(v) => setModule(v as ModuleName)}>
            <SelectTrigger size="sm" className="h-7 text-xs flex-1">
              <SelectValue placeholder="选择部门" />
            </SelectTrigger>
            <SelectContent>
              {moduleNames.filter((m: ModuleName) => canManageModule(actor, m)).map((m: ModuleName) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" className="h-7 text-xs px-2" onClick={submit} disabled={saving || invalid}>
          {saving ? '…' : <Check className="size-3.5" />}
        </Button>
      </div>
      {needsScope && (
        <div className="flex flex-wrap gap-x-2.5 gap-y-1">
          {moduleNames.filter((m: ModuleName) => canManageModule(actor, m)).map((m: ModuleName) => (
            <label key={m} className="flex items-center gap-1 text-[10px] cursor-pointer">
              <input
                type="checkbox"
                className="promise-optional-toggle"
                checked={managed.includes(m)}
                onChange={(e) => setManaged((prev) => (e.target.checked ? [...prev, m] : prev.filter((x: ModuleName) => x !== m)))}
              />
              {m}
            </label>
          ))}
        </div>
      )}
      {err && <div className="text-[10px] text-destructive">{err}</div>}
    </div>
  );
}

// 新增组别：组别现在是数据驱动的（department 表），只有 L1 能增删。
// 「有周里程碑」决定该组在里程碑页是否出现；「参与模块排名」决定是否进排名比较。
function AddDepartmentInline({
  onDone,
  onAdded,
}: {
  onDone: () => void;
  onAdded: () => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [hasMilestone, setHasMilestone] = useState(true);
  const [ranked, setRanked] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(): Promise<void> {
    const trimmed: string = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setErr('');
    try {
      await departmentsApi.createDepartment({ name: trimmed, hasMilestone, ranked });
      await onAdded();
    } catch (e) {
      setErr(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-2 space-y-2 max-w-md">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">新增组别</span>
        <button type="button" onClick={onDone} className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="组别名称，如「结构模块」"
          className="h-7 flex-1 text-xs"
        />
        <Button size="sm" className="h-7 text-xs px-2" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? '…' : <Check className="size-3.5" />}
        </Button>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
          <input
            type="checkbox"
            className="promise-optional-toggle"
            checked={hasMilestone}
            onChange={(e) => setHasMilestone(e.target.checked)}
          />
          有周里程碑
        </label>
        <label className="flex items-center gap-1 text-[10px] cursor-pointer">
          <input
            type="checkbox"
            className="promise-optional-toggle"
            checked={ranked}
            onChange={(e) => setRanked(e.target.checked)}
          />
          参与模块排名
        </label>
      </div>
      {err && <div className="text-[10px] text-destructive">{err}</div>}
    </div>
  );
}

// 重命名组别：组别名就是各业务表里 module 字段的取值，后端会把所有引用一起改名，
// 所以改完要同时刷新组别清单和花名册（成员的归属名跟着变了）。
function RenameDepartmentInline({
  dept,
  onDone,
  onRenamed,
}: {
  dept: DepartmentRecord;
  onDone: () => void;
  onRenamed: () => Promise<void>;
}) {
  const [name, setName] = useState(dept.name);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function submit(): Promise<void> {
    const trimmed: string = name.trim();
    if (!trimmed || trimmed === dept.name) {
      onDone();
      return;
    }
    setSaving(true);
    setErr('');
    try {
      await departmentsApi.renameDepartment(dept.id, { name: trimmed });
      await onRenamed();
    } catch (e) {
      setErr(errorMessage(e));
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-dashed p-2 space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Input
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void submit();
            if (e.key === 'Escape') onDone();
          }}
          className="h-7 flex-1 text-xs"
        />
        <Button size="sm" className="h-7 text-xs px-2" onClick={submit} disabled={saving || !name.trim()}>
          {saving ? '…' : <Check className="size-3.5" />}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={onDone} disabled={saving}>
          <X className="size-3.5" />
        </Button>
      </div>
      {err && <div className="text-[10px] text-destructive">{err}</div>}
    </div>
  );
}
