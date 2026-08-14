/* Trasowanie linii przesyłowych po heksach (flat-top, odd-q).
   Ta sama logika jest wbudowana w HexMap.jsx — tu wystawiona jako moduł
   dla kart specyfikacji, generatorów danych i testów silnika. */

export const HEX_R = 34;
export const STEP_X = 51;
export const STEP_Y = 59;
/** Odstęp między równoległymi torami w jednym korytarzu [px]. */
export const CORRIDOR_SPACING = 9;

export function hexCenter(col, row) {
  return { x: HEX_R + STEP_X * col, y: (col % 2 ? STEP_Y : STEP_Y / 2) + STEP_Y * row };
}

function toCube(col, row) { const x = col, z = row - ((col - (col & 1)) / 2); return { x: x, y: -x - z, z: z }; }
function fromCube(c) { return { col: c.x, row: c.z + ((c.x - (c.x & 1)) / 2) }; }
function cubeRound(x, y, z) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz; else if (dy > dz) ry = -rx - rz; else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}

/** Łańcuch heksów trasy między dwoma heksami (włącznie z końcami). */
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

/** Linie → łamane w px; wspólny korytarz rozdziela tory równolegle. */
export function routeLines(lines) {
  const paths = lines.map(function (l) { return l.fromHex && l.toHex ? hexLine(l.fromHex, l.toHex) : null; });
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
    if (!p) { const l = lines[li]; return l.from && l.to ? [l.from, l.to] : []; }
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
