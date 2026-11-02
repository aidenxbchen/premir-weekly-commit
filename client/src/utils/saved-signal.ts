// 保存/评级/删除类操作现在直接用接口返回的最新数据更新本地状态，不再整页重新
// 拉取一遍。三种结果统一走同一个信号：
// - { record }     保存/评级成功，把这一条换成服务端返回的最新版本（不存在则追加）
// - { deletedId }   删除成功，把这一条从本地数组里摘掉
// - undefined       出错了，手上没有可信的最新数据，退回整页重新拉取兜底
export type SavedSignal<T extends { id: string }> = { record: T } | { deletedId: string } | undefined;

export function applySavedSignal<T extends { id: string }>(items: T[], signal: { record: T } | { deletedId: string }): T[] {
  if ('deletedId' in signal) return items.filter((i: T) => i.id !== signal.deletedId);
  const idx: number = items.findIndex((i: T) => i.id === signal.record.id);
  if (idx === -1) return [...items, signal.record];
  const next: T[] = [...items];
  next[idx] = signal.record;
  return next;
}
