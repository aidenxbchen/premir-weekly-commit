import type { ReactNode } from "react";

// `border` fully replaces the default border classes (width + color) rather
// than layering on top of them, so callers that need a custom border color
// (e.g. a rank-highlighted card) don't fight Tailwind's utility ordering.
export function Card({
  children,
  className = "",
  border = "border border-brand-border",
}: {
  children: ReactNode;
  className?: string;
  border?: string;
}) {
  return <div className={`bg-white ${border} rounded-xl p-4 shadow-sm ${className}`}>{children}</div>;
}
