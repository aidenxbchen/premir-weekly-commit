import { useCallback, useState } from 'react';
import { errorMessage } from '@/utils/error';

// 统一的"保存"状态管理：所有会触发一次服务端写入的 UI（编辑表单、复选框、评级、
// 验收标准增删）都应该走这个 hook，而不是各自手写 try/catch——历史上反复出现过
// "请求失败但界面完全没反应"的 bug，根源就是散落各处的保存逻辑有的忘了写
// catch、有的连 await 都没做。用这个 hook 后，失败必定会被捕获并转成可读文案，
// 不会再有静默失败的入口。
export function useSavable() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 返回是否成功，调用方按需决定成功后要不要关闭编辑态——不在这里帮调用方做
  // "成功后自动怎样"的假设，保持这个 hook 只负责状态管理本身。
  const run = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setSaving(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, []);

  return { saving, error, setError, run };
}
