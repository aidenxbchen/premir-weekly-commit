// Splits a criteria blob like "1.先做X 2.再做Y" into individual items so
// each can be checked off separately. Falls back to a single item when no
// numbering is found — don't invent structure that isn't there.
export function splitCriteria(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?=\d+[.、])/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [trimmed];
}

// `splitCriteria` keeps each item's own leading "1." (it's a lookahead
// split, doesn't consume the match) since that's what's shown when reading
// the field — but an individual item's *editor* shouldn't make someone
// manage their own numbering, so strip it there.
export function stripNumberPrefix(item: string): string {
  return item.replace(/^\d+[.、]\s*/, "");
}

// Rebuilds the single stored text blob from a list of individual items —
// the inverse of splitCriteria. A single item stays bare (matches
// splitCriteria's own "no numbering found -> one item" fallback); two or
// more get re-numbered "1.x 2.y" regardless of whatever numbering (if any)
// they had before, so adding/editing/removing items never leaves stale or
// skipped numbers.
export function encodeCriteria(items: string[]): string {
  const cleaned = items.map((s) => s.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];
  return cleaned.map((item, i) => `${i + 1}.${item}`).join(" ");
}

const PLACEHOLDER = "·";

// Checklist state is stored as one comma-joined string ("✅,·,❌") aligned
// by index to the parsed criteria items, so gaps don't shift later marks.
export function parseChecklist(raw: string | undefined, count: number): Array<"✅" | "❌" | undefined> {
  const parts = (raw ?? "").split(",");
  return Array.from({ length: count }, (_, i) => {
    const v = parts[i];
    return v === "✅" || v === "❌" ? v : undefined;
  });
}

export function encodeChecklist(items: Array<"✅" | "❌" | undefined>): string {
  return items.map((v) => v ?? PLACEHOLDER).join(",");
}

export function setChecklistAt(
  current: Array<"✅" | "❌" | undefined>,
  index: number,
  value: "✅" | "❌"
): string {
  const next = [...current];
  next[index] = value;
  return encodeChecklist(next);
}

// True once every item in `text` has an explicit ✅/❌ mark — vacantly true
// when there are no items to check (empty text). Used to gate grading on
// "all checkboxes decided first" (server enforces the same check, see
// server/src/lib/checklist.ts — this is the UI-side mirror for showing why
// a grade button is disabled, not the actual security boundary).
export function isChecklistComplete(text: string, checklistRaw?: string): boolean {
  const items = splitCriteria(text);
  if (items.length === 0) return true;
  return parseChecklist(checklistRaw, items.length).every((c) => c !== undefined);
}
