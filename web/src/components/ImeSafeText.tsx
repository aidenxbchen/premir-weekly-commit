import { useRef } from "react";
import type { ChangeEvent, CompositionEvent, InputHTMLAttributes, TextareaHTMLAttributes } from "react";

// The Feishu embedded webview (and WebKit-based browsers more broadly) can
// fire input events with the IME's in-progress pinyin buffer as literal
// text before composition actually finishes, instead of only firing once
// composition commits. A plain controlled `onChange={(e) => setX(e.target
// .value)}` then leaks those raw fragments into the field's value — typing
// "hahaha" (哈哈哈) comes out as "哈哈哈ha'ha'haha'ha'hha'haha'hhah".
// Skipping the onChange-driven update while composing (and only committing
// once on compositionend) fixes it: React never re-renders mid-composition,
// so the browser's own composition-buffer rendering is left alone instead
// of being clobbered by a React-driven value re-sync on every keystroke.

type BaseProps = { value: string; onChange: (next: string) => void };

export function ImeInput({
  value,
  onChange,
  ...rest
}: BaseProps & Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const composing = useRef(false);
  return (
    <input
      {...rest}
      value={value}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        if (!composing.current) onChange(e.target.value);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e: CompositionEvent<HTMLInputElement>) => {
        composing.current = false;
        onChange(e.currentTarget.value);
      }}
    />
  );
}

export function ImeTextarea({
  value,
  onChange,
  ...rest
}: BaseProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const composing = useRef(false);
  return (
    <textarea
      {...rest}
      value={value}
      onChange={(e: ChangeEvent<HTMLTextAreaElement>) => {
        if (!composing.current) onChange(e.target.value);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(e: CompositionEvent<HTMLTextAreaElement>) => {
        composing.current = false;
        onChange(e.currentTarget.value);
      }}
    />
  );
}
