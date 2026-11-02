import { useEffect, useRef, useState } from 'react';
import { errorMessage } from './error';

// 页面之间来回切换时，同一个接口往往刚刚才请求过。这里做一层很轻的
// "先用旧数据渲染、再后台刷新"（stale-while-revalidate）缓存：
//   - 命中且没过期 → 直接用，不发请求（切页签、切页面就是瞬间的）
//   - 命中但过期了 → 先把旧数据渲染出来，同时后台刷新，回来后自动替换
//   - 没命中 → 正常等待，并且同一时刻的重复请求会合并成一次
// 退出登录或换了人不需要担心：数据都在内存里，刷新页面即清空。
//
// 写入方（保存/退回/删除）改完数据后调用 invalidateApiCache('commitments:')
// 把相关前缀标为过期，正在看着这个数据的页面会立刻重新拉一次。
type Entry = {
  data?: unknown;
  // 上次成功取到数据的时间；0 表示"还没有可信数据"（含被标记过期）
  at: number;
  promise?: Promise<unknown>;
  error?: string;
};

const store = new Map<string, Entry>();
// 每个 key 最近一次的取数函数，invalidate 时要靠它重新拉
const loaders = new Map<string, () => Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();

export const API_CACHE_TTL_MS = 20_000;

function notify(key: string): void {
  listeners.get(key)?.forEach((fn: () => void) => fn());
}

export function subscribeApiCache(key: string, listener: () => void): () => void {
  const set = listeners.get(key) ?? new Set<() => void>();
  set.add(listener);
  listeners.set(key, set);
  return () => {
    set.delete(listener);
    if (set.size === 0) listeners.delete(key);
  };
}

export function readApiCache<T>(key: string): { data?: T; loaded: boolean; error: string } {
  const entry = store.get(key);
  return {
    data: entry?.data as T | undefined,
    loaded: (entry?.at ?? 0) > 0,
    error: entry?.error ?? '',
  };
}

export async function loadApiCache<T>(key: string, loader: () => Promise<T>, ttl: number = API_CACHE_TTL_MS): Promise<T> {
  const entry = store.get(key);
  const now = Date.now();
  if (entry?.data !== undefined && entry.at > 0 && now - entry.at < ttl) return entry.data as T;
  // 同一份数据同时被两个组件要：合并成一次请求
  if (entry?.promise) return entry.promise as Promise<T>;

  loaders.set(key, loader as () => Promise<unknown>);
  const stale: T | undefined = entry?.data as T | undefined;
  const previousAt: number = entry?.at ?? 0;

  const promise = loader().then(
    (data: T) => {
      store.set(key, { data, at: Date.now() });
      notify(key);
      return data;
    },
    (e: unknown) => {
      // 刷新失败就把旧数据留着（过期但可用），只把错误记下来给界面提示
      store.set(key, { data: stale, at: previousAt, error: errorMessage(e) });
      notify(key);
      throw e;
    },
  );
  store.set(key, { data: stale, at: previousAt, promise });
  return promise;
}

// 把匹配前缀的数据标为过期，并让正在用它的页面立刻重新拉一次。
export function invalidateApiCache(prefix = ''): void {
  for (const [key, entry] of [...store]) {
    if (prefix && !key.startsWith(prefix)) continue;
    store.set(key, { data: entry.data, at: 0, error: entry.error });
    const loader = loaders.get(key);
    if (loader && (listeners.get(key)?.size ?? 0) > 0) {
      void loadApiCache(key, loader, 0).catch(() => undefined);
    }
  }
}

// 就地改一份已缓存的数据（保存/删除之后用）。这样界面立刻反映改动，也不用为了
// 一次勾选再跑一趟接口；下一次过期时自然会从服务端拿权威数据。
export function mutateApiCache<T>(key: string, updater: (data: T) => T): void {
  const entry = store.get(key);
  if (!entry || entry.data === undefined) return;
  store.set(key, { data: updater(entry.data as T), at: entry.at, error: entry.error });
  notify(key);
}

// 组件侧用法：key 变了（换了周、换了人）自然会重新取。
export function useApiCache<T>(
  key: string,
  loader: () => Promise<T>,
  ttl: number = API_CACHE_TTL_MS,
): { data?: T; loaded: boolean; error: string } {
  const [, force] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      if (alive) force((n: number) => n + 1);
    };
    const unsubscribe = subscribeApiCache(key, refresh);
    // 缓存新鲜时这里直接返回，不会发请求；过期或没有数据才会真的去取。
    void loadApiCache(key, () => loaderRef.current(), ttl).catch(() => undefined);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [key, ttl]);

  const entry = readApiCache<T>(key);
  return { data: entry.data, loaded: entry.loaded, error: entry.error };
}
