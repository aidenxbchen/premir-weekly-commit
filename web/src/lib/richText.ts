// Bitable text-type fields accept a plain string on write, but always read
// back as an array of {text, type} runs (its rich-text run representation)
// — confirmed against the real API, not assumed. Use this wherever a text
// field is displayed or used to seed an editable string.
export type RichText = string | Array<{ text?: string; type?: string }> | undefined;

export function plainText(value: RichText): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return value.map((seg) => seg.text ?? "").join("");
}
