import React from "react";

export const HEX_R = 34;
export const STEP_X = 51;
export const STEP_Y = 59;
export const HEX_PATH = "M-34 0 L-17 -29.5 L17 -29.5 L34 0 L17 29.5 L-17 29.5 Z";

/** Biomy heksa: etykieta w legendzie + mnożnik kosztu budowy (01 §3.2). */
export const BIOMES = [
  { id: "nizina", label: "nizina ×1,0" },
  { id: "wyzyna", label: "wyżyna ×1,3" },
  { id: "gory", label: "góry ×2,2" },
  { id: "las", label: "las ×1,4" },
  { id: "bagno", label: "bagno ×1,8" },
  { id: "jezioro", label: "jezioro ×2,6" },
  { id: "morze", label: "morze ×3,0" },
  { id: "miasto", label: "zurbaniz. ×1,9" },
];

const TEX = {
  gory: '<path d="M-21 13 l8 -13 l8 13 z"/><path d="M3 13 l6 -9 l6 9 z"/>',
  wyzyna: '<path d="M-15 12 q7 -7 14 0" fill="none" stroke-width="1.6"/><path d="M2 15 q6 -5 12 0" fill="none" stroke-width="1.6"/>',
  las: '<path d="M-18 15 l4 -10 l4 10 z"/><path d="M-5 16 l4.5 -11 l4.5 11 z"/><path d="M9 15 l4 -10 l4 10 z"/>',
  bagno: '<path d="M-16 9 h11 M0 9 h11 M-9 15 h11" fill="none" stroke-width="1.8" stroke-linecap="round"/>',
  jezioro: '<path d="M-17 8 q6 -4 11 0 t11 0" fill="none" stroke-width="1.6"/><path d="M-14 16 q6 -4 11 0 t11 0" fill="none" stroke-width="1.6"/>',
  morze: '<path d="M-17 8 q6 -4 11 0 t11 0" fill="none" stroke-width="1.6"/><path d="M-14 16 q6 -4 11 0 t11 0" fill="none" stroke-width="1.6"/>',
  miasto: '<rect x="-16" y="6" width="5" height="9"/><rect x="-8" y="2" width="6" height="13"/><rect x="1" y="8" width="5" height="7"/><rect x="9" y="4" width="5" height="11"/>',
};

/** Środek heksa w układzie SVG dla współrzędnych kolumna/rząd (flat-top, odd-q). */
export function hexCenter(col, row) {
  return { x: HEX_R + STEP_X * col, y: (col % 2 ? STEP_Y : STEP_Y / 2) + STEP_Y * row };
}

/** Odstęp między równoległymi torami w jednym korytarzu [px]. */
export const CORRIDOR_SPACING = 9;

function toCube(col, row) { const x = col, z = row - ((col - (col & 1)) / 2); return { x: x, y: -x - z, z: z }; }
function fromCube(c) { return { col: c.x, row: c.z + ((c.x - (c.x & 1)) / 2) }; }
function cubeRound(x, y, z) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}

/** Trasa linii: łańcuch heksów od obiektu do obiektu (przez środki heksów po drodze). */
export function hexLine(a, b) {
  const A = toCube(a[0], a[1]), B = toCube(b[0], b[1]);
  const N = Math.max(Math.abs(A.x - B.x), Math.abs(A.y - B.y), Math.abs(A.z - B.z));
  const out = [];
  for (let i = 0; i <= N; i++) {
    const t = N === 0 ? 0 : i / N;
    out.push(fromCube(cubeRound(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t)));
  }
  return out;
}

/**
 * Zamienia listę linii (fromHex/toHex) na łamane w px: trasa idzie przez środki heksów,
 * a linie dzielące ten sam korytarz rozjeżdżają się równolegle (±CORRIDOR_SPACING).
 */
