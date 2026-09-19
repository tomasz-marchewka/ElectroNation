import React from "react";

/** Akcja tury. variant="primary" = ZATWIERDŹ TURĘ, "ghost" = przewijanie. */
export function Button({ variant = "primary", block = false, children, ...rest }) {
  const cls = ["en-btn", variant === "ghost" && "en-btn--ghost", block && "en-btn--block"]
    .filter(Boolean)
    .join(" ");
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}
