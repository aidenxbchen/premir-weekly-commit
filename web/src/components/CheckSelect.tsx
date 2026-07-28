import { useEffect, useRef, useState } from "react";

const OPTIONS = ["—", "✅", "❌"] as const;

// A small click-to-open popover for ✅ / ❌ (— when unset), placed in front
// of a criteria line to mark whether that tier's bar was cleared. Not a
// native <select> — that always draws its own browser dropdown-arrow chrome
// next to the value, which visually competes with the ✅/❌ mark itself and
// doesn't match the custom pill-button style used elsewhere (e.g. grading).
export function CheckSelect({
  value,
  canEdit,
  onChange,
}: {
  value?: "✅" | "❌";
  canEdit: boolean;
  onChange: (next: "✅" | "❌") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!canEdit) {
    return <span className="text-base leading-none w-5 text-center shrink-0">{value ?? "—"}</span>;
  }

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="点击选择"
        className="text-base leading-none w-6 h-6 flex items-center justify-center rounded hover:bg-brand-panel border border-transparent hover:border-brand-border"
      >
        {value ?? "—"}
      </button>
      {open && (
        <div className="absolute z-20 top-full left-0 mt-1 bg-white border border-brand-border rounded-lg shadow-md flex gap-0.5 p-1">
          {OPTIONS.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                if (opt !== "—") onChange(opt);
                setOpen(false);
              }}
              className="w-7 h-7 flex items-center justify-center rounded hover:bg-brand-panel text-base"
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
