import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Avatar } from "../components/Avatar";
import { Card } from "../components/Card";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { ImeInput } from "../components/ImeSafeText";
import type { DirectoryPerson, Role, RosterItem } from "../types";

const MODULES = ["洗净模块", "烘干模块", "熨烫模块", "净水模块", "软件组"];

// Admin-only: every role in this app is ultimately derived from this one
// place (who's in which module, with what role), so this is the actual
// source of truth for the permission model — everything else just reads
// from it. Adding someone searches the live Feishu directory rather than
// being limited to people already known to this app, since the whole
// point is to bring in people who aren't in the roster yet.
export default function OrgManagement() {
  const [roster, setRoster] = useState<RosterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState<RosterItem | null>(null);
  const [removeError, setRemoveError] = useState("");
  const [removeBusy, setRemoveBusy] = useState(false);

  async function load() {
    const res = await api.get<{ items: RosterItem[] }>("/roster");
    setRoster(res.items);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function confirmRemove() {
    if (!removing) return;
    setRemoveBusy(true);
    setRemoveError("");
    try {
      await api.delete(`/org/members/${removing.openId}`);
      setRemoving(null);
      await load();
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoveBusy(false);
    }
  }

  if (loading) return <div className="text-brand-muted text-sm">加载中…</div>;

  const admins = roster.filter((r) => r.role === "admin");
  const byModule = new Map<string, RosterItem[]>();
  for (const mod of MODULES) byModule.set(mod, []);
  roster.forEach((r) => {
    if (r.role !== "admin" && r.module && byModule.has(r.module)) {
      byModule.get(r.module)!.push(r);
    }
  });

  return (
    <div className="space-y-5">
      <OrgSection
        title="管理员"
        subtitle="可管理所有模块与评级；也可选填一个兼任模块"
        people={admins}
        onRemove={(p) => setRemoving(p)}
        addRole="admin"
        allowModulePicker
        onAdded={load}
      />
      {MODULES.map((mod) => {
        const people = byModule.get(mod) ?? [];
        const leads = people.filter((p) => p.role === "lead");
        const members = people.filter((p) => p.role === "member");
        return (
          <OrgSection
            key={mod}
            title={mod}
            people={[...leads, ...members]}
            onRemove={(p) => setRemoving(p)}
            addRole="member"
            fixedModule={mod}
            onAdded={load}
          />
        );
      })}

      {removing && (
        <ConfirmDialog
          title="移除这个人？"
          message={`确认将「${removing.name}」从${removing.role === "admin" ? "管理员" : removing.module ?? "该模块"}移除吗？这不会删除TA之前的历史数据，只是移除当前的角色/模块归属。${
            removeError ? `\n\n上次操作失败：${removeError}` : ""
          }`}
          confirmLabel="确认移除"
          busy={removeBusy}
          onConfirm={confirmRemove}
          onCancel={() => setRemoving(null)}
        />
      )}
    </div>
  );
}

function roleLabel(role: Role): string {
  if (role === "admin") return "管理员";
  if (role === "lead") return "负责人";
  return "组员";
}

function OrgSection({
  title,
  subtitle,
  people,
  onRemove,
  addRole,
  fixedModule,
  allowModulePicker,
  onAdded,
}: {
  title: string;
  subtitle?: string;
  people: RosterItem[];
  onRemove: (p: RosterItem) => void;
  addRole: "admin" | "member";
  fixedModule?: string;
  allowModulePicker?: boolean;
  onAdded: () => void;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-brand-text">{title}</div>
          {subtitle && <div className="text-xs text-brand-label mt-0.5">{subtitle}</div>}
        </div>
        <div className="eyebrow">{people.length} 人</div>
      </div>

      <div className="mt-3 space-y-1.5">
        {people.map((p) => (
          <div
            key={p.openId}
            className="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-brand-panel group"
          >
            <Avatar name={p.name} avatarUrl={p.avatarUrl} size={28} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-brand-text truncate">{p.name}</div>
            </div>
            <span className="eyebrow shrink-0">
              {roleLabel(p.role)}
              {p.role === "admin" && p.module ? ` · ${p.module}` : ""}
            </span>
            <button
              onClick={() => onRemove(p)}
              className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity text-xs shrink-0"
              title="移除"
            >
              移除
            </button>
          </div>
        ))}
        {people.length === 0 && <div className="text-xs text-brand-label px-2">暂无人员</div>}
      </div>

      <AddMemberForm defaultRole={addRole} fixedModule={fixedModule} allowModulePicker={allowModulePicker} onAdded={onAdded} />
    </Card>
  );
}

function AddMemberForm({
  defaultRole,
  fixedModule,
  allowModulePicker,
  onAdded,
}: {
  defaultRole: "admin" | "member";
  fixedModule?: string;
  allowModulePicker?: boolean;
  onAdded: () => void;
}) {
  const [selected, setSelected] = useState<DirectoryPerson | null>(null);
  const [role, setRole] = useState<Role>(defaultRole === "admin" ? "admin" : "member");
  const [module, setModule] = useState<string>(fixedModule ?? "");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!selected) return;
    setSaving(true);
    setErr("");
    try {
      await api.post("/org/members", {
        openId: selected.openId,
        name: selected.name,
        avatarUrl: selected.avatarUrl,
        role,
        module: fixedModule ?? (module || undefined),
      });
      setSelected(null);
      setModule(fixedModule ?? "");
      setRole(defaultRole === "admin" ? "admin" : "member");
      onAdded();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-brand-borderLight">
      {!selected ? (
        <PersonPicker onSelect={setSelected} />
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 bg-brand-panel rounded-lg px-2.5 py-1.5">
            <Avatar name={selected.name} avatarUrl={selected.avatarUrl} size={24} />
            <span className="text-sm text-brand-text flex-1">{selected.name}</span>
            <button onClick={() => setSelected(null)} className="text-brand-label hover:text-brand-blue text-xs">
              重新选择
            </button>
          </div>
          <div className="flex items-center gap-2">
            {!fixedModule && (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="border border-brand-border rounded-lg px-2 py-1 text-xs"
              >
                <option value="admin">管理员</option>
                <option value="lead">负责人</option>
                <option value="member">组员</option>
              </select>
            )}
            {fixedModule && (
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
                className="border border-brand-border rounded-lg px-2 py-1 text-xs"
              >
                <option value="lead">负责人</option>
                <option value="member">组员</option>
              </select>
            )}
            {(allowModulePicker || (!fixedModule && role !== "admin")) && (
              <select
                value={module}
                onChange={(e) => setModule(e.target.value)}
                className="border border-brand-border rounded-lg px-2 py-1 text-xs flex-1"
              >
                <option value="">{role === "admin" ? "不兼任模块" : "选择模块"}</option>
                {MODULES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={submit}
              disabled={saving || (!fixedModule && role !== "admin" && !module)}
              className="px-3 py-1 rounded-lg bg-brand-blue text-white text-xs disabled:opacity-50 hover:bg-brand-navy ml-auto"
            >
              {saving ? "添加中…" : "确认添加"}
            </button>
          </div>
          {err && <div className="text-[10px] text-red-500">{err}</div>}
        </div>
      )}
    </div>
  );
}

function PersonPicker({ onSelect }: { onSelect: (p: DirectoryPerson) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DirectoryPerson[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setErr("");
    const t = setTimeout(async () => {
      try {
        const res = await api.get<{ items: DirectoryPerson[] }>(`/org/directory?q=${encodeURIComponent(query)}`);
        setResults(res.items);
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, open]);

  return (
    <div ref={boxRef} className="relative">
      <ImeInput
        value={query}
        onChange={setQuery}
        onFocus={() => setOpen(true)}
        placeholder="搜索姓名，添加一个人…"
        className="w-full border border-brand-border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/20"
      />
      {open && (
        <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-brand-border rounded-lg shadow-md max-h-64 overflow-y-auto">
          {loading && <div className="px-3 py-2 text-xs text-brand-label">搜索中…</div>}
          {!loading && err && <div className="px-3 py-2 text-xs text-red-500">{err}</div>}
          {!loading && !err && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-brand-label">没有匹配的人</div>
          )}
          {!loading &&
            results.map((p) => (
              <button
                key={p.openId}
                onClick={() => {
                  onSelect(p);
                  setOpen(false);
                  setQuery("");
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-brand-panel text-left"
              >
                <Avatar name={p.name} avatarUrl={p.avatarUrl} size={24} />
                <span className="text-sm text-brand-text">{p.name}</span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
