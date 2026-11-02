import { useMemo, useState } from 'react';
import { Markdown } from '@tiptap/markdown';
import { Bold, Italic, Link2, List, ListOrdered, Undo2, Redo2 } from 'lucide-react';
import { TiptapEditor, TiptapEditorContent, TiptapEditorToolbar } from './business-ui/tiptap-editor/tiptap-editor';
import { CompleteKit } from './business-ui/tiptap-editor/extensions/complete-kit';
import { useTiptapEditor } from './business-ui/tiptap-editor/hooks/use-tiptap-editor';
import { LinkToolbarButton } from './business-ui/tiptap-editor/components/link-toolbar-button';
import { ImeTextarea } from './ImeSafeText';
import { DocLinkText } from './DocLinkText';

export interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  className?: string;
  rows?: number;
  maxLength?: number;
  'aria-label'?: string;
}

function FormattingToolbar() {
  const { editor } = useTiptapEditor();
  if (!editor) return null;
  const tools = [
    { name: '加粗', icon: Bold, active: editor.isActive('bold'), run: () => editor.chain().focus().toggleBold().run() },
    { name: '斜体', icon: Italic, active: editor.isActive('italic'), run: () => editor.chain().focus().toggleItalic().run() },
    { name: '无序列表', icon: List, active: editor.isActive('bulletList'), run: () => editor.chain().focus().toggleBulletList().run() },
    { name: '有序列表', icon: ListOrdered, active: editor.isActive('orderedList'), run: () => editor.chain().focus().toggleOrderedList().run() },
  ];
  return <TiptapEditorToolbar className="writing-toolbar" role="toolbar" aria-label="文本格式">
    {tools.map((tool) => <button key={tool.name} type="button" title={tool.name} aria-label={tool.name}
      aria-pressed={tool.active} onMouseDown={(event) => event.preventDefault()} onClick={tool.run}><tool.icon /></button>)}
    <span className="writing-toolbar-divider" />
    <LinkToolbarButton />
    <span className="writing-toolbar-divider" />
    <button type="button" title="撤销" aria-label="撤销" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}><Undo2 /></button>
    <button type="button" title="重做" aria-label="重做" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}><Redo2 /></button>
  </TiptapEditorToolbar>;
}

/** 编辑时直接排版，持久化仍是 Markdown；不回写 DOM，避免干扰飞书中文输入法。 */
export function RichTextEditor({ value, onChange, placeholder, disabled, autoFocus, className = '', rows = 2,
  maxLength, 'aria-label': label }: RichTextEditorProps) {
  const [source, setSource] = useState(false);
  const extensions = useMemo(() => [CompleteKit.configure({
    placeholder: { placeholder: placeholder ?? '写下内容，粘贴网址会自动识别…' },
    link: { autolink: true, linkOnPaste: true, openOnClick: false, defaultProtocol: 'https' },
    image: false, attachment: false, codeBlock: false, color: false, highlight: false, textStyle: false, textAlign: false,
  }), Markdown.configure({ markedOptions: { gfm: true, breaks: true } })], [placeholder]);

  if (disabled) return <div className={`writing-readonly ${className}`}><DocLinkText text={value} /></div>;
  return <div className={`writing-field ${className}`} style={{ '--writing-lines': rows } as React.CSSProperties}>
    <div className="writing-mode"><span><Link2 aria-hidden="true" />网址自动识别</span>
      <button type="button" aria-pressed={source} onClick={() => setSource((current) => !current)}>{source ? '返回排版' : 'Markdown'}</button>
    </div>
    {source ? <ImeTextarea aria-label={label ?? placeholder ?? 'Markdown 内容'} value={value} onChange={onChange}
      placeholder={placeholder} rows={rows + 2} maxLength={maxLength} autoFocus={autoFocus} /> :
      <TiptapEditor value={value} onValueChange={onChange} contentFormat="markdown" extensions={extensions} autoFocus={autoFocus}
        contentLabel={label ?? placeholder ?? '内容编辑器'}>
        <FormattingToolbar />
        <TiptapEditorContent />
      </TiptapEditor>}
    {maxLength && value.length > maxLength && <p className="text-xs text-destructive" role="alert">内容超过 {maxLength} 字，请精简后保存。</p>}
  </div>;
}
