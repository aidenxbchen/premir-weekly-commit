import { useCallback } from 'react';
import { departmentsApi } from '@/api';
import { API_CACHE_TTL_MS, invalidateApiCache, loadApiCache, useApiCache } from '@/utils/api-cache';
import type { DepartmentRecord } from '@shared/api.interface';

const KEY = 'departments:all';

// 组别（部门）清单来自后端 department 表——管理员可以在组织管理页增删，
// 所以每个需要组别清单的页面都得动态取，不能再读共享常量。
// 走一层缓存：周承诺页/里程碑页/组织管理页来回切时不再重复请求（清单本来就很少变）。
export function useDepartments(): {
  departments: DepartmentRecord[];
  moduleNames: string[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
} {
  const { data, loaded, error } = useApiCache<{ items: DepartmentRecord[] }>(
    KEY,
    () => departmentsApi.listDepartments(),
    API_CACHE_TTL_MS * 3,
  );

  const reload = useCallback(async (): Promise<void> => {
    // 组织管理页改完组别要立刻看到：清掉缓存重新拉。
    invalidateApiCache(KEY);
    await loadApiCache(KEY, () => departmentsApi.listDepartments(), 0).catch(() => undefined);
  }, []);

  const departments: DepartmentRecord[] = data?.items ?? [];
  return {
    departments,
    moduleNames: departments.map((d: DepartmentRecord) => d.name),
    loading: !loaded,
    error,
    reload,
  };
}
