import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useCurrentUserProfile } from '@lark-apaas/client-toolkit/hooks/useCurrentUserProfile';
import { Flag, LayoutDashboard, Network, Plus, ShieldCheck, UserRound } from 'lucide-react';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SketchbookWelcome } from '@/components/SketchbookWelcome';
import { WeekPicker } from '@/components/WeekPicker';
import { meApi, weekApi } from '@/api';
import { errorMessage } from '@/utils/error';
import { usePersonInfo } from '@/hooks/usePersonInfo';
import { CommentInboxProvider, PersonalUnreadDot } from '@/components/CommentInbox';
import { BigAvatar } from '@/components/BigAvatar';
import type { MeResponse, TeamRole } from '@shared/api.interface';

const ROLE_FALLBACK_LABEL: Record<TeamRole, string> = { admin: '管理员', lead: '负责人', member: '组员', reader: '阅读者' };

// 加载页进度条允许爬到的高度：等待身份识别是大头（一次完整的登录态解析），
// 拉取排行榜数据是收尾。
const PHASE_LABEL = { auth: '登录中…', data: '同步飞书数据…', done: '准备就绪' } as const;
type LoadPhase = keyof typeof PHASE_LABEL;
const HOT_RELOAD_ENTRY_KEY = 'anever:preserve-workspace-on-hot-reload';
const viteHot = (import.meta as ImportMeta & {
  hot?: { on: (event: 'vite:beforeFullReload', callback: () => void) => void };
}).hot;

if (viteHot) {
  viteHot.on('vite:beforeFullReload', () => {
    sessionStorage.setItem(HOT_RELOAD_ENTRY_KEY, 'true');
  });
}

// 加载页（领奖台 + 进度条）至少展示这么久，哪怕数据秒回也不会一闪而过看不清。

const NAV_ITEMS = [
  { to: '/', label: '个人中心', icon: UserRound },
  { to: '/milestones', label: '周里程碑', icon: Flag },
  { to: '/commitments', label: '周承诺', icon: LayoutDashboard },
];
const ADMIN_ITEMS = [
  { to: '/ratings', label: '全员评级表', icon: ShieldCheck },
  { to: '/org', label: '组织架构', icon: Network },
];

export interface LayoutContext {
  me: MeResponse;
  week: string;
  setWeek: (week: string) => void;
  reloadMe: () => Promise<void>;
}