export function routeLines(lines) {
  const paths = lines.map(function (l) {
    return l.fromHex && l.toHex ? hexLine(l.fromHex, l.toHex) : null;
  });
  const corridors = {};
  paths.forEach(function (p, li) {
    if (!p) return;
    for (let i = 0; i < p.length - 1; i++) {
      const ka = p[i].col + "," + p[i].row, kb = p[i + 1].col + "," + p[i + 1].row;
      const key = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      (corridors[key] = corridors[key] || []).push(li);
    }
  });
  return paths.map(function (p, li) {
    if (!p) {
      const l = lines[li];
      return l.from && l.to ? [l.from, l.to] : [];
    }
    const vecs = [];
    for (let i = 0; i < p.length - 1; i++) {
      const ka = p[i].col + "," + p[i].row, kb = p[i + 1].col + "," + p[i + 1].row;
      const key = ka < kb ? ka + "|" + kb : kb + "|" + ka;
      const users = corridors[key];
      const off = (users.indexOf(li) - (users.length - 1) / 2) * CORRIDOR_SPACING;
      const first = ka < kb ? p[i] : p[i + 1], second = ka < kb ? p[i + 1] : p[i];
      const c1 = hexCenter(first.col, first.row), c2 = hexCenter(second.col, second.row);
      const dx = c2.x - c1.x, dy = c2.y - c1.y, len = Math.sqrt(dx * dx + dy * dy) || 1;
      vecs.push({ x: (-dy / len) * off, y: (dx / len) * off });
    }
    return p.map(function (h, j) {
      const c = hexCenter(h.col, h.row);
      const v = p.length === 1 ? { x: 0, y: 0 }
        : j === 0 ? vecs[0]
        : j === p.length - 1 ? vecs[vecs.length - 1]
        : { x: (vecs[j - 1].x + vecs[j].x) / 2, y: (vecs[j - 1].y + vecs[j].y) / 2 };
      return [Math.round((c.x + v.x) * 10) / 10, Math.round((c.y + v.y) * 10) / 10];
    });
  });
}

function pointsAttr(pts) { return pts.map(function (p) { return p[0] + "," + p[1]; }).join(" "); }

const LOAD_STROKE = { ok: "--en-ok", warn: "--en-warn", over: "--en-danger", idle: "--en-idle" };
const TYPE_WIDTH = { NN: 2.5, SN: 4, WN: 6 };

const ICONS = {
  coal: '<rect x="-12" y="-4" width="24" height="10" fill="none" stroke="COLOR" stroke-width="2"/><rect x="4" y="-14" width="5" height="10" fill="COLOR"/>',
  gas: '<rect x="-11" y="-3" width="22" height="9" fill="none" stroke="COLOR" stroke-width="2"/><path d="M-4 -8 L0 -14 L4 -8 Z" fill="COLOR"/>',
  wind: '<path d="M0 2 L0 -14 M0 2 L13 9 M0 2 L-13 9" stroke="COLOR" stroke-width="2.5" fill="none"/><circle cx="0" cy="2" r="2.5" fill="COLOR"/>',
  pv: '<rect x="-11" y="-7" width="22" height="14" fill="none" stroke="COLOR" stroke-width="2"/><path d="M-11 0 L11 0 M-3.7 -7 L-3.7 7 M3.7 -7 L3.7 7" stroke="COLOR" stroke-width="1" fill="none"/>',
  bess: '<rect x="-10" y="-6" width="20" height="12" fill="none" stroke="COLOR" stroke-width="2"/><rect x="10" y="-3" width="3" height="6" fill="COLOR"/><rect x="-8" y="-4" width="11" height="8" fill="COLOR" opacity="0.5"/>',
  node: '<g transform="rotate(45)"><rect x="-8" y="-8" width="16" height="16" fill="none" stroke="COLOR" stroke-width="2"/></g>',
  city: '<rect x="-14" y="-4" width="7" height="13" fill="COLOR"/><rect x="-4" y="-11" width="8" height="20" fill="COLOR"/><rect x="7" y="-6" width="6" height="15" fill="COLOR"/>',
  town: '<rect x="-11" y="-3" width="6" height="12" fill="COLOR"/><rect x="-2" y="-9" width="7" height="18" fill="COLOR"/>',
  border: '<path d="M-9 -6 L-1 0 L-9 6 M3 -6 L11 0 L3 6" stroke="COLOR" stroke-width="2" fill="none"/>',
};

