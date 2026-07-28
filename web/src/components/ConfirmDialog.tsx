// Generic centered-overlay confirm modal. Every +NEW press goes through
// this — no "first press is free" special-casing (see server/src/lib/week.ts
// for why a single uniform confirm covers both misclick-prevention and
// deliberately skipping ahead after a break).
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "确认",
  cancelLabel = "取消",
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5">
        <div className="font-semibold text-brand-text">{title}</div>
        <div className="text-sm text-brand-muted mt-2 whitespace-pre-wrap">{message}</div>
        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-3.5 py-1.5 rounded-lg border border-brand-border text-brand-muted text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-3.5 py-1.5 rounded-lg bg-brand-blue text-white text-sm disabled:opacity-50 hover:bg-brand-navy"
          >
            {busy ? "处理中…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
