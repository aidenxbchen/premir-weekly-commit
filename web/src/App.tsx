import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { api } from "./api";
import { silentLogin } from "./feishuAuth";
import { Avatar } from "./components/Avatar";
import { ConfirmDialog } from "./components/ConfirmDialog";
import DevLogin from "./components/DevLogin";
import { LoadingScreen } from "./components/LoadingScreen";
import { WeekPicker } from "./components/WeekPicker";
import AllMilestones from "./pages/AllMilestones";
import AllRatings from "./pages/AllRatings";
import ModuleCommitments from "./pages/ModuleCommitments";
import OrgManagement from "./pages/OrgManagement";
import { rankPeople, type RankedPerson } from "./lib/ranking";
import { weeksSinceStart } from "./lib/week";
import type { BitableRecord, Me, RatingFields, RosterItem } from "./types";

// The three real steps behind the loading screen's progress bar — each
// raises the ceiling useSmoothProgress creeps toward. Login is the bulk of
// the wait for a fresh session (a full Feishu OAuth round-trip); the data
// step is what actually builds the podium.
const CEILING = { auth: 35, data: 90, done: 100 } as const;
const PHASE_LABEL = { auth: "登录中…", data: "同步飞书数据…", done: "准备就绪" } as const;
type LoadPhase = keyof typeof CEILING;

// The loading screen (podium + progress bar) always shows for at least
// this long, even when auth and the podium data both come back instantly
// — otherwise on a fast connection it just flickers past unseen.
const MIN_LOADING_MS = 7000;

type Status = "loading" | "need-dev-login" | "error" | "ready";

const NAV_ITEMS = [
  { key: "milestones", label: "各模块周里程碑" },
  { key: "ratings", label: "全员评级表" },
  { key: "洗净模块", label: "洗净周承诺" },
  { key: "烘干模块", label: "烘干周承诺" },
  { key: "熨烫模块", label: "熨烫周承诺" },
  { key: "净水模块", label: "净水周承诺" },
] as const;

// Admin-only, always last — org structure is where every permission in
// this app ultimately comes from, so it's kept separate from the
// team-facing pages above rather than mixed in.
const ORG_NAV_ITEM = { key: "org", label: "组织架构管理" } as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"] | typeof ORG_NAV_ITEM.key;

