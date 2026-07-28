import type { FieldValue } from "./bitable.js";

// Text-type Bitable fields read back as an array of {text} runs, not a
// plain string — mirrors web/src/lib/richText.ts's plainText().
function plainText(value: FieldValue | undefined): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return value
      .map((seg) => (typeof seg === "object" && seg && "text" in seg ? (seg as { text?: string }).text ?? "" : ""))
      .join("");
  }
  return "";
}

// Mirrors web/src/lib/criteria.ts's splitCriteria() — a numbered blob
// ("1.xxx 2.yyy") becomes one item per number, otherwise the whole text is
// one item.
function splitCriteria(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parts = trimmed
    .split(/(?=\d+[.、])/g)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [trimmed];
}

// True if every item in `criteriaText` has an explicit ✅/❌ mark in
// `checklistRaw` (the comma-joined, index-aligned encoding from
// web/src/lib/criteria.ts). Vacantly true when there are no items to check
// (empty criteria text) — nothing there to require a mark on.
export function isChecklistComplete(criteriaText: FieldValue | undefined, checklistRaw: FieldValue | undefined): boolean {
  const items = splitCriteria(plainText(criteriaText));
  if (items.length === 0) return true;
  const tokens = plainText(checklistRaw).split(",");
  if (tokens.length < items.length) return false;
  return tokens.slice(0, items.length).every((t) => t === "✅" || t === "❌");
}
