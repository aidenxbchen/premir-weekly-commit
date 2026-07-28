import { useState } from "react";
import type { ReactNode } from "react";
import { api } from "../api";
import { plainText } from "../lib/richText";
import type { CommitmentFields } from "../types";
import { Card } from "./Card";
import { ImeTextarea } from "./ImeSafeText";

const inputCls =
  "w-full border border-brand-border rounded-lg px-3 py-2 text-sm leading-normal resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue/20";

function toLocalInput(ms?: number): string {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(s: string): number | undefined {
  if (!s) return undefined;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? undefined : t;
}

export function CommitmentForm({
  week,
  recordId,
  initial,
  onSaved,
  onCancel,
}: {
  week: string;
  recordId?: string;
  initial?: CommitmentFields;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [deliverable, setDeliverable] = useState(plainText(initial?.["交付物"]));
  const [criteria, setCriteria] = useState(plainText(initial?.["验收标准"]));
  const [risk, setRisk] = useState(plainText(initial?.["依赖与风险"]));
  const [startTime, setStartTime] = useState(toLocalInput(initial?.["开始时间"]));
  const [endTime, setEndTime] = useState(toLocalInput(initial?.["截止时间"]));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    if (!deliverable.trim() || !criteria.trim()) {
      setErr("交付物和验收标准不能为空");
      return;
    }
    setSaving(true);
    setErr("");
    const payload = {
      deliverable,
      criteria,
      risk,
      startTime: fromLocalInput(startTime),
      endTime: fromLocalInput(endTime),
    };
    try {
      if (recordId) {
        await api.patch(`/commitments/${recordId}`, payload);
      } else {
        await api.post("/commitments", { week, ...payload });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="space-y-2">
      <Field label="交付物" hint="周五能放在桌上给人看的东西">
        <ImeTextarea value={deliverable} onChange={setDeliverable} rows={2} className={inputCls} />
      </Field>
      <Field label="验收标准" hint="一个不了解细节的人能否对照判断完没完成？">
        <ImeTextarea value={criteria} onChange={setCriteria} rows={2} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="开始时间（选填）">
          <input
            type="datetime-local"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="截止时间（选填）">
          <input
            type="datetime-local"
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="依赖与风险（选填）">
        <ImeTextarea value={risk} onChange={setRisk} rows={2} className={inputCls} />
      </Field>
      {err && <div className="text-xs text-red-500">{err}</div>}
      <div className="flex gap-2 pt-1">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-brand-blue text-white text-sm disabled:opacity-50 hover:bg-brand-navy"
        >
          {saving ? "保存中…" : "保存"}
        </button>
        <button onClick={onCancel} className="px-4 py-2 rounded-lg border border-brand-border text-sm text-brand-muted">
          取消
        </button>
      </div>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm font-medium text-brand-text">{label}</div>
      {hint && <div className="text-xs text-brand-label mb-1">{hint}</div>}
      {children}
    </label>
  );
}