export default function App() {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState("");
  const [me, setMe] = useState<Me | null>(null);
  const [page, setPage] = useState<NavKey>("milestones");
  const [week, setWeek] = useState("");
  const [confirmingNewWeek, setConfirmingNewWeek] = useState(false);
  const [advancingWeek, setAdvancingWeek] = useState(false);
  const [advanceError, setAdvanceError] = useState("");
  // Dev mode means "not running inside the Feishu client webview" — known
  // synchronously up front, not something to infer from a login failure
  // (which never happens if you're already holding a valid session cookie
  // from an earlier local test).
  const [devMode] = useState(() => !(window.h5sdk && window.tt));
  const [loadPhase, setLoadPhase] = useState<LoadPhase>("auth");
  const [topThree, setTopThree] = useState<RankedPerson[] | null>(null);
  // Reset at the top of every loadMe() call (not just once at mount) so
  // the 7s minimum always measures from "we're actually logging this
  // session in" — whether that's the automatic silent-login path or a
  // manual dev-login click — rather than potentially being already-elapsed
  // by the time a real load starts.
  const loadStartRef = useRef(0);

  async function loadMe() {
    loadStartRef.current = Date.now();
    const data = await api.get<Me>("/me");
    setMe(data);
    setWeek((w) => w || data.week);
    setStatus("loading");
    setLoadPhase("data");

    // The podium is cosmetic — this whole block is best-effort. If it fails
    // for any reason, the loading screen just skips straight to the real
    // app instead of getting stuck on it.
    try {
      const historyWeeks = weeksSinceStart(data.week);
      const [rosterRes, ...perWeek] = await Promise.all([
        api.get<{ items: RosterItem[] }>("/roster"),
        ...historyWeeks.map((w) => api.get<{ items: BitableRecord<RatingFields>[] }>(`/ratings?week=${w}`)),
      ]);
      const byWeek = new Map<string, Map<string, BitableRecord<RatingFields>>>();
      historyWeeks.forEach((w, i) => {
        const byPerson = new Map<string, BitableRecord<RatingFields>>();
        perWeek[i].items.forEach((rec) => {
          const id = rec.fields["成员姓名"]?.[0]?.id;
          if (id) byPerson.set(id, rec);
        });
        byWeek.set(w, byPerson);
      });
      setTopThree(rankPeople(rosterRes.items, byWeek, historyWeeks).slice(0, 3));
    } catch {
      // ignore — see comment above
    }

    setLoadPhase("done");
    // Forced floor on the total time this screen is shown — if auth and
    // the podium fetch both came back fast, this is most of the wait; if
    // they were slow, this adds little to nothing on top of them.
    const elapsed = Date.now() - loadStartRef.current;
    await new Promise((r) => setTimeout(r, Math.max(0, MIN_LOADING_MS - elapsed)));
    setStatus("ready");
  }

  async function confirmAdvanceWeek() {
    setAdvancingWeek(true);
    setAdvanceError("");
    try {
      const { week: newWeek } = await api.post<{ week: string }>("/week/advance");
      setMe((prev) => (prev ? { ...prev, week: newWeek } : prev));
      setWeek(newWeek);
      setConfirmingNewWeek(false);
    } catch (e) {
      setAdvanceError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdvancingWeek(false);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await loadMe();
      } catch {
        if (window.h5sdk && window.tt) {
          try {
            await silentLogin();
            await loadMe();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setStatus("error");
          }
        } else {
          setStatus("need-dev-login");
        }
      }
    })();
  }, []);

  async function switchIdentity() {
    await api.post("/auth/logout");
    setMe(null);
    setWeek("");
    setLoadPhase("auth");
    setTopThree(null);
    setStatus("need-dev-login");
  }

  if (status === "loading") {
    return <LoadingScreen ceiling={CEILING[loadPhase]} label={PHASE_LABEL[loadPhase]} topThree={topThree} />;
  }
  if (status === "error") return <Centered>登录失败：{error}</Centered>;
  if (status === "need-dev-login") return <DevLogin onLoggedIn={loadMe} />;
  if (!me || !week) return <LoadingScreen ceiling={CEILING.done} label={PHASE_LABEL.done} topThree={topThree} />;

  const navItems = me.role === "admin" ? [...NAV_ITEMS, ORG_NAV_ITEM] : NAV_ITEMS;
  const pageLabel = navItems.find((n) => n.key === page)?.label ?? "";
  const isModulePage = page !== "milestones" && page !== "ratings" && page !== "org";

  return (
    <div className="min-h-screen bg-brand-bg flex">
      <aside className="w-56 shrink-0 bg-brand-navy min-h-screen text-white">
        <div className="p-5 border-b border-white/10">
          <div className="eyebrow text-[#8fb4ff]">PREMIR</div>
          <div className="mt-2 flex items-center gap-2.5">
            <Avatar name={me.name} avatarUrl={me.avatarUrl} size={36} />
            <div className="min-w-0">
              <div className="font-semibold text-sm truncate">{me.name}</div>
              <div className="text-xs text-[#c7d3ef] mt-0.5 truncate">{me.module ?? "管理员"}</div>
            </div>
          </div>
          {devMode && (
            <button
              onClick={switchIdentity}
              className="mt-2.5 text-xs text-[#8fb4ff] hover:text-white underline underline-offset-2"
            >
              切换身份（本地测试）
            </button>
          )}
        </div>
        <nav className="p-3 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.key}
              onClick={() => setPage(item.key)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                page === item.key ? "bg-brand-blue text-white" : "text-[#c7d3ef] hover:bg-white/5"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="bg-white border-b border-brand-border px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <div className="eyebrow">PREMIR WEEKLY</div>
            <div className="font-semibold text-brand-text mt-0.5">{pageLabel}</div>
          </div>
          <div className="flex items-center gap-2">
            {page === "milestones" && me.role === "admin" && (
              <button
                onClick={() => {
                  setAdvanceError("");
                  setConfirmingNewWeek(true);
                }}
                className="px-3 py-1.5 rounded-lg bg-brand-blue text-white text-sm font-medium hover:bg-brand-navy"
              >
                + NEW
              </button>
            )}
            {page !== "ratings" && page !== "org" && <WeekPicker value={week} currentWeek={me.week} onChange={setWeek} />}
          </div>
        </header>
        <div className="p-8">
          {page === "milestones" && <AllMilestones me={me} week={week} onWeekChange={setWeek} />}
          {page === "ratings" && <AllRatings me={me} />}
          {page === "org" && <OrgManagement />}
          {isModulePage && <ModuleCommitments me={me} week={week} moduleName={page} />}
        </div>
      </main>
      {confirmingNewWeek && (
        <ConfirmDialog
          title="开启新的一周？"
          message={`当前最新周为 ${me.week}，确认后将开启 W${Number(me.week.slice(1)) + 1}，且不可撤销。${
            advanceError ? `\n\n上次操作失败：${advanceError}` : ""
          }`}
          confirmLabel="确认开启"
          busy={advancingWeek}
          onConfirm={confirmAdvanceWeek}
          onCancel={() => setConfirmingNewWeek(false)}
        />
      )}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <div className="min-h-screen flex items-center justify-center text-brand-muted bg-brand-bg">{children}</div>;
}
