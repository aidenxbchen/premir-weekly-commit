import { useEffect, useState } from "react";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { CheckSelect } from "../components/CheckSelect";
import { CommitmentForm } from "../components/CommitmentForm";
import { EditableDateTimeField } from "../components/EditableDateTimeField";
import { EditableField } from "../components/EditableField";
import { GradeSection } from "../components/GradeSection";
import { MilestoneCard } from "../components/MilestoneCard";
import { finalGrade, personRankScore, trimLeadingEmptyHistory, type HistoryEntry } from "../lib/gradeScore";
import { plainText } from "../lib/richText";
import { weeksUpTo } from "../lib/week";
import type {
  BitableRecord,
  CommitmentFields,
  Grade,
  Me,
  MilestoneFields,
  RatingFields,
  RosterItem,
} from "../types";

const HISTORY_WEEKS = 8;
const VALID_GRADES: string[] = ["A", "B+", "B", "C"];

export default function ModuleCommitments({
  me,
  week,
  moduleName,
}: {
  me: Me;
  week: string;
  moduleName: string;
}) {
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [milestone, setMilestone] = useState<BitableRecord<MilestoneFields> | undefined>();
  const [commitments, setCommitments] = useState<BitableRecord<CommitmentFields>[]>([]);
  const [ratingsByWeek, setRatingsByWeek] = useState<Map<string, Map<string, BitableRecord<RatingFields>>>>(
    new Map()
  );
  const [loading, setLoading] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const historyWeeks = weeksUpTo(me.week, HISTORY_WEEKS);
  const isMyModule = me.module === moduleName;
  const isLeadOfModule = me.role === "lead" && me.module === moduleName;

  // `loading` only ever starts true (for the very first paint) and is set
  // false once — every subsequent call (a week/module change, or onSaved
  // firing after any edit) just swaps the data in silently instead of
  // blanking the page back to "加载中…", which read as a jarring full-page
  // refresh on something as small as one checkbox click.
  async function loadWeekData() {
    const [rosterRes, milestonesRes, commitmentsRes] = await Promise.all([
      api.get<{ items: RosterItem[] }>("/roster"),
      api.get<{ items: BitableRecord<MilestoneFields>[] }>(`/milestones?week=${week}`),
      api.get<{ items: BitableRecord<CommitmentFields>[] }>(
        `/commitments?module=${encodeURIComponent(moduleName)}&week=${week}`
      ),
    ]);
    setRoster(rosterRes.items);
    setMilestone(milestonesRes.items.find((i) => i.fields["模块"] === moduleName));
    setCommitments(commitmentsRes.items);
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
    loadWeekData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week, moduleName]);

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.week]);

  if (loading || !historyLoaded) return <div className="text-brand-muted text-sm">加载中…</div>;

  const lead = roster.find((r) => r.module === moduleName && r.role === "lead");
  const members = roster.filter((r) => r.module === moduleName).sort((a, b) => (a.role === "lead" ? -1 : b.role === "lead" ? 1 : 0));

  const rawHistory: HistoryEntry[] = historyWeeks.map((w) => {
    const f = lead ? ratingsByWeek.get(w)?.get(lead.openId)?.fields : undefined;
    return { week: w, grade: finalGrade(f?.["周一评级"], f?.["周五评级"]) };
  });
  const history = lead ? trimLeadingEmptyHistory(rawHistory) : [];
  const score = personRankScore(rawHistory.map((h) => h.grade));
  const leadAvatarUrl = lead?.avatarUrl;
  const commitmentsReady =
    commitments.length > 0 && commitments.every((c) => c.fields["达标"] === "✅" || c.fields["达标"] === "❌");

  const commitmentsByPerson = new Map<string, BitableRecord<CommitmentFields>[]>();
  commitments.forEach((c) => {
    const id = c.fields["姓名"]?.[0]?.id;
    if (!id) return;
    if (!commitmentsByPerson.has(id)) commitmentsByPerson.set(id, []);
    commitmentsByPerson.get(id)!.push(c);
  });

  return (
    <div className="space-y-6">
      <MilestoneCard
        me={me}
        week={week}
        module={moduleName}
        lead={lead}
        leadAvatarUrl={leadAvatarUrl}
        history={history}
        score={score}
        record={milestone}
        commitmentsReady={commitmentsReady}
        onSaved={loadWeekData}
        onWeekChange={() => {}}
        compact
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
        {members.map((person) => {
          const isOwnCard = person.openId === me.openId;
          const personCommitments = commitmentsByPerson.get(person.openId) ?? [];

          return (
            <PersonCard
              key={person.openId}
              person={person}
              avatarUrl={person.avatarUrl}
              moduleName={moduleName}
              week={week}
              commitments={personCommitments}
              isOwnCard={isOwnCard && isMyModule}
              // 里程碑页面（管理员管各模块）和周承诺页面（负责人管本组）职责不同：
              // 这里负责人可以勾选组内其他成员的交付物复选框，但不能勾自己的——
              // 跟评级一样，自己的卡片留给管理员来处理。
              canCheck={me.role === "admin" || (isLeadOfModule && !isOwnCard)}
              // A lead grades their members but never themselves — that's
              // admin's job, same as module-level 周末/周一评级.
              canGrade={me.role === "admin" || (isLeadOfModule && !isOwnCard)}
              showForm={isOwnCard && isMyModule && showForm}
              onToggleForm={setShowForm}
              onSaved={loadWeekData}
            />
          );
        })}
      </div>
    </div>
  );
}

