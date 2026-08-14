import React from "react";

const LAYER_TOKENS = ["--en-coal", "--en-gas", "--en-wind", "--en-storage"];

/**
 * Wykres doby: prawda za nami (warstwy pokrycia + linia popytu),
 * pasmo prognozy przed nami, pionowa kreska TERAZ (01 §8 pkt 2).
 */
export function DayChart({
  width = 1060,
  height = 130,
  truth = [],
  forecast = [],
  nowRatio = 0.75,
  turns = 8,
  legend = [
    { token: "--en-coal", label: "WĘGIEL" },
    { token: "--en-gas", label: "GAZ" },
    { token: "--en-wind", label: "WIATR" },
    { token: "--en-storage", label: "IMPORT/MAGAZYN" },
  ],
  caption = "DOBA · POPYT vs POKRYCIE [MW]",
  note = "— PRAWDA · ┄ PROGNOZA (PASMO)",
}) {
  const nowX = width * nowRatio;
  const step = width / turns;
  const gid = React.useMemo(() => "enGen" + Math.random().toString(36).slice(2, 8), []);
  const px = (p, i, arr) => [(i / Math.max(1, arr.length - 1)) * nowX, height - (p / 100) * height];
  const truthPts = truth.map(px);
  const fcMid = forecast.map((f, i) => [nowX + ((i + 1) / forecast.length) * (width - nowX), height - (((f.lo + f.hi) / 2) / 100) * height]);
  const fcHi = forecast.map((f, i) => [nowX + ((i + 1) / forecast.length) * (width - nowX), height - (f.hi / 100) * height]);
  const fcLo = forecast.map((f, i) => [nowX + ((i + 1) / forecast.length) * (width - nowX), height - (f.lo / 100) * height]);
  const join = (pts) => pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");

  return (
    <div>
      <svg viewBox={"0 0 " + width + " " + height} style={{ display: "block", width: "100%", background: "var(--en-bg-chart)", borderTop: "1px solid var(--en-border)" }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="1" x2="0" y2="0">
            {LAYER_TOKENS.map((t, i) => {
              const a = [0, 0.55, 0.72, 0.92][i];
              const b = [0.55, 0.72, 0.92, 1][i];
              return [
                <stop key={t + "a"} offset={a} stopColor={"var(" + t + ")"} />,
                <stop key={t + "b"} offset={b} stopColor={"var(" + t + ")"} />,
              ];
            })}
          </linearGradient>
        </defs>
        <g stroke="var(--en-border-subtle)" strokeWidth="1">
          {Array.from({ length: turns - 1 }, (_, i) => (
            <path key={i} d={"M" + ((i + 1) * step).toFixed(1) + " 0 V" + height} />
          ))}
        </g>
        <rect x={nowX} y="0" width={step} height={height} fill="var(--en-action)" opacity="0.07" />
        {truthPts.length > 1 && (
          <>
            <polygon points={join(truthPts) + " " + nowX + "," + height + " 0," + height} fill={"url(#" + gid + ")"} opacity="0.65" />
            <polyline points={join(truthPts)} fill="none" stroke="var(--en-text)" strokeWidth="2" />
          </>
        )}
        {forecast.length > 1 && (
          <>
            <polygon points={join(fcHi) + " " + join([...fcLo].reverse())} fill="var(--en-wind)" opacity="0.14" />
            <polyline points={join(fcMid)} fill="none" stroke="var(--en-wind)" strokeWidth="1.5" strokeDasharray="5 4" />
          </>
        )}
        <path d={"M" + nowX + " 0 V" + height} stroke="var(--en-action)" strokeWidth="1.5" strokeDasharray="3 3" />
        <text x={nowX + 6} y="12" fill="var(--en-action)" fontSize="10" fontFamily="var(--en-font-mono)">TERAZ</text>
        {caption && <text x="8" y="14" fill="var(--en-text-4)" fontSize="10" fontFamily="var(--en-font-mono)">{caption}</text>}
      </svg>
      <div className="en-chartlegend">
        {legend.map((l) => (
          <span key={l.label}>
            <span className="en-swatch" style={{ background: "var(" + l.token + ")" }} /> {l.label}
          </span>
        ))}
        {note && <span style={{ marginLeft: "auto" }}>{note}</span>}
      </div>
    </div>
  );
}
