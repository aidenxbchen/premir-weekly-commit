// 新编辑的验收项用明确分隔符保存，项内的数字、网址和 Markdown 列表不再被拆项。
// 未经编辑的历史记录仍按原规则解析，不迁移已有验收状态。
const CRITERION_MARKER = '<!-- anever:criterion -->';

export function hasStructuredCriteria(text: string): boolean {
  return text.trimStart().startsWith(CRITERION_MARKER);
}

export function splitCriteria(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (hasStructuredCriteria(trimmed)) return trimmed.split(CRITERION_MARKER).map((item) => item.trim()).filter(Boolean);
  const parts = trimmed.split(/(?=\d+[.、])/g).map((item) => item.trim()).filter(Boolean);
  return parts.length > 1 ? parts : [trimmed];
}

export function encodeCriteria(items: string[]): string {
  return items.map((item) => item.trim()).filter(Boolean)
    .map((item) => `${CRITERION_MARKER}\n${item}`).join('\n\n');
}

export function stripNumberPrefix(item: string): string {
  return item.replace(/^\d+[.、]\s*/, '');
}
