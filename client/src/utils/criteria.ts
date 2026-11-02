import type { CheckMark, CommitmentRecord } from '@shared/api.interface';
import { splitCriteria } from '@shared/criteria-text';
export { splitCriteria, encodeCriteria, stripNumberPrefix, hasStructuredCriteria } from '@shared/criteria-text';

// 周承诺的字段模板，所有小组统一（硬件模块、软件组、MCU嵌入式、Linux嵌入式都是
// 同一张表、同一套字段）：交付物 / 验收标准 / 依赖与风险。
// B+验收标准曾经是每条承诺上的一个可选档位，现在改成"每人每周一份"的独立判断，
// 存在 weekly_b_plus 表里，不再属于某一条承诺，所以这里没有它。
export interface PromiseField {
  key: string;
  label: string;
  value: string;
  // 必填字段（交付物/验收标准）：展示时始终出现，空值显示"未填写"。
  // 没打这个标记的就是选填字段（依赖与风险），只在有内容时出现。
  required?: boolean;
}

export function promiseFields(record: CommitmentRecord): PromiseField[] {
  return [
    { key: 'deliverable', label: '交付物', value: record.deliverable ?? '', required: true },
    { key: 'criteria', label: '验收标准', value: record.criteria ?? '', required: true },
    { key: 'risk', label: '依赖与风险', value: record.risk ?? '' },
  ];
}

// 团队视图用：必填字段始终出现，选填字段（依赖与风险）有内容才出现。
export function promiseDisplayFields(record: CommitmentRecord): PromiseField[] {
  return promiseFields(record).filter((field: PromiseField) => field.required || Boolean(field.value.trim()));
}

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

export function setChecklistAt(current: Array<CheckMark | undefined>, index: number, value: CheckMark): string {
  const next: Array<CheckMark | undefined> = [...current];
  next[index] = value;
  return encodeChecklist(next);
}

export function isChecklistComplete(text: string, checklistRaw?: string): boolean {
  const items: string[] = splitCriteria(text);
  if (items.length === 0) return true;
  return parseChecklist(checklistRaw, items.length).every((c: CheckMark | undefined) => c !== undefined);
}