const Layout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [notificationEntry] = useState(() => new URLSearchParams(location.search).has('comment')
    ? { pathname: location.pathname, search: location.search } : null);
  const userInfo = useCurrentUserProfile();
  const [me, setMe] = useState<MeResponse | null>(null);
  const { avatarUrl: sidebarAvatarUrl } = usePersonInfo(me?.userId);
  const [week, setWeek] = useState('');
  const [activeWeeks, setActiveWeeks] = useState<string[]>([]);
  const [confirmingNewWeek, setConfirmingNewWeek] = useState(false);
  const [advancingWeek, setAdvancingWeek] = useState(false);
  const [advanceError, setAdvanceError] = useState('');
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('auth');
  const [ready, setReady] = useState(false);
  const [entered, setEntered] = useState(() => {
    const preserveForHotReload = sessionStorage.getItem(HOT_RELOAD_ENTRY_KEY) === 'true';
    sessionStorage.removeItem(HOT_RELOAD_ENTRY_KEY);
    return preserveForHotReload || new URLSearchParams(window.location.search).has('comment');
  });

  async function reloadMe(): Promise<void> {
    const [data, activity] = await Promise.all([meApi.getMe(), weekApi.listActiveWeeks()]);
    setMe(data);
    setActiveWeeks(activity.weeks);
    setWeek((w) => w || data.week);
    setLoadPhase('data');

    setLoadPhase('done');
    setReady(true);
  }

  useEffect(() => {
    reloadMe();
  }, []);

  useEffect(() => {
    // 评论通知仍可直达个人中心并自动展开讨论。
    if (notificationEntry && notificationEntry.pathname !== '/') {
      navigate({ pathname: '/', search: notificationEntry.search }, { replace: true });
    }
  }, [navigate, notificationEntry]);

  function enterWorkspace() {
    // 从任何旧地址进入，按钮都统一落到当前登录者的个人中心。
    navigate({ pathname: '/', search: location.search }, { replace: true });
    setEntered(true);
  }

  async function confirmAdvanceWeek(): Promise<void> {
    setAdvancingWeek(true);
    setAdvanceError('');
    try {
      const { week: newWeek } = await weekApi.advanceWeek(week);
      setMe((prev) => (prev ? { ...prev, week: newWeek } : prev));
      setWeek(newWeek);
      const activity = await weekApi.listActiveWeeks();
      setActiveWeeks(activity.weeks);
      setConfirmingNewWeek(false);
    } catch (e) {
      setAdvanceError(errorMessage(e));
    } finally {
      setAdvancingWeek(false);
    }
  }

  if (!entered || !userInfo?.user_id || !ready || !me || !week) {
    return <SketchbookWelcome ready={!!userInfo?.user_id && ready && !!me && !!week} label={PHASE_LABEL[loadPhase]} onEnter={enterWorkspace} />;
  }

  const isMilestonesPage: boolean = location.pathname === '/milestones';
  const isRatingsOrOrg: boolean = location.pathname === '/ratings' || location.pathname === '/org';
  const currentWeekHasActivity: boolean = activeWeeks.includes(me.week);

  return (
    <CommentInboxProvider key={me.userId}><div className="min-h-screen workspace-shell flex">
      <aside className="workspace-sidebar w-64 shrink-0 min-h-screen text-primary-foreground sticky top-0">
        <div className="p-6 border-b border-white/10">
          <div className="text-xl font-semibold tracking-[0.22em]" style={{ fontFamily: 'Outfit, sans-serif' }}>ANEVER</div>
          <div className="sidebar-person mt-7"><BigAvatar name={userInfo.name} avatarUrl={sidebarAvatarUrl} size={36} /><div className="min-w-0"><div className="text-sm font-semibold truncate">{userInfo.name}</div><div className="text-xs text-primary-foreground/60 mt-0.5 truncate">{me.module ?? ROLE_FALLBACK_LABEL[me.role]}</div></div></div>
        </div>
        <nav className="p-4 space-y-1.5">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              aria-label={item.label}
              className={({ isActive }) =>
                `flex items-center gap-3 w-full text-left px-3.5 py-3 rounded-xl text-sm transition-all ${
                  isActive ? 'bg-white/16 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)]' : 'text-primary-foreground/70 hover:bg-white/7 hover:text-white'
                }`
              }
            >
              <item.icon className="size-4" /><span className="nav-label">{item.label}</span>{item.to === '/' && <PersonalUnreadDot />}
            </NavLink>
          ))}
          {me.level === 'L1' && <><div className="px-3.5 pt-6 pb-2 text-[10px] uppercase tracking-[.2em] text-white/35">管理员界面</div>{ADMIN_ITEMS.map((item) => <NavLink key={item.to} to={item.to} aria-label={item.label} className={({ isActive }) => `flex items-center gap-3 w-full px-3.5 py-3 rounded-xl text-sm transition-all ${isActive ? 'bg-white/16 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)]' : 'text-primary-foreground/70 hover:bg-white/7 hover:text-white'}`}><item.icon className="size-4" /><span className="nav-label">{item.label}</span></NavLink>)}</>}
        </nav>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="workspace-topbar px-8 py-4 flex items-center justify-between sticky top-0 z-10">
          <div className="text-[11px] font-semibold tracking-[0.12em] text-muted-foreground" style={{ fontFamily: 'Outfit, sans-serif' }}>A. Never Stop Becoming...</div>
          <div className="workspace-week-actions">
            {isMilestonesPage && me.level === 'L1' && (
              <button
                className="new-week-button"
                type="button"
                onClick={() => {
                  setAdvanceError('');
                  setConfirmingNewWeek(true);
                }}
              >
                <span><Plus aria-hidden="true" /></span>
                <span className="new-week-copy"><small>{currentWeekHasActivity ? 'NEXT CYCLE' : 'EMPTY WEEK'}</small><strong>{currentWeekHasActivity ? '开启新一周' : '跳过并开启下一周'}</strong></span>
              </button>
            )}
            {!isRatingsOrOrg && <WeekPicker value={week} currentWeek={me.week} activeWeeks={activeWeeks} onChange={setWeek} />}
          </div>
        </header>
        <div className="p-8 xl:p-10 max-w-[1680px] mx-auto">
          <Outlet context={{ me, week, setWeek, reloadMe } satisfies LayoutContext} />
        </div>
      </main>
      <ConfirmDialog
        open={confirmingNewWeek}
        title="开启新的一周？"
        message={`${currentWeekHasActivity ? `当前最新周为 ${me.week}` : `${me.week} 还没有任何周承诺、里程碑或评级，将作为空白周跳过`}，确认后将开启 W${Number(me.week.slice(1)) + 1}，且不可撤销。${
          advanceError ? `\n\n上次操作失败：${advanceError}` : ''
        }`}
        confirmLabel="确认开启"
        busy={advancingWeek}
        onConfirm={confirmAdvanceWeek}
        onCancel={() => setConfirmingNewWeek(false)}
      />
    </div></CommentInboxProvider>
  );
};

export default Layout;
