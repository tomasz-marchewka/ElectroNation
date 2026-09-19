import React from "react";

const TONES = { ok: "--en-ok", warn: "--en-warn", danger: "--en-danger", info: "--en-info", idle: "--en-idle" };

/** Kropka stanu — obciążenie linii, stan obiektu, legenda mapy. */
export function StatusDot({ tone = "ok", size = 8, label }) {
  const dot = <span className="en-dot" style={{ background: "var(" + (TONES[tone] || TONES.ok) + ")", width: size, height: size }} />;
  if (!label) return dot;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--en-font-mono)", fontSize: "var(--en-fs-caption)", color: "var(--en-text-3)" }}>
      {dot}
      {label}
    </span>
  );
}