function PersonCard({
  person,
  avatarUrl,
  moduleName,
  week,
  commitments,
  isOwnCard,
  canCheck,
  canGrade,
  showForm,
  onToggleForm,
  onSaved,
}: {
  person: RosterItem;
  avatarUrl?: string;
  moduleName: string;
  week: string;
  commitments: BitableRecord<CommitmentFields>[];
  isOwnCard: boolean;
  canCheck: boolean;
  canGrade: boolean;
  showForm: boolean;
  onToggleForm: (v: boolean) => void;
  onSaved: () => void;
}) {
  return (
    <div className="bg-white rounded-2xl border border-brand-border shadow-[0_2px_16px_rgba(22,41,107,0.08)] overflow-hidden flex flex-col">
      <div className="p-4">
        <div className="bg-brand-blue rounded-xl px-4 py-3 flex items-center gap-2.5">
          <Avatar name={person.name} avatarUrl={avatarUrl} size={32} />
          <div className="min-w-0">
            <div className="text-white font-semibold text-sm truncate">{person.name}</div>
            <div className="text-white/70 text-[11px]">{person.role === "lead" ? "负责人" : "组员"}</div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4 space-y-3 flex-1">
        {commitments.map((c) => (
          <DeliverableCard
            key={c.record_id}
            record={c}
            moduleName={moduleName}
            isOwner={isOwnCard}
            canCheck={canCheck}
            onSaved={onSaved}
          />
        ))}

        {isOwnCard &&
          commitments.length < 4 &&
          (showForm ? (
            <CommitmentForm
              week={week}
              onSaved={() => {
                onToggleForm(false);
                onSaved();
              }}
              onCancel={() => onToggleForm(false)}
            />
          ) : (
            <button
              onClick={() => onToggleForm(true)}
              className="w-full border-2 border-dashed border-brand-border rounded-xl py-2.5 text-brand-label hover:text-brand-blue hover:border-brand-blue transition-colors text-sm"
            >
              + 添加一条承诺
            </button>
          ))}

        {commitments.length === 0 && !isOwnCard && (
          <div className="text-xs text-brand-label">本周还没有承诺</div>
        )}

        {/* The module lead's own grade comes solely from the 各模块周里程碑
            page now (admin grading the module = grading the lead) — see
            server/src/lib/ratingsSync.ts's syncGradeToOwnCommitments, which
            mirrors that grade onto these commitment records automatically.
            No separate grading UI here for the lead's own card, so there's
            only ever one place a lead gets graded, not two. */}
        {commitments.length > 0 && person.role !== "lead" && (
          <PersonGradeCards moduleName={moduleName} commitments={commitments} canGrade={canGrade} onSaved={onSaved} />
        )}
      </div>
    </div>
  );
}

