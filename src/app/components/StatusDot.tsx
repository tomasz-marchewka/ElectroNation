// Adapted from design-system/components/data/StatusDot.{jsx,d.ts}.
// Three load grades and nothing else: OK / >75 % / LIMIT (01 §8). The same
// three colors mean the same thing on map lines, so they are not reused.

export type StatusTone = "ok" | "warn" | "danger" | "info" | "idle";

const TONE_TOKENS: Record<StatusTone, string> = {
  ok: "--en-ok",
  warn: "--en-warn",
  danger: "--en-danger",
  info: "--en-info",
  idle: "--en-idle",
};

export interface StatusDotProps {
  tone?: StatusTone;
  /** Size in px. Defaults to 8. */
  size?: number;
  /** Caption next to the dot, e.g. ">75%". */
  label?: string;
}

export function StatusDot({ tone = "ok", size = 8, label }: StatusDotProps) {
  const dot = (
    <span
      className="en-dot"
      data-tone={tone}
      style={{ background: `var(${TONE_TOKENS[tone]})`, width: size, height: size }}
    />
  );
  if (label === undefined) return dot;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--en-space-3)",
        fontFamily: "var(--en-font-mono)",
        fontSize: "var(--en-fs-caption)",
        color: "var(--en-text-3)",
      }}
    >
      {dot}
      {label}
    </span>
  );
}
