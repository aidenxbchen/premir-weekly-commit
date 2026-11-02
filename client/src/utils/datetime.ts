export const HOUR_OPTIONS: string[] = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

// 每周一全天放开修改：交付物不需要管理员逐条解锁就能自行编辑，周二 0 点起恢复
// 锁定。和其它日期/时间处理一样，直接用浏览器本地时间——这个应用假定使用者
// 都在国内、浏览器时区就是北京时间，没有再额外做时区换算。
export function isMondayLocal(now: Date = new Date()): boolean {
  return now.getDay() === 1;
}

export function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function toLocalInputValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | undefined {
  if (!value) return undefined;
  const t: number = new Date(value).getTime();
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}