const ICON_COLOR = {
  coal: "--en-coal-ico", gas: "--en-gas-ico", wind: "--en-wind", pv: "--en-pv",
  bess: "--en-ok", node: "--en-info", city: "--en-map-label-city", town: "--en-map-label-city",
  border: "--en-storage",
};

/**
 * Mapa heksagonalna: pole biomów, korytarze linii z animowanym przepływem,
 * obiekty z zachowanym pod nimi biomem, legendy biomów i typów linii.
 */
export function HexMap({
  cols = 21,
  rows = 11,
  width = 1060,
  height = 640,
  hexes,
  lines = [],
  objects = [],
  labels = [],
  overloadLabel,
  scaleLabel = "1 HEKS = 25 KM",
  showBiomeLegend = true,
  showLineLegend = true,
  onHexClick,
}) {
  const field = React.useMemo(() => {
    if (hexes) return hexes;
    const out = [];
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const { x, y } = hexCenter(c, r);
        if (y > height) continue;
        out.push({ col: c, row: r, x, y, biome: "nizina" });
      }
    }
    return out;
  }, [hexes, cols, rows, height]);

  const byBiome = {};
  field.forEach((h) => (byBiome[h.biome] = byBiome[h.biome] || []).push(h));
  const routes = React.useMemo(() => routeLines(lines), [lines]);

  return (
    <svg viewBox={"0 0 " + width + " " + height} style={{ display: "block", width: "100%", background: "var(--en-bg-map)" }}>
      {BIOMES.map((b) =>
        byBiome[b.id] ? (
          <g key={b.id} fill={"var(--en-biome-" + b.id + "-fill)"} stroke={"var(--en-biome-" + b.id + "-edge)"} strokeWidth="1">
            {byBiome[b.id].map((h) => (
              <path
                key={h.col + "," + h.row}
                d={HEX_PATH}
                transform={"translate(" + h.x + " " + h.y + ")"}
                onClick={onHexClick ? () => onHexClick(h) : undefined}
                style={onHexClick ? { cursor: "pointer" } : undefined}
              />
            ))}
          </g>
        ) : null
      )}
      {BIOMES.map((b) =>
        byBiome[b.id] && TEX[b.id] ? (
          <g key={"t" + b.id} fill={"var(--en-biome-" + b.id + "-tex)"} stroke={"var(--en-biome-" + b.id + "-tex)"} opacity="0.62" style={{ pointerEvents: "none" }}>
            {byBiome[b.id].map((h) => (
              <g key={h.col + "," + h.row} transform={"translate(" + h.x + " " + h.y + ")"} dangerouslySetInnerHTML={{ __html: TEX[b.id] }} />
            ))}
          </g>
        ) : null
      )}

      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        {routes.map((pts, i) => (
          <polyline
            key={i}
            points={pointsAttr(pts)}
            stroke={"var(" + (LOAD_STROKE[lines[i].load] || LOAD_STROKE.ok) + ")"}
            strokeWidth={TYPE_WIDTH[lines[i].type] || 4}
            strokeDasharray={lines[i].load === "idle" ? "4 4" : undefined}
          />
        ))}
      </g>
      {overloadLabel && (
        <text x={overloadLabel.x} y={overloadLabel.y} fill="var(--en-danger)" fontSize="11" fontFamily="var(--en-font-mono)" fontWeight="600" paintOrder="stroke" stroke="var(--en-bg-map)" strokeWidth="3.5">
          {overloadLabel.text}
        </text>
      )}

      <g fill="none">
        {objects.map((o, i) => (
          <path
            key={i}
            d={HEX_PATH}
            transform={"translate(" + o.x + " " + o.y + ")"}
            stroke={o.alert ? "var(--en-danger)" : o.kind === "city" || o.kind === "town" ? "var(--en-city-ring)" : "var(--en-obj-ring)"}
            strokeWidth={o.kind === "city" || o.kind === "town" || o.alert ? 3 : 2}
          />
        ))}
      </g>
      <g fill="var(--en-map-pad)" opacity="var(--en-map-pad-opacity)">
        {objects.map((o, i) => (
          <circle key={i} cx={o.x} cy={o.y} r={o.kind === "city" ? 19 : 17} />
        ))}
      </g>
      {objects.map((o, i) => (
        <g
          key={i}
          transform={"translate(" + o.x + " " + o.y + ")"}
          dangerouslySetInnerHTML={{ __html: (ICONS[o.kind] || "").replace(/COLOR/g, "var(" + (ICON_COLOR[o.kind] || "--en-text") + ")") }}
        />
      ))}

      <g fontFamily="var(--en-font-mono)" fontSize="10.5" textAnchor="middle" paintOrder="stroke" stroke="var(--en-bg-map)" strokeWidth="3.5" strokeLinejoin="round">
        {labels.map((l, i) => (
          <text key={i} x={l.x} y={l.y} fill={"var(" + (l.tone === "city" ? "--en-map-label-city" : l.tone === "danger" ? "--en-danger-text" : "--en-map-label") + ")"} fontWeight={l.tone ? 600 : 400}>
            {l.text}
          </text>
        ))}
      </g>

      {showBiomeLegend && (
        <>
          <rect x="0" y="0" width={width} height="34" fill="var(--en-bg-app)" opacity="0.9" />
          <g fontFamily="var(--en-font-mono)">
            {BIOMES.map((b, i) => (
              <g key={b.id}>
                <path d="M-9 0 L-4.5 -7.8 L4.5 -7.8 L9 0 L4.5 7.8 L-4.5 7.8 Z" transform={"translate(" + (26 + i * 126) + " 17)"} fill={"var(--en-biome-" + b.id + "-fill)"} stroke={"var(--en-biome-" + b.id + "-edge)"} strokeWidth="1.2" />
                <text x={41 + i * 126} y="21" fontSize="10" fill="var(--en-map-label)">{b.label}</text>
              </g>
            ))}
          </g>
        </>
      )}

      {showLineLegend && (
        <>
          <rect x="8" y={height - 64} width="176" height="56" fill="var(--en-bg-app)" opacity="0.9" />
          <g transform={"translate(20 " + (height - 48) + ")"} fontFamily="var(--en-font-mono)" fontSize="9.5" fill="var(--en-map-label)">
            <path d="M0 4 L26 4" stroke="var(--en-idle)" strokeWidth="2.5" />
            <text x="32" y="8">NN 150</text>
            <path d="M0 20 L26 20" stroke="var(--en-idle)" strokeWidth="4" />
            <text x="32" y="24">SN 500</text>
            <path d="M0 36 L26 36" stroke="var(--en-idle)" strokeWidth="6" />
            <text x="32" y="40">WN 1500</text>
            <circle cx="96" cy="4" r="4" fill="var(--en-ok)" />
            <text x="106" y="8">OK</text>
            <circle cx="96" cy="20" r="4" fill="var(--en-warn)" />
            <text x="106" y="24">&gt;75%</text>
            <circle cx="96" cy="36" r="4" fill="var(--en-danger)" />
            <text x="106" y="40">LIMIT</text>
          </g>
        </>
      )}

      {scaleLabel && (
        <text x={width - 16} y={height - 12} textAnchor="end" fontFamily="var(--en-font-mono)" fontSize="10" fill="var(--en-map-scale)">
          {scaleLabel}
        </text>
      )}
    </svg>
  );
}
