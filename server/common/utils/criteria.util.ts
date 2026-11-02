import type { CheckMark } from '@shared/api.interface';
import { splitCriteria } from '@shared/criteria-text';
export { splitCriteria, encodeCriteria, stripNumberPrefix } from '@shared/criteria-text';

// 把一段编号验收标准文本（"1.xxx 2.yyy"）拆成独立条目；没有编号时整段就是一条。
const PLACEHOLDER = '·';

// ⏹️：无法评，可能是依赖的前置工作还没完成——跟✅/❌一样算这一项已经处理完，
// 不会卡住后续评级。
export function parseChecklist(raw: string | undefined, count: number): Array<CheckMark | undefined> {
  const parts: string[] = (raw ?? '').split(',');
  return Array.from({ length: count }, (_unused: unknown, i: number) => {
    const v: string | undefined = parts[i];
    return v === '✅' || v === '❌' || v === '⏹️' ? v : undefined;
  });
}

export function encodeChecklist(items: Array<CheckMark | undefined>): string {
  return items.map((v: CheckMark | undefined) => v ?? PLACEHOLDER).join(',');
}

// 判断某条验收标准文本的每一项是否都已有标记——为空文本视为已完成（没有需要打勾的项）。
export function isChecklistComplete(text: string | undefined, checklistRaw: string | undefined): boolean {
  const items: string[] = splitCriteria(text ?? '');
  if (items.length === 0) return true;
  return parseChecklist(checklistRaw, items.length).every((c: CheckMark | undefined) => c !== undefined);
}
