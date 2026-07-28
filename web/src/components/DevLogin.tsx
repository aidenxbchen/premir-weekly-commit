import { useEffect, useState } from "react";
import { api } from "../api";

interface RosterItem {
  openId: string;
  name: string;
  role: string;
  module?: string;
}

// Local-dev only: lets you pick a roster identity without going through
// Feishu, since silent login only works inside the Feishu client webview.
// The backend refuses these routes when NODE_ENV=production.
export default function DevLogin({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [items, setItems] = useState<RosterItem[]>([]);
  const [err, setErr] = useState("");

  useEffect(() => {
    api
      .get<{ items: RosterItem[] }>("/auth/dev-roster")
      .then((d) => setItems(d.items))
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)));
  }, []);

  async function login(openId: string) {
    await api.post("/auth/dev-login", { openId });
    onLoggedIn();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg p-4">
      <div className="bg-white border border-brand-border rounded-xl p-6 w-full max-w-sm">
        <div className="eyebrow mb-1">PREMIR WEEKLY</div>
        <div className="text-sm text-brand-muted mb-3">本地开发模式（不在飞书客户端内）：选一个身份登录测试</div>
        {err && <div className="text-xs text-red-500 mb-2">{err}</div>}
        <div className="space-y-1 max-h-96 overflow-y-auto">
          {items.map((i) => (
            <button
              key={i.openId}
              onClick={() => login(i.openId)}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-panel flex justify-between items-center"
            >
              <span>{i.name}</span>
              <span className="text-xs text-brand-label">
                {i.role}
                {i.module ? ` · ${i.module}` : ""}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
