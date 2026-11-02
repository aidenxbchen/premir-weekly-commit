import { useMemo, type ReactNode } from 'react';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import type { JSONContent } from '@tiptap/core';

// 和编辑器共用解析器；仅生成 React 文本节点，绝不执行用户提供的 HTML。
const parser = new MarkdownManager({ extensions: [StarterKit], markedOptions: { gfm: true, breaks: true } });

export function safeLink(href: string): boolean {
  return /^(https?:\/\/|mailto:|\/[^/]|#)/i.test(href);
}

export function MarkdownContent({ text, renderLink }: {
  text: string;
  renderLink: (href: string, label: ReactNode, automatic: boolean) => ReactNode;
}) {
  const doc = useMemo(() => parser.parse(text), [text]);
  function render(node: JSONContent, key: number): ReactNode {
    if (node.type === 'text') {
      let child: ReactNode = node.text ?? '';
      for (const mark of node.marks ?? []) {
        if (mark.type === 'bold') child = <strong>{child}</strong>;
        else if (mark.type === 'italic') child = <em>{child}</em>;
        else if (mark.type === 'strike') child = <s>{child}</s>;
        else if (mark.type === 'underline') child = <u>{child}</u>;
        else if (mark.type === 'code') child = <code>{child}</code>;
        else if (mark.type === 'link' && typeof mark.attrs?.href === 'string' && safeLink(mark.attrs.href)) {
          const href: string = mark.attrs.href;
          const automatic = node.text === href || node.text === href.replace(/^https?:\/\//, '');
          // 中文句末标点不属于裸网址；显式命名的 Markdown 链接仍按原地址保留。
          const punctuation = automatic ? href.search(/[，。；、！？…“”‘’]/u) : -1;
          const labelEnd = punctuation - (href.length - (node.text?.length ?? 0));
          child = punctuation >= 0 && labelEnd > 0
            ? <>{renderLink(href.slice(0, punctuation), node.text?.slice(0, labelEnd), true)}{node.text?.slice(labelEnd)}</>
            : renderLink(href, child, automatic);
        }
      }
      return <span key={key}>{child}</span>;
    }
    const children = (node.content ?? []).map(render);
    switch (node.type) {
      case 'paragraph': return <p key={key}>{children}</p>;
      case 'heading': return <div role="heading" aria-level={Number(node.attrs?.level) || 3} className="formatted-heading" key={key}>{children}</div>;
      case 'bulletList': return <ul key={key}>{children}</ul>;
      case 'orderedList': return <ol key={key} start={Number(node.attrs?.start) || 1}>{children}</ol>;
      case 'listItem': return <li key={key}>{children}</li>;
      case 'blockquote': return <blockquote key={key}>{children}</blockquote>;
      case 'codeBlock': return <pre key={key}><code>{children}</code></pre>;
      case 'hardBreak': return <br key={key} />;
      case 'horizontalRule': return <hr key={key} />;
      default: return <span key={key}>{children}</span>;
    }
  }
  return <div className="formatted-text">{(doc.content ?? []).map(render)}</div>;
}
