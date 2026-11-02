import { useEffect, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';

// 上一版方案依赖 compositionstart/compositionend 的事件时序来判断"是否正在用输入法
// 组字"，组字期间跳过受控 onChange，只在 compositionend 时提交一次。这个方案在部分
// 内嵌 webview（实测飞书桌面客户端）下无效——组字过程中输入法候选框会反复闪烁，
// 最终要么整段拼音以英文字母原样卡住，要么组完的汉字丢失。根因大概率是这些 webview
// 里 input 事件和 compositionstart/end 的触发顺序跟标准浏览器不一致，导致中间态被当成
// 正常输入回写进受控 value，下一次渲染 React 又把 DOM 实时内容强制改回那个中间态，
// 和输入法的组字状态打架。
// 改成完全不依赖组合事件时序：输入框的 DOM 值不受 React 实时控制（只在挂载时和"外部
// 主动改变 value"时才写回 DOM），每次原生 input 事件都如实把最新内容上报给上层，但绝
// 不会在打字/组字过程中把 DOM 的实时内容改写回去，从根上避免和输入法抢值。

type BaseProps = { value: string; onChange: (next: string) => void };

export function ImeInput({
  value,
  onChange,
  ...rest
}: BaseProps & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value;
  }, [value]);
  return (
    <Input {...rest} ref={ref} defaultValue={value} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />
  );
}

export function ImeTextarea({
  value,
  onChange,
  ...rest
}: BaseProps & Omit<React.ComponentProps<typeof Textarea>, 'value' | 'onChange'>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (ref.current && ref.current.value !== value) ref.current.value = value;
  }, [value]);
  return (
    <Textarea
      {...rest}
      ref={ref}
      defaultValue={value}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onChange(e.target.value)}
    />
  );
}
