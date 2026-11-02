import { lazy, Suspense } from 'react';
import type { RichTextEditorProps } from './RichTextEditorImpl';
import { DocLinkText } from './DocLinkText';

// 只有开始编辑才下载完整编辑器，浏览工作台时不增加编辑工具的等待。
const Editor = lazy(() => import('./RichTextEditorImpl').then((module) => ({ default: module.RichTextEditor })));

export function RichTextEditor(props: RichTextEditorProps) {
  if (props.disabled) return <div className={`writing-readonly ${props.className ?? ''}`}><DocLinkText text={props.value} /></div>;
  return <Suspense fallback={<div className="writing-loading" role="status">正在准备编辑器…</div>}><Editor {...props} /></Suspense>;
}