// One grade per person per week, not per deliverable — written to every one
// of that person's commitment records for the week so the lock/self-grading
// rules already enforced per-record (see server/src/routes/grade.ts) apply
// uniformly no matter which record happens to be "first".
function PersonGradeCards({
  moduleName,
  commitments,
  canGrade,
  onSaved,
}: {
  moduleName: string;
  commitments: BitableRecord<CommitmentFields>[];
  canGrade: boolean;
  onSaved: () => void;
}) {
  const first = commitments[0].fields;

  // Same two gates as milestone grading (see MilestoneCard.tsx): every
  // deliverable needs a ✅/❌ 达标 mark before either grade can be given,
  // and 周一评级 needs 周末评级 to already exist. Mirrored server-side in
  // grade.ts — this is just so the UI shows why, not the real boundary.
  const allChecked = commitments.every((c) => c.fields["达标"] === "✅" || c.fields["达标"] === "❌");
  const weekendGraded = !!first["周末评级"] && VALID_GRADES.includes(first["周末评级"]);
  const canGradeWeekend = canGrade && allChecked;
  const canGradeMonday = canGrade && allChecked && weekendGraded;
  const weekendBlockedReason = canGrade && !allChecked ? "请先完成所有复选框" : undefined;
  const mondayBlockedReason = !canGrade
    ? undefined
    : !allChecked
      ? "请先完成所有复选框"
      : !weekendGraded
        ? "请先完成周末评级"
        : undefined;

  async function submit(which: "weekend" | "monday", grade: Grade, note: string) {
    await Promise.all(
      commitments.map((c) =>
        api.post(`/grade/commitment/${moduleName}/${c.record_id}`, { which, grade, note })
      )
    );
    onSaved();
  }

  return (
    <div className="pt-1 space-y-2">
      <div className="border border-brand-border rounded-xl p-3">
        <GradeSection
          label="周末评级"
          currentGrade={first["周末评级"]}
          canGrade={canGradeWeekend}
          blockedReason={weekendBlockedReason}
          onSubmit={(g, n) => submit("weekend", g, n)}
        />
      </div>
      <div className="border border-brand-border rounded-xl p-3">
        <GradeSection
          label="周一评级"
          currentGrade={first["周一评级"]}
          canGrade={canGradeMonday}
          blockedReason={mondayBlockedReason}
          onSubmit={(g, n) => submit("monday", g, n)}
        />
      </div>
    </div>
  );
}

function DeliverableCard({
  record,
  moduleName,
  isOwner,
  canCheck,
  onSaved,
}: {
  record: BitableRecord<CommitmentFields>;
  moduleName: string;
  isOwner: boolean;
  canCheck: boolean;
  onSaved: () => void;
}) {
  const f = record.fields;
  const locked = f["考核人已确认"] === true;
  const canEditOwn = isOwner && !locked;
  const check = f["达标"] as "✅" | "❌" | undefined;

  async function patch(field: string, value: unknown) {
    await api.patch(`/commitments/${record.record_id}`, { module: moduleName, [field]: value });
    onSaved();
  }

  return (
    <div className="border border-brand-border rounded-xl p-3">
      <div className="flex gap-2">
        <div className="pt-0.5">
          <CheckSelect value={check} canEdit={canCheck} onChange={(v) => patch("check", v)} />
        </div>
        <div className="flex-1 min-w-0 space-y-2.5">
          <EditableField
            label="交付物"
            value={plainText(f["交付物"])}
            canEdit={canEditOwn}
            onSave={(v) => patch("deliverable", v)}
          />
          <EditableField
            label="验收标准"
            value={plainText(f["验收标准"])}
            canEdit={canEditOwn}
            onSave={(v) => patch("criteria", v)}
          />
          <div className="grid grid-cols-2 gap-2">
            <EditableDateTimeField
              label="开始时间"
              valueMs={f["开始时间"]}
              canEdit={canEditOwn}
              onSave={(v) => patch("startTime", v)}
            />
            <EditableDateTimeField
              label="截止时间"
              valueMs={f["截止时间"]}
              canEdit={canEditOwn}
              onSave={(v) => patch("endTime", v)}
            />
          </div>
          <EditableField
            label="依赖与风险"
            value={plainText(f["依赖与风险"])}
            canEdit={canEditOwn}
            onSave={(v) => patch("risk", v)}
          />
        </div>
      </div>
    </div>
  );
}
