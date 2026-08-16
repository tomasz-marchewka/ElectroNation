// Adapted from design-system/components/controls/Button.{jsx,d.ts}.
// Exactly one primary action per screen — committing the turn. Everything
// else is a ghost (Button.prompt.md).

import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** "primary" = the action color (--en-action), "ghost" = outline only. */
  variant?: "primary" | "ghost";
  /** Stretches over the container's full width. */
  block?: boolean;
  children?: ReactNode;
}

export function Button({ variant = "primary", block = false, children, ...rest }: ButtonProps) {
  const className = [
    "en-btn",
    variant === "ghost" ? "en-btn--ghost" : null,
    block ? "en-btn--block" : null,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={className} {...rest}>
      {children}
    </button>
  );
}
