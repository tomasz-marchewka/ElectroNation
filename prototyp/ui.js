/* ============================================================
   ElectroNation prototype — UI layer (map, cards, turn loop)
   Visual style per design handoff (dark, Barlow Condensed + Plex Mono).
   All user-facing strings are Polish by design; code stays English.
   ============================================================ */
"use strict";
const S = window.SIM;
const $ = (sel) => document.querySelector(sel);

/* ---------- formatting ---------- */
function fmtMoney(x) {
  const a = Math.abs(x);
  const sign = x < 0 ? "−" : "";
  if (a >= 1e9) return `${sign}${(a / 1e9).toFixed(2)} mld`;
  if (a >= 1e6) return `${sign}${(a / 1e6).toFixed(1)} mln`;
  if (a >= 1e3) return `${sign}${(a / 1e3).toFixed(0)} tys.`;
  return `${sign}${a.toFixed(0)}`;
}
function fmtMoneySigned(x) { return (x >= 0 ? "+" : "") + fmtMoney(x).replace("−", "−"); }
function fmtMW(x) { return `${Math.round(x)} MW`; }
function hh(h) { return `${String(h).padStart(2, "0")}:00`; }
const LAST = S.LAST_TURN;
function turnRange(t) { const T = S.TURNS[t]; return `${String(T.from).padStart(2, "0")}–${String(T.to).padStart(2, "0")}`; }
function turnTitle(t) { return `${turnRange(t)} · ${S.TURNS[t].label}`; }
function plDays(n) { // Polish plural for game days
  if (n === 1) return "1 doba";
  const d10 = n % 10, d100 = n % 100;
  return `${n} ${d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14) ? "doby" : "dób"}`;
}

/* ---------- UI state ---------- */
const UI = {
  sel: null,              // selected hex {q, r}; null = hex panel closed
  lineFrom: null,         // object id armed as the start of a new line
  lineType: "mv",         // line type key armed for drawing
  view: { x: 0, y: 0, k: 1 },
  planCache: null,        // last plan flow (forecast) for previews
  resolveAnim: null,
  stopNote: null,
};

/* ============================================================
   MAP
   ============================================================ */
const svg = $("#map-svg");
const NS = "http://www.w3.org/2000/svg";
let gWorld, gTerrain, gLines, gNodes, gOverlay;

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
}
function hexPoints(cx, cy, s) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 180 * (60 * i);
    pts.push(`${(cx + s * Math.cos(a)).toFixed(1)},${(cy + s * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(" ");
}
function initMap() {
  svg.setAttribute("viewBox", "0 0 760 620");
  svg.innerHTML = "";
  gWorld = el("g", {}, svg);
  gTerrain = el("g", {}, gWorld);
  gLines = el("g", {}, gWorld);
  gNodes = el("g", {}, gWorld);
  gOverlay = el("g", { "pointer-events": "none" }, gWorld);
  for (const hx of S.state.hexes) {
    const c = S.hexCenter(hx.q, hx.r);
    el("polygon", {
      points: hexPoints(c.x, c.y, 32.2),
      fill: S.TERRAIN[hx.terrain].color, stroke: "#0a0e12", "stroke-width": 1,
      "data-q": hx.q, "data-r": hx.r,
    }, gTerrain);
  }
  applyView();
}
function applyView() {
  gWorld.setAttribute("transform", `translate(${UI.view.x},${UI.view.y}) scale(${UI.view.k})`);
}

function lineColor(pct) {
  if (pct >= 1.0) return "var(--alarm)";
  if (pct >= 0.85) return "var(--high)";
  if (pct >= 0.6) return "var(--warn)";
  return "var(--ok)";
}
function stationLoadColor(o) {
  const cap = o.kind === "border" ? S.objCapMW(o) : S.junctionCap(o);
  const pct = cap > 0 ? (o.flowThrough || 0) / cap : 0;
  if (pct >= 0.95) return "#ff4d4f";
  if (pct >= 0.85) return "#ff7a45";
  if (pct >= 0.6) return "#ffb020";
  return null;
}
function nodeColorOf(o) {
  if (o.kind === "city") return o.connected ? "#e8f1f8" : "#5c6b7a";
  if (o.kind === "junction") return (o.state === "ready" && stationLoadColor(o)) || "#cfd8e3";
  if (o.kind === "border") return (o.state === "ready" && stationLoadColor(o)) || "#b07ce8";
  if (o.kind === "borderSite") return "#b07ce8";
  return S.TECH[o.tech].color.replace("var(--c-", "").length ? getComputedStyle(document.documentElement).getPropertyValue(S.TECH[o.tech].color.slice(4, -1)) || "#3ddc84" : "#3ddc84";
}
function nodeSymbol(o) {
  if (o.kind === "city") return "M";
  if (o.kind === "junction") return "▣";
  if (o.kind === "border" || o.kind === "borderSite") return "⇄";
  return S.TECH[o.tech].sym;
}
function nodeValueLine(o) {
  const st = S.state;
  if (o.state === "building") return `BUDOWA ${o.daysLeft}d`;
  if (o.kind === "city") {
    if (!o.connected) return "NIEPODŁĄCZONE";
    const d = S.cityDemandMW(o, Math.min(st.turn, LAST));
    return `${Math.round(d)} MW`;
  }
  if (o.kind === "junction") {
    return `${Math.round(o.flowThrough || 0)}/${S.junctionCap(o)} MW · ${S.usedSlots(o)}/${S.lineSlots(o)} przył.`;
  }
  if (o.kind === "borderSite") return "PUNKT GRANICZNY";
  if (o.kind === "border") return `${Math.round(o.flowThrough || 0)}/${S.objCapMW(o)} MW · ${o.setpoint > 0 ? "IMP" : o.setpoint < 0 ? "EKS" : "—"}`;
  if (o.kind === "storage") return `${Math.round(o.soc)}/${S.objEnergyCap(o)} MWh`;
  if (o.kind === "res") {
    if (o.enabled === false) return `WYŁ. · ${S.objCapMW(o)} MW`;
    const t = Math.min(st.turn, LAST);
    const mw = st.day.turns[t]
      ? (o.tech === "wind" ? S.farmWindMW(o, t) : S.farmPvMW(o, t)) // resolved → truth
      : farmForecastNow(o);
    return `${Math.round(mw)}/${S.objCapMW(o)} MW`;
  }
  return `${Math.round(clamp0(o.setpoint || 0, S.objCapMW(o)))}/${S.objCapMW(o)} MW`;
}
function enabledInstalled(tech) {
  return S.state.objects.filter(o => o.kind === "res" && o.state === "ready" && o.tech === tech && o.enabled !== false)
    .reduce((s, o) => s + S.objCapMW(o), 0);
}
function farmForecastNow(o) {
  if (o.enabled === false) return 0;
  const st = S.state;
  const fleetF = o.tech === "wind" ? S.forecastWindMW(st.turn, st.turn) : S.forecastPvMW(st.turn, st.turn);
  const inst = enabledInstalled(o.tech);
  return inst > 0 ? S.objCapMW(o) * (fleetF.mean / inst) : 0;
}

function renderMapDynamic() {
  gLines.innerHTML = "";
  gNodes.innerHTML = "";
  gOverlay.innerHTML = "";
  const st = S.state;
  // group lines by station pair for lane offsets
  const laneCount = new Map(), laneIdx = new Map();
  for (const l of st.lines) {
    const key = [Math.min(l.aId, l.bId), Math.max(l.aId, l.bId)].join("-");
    laneIdx.set(l.id, laneCount.get(key) || 0);
    laneCount.set(key, (laneCount.get(key) || 0) + 1);
  }
  for (const l of st.lines) {
    const key = [Math.min(l.aId, l.bId), Math.max(l.aId, l.bId)].join("-");
    const lanes = laneCount.get(key), lane = laneIdx.get(l.id);
    const off = (lane - (lanes - 1) / 2) * 5;
    const pts = l.path.map(p => S.hexCenter(p.q, p.r));
    // perpendicular offset relative to overall direction
    const dx = pts[pts.length - 1].x - pts[0].x, dy = pts[pts.length - 1].y - pts[0].y;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * off, oy = (dx / len) * off;
    const ptStr = pts.map(p => `${(p.x + ox).toFixed(1)},${(p.y + oy).toFixed(1)}`).join(" ");
    const lt = S.LINE_TYPES[l.type];
    const baseWidth = l.type === "hv" ? 3.4 : l.type === "mv" ? 2.5 : 1.7;
    const pct = l.state === "ready" ? (l.flow || 0) / lt.cap : 0;
    const stroke = l.state === "ready" ? lineColor(pct) : "#3a4757";
    el("polyline", {
      points: ptStr, fill: "none", stroke,
      "stroke-width": pct >= 0.85 ? baseWidth + 1 : baseWidth,
      "stroke-linejoin": "round", "stroke-linecap": "round",
      "stroke-dasharray": l.state === "building" ? "5 5" : "none",
      opacity: l.state === "building" ? 0.7 : 1,
    }, gLines);
    const mid = pts[Math.floor(pts.length / 2)];
    const label = l.state === "building" ? `${lt.short} ${l.hoursLeft}h` : `${lt.short} ${Math.round(pct * 100)}%`;
    el("text", { x: mid.x + ox, y: mid.y + oy - 5, "font-size": 9, fill: stroke, "text-anchor": "middle", class: "mono" }, gLines).textContent = label;
  }
  // nodes
  for (const o of st.objects) {
    const c = S.hexCenter(o.q, o.r);
    const color = nodeColorOf(o);
    const isSite = o.kind === "borderSite" && st.objects.some(b => b.kind === "border" && b.q === o.q && b.r === o.r);
    if (isSite) continue; // built border replaces its site marker
    const g = el("g", { transform: `translate(${c.x},${c.y})` }, gNodes);
    const r = o.kind === "city" ? 11 : 10;
    el("circle", {
      r, fill: "#0c1117", stroke: color, "stroke-width": 2,
      "stroke-dasharray": (o.state === "building" || o.kind === "borderSite") ? "3 3" : "none",
      opacity: o.kind === "borderSite" ? 0.75 : 1,
    }, g);
    const sym = el("text", { y: 3, "text-anchor": "middle", "font-size": 8, fill: color, class: "mono" }, g);
    sym.textContent = nodeSymbol(o);
    const name = el("text", { y: r + 11, "text-anchor": "middle", "font-size": 9.5, fill: "#e8f1f8" }, g);
    name.textContent = S.objName(o);
    const val = el("text", { y: r + 20, "text-anchor": "middle", "font-size": 8, fill: color, class: "mono" }, g);
    val.textContent = nodeValueLine(o);
    if (UI.lineFrom === o.id) el("circle", { r: r + 4, fill: "none", stroke: "var(--ok)", "stroke-dasharray": "4 2" }, g);
  }
  // selected hex outline (any hex, also empty)
  if (UI.sel) {
    const c = S.hexCenter(UI.sel.q, UI.sel.r);
    el("polygon", { points: hexPoints(c.x, c.y, 30), fill: "none", stroke: "#e8f1f8", "stroke-width": 1.6, "stroke-dasharray": "5 3" }, gOverlay);
  }
  // line-drawing mode: highlight valid target objects
  if (UI.lineFrom != null) {
    for (const o of st.objects) {
      if (o.id === UI.lineFrom || o.kind === "borderSite") continue;
      if (S.usedSlots(o) >= S.lineSlots(o)) continue;
      const c = S.hexCenter(o.q, o.r);
      el("circle", { cx: c.x, cy: c.y, r: 15, fill: "none", stroke: "rgba(61,220,132,.5)", "stroke-dasharray": "3 3" }, gOverlay);
    }
  }
}

/* map interactions: pan / zoom / click */
let panState = null;
svg.addEventListener("pointerdown", (ev) => {
  panState = { x: ev.clientX, y: ev.clientY, vx: UI.view.x, vy: UI.view.y, moved: false };
  svg.setPointerCapture(ev.pointerId);
  svg.classList.add("panning");
});
svg.addEventListener("pointermove", (ev) => {
  if (!panState) return;
  const dx = ev.clientX - panState.x, dy = ev.clientY - panState.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) panState.moved = true;
  if (panState.moved) {
    const scale = viewScale();
    UI.view.x = panState.vx + dx / scale;
    UI.view.y = panState.vy + dy / scale;
    applyView();
  }
});
svg.addEventListener("pointerup", (ev) => {
  svg.classList.remove("panning");
  const wasClick = panState && !panState.moved;
  panState = null;
  if (wasClick) onMapClick(ev);
});
function viewScale() {
  // CSS px per viewBox unit (uniform, meet)
  const r = svg.getBoundingClientRect();
  return Math.min(r.width / 760, r.height / 620);
}
function clientToWorld(ev) {
  const r = svg.getBoundingClientRect();
  const s = viewScale();
  const px = (ev.clientX - r.left - (r.width - 760 * s) / 2) / s;
  const py = (ev.clientY - r.top - (r.height - 620 * s) / 2) / s;
  return { x: (px - UI.view.x) / UI.view.k, y: (py - UI.view.y) / UI.view.k };
}
function worldToHex(x, y) {
  let best = null, bestD = 1e9;
  for (const hx of S.state.hexes) {
    const c = S.hexCenter(hx.q, hx.r);
    const d = (c.x - x) ** 2 + (c.y - y) ** 2;
    if (d < bestD) { bestD = d; best = hx; }
  }
  return bestD <= 34 * 34 ? best : null;
}
svg.addEventListener("wheel", (ev) => {
  ev.preventDefault();
  const w = clientToWorld(ev);
  const f = ev.deltaY < 0 ? 1.15 : 0.87;
  const k2 = Math.max(0.6, Math.min(4, UI.view.k * f));
  UI.view.x += w.x * (UI.view.k - k2);
  UI.view.y += w.y * (UI.view.k - k2);
  UI.view.k = k2;
  applyView();
}, { passive: false });
$("#zoom-in").onclick = () => { UI.view.k = Math.min(4, UI.view.k * 1.2); applyView(); };
$("#zoom-out").onclick = () => { UI.view.k = Math.max(0.6, UI.view.k * 0.83); applyView(); };
$("#zoom-reset").onclick = () => { UI.view = { x: 0, y: 0, k: 1 }; applyView(); };

function objectAt(q, r) {
  return S.state.objects.find(o => o.q === q && o.r === r && o.kind !== "borderSite")
    || S.state.objects.find(o => o.q === q && o.r === r);
}
function onMapClick(ev) {
  const w = clientToWorld(ev);
  const hx = worldToHex(w.x, w.y);
  if (!hx) { UI.sel = null; renderAll(); return; }
  onHexActivate(hx.q, hx.r);
}
function onHexActivate(q, r) {
  if (UI.lineFrom != null) {
    const from = S.state.objects.find(o => o.id === UI.lineFrom);
    const target = objectAt(q, r);
    if (!target || target.id === UI.lineFrom) {
      setHint("Linia musi dojść do innego obiektu — kliknij heks z obiektem (ESC anuluje).", false);
      return;
    }
    const res = S.buildLine(UI.lineFrom, target.id, UI.lineType);
    if (res.ok) setHint(`Budowa: ${S.LINE_TYPES[res.line.type].short} ${S.objName(from)} — ${S.objName(target)}, ${res.line.km} km, koszt ${fmtMoney(res.line.spentCapex)}.`, true);
    else setHint(`Nie można poprowadzić linii: ${res.why}.`, false);
    UI.lineFrom = null;
    UI.sel = { q, r };
    renderAll();
    computePlanPreview();
    return;
  }
  UI.sel = { q, r };
  renderAll();
}

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    if (UI.lineFrom != null) { UI.lineFrom = null; hintDefault(); }
    else UI.sel = null;
    renderAll();
  }
});
function hintDefault() {
  setHint("Kliknij dowolny heks — zobaczysz szczegóły i to, co można tam zbudować.", false);
}
function setHint(txt, active) {
  const hb = $("#hint-bar");
  hb.textContent = txt;
  hb.classList.toggle("active", !!active);
}

/* ============================================================
   DAY CHART (bottom)
   ============================================================ */
const STACK_ORDER = [
  ["nuclear", "--c-nuclear", "JĄDR"], ["coal", "--c-coal", "WĘGIEL"], ["ccgt", "--c-gas", "CCGT"],
  ["ocgt", "--c-gas", "OCGT"], ["pumped", "--c-pumped", "SZCZ-P"], ["battery", "--c-batt", "BAT"],
  ["import", "--c-imp", "IMPORT"], ["wind", "--c-wind", "WIATR"], ["pv", "--c-pv", "PV"],
];
function renderDayChart() {
  const st = S.state;
  const c = $("#day-chart");
  c.innerHTML = "";
  const x0 = 34, x1 = 950, y0 = 128, y1 = 10;
  const xh = (hpos) => x0 + (x1 - x0) * hpos / 24; // continuous hour position 0..24
  let peak = 100;
  for (let t = 0; t <= LAST; t++) {
    const f = S.forecastDemandMW(t, st.turn);
    peak = Math.max(peak, f.mean + f.band);
    const tr = st.day.turns[t];
    if (tr) peak = Math.max(peak, tr.demand, tr.served + tr.charge + tr.exportMW);
  }
  const ys = (v) => y0 - (y0 - y1) * v / (peak * 1.12);
  // turn boundary gridlines
  for (const T of S.TURNS) {
    el("line", { x1: xh(T.from), y1: y1, x2: xh(T.from), y2: y0, stroke: "#2a3542", "stroke-width": 1, opacity: 0.5 }, c);
  }
  // stacked step areas over resolved turns (turns resolve in order → contiguous)
  let baseVals = new Array(S.TURNS.length).fill(0);
  for (const [tech, cssVar] of STACK_ORDER) {
    const tops = baseVals.map((b, t) => b + (st.day.turns[t] ? (st.day.turns[t].byTech[tech] || 0) : 0));
    let d = "", started = false;
    for (let t = 0; t <= LAST; t++) {
      if (!st.day.turns[t]) continue;
      d += `${started ? "L" : "M"}${xh(S.TURNS[t].from)},${ys(tops[t])} L${xh(S.TURNS[t].to)},${ys(tops[t])} `;
      started = true;
    }
    if (started) {
      for (let t = LAST; t >= 0; t--) {
        if (!st.day.turns[t]) continue;
        d += `L${xh(S.TURNS[t].to)},${ys(baseVals[t])} L${xh(S.TURNS[t].from)},${ys(baseVals[t])} `;
      }
      el("path", { d: d + "Z", fill: `var(${cssVar})`, opacity: 0.8, stroke: "none" }, c);
    }
    baseVals = tops;
  }
  // demand: actual solid steps / forecast dashed steps + uncertainty band
  let dAct = "", dFc = "";
  const bandUp = [], bandDn = [];
  for (let t = 0; t <= LAST; t++) {
    const T = S.TURNS[t];
    const tr = st.day.turns[t];
    if (tr) dAct += `${dAct ? "L" : "M"}${xh(T.from)},${ys(tr.demand)} L${xh(T.to)},${ys(tr.demand)} `;
    else {
      const f = S.forecastDemandMW(t, st.turn);
      dFc += `${dFc ? "L" : "M"}${xh(T.from)},${ys(f.mean)} L${xh(T.to)},${ys(f.mean)} `;
      bandUp.push(`${xh(T.from)},${ys(f.mean + f.band)}`, `${xh(T.to)},${ys(f.mean + f.band)}`);
      bandDn.unshift(`${xh(T.from)},${ys(Math.max(0, f.mean - f.band))}`);
      bandDn.unshift(`${xh(T.to)},${ys(Math.max(0, f.mean - f.band))}`);
    }
  }
  if (bandUp.length > 1) el("polygon", { points: bandUp.join(" ") + " " + bandDn.join(" "), fill: "rgba(232,241,248,.08)", stroke: "none" }, c);
  if (dAct) el("path", { d: dAct, fill: "none", stroke: "#e8f1f8", "stroke-width": 2 }, c);
  if (dFc) el("path", { d: dFc, fill: "none", stroke: "#e8f1f8", "stroke-width": 1.4, "stroke-dasharray": "5 4", opacity: 0.8 }, c);
  // now line at the start of the current turn's block
  const cur = S.TURNS[Math.min(st.turn, LAST)];
  el("line", { x1: xh(cur.from), y1: 6, x2: xh(cur.from), y2: y0, stroke: "var(--ok)", "stroke-dasharray": "4 4", opacity: 0.8 }, c);
  // block start ticks
  for (const T of S.TURNS) {
    el("text", { x: xh(T.from), y: 144, "font-size": 9, fill: "#5c6b7a", "text-anchor": "middle", class: "mono" }, c).textContent = T.from;
  }
  el("text", { x: xh(24), y: 144, "font-size": 9, fill: "#5c6b7a", "text-anchor": "middle", class: "mono" }, c).textContent = "24";
  el("text", { x: 4, y: ys(peak), "font-size": 9, fill: "#5c6b7a", class: "mono" }, c).textContent = `${Math.round(peak)}`;
  el("text", { x: 4, y: y0, "font-size": 9, fill: "#5c6b7a", class: "mono" }, c).textContent = "0 MW";
  // legend
  $("#dc-legend").innerHTML = STACK_ORDER.map(([t, v, lbl]) =>
    `<span class="lg"><i style="background:var(${v})"></i>${lbl}</span>`).join("") +
    `<span class="lg"><i style="background:#e8f1f8"></i>POPYT</span>`;
}

/* ============================================================
   TOP BAR
   ============================================================ */
function renderTopbar() {
  const st = S.state;
  $("#date-line").textContent = `${S.CFG.monthNames[st.month]} · ROK ${st.year} · ${S.CFG.dayTypeNames[st.dayIdx]}`;
  // turn strip: one cell per turn, width proportional to the block length
  const strip = $("#turn-strip");
  strip.innerHTML = "";
  for (let t = 0; t <= LAST; t++) {
    const cell = document.createElement("div");
    cell.className = "ts-cell";
    cell.style.flexGrow = S.turnHours(t);
    const tr = st.day.turns[t];
    if (tr) {
      if (tr.unserved > 0.5) cell.classList.add("alarm");
      else if (tr.maxLoadPct >= 0.85 || (tr.maxStationPct || 0) >= 0.85 || tr.stormCut || (tr.availRes > 50 && tr.curtail > 0.4 * tr.availRes)) cell.classList.add("warn");
      else cell.classList.add("ok");
    }
    if (t === st.turn && st.phase !== "dayReport") cell.classList.add("now");
    cell.textContent = S.TURNS[t].from;
    cell.title = turnTitle(t);
    strip.appendChild(cell);
  }
  // budget (red when in the red — soft-fail state per doc 01 §9)
  const bv = $("#budget-value");
  bv.textContent = fmtMoney(st.budget);
  bv.style.color = st.budget < 0 ? "var(--alarm)" : "";
  const f = st.day.fin;
  const runVar = (f.revenue + f.exportRev - f.fuel - f.importCost - f.penalty) * S.CFG.repDays[st.dayIdx];
  const bd = $("#budget-day");
  bd.textContent = `doba: ≈ ${fmtMoneySigned(runVar)} zł`;
  bd.className = "budget-day " + (runVar >= 0 ? "pos" : "neg");
  // phase
  $("#turn-caption").textContent = st.phase === "dayReport" ? "DOBA ZAKOŃCZONA" : `TURA ${turnRange(st.turn)} · ${S.TURNS[st.turn].label}`;
  const pn = $("#phase-name");
  const map = { decision: ["NASTAWY", ""], resolving: ["ROZSTRZYGNIĘCIE", "resolve"], report: ["RAPORT", "report"], dayReport: ["RAPORT DOBY", "report"] };
  pn.textContent = map[st.phase][0];
  pn.className = "phase-name " + map[st.phase][1];
  // balance gauge
  updateBalanceBox();
  // action button
  const btn = $("#action-btn");
  btn.classList.toggle("busy", st.phase === "resolving");
  btn.textContent =
    st.phase === "decision" ? "ZATWIERDŹ TURĘ ▸" :
    st.phase === "resolving" ? "ROZSTRZYGANIE…" :
    st.phase === "report" ? (st.turn >= LAST ? "RAPORT DOBY ▸" : "NASTĘPNA TURA ▸") :
    "NOWA DOBA ▸";
}
function updateBalanceBox() {
  const st = S.state;
  const v = $("#bb-value"), sub = $("#bb-sub"), needle = $("#bb-needle");
  if (st.phase === "decision" || st.phase === "dayReport") {
    const t = Math.min(st.turn, LAST);
    const fd = S.forecastDemandMW(t, t);
    const plan = planSupplyTotal(t);
    const saldo = plan - fd.mean;
    v.textContent = `${saldo >= 0 ? "+" : "−"}${Math.abs(Math.round(saldo))} MW`;
    v.className = "bb-value " + (saldo < 0 ? "alarm" : saldo < fd.band ? "warn" : "");
    sub.textContent = `plan ${Math.round(plan)} · popyt ${Math.round(fd.mean)}±${Math.round(fd.band)}`;
    needle.style.left = `${clampPct(50 + saldo / 8)}%`;
  } else {
    const tr = st.day.turns[st.turn];
    if (!tr) return;
    if (tr.unserved > 0.5) {
      v.textContent = `−${Math.round(tr.unserved)} MW`;
      v.className = "bb-value alarm";
      sub.textContent = "ENERGIA NIEDOSTARCZONA";
      needle.style.left = `${clampPct(50 - tr.unserved / 8)}%`;
    } else {
      v.textContent = "OK";
      v.className = "bb-value";
      sub.textContent = `dostarczone ${Math.round(tr.served)} MW · straty ${Math.round(tr.losses)}`;
      needle.style.left = "50%";
    }
  }
}
function clampPct(x) { return Math.max(2, Math.min(98, x)); }
function planSupplyTotal(t) {
  const st = S.state;
  const hrs = S.turnHours(t);
  let sum = 0;
  for (const o of st.objects) {
    if (o.state !== "ready") continue;
    if (!S.hasNetLink(o) && o.kind !== "border" && o.kind !== "city") continue;
    if (o.kind === "plant") sum += clamp0(o.setpoint || 0, S.objCapMW(o));
    else if (o.kind === "res") {
      if (o.enabled === false) continue;
      const f = o.tech === "wind" ? S.forecastWindMW(t, st.turn) : S.forecastPvMW(t, st.turn);
      const inst = enabledInstalled(o.tech);
      sum += inst > 0 ? S.objCapMW(o) * f.mean / inst : 0;
    }
    else if (o.kind === "storage") { const sp = o.setpoint || 0; if (sp > 0) sum += Math.min(sp, o.soc / hrs); else sum -= Math.min(-sp, (S.objEnergyCap(o) - o.soc) / (S.TECH[o.tech].eff * hrs)); }
    else if (o.kind === "border") { const sp = o.setpoint || 0; sum += sp > 0 ? sp : sp; }
  }
  return sum;
}
function clamp0(x, hi) { return Math.max(0, Math.min(hi, x)); }

/* ============================================================
   OPS CARDS
   ============================================================ */
function miniChart(id, series, opts) {
  // series: [{pts: [{x,y}], color, dash, width}] with x in hours 0..24 (step
  // points per turn); band: {up: [{x,y}…], dn: [{x,y}… reversed], color}
  const W = 380, H = opts.h || 100;
  let out = `<svg class="mini-chart${opts.small ? " small" : ""}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  const ymax = opts.ymax || 100;
  const X = (x) => 6 + (W - 12) * x / 24;
  const Y = (v) => (H - 14) - (H - 22) * clampN(v, 0, ymax) / ymax;
  if (opts.band && opts.band.up.length > 1) {
    const up = opts.band.up.map(p => `${X(p.x)},${Y(p.y)}`).join(" ");
    const dn = opts.band.dn.map(p => `${X(p.x)},${Y(p.y)}`).join(" ");
    out += `<polygon points="${up} ${dn}" fill="${opts.band.color}" stroke="none"/>`;
  }
  for (const s of series) {
    let d = "";
    s.pts.forEach((p) => { if (p.y == null) return; d += (d ? "L" : "M") + `${X(p.x)},${Y(p.y)} `; });
    if (d) out += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="${s.width || 1.6}" ${s.dash ? `stroke-dasharray="${s.dash}"` : ""}/>`;
  }
  if (opts.now != null) out += `<line x1="${X(opts.now)}" y1="4" x2="${X(opts.now)}" y2="${H - 12}" stroke="var(--ok)" stroke-dasharray="3 3" opacity=".7"/>`;
  out += `<text x="${W - 4}" y="10" font-size="8" fill="#5c6b7a" text-anchor="end" font-family="IBM Plex Mono">${opts.label || ""} max ${Math.round(ymax)}</text>`;
  out += `</svg>`;
  return out;
}
function clampN(x, a, b) { return Math.max(a, Math.min(b, x)); }

function renderForecastCard() {
  const st = S.state;
  const card = $("#card-forecast");
  const active = st.phase === "decision";
  card.className = "card card-forecast" + (active ? " active" : " on");
  const t0 = st.turn;
  const nowX = S.TURNS[t0].from;
  // demand chart data (step per turn)
  let ymax = 100;
  const actPts = [], fcPts = [], bandUp = [], bandDn = [];
  for (let t = 0; t <= LAST; t++) {
    const T = S.TURNS[t];
    const tr = st.day.turns[t];
    if (tr) { actPts.push({ x: T.from, y: tr.demand }, { x: T.to, y: tr.demand }); ymax = Math.max(ymax, tr.demand); }
    else {
      const f = S.forecastDemandMW(t, t0);
      fcPts.push({ x: T.from, y: f.mean }, { x: T.to, y: f.mean });
      bandUp.push({ x: T.from, y: f.mean + f.band }, { x: T.to, y: f.mean + f.band });
      bandDn.unshift({ x: T.from, y: Math.max(0, f.mean - f.band) });
      bandDn.unshift({ x: T.to, y: Math.max(0, f.mean - f.band) });
      ymax = Math.max(ymax, f.mean + f.band);
    }
  }
  // wind / pv chart
  const wInst = S.installedWind(), pInst = S.installedPv();
  const wPts = [], wUp = [], wDn = [], pPts = [];
  let ymax2 = Math.max(50, wInst, pInst);
  for (let t = 0; t <= LAST; t++) {
    const T = S.TURNS[t];
    const resolved = !!st.day.turns[t];
    const fw = S.forecastWindMW(t, t0), fp = S.forecastPvMW(t, t0);
    wPts.push({ x: T.from, y: fw.mean }, { x: T.to, y: fw.mean });
    pPts.push({ x: T.from, y: fp.mean }, { x: T.to, y: fp.mean });
    if (!resolved) {
      const up = Math.min(wInst, fw.mean + fw.band), dn = Math.max(0, fw.mean - fw.band);
      wUp.push({ x: T.from, y: up }, { x: T.to, y: up });
      wDn.unshift({ x: T.from, y: dn });
      wDn.unshift({ x: T.to, y: dn });
    }
  }
  // briefing
  let peakT = t0, peakV = 0;
  for (let t = t0; t <= LAST; t++) { const f = S.forecastDemandMW(t, t0); if (f.mean > peakV) { peakV = f.mean; peakT = t; } }
  const wNow = S.forecastWindMW(Math.min(t0 + 1, LAST), t0).mean, wLater = S.forecastWindMW(Math.min(t0 + 2, LAST), t0).mean;
  const windTrend = wInst < 1 ? "—" : wLater < wNow * 0.6 ? "SŁABNIE ⚠" : wLater > wNow * 1.5 ? "wzmaga się" : "stabilny";
  // plan check for the remaining turns of the day
  let chips = "";
  for (let i = 1; i <= 6; i++) {
    const t = t0 + i;
    if (t > LAST) { chips += `<div class="h6">—</div>`; continue; }
    const f = S.forecastDemandMW(t, t0);
    const plan = planSupplyTotal(t);
    const cls = plan >= f.mean + f.band ? "ok" : plan >= f.mean - f.band ? "warn" : "alarm";
    const txt = plan >= f.mean + f.band ? "OK" : plan >= f.mean - f.band ? "RYZ" : "DEF";
    chips += `<div class="h6 ${cls}" title="${turnTitle(t)}: plan ${Math.round(plan)} vs popyt ${Math.round(f.mean)}±${Math.round(f.band)}">${String(S.TURNS[t].from).padStart(2, "0")}<br>${txt}</div>`;
  }
  card.innerHTML = `
    <div class="card-head"><span class="card-title" style="color:var(--info)">PROGNOZA</span>
      <span class="chip info">${turnTitle(t0)}</span></div>
    <div class="rowline"><span class="k">REŻIM MIESIĄCA</span><span class="info">${st.day.regimeLabel}</span></div>
    ${miniChart("fc-demand", [
      { pts: actPts, color: "#e8f1f8", width: 2 },
      { pts: fcPts, color: "#e8f1f8", dash: "5 4", width: 1.4 },
    ], { ymax: ymax * 1.1, now: nowX, label: "POPYT [MW]", band: { up: bandUp, dn: bandDn, color: "rgba(232,241,248,.09)" } })}
    ${miniChart("fc-res", [
      { pts: wPts, color: "var(--c-wind)", width: 1.8 },
      { pts: pPts, color: "var(--c-pv)", width: 1.6 },
    ], { ymax: ymax2 * 1.05, now: nowX, small: true, label: "WIATR/PV [MW]", band: { up: wUp, dn: wDn, color: "rgba(61,220,132,.10)" } })}
    <div class="rowline"><span class="k">SZCZYT</span><span>${turnRange(peakT)} · ${Math.round(peakV)} MW ±${Math.round(S.forecastDemandMW(peakT, t0).band)}</span></div>
    <div class="rowline"><span class="k">WIATR ZA 2 TURY</span><span class="${windTrend.includes("⚠") ? "warn" : ""}">${windTrend}</span></div>
    <div class="rowline"><span class="k">BILANS PRZY OBECNYCH NASTAWACH</span><span></span></div>
    <div class="h6-strip">${chips}</div>`;
}

function unitRowHTML(o) {
  const st = S.state;
  const t = S.TECH[o.tech];
  const noLink = !S.hasNetLink(o);
  const cap = S.objCapMW(o);
  if (o.kind === "plant") {
    return `<div class="unit">
      <div class="unit-head"><span class="unit-name">${t.label} #${o.id}</span>
        ${noLink ? '<span class="chip alarm">BRAK LINII</span>' : `<span class="chip ${o.setpoint > 0 ? "on" : ""}">${o.setpoint > 0 ? "W RUCHU" : "POSTÓJ"}</span>`}</div>
      <div class="unit-meta">${t.varCost} zł/MWh · 0–${cap} MW${o.expansion ? ` · rozbudowa ${o.expansion.daysLeft}d` : ""}</div>
      <div class="unit-row"><input type="range" min="0" max="${cap}" step="10" value="${Math.round(o.setpoint || 0)}" data-sp="${o.id}" ${noLink ? "disabled" : ""}>
        <span class="unit-val" id="spv-${o.id}">${Math.round(o.setpoint || 0)} MW</span></div></div>`;
  }
  if (o.kind === "res") {
    const on = o.enabled !== false;
    const fNow = farmForecastNow(o);
    return `<div class="unit">
      <div class="unit-head"><span class="unit-name">${t.label} #${o.id}</span>
        ${noLink ? '<span class="chip alarm">BRAK LINII</span>' : on ? '<span class="chip info">NIESTEROWALNE</span>' : '<span class="chip warn">WYŁĄCZONA</span>'}</div>
      <div class="unit-meta">moc zainst. ${cap} MW · prognoza teraz: <b style="color:${o.tech === "wind" ? "var(--c-wind)" : "var(--c-pv)"}">${Math.round(fNow)} MW</b></div>
      <button class="ghost-btn mini" data-res-toggle="${o.id}">${on ? "⏻ WYŁĄCZ FARMĘ" : "⏻ WŁĄCZ FARMĘ"}</button></div>`;
  }
  if (o.kind === "storage") {
    const soc = o.soc, ecap = S.objEnergyCap(o);
    return `<div class="unit">
      <div class="unit-head"><span class="unit-name">${t.label} #${o.id}</span>
        ${noLink ? '<span class="chip alarm">BRAK LINII</span>' : `<span class="chip ${o.setpoint ? "on" : ""}">${o.setpoint > 0 ? "ODDAJE" : o.setpoint < 0 ? "ŁADUJE" : "CZUWA"}</span>`}</div>
      <div class="unit-meta">${cap} MW / ${ecap} MWh · sprawność ${Math.round(S.TECH[o.tech].eff * 100)}% · SOC ${Math.round(soc)} MWh</div>
      <div class="unit-row"><input class="batt" type="range" min="${-cap}" max="${cap}" step="10" value="${Math.round(o.setpoint || 0)}" data-sp="${o.id}" ${noLink ? "disabled" : ""}>
        <span class="unit-val" id="spv-${o.id}">${spLabelStorage(o.setpoint || 0)}</span></div>
      <div class="soc-bar"><div class="soc-fill" style="width:${ecap ? soc / ecap * 100 : 0}%"></div></div></div>`;
  }
  if (o.kind === "border") {
    const capB = S.objCapMW(o);
    return `<div class="unit">
      <div class="unit-head"><span class="unit-name">${o.name}</span><span class="chip ${o.setpoint ? "on" : ""}">${o.setpoint > 0 ? "IMPORT" : o.setpoint < 0 ? "EKSPORT" : "0"}</span></div>
      <div class="unit-meta">import ${S.CFG.importPrice} zł/MWh · eksport ${S.CFG.exportPrice} zł/MWh · ⩽${capB} MW</div>
      <div class="unit-row"><input class="border-sl" type="range" min="${-capB}" max="${capB}" step="10" value="${Math.round(o.setpoint || 0)}" data-sp="${o.id}">
        <span class="unit-val" id="spv-${o.id}">${spLabelBorder(o.setpoint || 0)}</span></div></div>`;
  }
  return "";
}
function spLabelStorage(v) { return v > 0 ? `ODDAJ ${Math.round(v)}` : v < 0 ? `ŁADUJ ${Math.round(-v)}` : "0 MW"; }
function spLabelBorder(v) { return v > 0 ? `IMP ${Math.round(v)}` : v < 0 ? `EKS ${Math.round(-v)}` : "0 MW"; }

function renderSetpointsCard() {
  const st = S.state;
  const card = $("#card-setpoints");
  const active = st.phase === "decision";
  card.className = "card card-setpoints" + (active ? " active" : "");
  const plants = st.objects.filter(o => o.kind === "plant" && o.state === "ready");
  const res = st.objects.filter(o => o.kind === "res" && o.state === "ready");
  const stor = st.objects.filter(o => o.kind === "storage" && o.state === "ready");
  const borders = st.objects.filter(o => o.kind === "border" && o.state === "ready");
  let html = `<div class="card-head"><span class="card-title" style="color:var(--ok)">NASTAWY</span>
    <span class="chip ${active ? "on" : ""}">${active ? "● AKTYWNA" : "OCZEKUJE"}</span></div>`;
  if (!plants.length && !res.length && !stor.length && !borders.length) {
    html += `<div class="unit-meta">Brak jednostek. Kliknij heks na mapie, żeby zbudować elektrownię; linię poprowadzisz z panelu obiektu.</div>`;
  }
  if (plants.length) html += `<div class="sec-label">Elektrownie</div>` + plants.map(unitRowHTML).join("");
  if (res.length) html += `<div class="sec-label">OZE</div>` + res.map(unitRowHTML).join("");
  if (stor.length) html += `<div class="sec-label">Magazyny</div>` + stor.map(unitRowHTML).join("");
  if (borders.length) html += `<div class="sec-label">Wymiana transgraniczna</div>` + borders.map(unitRowHTML).join("");
  html += `<div class="balance-summary" id="balance-summary"></div>
    <button class="ghost-btn" id="skip-event">PRZEWIŃ, AŻ COŚ SIĘ STANIE ▸▸</button>
    <button class="ghost-btn" id="skip-day">PRZEWIŃ DO KOŃCA DOBY ▸|</button>`;
  card.innerHTML = html;
  card.querySelectorAll("input[type=range]").forEach(inp => {
    inp.addEventListener("input", () => {
      const id = +inp.dataset.sp;
      const o = st.objects.find(x => x.id === id);
      o.setpoint = +inp.value;
      const lbl = $(`#spv-${id}`);
      if (lbl) lbl.textContent = o.kind === "storage" ? spLabelStorage(o.setpoint) : o.kind === "border" ? spLabelBorder(o.setpoint) : `${Math.round(o.setpoint)} MW`;
      schedulePlanPreview();
    });
  });
  card.querySelectorAll("[data-res-toggle]").forEach(btn => btn.addEventListener("click", () => {
    const o = st.objects.find(x => x.id === +btn.dataset.resToggle);
    o.enabled = o.enabled === false;
    renderAll();
    computePlanPreview();
  }));
  $("#skip-event")?.addEventListener("click", () => skipTurns(true));
  $("#skip-day")?.addEventListener("click", () => skipTurns(false));
  updateBalanceSummary();
}
function updateBalanceSummary() {
  const st = S.state;
  const box = $("#balance-summary");
  if (!box || st.phase !== "decision") { if (box) box.innerHTML = ""; return; }
  const t = st.turn;
  const fd = S.forecastDemandMW(t, t);
  const plan = planSupplyTotal(t);
  const saldo = plan - fd.mean;
  const cls = saldo < 0 ? "alarm" : saldo < fd.band ? "warn" : "ok";
  let netLine = "";
  if (UI.planCache) {
    const served = [...UI.planCache.res.sinkServed.entries()].filter(([k]) => k.startsWith("c")).reduce((s, [, v]) => s + v, 0);
    const deficit = Math.max(0, fd.mean - served);
    netLine = `<div class="rowline"><span class="k">PO SIECI (est.)</span>
      <span class="${deficit > 1 ? "neg" : "pos"}">dostarczalne ${Math.round(served)} / ${Math.round(fd.mean)} MW${deficit > 1 ? ` · WĄSKIE GARDŁO −${Math.round(deficit)}` : ""}</span></div>`;
  }
  box.className = "balance-summary " + cls;
  box.innerHTML = `
    <div class="rowline"><span class="k">PLAN PODAŻY</span><span>${Math.round(plan)} MW</span></div>
    <div class="rowline"><span class="k">POPYT (PROGNOZA)</span><span>${Math.round(fd.mean)} ±${Math.round(fd.band)} MW</span></div>
    <div class="rowline"><span class="k">SALDO</span><span class="${saldo < 0 ? "neg" : saldo < fd.band ? "warn" : "pos"}">${saldo >= 0 ? "+" : "−"}${Math.abs(Math.round(saldo))} MW</span></div>
    ${netLine}`;
}
let planPreviewTimer = null;
function schedulePlanPreview() {
  updateBalanceBox();
  if (planPreviewTimer) return;
  planPreviewTimer = setTimeout(() => {
    planPreviewTimer = null;
    computePlanPreview();
  }, 120);
}
function computePlanPreview() {
  const st = S.state;
  if (st.phase !== "decision") { UI.planCache = null; return; }
  UI.planCache = S.planFlow(st.turn);
  for (const l of st.lines) if (l.state === "ready") l.flow = UI.planCache.res.lineFlow.get(l.id) || 0;
  for (const o of st.objects) {
    if ((o.kind === "junction" || o.kind === "border") && o.state === "ready") {
      o.flowThrough = UI.planCache.res.stationFlow.get(o.id) || 0;
    }
  }
  renderMapDynamic();
  updateBalanceSummary();
  updateBalanceBox();
}

function renderResolveCard() {
  const st = S.state;
  const card = $("#card-resolve");
  const active = st.phase === "resolving" || st.phase === "report";
  card.className = "card card-resolve" + (st.phase === "resolving" ? " active" : active ? " on" : "");
  const tr = st.day.turns[st.turn] && st.phase !== "decision" ? st.day.turns[st.turn] : lastResolved();
  let html = `<div class="card-head"><span class="card-title" style="color:var(--warn)">ROZSTRZYGNIĘCIE</span>
    <span class="chip ${st.phase === "resolving" ? "warn" : ""}">${tr ? "TURA " + turnRange(tr.t) : "OCZEKUJE"}</span></div>`;
  if (!tr) html += `<div class="unit-meta">Jeszcze nic się nie rozstrzygnęło.</div>`;
  else {
    const dW = tr.truthWind - tr.fcWind;
    html += `
      <div class="rowline"><span class="k">POPYT (ŚR.)</span><span>prog. ${Math.round(tr.fcDemand)} → <b>${Math.round(tr.demand)}</b> MW</span></div>
      <div class="rowline"><span class="k">WIATR</span><span class="${Math.abs(dW) > 30 ? "warn" : ""}">prog. ${Math.round(tr.fcWind)} → <b>${Math.round(tr.truthWind)}</b> MW (${dW >= 0 ? "+" : ""}${Math.round(dW)})</span></div>
      <div class="rowline"><span class="k">PV</span><span>prog. ${Math.round(tr.fcPv)} → <b>${Math.round(tr.truthPv)}</b> MW</span></div>
      <div class="rowline"><span class="k">DOSTARCZONO</span><span class="${tr.unserved > 0.5 ? "neg" : "pos"}">${Math.round(tr.served)} / ${Math.round(tr.demand)} MW śr. przez ${tr.hours} h</span></div>
      <div class="rowline"><span class="k">STRATY SIECIOWE</span><span>${Math.round(tr.losses)} MW</span></div>
      ${tr.curtail > 1 ? `<div class="rowline"><span class="k">PRZYCIĘTE OZE</span><span class="warn">${Math.round(tr.curtail)} MW</span></div>` : ""}
      ${tr.exportMW > 1 ? `<div class="rowline"><span class="k">EKSPORT</span><span>${Math.round(tr.exportMW)} MW</span></div>` : ""}
      ${tr.charge > 1 ? `<div class="rowline"><span class="k">ŁADOWANIE MAGAZYNÓW</span><span>${Math.round(tr.charge)} MW</span></div>` : ""}`;
    if (tr.unserved > 0.5) {
      const cities = tr.cityRes.filter(c => c.unserved > 0.5).map(c => `${c.name} −${Math.round(c.unserved)} MW`).join(", ");
      html += `<div class="event-box">⚠ NIEDOBÓR MOCY: ${cities}</div>`;
    }
    if (tr.stormCut) html += `<div class="event-box warn">⚠ WYŁĄCZENIE SZTORMOWE — wiatr ≥ 25 m/s, turbiny stają</div>`;
    if (UI.stopNote) html += `<div class="event-box warn">⏸ PRZEWIJANIE ZATRZYMANE: ${UI.stopNote}</div>`;
  }
  card.innerHTML = html;
}
function lastResolved() {
  const st = S.state;
  for (let t = LAST; t >= 0; t--) if (st.day.turns[t]) return st.day.turns[t];
  return null;
}

function renderReportCard() {
  const st = S.state;
  const card = $("#card-report");
  const tr = lastResolved();
  card.className = "card card-report" + (st.phase === "report" || st.phase === "dayReport" ? " active" : "");
  let html = `<div class="card-head"><span class="card-title">RAPORT</span>
    <span class="chip">${tr ? "TURA " + turnRange(tr.t) : "OCZEKUJE"}</span></div>`;
  if (tr) {
    const result = tr.revenue + tr.exportRev - tr.fuel - tr.importCost - tr.penalty;
    html += `
      <div class="rowline"><span class="k">PRZYCHÓD (${S.CFG.tariff} zł/MWh · ${tr.hours} h)</span><span class="pos">+${fmtMoney(tr.revenue)}</span></div>
      ${tr.exportRev > 0 ? `<div class="rowline"><span class="k">EKSPORT</span><span class="pos">+${fmtMoney(tr.exportRev)}</span></div>` : ""}
      <div class="rowline"><span class="k">PALIWO</span><span class="neg">−${fmtMoney(tr.fuel)}</span></div>
      ${tr.importCost > 0 ? `<div class="rowline"><span class="k">IMPORT</span><span class="neg">−${fmtMoney(tr.importCost)}</span></div>` : ""}
      ${tr.penalty > 0 ? `<div class="rowline"><span class="k">KARY (niedostarczenie)</span><span class="neg">−${fmtMoney(tr.penalty)}</span></div>` : ""}
      <div class="rowline total"><span class="k">WYNIK TURY</span><span class="${result >= 0 ? "pos" : "neg"}">${fmtMoneySigned(result)} zł</span></div>`;
  } else html += `<div class="unit-meta">Rozegraj pierwszą turę.</div>`;
  card.innerHTML = html;
}

/* ============================================================
   HEX PANEL (docked over the map's right edge)
   Clicking any hex opens it: terrain info, the build catalog for
   that hex (the only way to build), object details and actions.
   ============================================================ */
const CATALOG = [
  { sec: "Wytwarzanie sterowalne", items: ["nuclear", "coal", "ccgt", "ocgt"] },
  { sec: "OZE (pogodozależne)", items: ["wind", "pv"] },
  { sec: "Magazyny energii", items: ["battery", "pumped"] },
  { sec: "Sieć i granica", items: ["junction", "border"] },
];
function buildItemHTML(key, q, r) {
  const t = S.TECH[key];
  const cost = S.buildCost(key, q, r);
  let meta = "";
  if (t.kind === "plant") meta = `blok ${t.block} MW · ${t.varCost} zł/MWh · ${plDays(t.buildDays)}`;
  else if (t.kind === "res") meta = `${t.block} MW · koszt zmienny ~0 · ${plDays(t.buildDays)}`;
  else if (t.kind === "storage") meta = `${t.powerBlock} MW / ${t.energyBlock} MWh · η ${Math.round(t.eff * 100)}% · ${plDays(t.buildDays)}`;
  else if (key === "junction") meta = `${t.capMW} MW · ${t.fields} przyłączy · ${plDays(t.buildDays)} · łączy/rozdziela linie`;
  else if (key === "border") meta = `${t.capMW} MW · imp ${S.CFG.importPrice} / eks ${S.CFG.exportPrice} zł/MWh · ${plDays(t.buildDays)}`;
  const afford = S.state.budget >= cost;
  return `<div class="cat-item${afford ? "" : " disabled"}" data-build="${key}" title="${afford ? "Kliknij, aby zbudować" : "Brak środków"}">
    <div><div class="nm">${t.label}</div><div class="meta">${meta}</div></div>
    <div class="price">${fmtMoney(cost)}</div></div>`;
}
function buildListHTML(q, r) {
  const groups = [];
  for (const sec of CATALOG) {
    const ok = sec.items.filter(k => S.canBuildAt(k, q, r).ok);
    if (ok.length) groups.push({ sec: sec.sec, keys: ok });
  }
  if (!groups.length) {
    const why = S.canBuildAt("ccgt", q, r).why;
    return `<div class="sec-label">Budowa</div><div class="unit-meta">Nie można tu budować${why ? ` — ${why}` : ""}.</div>`;
  }
  let html = `<div class="sec-label">Co można zbudować (klik = budowa)</div>
    <div class="unit-meta">Ceny zawierają mnożnik terenu ×${S.TERRAIN[S.hexAt(S.state, q, r).terrain].mult}.</div>`;
  for (const g of groups) html += g.keys.map(k => buildItemHTML(k, q, r)).join("");
  return html;
}
function linesThroughHex(q, r) {
  return S.state.lines.filter(l => l.path.some(p => p.q === q && p.r === r));
}
function lineSectionHTML(l) {
  const lt = S.LINE_TYPES[l.type];
  const a = S.state.objects.find(x => x.id === l.aId), b = S.state.objects.find(x => x.id === l.bId);
  const pct = Math.round((l.flow || 0) / lt.cap * 100);
  const tapNames = l.taps.map(t => S.objName(S.state.objects.find(x => x.id === t.id))).join(", ");
  return `<div class="hp-head sub"><span class="hp-title">${lt.label}</span>${objChip(l)}</div>
    <div class="rowline"><span class="k">TRASA</span><span>${a ? S.objName(a) : "?"} — ${b ? S.objName(b) : "?"}</span></div>
    ${tapNames ? `<div class="rowline"><span class="k">ODGAŁĘZIENIA</span><span>${tapNames}</span></div>` : ""}
    <div class="rowline"><span class="k">DŁUGOŚĆ / STRATY</span><span>${l.km} km · ${(lt.lossPer100 * l.km / 100 * 100).toFixed(1)}%</span></div>
    <div class="rowline"><span class="k">PRZESYŁ</span><span>${Math.round(l.flow || 0)} / ${lt.cap} MW (${pct}%)</span></div>
    ${l.state === "building" ? `<button class="ghost-btn danger" data-cancel="${l.id}">✕ ANULUJ BUDOWĘ LINII (nakłady przepadają)</button>` : ""}`;
}
function objActionsHTML(o) {
  let html = "";
  if (o.kind !== "borderSite" && S.usedSlots(o) < S.lineSlots(o)) {
    html += `<div class="sec-label">Poprowadź linię stąd (przyłącza ${S.usedSlots(o)}/${S.lineSlots(o)})</div>`;
    for (const [key, lt] of Object.entries(S.LINE_TYPES)) {
      html += `<div class="cat-item" data-line-from="${o.id}" data-line-type="${key}">
        <div><div class="nm">⚡ ${lt.short} — ${lt.cap} MW</div>
        <div class="meta">straty ${lt.lossPer100 * 100}%/100 km · ${lt.buildHoursPerHex} h/heks</div></div>
        <div class="price">${fmtMoney(lt.costPerKm)}/km</div></div>`;
    }
  }
  if (o.state === "building" || o.expansion) {
    html += `<button class="ghost-btn danger" data-cancel="${o.id}">✕ ANULUJ ${o.state === "building" ? "BUDOWĘ" : "ROZBUDOWĘ"} (nakłady przepadają)</button>`;
  }
  return html;
}
function renderHexPanel() {
  const panel = $("#hex-panel");
  if (!UI.sel) { panel.hidden = true; return; }
  const { q, r } = UI.sel;
  const st = S.state;
  const hx = S.hexAt(st, q, r);
  const t = S.TERRAIN[hx.terrain];
  const obj = objectAt(q, r);
  let html = `<div class="hp-head"><span class="hp-title">HEKS [${q},${r}] — ${t.label.toUpperCase()}</span>
    <button class="hp-close" id="hp-close" title="Zamknij (ESC)">✕</button></div>
    <div class="rowline"><span class="k">KOSZT TERENU</span><span>×${t.mult}</span></div>
    <div class="rowline"><span class="k">WIATR / SŁOŃCE</span><span>×${hx.windClass.toFixed(2)} · ×${hx.sunClass.toFixed(2)}</span></div>
    ${S.isPumpedSite(st, q, r) ? `<div class="rowline"><span class="k">LOKALIZACJA</span><span class="pos">✓ szczytowo-pompowa</span></div>` : ""}`;
  if (obj) {
    html += `<div class="hp-head sub"><span class="hp-title">${objTitle(obj)}</span>${objChip(obj)}</div>
      ${objectInfoHTML(obj)}${objActionsHTML(obj)}`;
  }
  for (const l of linesThroughHex(q, r)) html += lineSectionHTML(l);
  if (!obj || obj.kind === "borderSite") html += buildListHTML(q, r);
  panel.innerHTML = html;
  panel.hidden = false;
  $("#hp-close").addEventListener("click", () => { UI.sel = null; UI.lineFrom = null; renderAll(); });
  panel.querySelectorAll("[data-build]").forEach(el2 => el2.addEventListener("click", () => {
    const res = S.build(el2.dataset.build, q, r);
    if (res.ok) setHint(`Rozpoczęto budowę: ${S.objName(res.obj)} — koszt ${fmtMoney(res.obj.spentCapex)}.`, true);
    else setHint(`Nie można budować: ${res.why}.`, false);
    renderAll();
    computePlanPreview();
  }));
  panel.querySelectorAll("[data-line-from]").forEach(el2 => el2.addEventListener("click", () => {
    UI.lineFrom = +el2.dataset.lineFrom;
    UI.lineType = el2.dataset.lineType;
    const o = st.objects.find(x => x.id === UI.lineFrom);
    const lt = S.LINE_TYPES[UI.lineType];
    setHint(`${lt.label} z ${S.objName(o)}: kliknij heks z obiektem docelowym (ESC anuluje). ${fmtMoney(lt.costPerKm)}/km × teren; mijane obiekty zostaną przyłączone.`, true);
    renderAll();
  }));
  panel.querySelectorAll("[data-cancel]").forEach(el2 => el2.addEventListener("click", () => {
    S.cancelConstruction(+el2.dataset.cancel);
    renderAll();
    computePlanPreview();
  }));
  if (obj) bindObjActions(panel, obj);
}
function renderQueue() {
  const st = S.state;
  const card = $("#card-queue");
  const items = []; // left/total in game days (lines converted from hours) for the fast-forward button
  for (const o of st.objects) {
    if (o.state === "building") items.push({ id: o.id, name: S.objName(o), left: o.daysLeft, total: S.TECH[o.tech].buildDays, leftLabel: `${plDays(o.daysLeft)} gry` });
    if (o.expansion) items.push({ id: o.id, name: `${S.objName(o)} (rozbudowa)`, left: o.expansion.daysLeft, total: o.expansion.daysLeft + 1, leftLabel: `${plDays(o.expansion.daysLeft)} gry` });
  }
  for (const l of st.lines) if (l.state === "building") {
    const lt = S.LINE_TYPES[l.type];
    const total = (l.path.length - 1) * lt.buildHoursPerHex;
    items.push({ id: l.id, name: `${lt.short} ${l.km} km`, left: Math.ceil(l.hoursLeft / 24), total: Math.ceil(total / 24), frac: 1 - l.hoursLeft / total, leftLabel: `${l.hoursLeft} h gry` });
  }
  let html = `<div class="card-head"><span class="card-title">BUDOWY W TOKU</span><span class="chip">${items.length}</span></div>`;
  if (!items.length) html += `<div class="unit-meta">Nic się nie buduje.</div>`;
  for (const it of items) {
    const frac = it.frac ?? (1 - it.left / it.total);
    html += `<div class="q-item"><div class="q-head"><span>${it.name}</span>
      <button class="q-cancel" data-cancel="${it.id}" title="Anulowanie = utrata nakładów">✕ anuluj</button></div>
      <div class="q-bar"><div class="q-fill" style="width:${frac * 100}%"></div></div>
      <div class="q-meta"><span>pozostało ${it.leftLabel}</span><span>${Math.round(frac * 100)}%</span></div></div>`;
  }
  if (items.length) {
    const minLeft = Math.max(1, Math.min(...items.map(i => i.left)));
    html += `<button class="ghost-btn" id="ff-build" title="Przewija całe doby z bieżącymi nastawami — ryzyko kar!">⏩ PRZEWIŃ ${minLeft === 1 ? "1 DOBĘ" : plDays(minLeft).toUpperCase()} (DO UKOŃCZENIA)</button>`;
  }
  card.innerHTML = html;
  card.className = "card on";
  card.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", () => { S.cancelConstruction(+b.dataset.cancel); renderAll(); }));
  $("#ff-build")?.addEventListener("click", () => {
    const minLeft = Math.max(1, Math.min(...items.map(i => i.left)));
    fastForwardDays(minLeft);
  });
}
function renderSystems() {
  const st = S.state;
  const card = $("#card-systems");
  const lvl = S.CFG.forecastLevels[st.forecastLevel];
  const next = S.CFG.forecastLevels[st.forecastLevel + 1];
  card.className = "card on";
  card.innerHTML = `<div class="card-head"><span class="card-title">SYSTEMY PROGNOSTYCZNE</span>
    <span class="chip info">${lvl.name}</span></div>
    <div class="rowline"><span class="k">BŁĄD PROGNOZY</span><span>×${lvl.mult.toFixed(1)} · wiatr +6h: ±${Math.round(S.sigmaAt("wind", 6) * 100)}% mocy zainst.</span></div>
    ${next ? `<button class="ghost-btn" id="buy-fc">ULEPSZ: ${next.name} (błąd ×${next.mult}) — ${fmtMoney(next.cost)}</button>` : `<div class="unit-meta">Maksymalny poziom.</div>`}`;
  $("#buy-fc")?.addEventListener("click", () => {
    const r = S.buyForecastUpgrade();
    if (!r.ok) setHint(`Nie można: ${r.why}.`, false);
    renderAll();
  });
}
/* object info — rendered inside the hex panel */
function isLine(o) { return o.aId !== undefined; }
function objTitle(o) { return isLine(o) ? S.LINE_TYPES[o.type].label : S.objName(o); }
function objChip(o) {
  if (isLine(o)) return `<span class="chip ${o.state === "ready" ? "on" : "warn"}">${o.state === "ready" ? "PRACUJE" : `BUDOWA ${o.hoursLeft}h`}</span>`;
  if (o.state === "building") return `<span class="chip warn">BUDOWA ${o.daysLeft}d</span>`;
  if (o.kind === "city") return `<span class="chip ${o.connected ? "on" : ""}">${o.connected ? "PRZYŁĄCZONE" : "NIEPODŁĄCZONE"}</span>`;
  return `<span class="chip on">PRACUJE</span>`;
}
function objectInfoHTML(o) {
  const st = S.state;
  let rows = "";
  if (o.kind === "city") {
    const linked = S.hasNetLink(o);
    const t = Math.min(st.turn, LAST);
    const growthPct = S.CFG.growthPerYear * Math.max(0, 1 - o.peak / o.peakMax) * 100;
    rows = `<div class="rowline"><span class="k">SZCZYT ZAPOTRZEBOWANIA</span><span>${Math.round(o.peak)} MW</span></div>
      <div class="rowline"><span class="k">POJEMNOŚĆ MIASTA</span><span>${Math.round(o.peakMax)} MW (wyk. ${Math.round(o.peak / o.peakMax * 100)}%)</span></div>
      <div class="rowline"><span class="k">WZROST</span><span>~${growthPct.toFixed(1)}%/rok</span></div>
      ${o.connected ? `<div class="rowline"><span class="k">POBÓR TERAZ</span><span>${Math.round(S.cityDemandMW(o, t))} MW</span></div>` : ""}
      <div class="rowline"><span class="k">TARYFA</span><span>${S.CFG.tariff} zł/MWh dostarczonej</span></div>
      <div class="rowline"><span class="k">LINIE</span><span>${S.usedSlots(o)} / ${S.lineSlots(o)}${linked ? "" : ' · <span class="neg">brak gotowej linii</span>'}</span></div>`;
    if (!o.connected) rows += `<button class="ghost-btn" data-act="connect" ${linked ? "" : "disabled"}>PRZYŁĄCZ MIASTO — ${fmtMoney(S.CFG.cityConnectCost)}</button>`;
  } else if (o.kind === "junction") {
    const pct = Math.round((o.flowThrough || 0) / S.junctionCap(o) * 100);
    rows = `<div class="rowline"><span class="k">PRZEPUSTOWOŚĆ</span><span>${S.junctionCap(o)} MW</span></div>
      <div class="rowline"><span class="k">PRZEPŁYW TERAZ</span><span class="${pct >= 85 ? "warn" : ""}">${Math.round(o.flowThrough || 0)} MW (${pct}%)</span></div>
      <div class="rowline"><span class="k">PRZYŁĄCZA LINII</span><span>${S.usedSlots(o)} / ${S.lineSlots(o)}</span></div>
      <div class="rowline"><span class="k">ROLA</span><span>zbiera i rozdziela linie</span></div>`;
  } else if (o.kind === "border") {
    rows = `<div class="rowline"><span class="k">ZDOLNOŚĆ</span><span>${S.objCapMW(o)} MW</span></div>
      <div class="rowline"><span class="k">CENY</span><span>imp ${S.CFG.importPrice} / eks ${S.CFG.exportPrice} zł/MWh</span></div>
      <div class="rowline"><span class="k">LINIE</span><span>${S.usedSlots(o)} / ${S.lineSlots(o)}</span></div>`;
  } else if (o.kind === "borderSite") {
    rows = `<div class="unit-meta">Punkt graniczny — przyłącze graniczne zbudujesz z listy poniżej.</div>`;
  } else if (o.kind === "storage") {
    rows = `<div class="rowline"><span class="k">MOC / POJEMNOŚĆ</span><span>${S.objCapMW(o)} MW / ${S.objEnergyCap(o)} MWh</span></div>
      <div class="rowline"><span class="k">SOC</span><span>${Math.round(o.soc)} MWh</span></div>
      <div class="rowline"><span class="k">SPRAWNOŚĆ CYKLU</span><span>${Math.round(S.TECH[o.tech].eff * 100)}%</span></div>
      <div class="rowline"><span class="k">LINIE</span><span>${S.usedSlots(o)} / ${S.lineSlots(o)}${S.hasNetLink(o) ? "" : ' · <span class="neg">brak gotowej linii</span>'}</span></div>`;
  } else {
    const hx = S.hexAt(st, o.q, o.r);
    rows = `<div class="rowline"><span class="k">MOC</span><span>${S.objCapMW(o)} MW (${o.blocks || 1}× blok)</span></div>`;
    if (o.kind === "res") rows += `<div class="rowline"><span class="k">LOKALIZACJA</span><span>wiatr ×${hx.windClass.toFixed(2)} · słońce ×${hx.sunClass.toFixed(2)}</span></div>`;
    if (o.kind === "plant") rows += `<div class="rowline"><span class="k">KOSZT ZMIENNY</span><span>${S.TECH[o.tech].varCost} zł/MWh</span></div>`;
    rows += `<div class="rowline"><span class="k">LINIE</span><span>${S.usedSlots(o)} / ${S.lineSlots(o)}${S.hasNetLink(o) ? "" : ' · <span class="neg">brak gotowej linii!</span>'}</span></div>`;
  }
  if (!isLine(o) && o.state === "ready" && !o.expansion && o.kind !== "city" && o.kind !== "borderSite") {
    const info = S.expansionInfo(o);
    rows += info
      ? `<button class="ghost-btn" data-act="expand">ROZBUDUJ: ${info.label} — ${fmtMoney(info.cost)} · ${info.days}d</button>`
      : `<div class="unit-meta">Limit lokalizacji osiągnięty — jedyną drogą jest nowa lokalizacja.</div>`;
  }
  return rows;
}
function bindObjActions(container, o) {
  container.querySelector('[data-act="connect"]')?.addEventListener("click", () => {
    const r = S.connectCity(o.id);
    if (!r.ok) setHint(`Nie można: ${r.why}.`, false);
    renderAll();
    computePlanPreview();
  });
  container.querySelector('[data-act="expand"]')?.addEventListener("click", () => {
    const r = S.expand(o.id);
    if (!r.ok) setHint(`Nie można: ${r.why}.`, false);
    renderAll();
  });
}
/* ============================================================
   TURN LOOP
   ============================================================ */
$("#action-btn").addEventListener("click", onAction);
function onAction() {
  const st = S.state;
  UI.stopNote = null;
  if (st.phase === "decision") {
    st.phase = "resolving";
    renderTopbar(); renderResolveCard();
    setTimeout(() => {
      S.resolveTurn();
      st.phase = "report";
      renderAll();
    }, 700);
  } else if (st.phase === "report") {
    if (st.turn >= LAST) {
      openDayReport();
    } else {
      st.turn++;
      st.phase = "decision";
      renderAll();
      computePlanPreview();
    }
  } else if (st.phase === "dayReport") {
    closeDayReport();
  }
}
function skipTurns(untilEvent) {
  const st = S.state;
  if (st.phase !== "decision") return;
  UI.stopNote = null;
  let note = null;
  while (st.turn <= LAST) {
    const tr = S.resolveTurn();
    if (untilEvent) {
      note = S.eventfulTurn(tr);
      if (note) break;
    }
    if (st.turn >= LAST) break;
    st.turn++;
  }
  st.phase = "report";
  UI.stopNote = note;
  renderAll();
}
function fastForwardDays(nDays) {
  const st = S.state;
  let n = 0, stopped = null;
  // finish current day first; abort multi-day skip when a day ends with penalties
  while (n < nDays) {
    while (st.turn <= LAST && !st.day.turns[st.turn]) { S.resolveTurn(); if (st.turn >= LAST) break; st.turn++; }
    if (!st.day.turns[LAST]) { st.turn = LAST; if (!st.day.turns[LAST]) S.resolveTurn(); }
    const hadPenalty = st.day.fin.penalty > 0;
    S.settleDay();
    S.advanceDay();
    n++;
    if (hadPenalty && n < nDays) { stopped = "kary za energię niedostarczoną"; break; }
  }
  st.phase = "decision";
  renderAll();
  computePlanPreview();
  const dayWord = n === 1 ? "dobie" : "dobach";
  setHint(stopped
    ? `⏸ Przewijanie przerwane po ${n} ${dayWord}: ${stopped}. Sprawdź sieć i nastawy.`
    : `Przewinięto ${n} dób gry.`, true);
}
function openDayReport() {
  const st = S.state;
  const settle = S.settleDay();
  st.phase = "dayReport";
  const layer = $("#modal-layer");
  const unservedDay = st.day.turns.reduce((s, tr) => s + (tr ? tr.unserved * tr.hours : 0), 0);
  layer.innerHTML = `<div class="modal">
    <h2>RAPORT DOBY — ${S.CFG.monthNames[st.month]}, ${S.CFG.dayTypeNames[st.dayIdx]}</h2>
    <div class="rowline"><span class="k">POGODA</span><span>${st.day.regimeLabel}</span></div>
    <div class="rowline"><span class="k">PRZYCHODY (taryfa)</span><span class="pos">+${fmtMoney(settle.fin.revenue)}</span></div>
    ${settle.fin.exportRev > 0 ? `<div class="rowline"><span class="k">EKSPORT</span><span class="pos">+${fmtMoney(settle.fin.exportRev)}</span></div>` : ""}
    <div class="rowline"><span class="k">PALIWO</span><span class="neg">−${fmtMoney(settle.fin.fuel)}</span></div>
    ${settle.fin.importCost > 0 ? `<div class="rowline"><span class="k">IMPORT</span><span class="neg">−${fmtMoney(settle.fin.importCost)}</span></div>` : ""}
    ${settle.fin.penalty > 0 ? `<div class="rowline"><span class="k">KARY</span><span class="neg">−${fmtMoney(settle.fin.penalty)}</span></div>` : ""}
    <div class="rowline"><span class="k">WYNIK ZMIENNY × ${settle.scale} DNI</span><span class="${settle.varResult >= 0 ? "pos" : "neg"}">${fmtMoneySigned(settle.varResult)}</span></div>
    <div class="rowline"><span class="k">KOSZTY STAŁE MAJĄTKU</span><span class="neg">−${fmtMoney(settle.fixed)}</span></div>
    <div class="rowline total"><span class="k">WYNIK DOBY</span><span class="${settle.result >= 0 ? "pos" : "neg"}">${fmtMoneySigned(settle.result)} zł</span></div>
    ${unservedDay > 0.5 ? `<div class="event-box">⚠ ENERGIA NIEDOSTARCZONA: ${Math.round(unservedDay)} MWh</div>` : ""}
    <button class="action-btn" style="width:100%;margin-top:12px" id="new-day-btn">NOWA DOBA ▸</button>
  </div>`;
  layer.hidden = false;
  $("#new-day-btn").addEventListener("click", closeDayReport);
  renderTopbar();
}
function closeDayReport() {
  $("#modal-layer").hidden = true;
  S.advanceDay();
  renderAll();
  computePlanPreview();
}

/* ============================================================
   RENDER ALL
   ============================================================ */
function renderAll() {
  renderTopbar();
  renderMapDynamic();
  renderDayChart();
  renderForecastCard();
  renderSetpointsCard();
  renderResolveCard();
  renderReportCard();
  renderQueue();
  renderSystems();
  renderHexPanel();
}

/* ============================================================
   DEBUG API (for automated testing; not part of the game UI)
   ============================================================ */
window.dbg = {
  state: () => S.state,
  build: (tech, q, r) => { const r2 = S.build(tech, q, r); renderAll(); return r2; },
  line: (a, b, type = "mv") => { const r2 = S.buildLine(a, b, type); renderAll(); return r2; },
  connect: (cityId) => { const r2 = S.connectCity(cityId); renderAll(); return r2; },
  set: (id, mw) => { const o = S.state.objects.find(x => x.id === id); if (o) o.setpoint = mw; renderAll(); computePlanPreview(); return o; },
  expand: (id) => { const r2 = S.expand(id); renderAll(); return r2; },
  turn: () => { if (S.state.phase === "decision") { S.resolveTurn(); S.state.phase = "report"; } renderAll(); return S.state.day.turns[S.state.turn]; },
  next: () => { onAction(); return `${S.state.phase} ${turnRange(S.state.turn)}`; },
  day: () => { skipTurns(false); return S.state.day.fin; },
  days: (n) => { fastForwardDays(n); return `${S.state.year}/${S.state.month + 1}/d${S.state.dayIdx + 1}`; },
  money: (x) => { S.state.budget += x; renderAll(); return S.state.budget; },
  find: (name) => S.state.objects.filter(o => (S.objName(o) || "").includes(name)),
  summary: () => {
    const st = S.state;
    return {
      date: `R${st.year} ${S.CFG.monthNames[st.month]} d${st.dayIdx + 1} T${st.turn} (${turnRange(st.turn)})`,
      phase: st.phase, budget: Math.round(st.budget / 1e6) + " mln",
      connected: S.connectedCities().map(c => c.name),
      objects: st.objects.filter(o => o.kind !== "city" && o.kind !== "borderSite").map(o => `${o.id}:${S.objName(o)}:${o.state}${o.state === "building" ? ":" + o.daysLeft + "d" : ""}`),
      lines: st.lines.map(l => `${l.id}:${l.aId}-${l.bId}:${l.km}km:${l.state}`),
      regime: st.day.regimeLabel,
      unservedTotal: Math.round(st.stats.totalUnservedMWh),
    };
  },
  newGame: (seed) => { S.newGame(seed); UI.sel = null; UI.lineFrom = null; hintDefault(); initMap(); renderAll(); computePlanPreview(); return "ok"; },
};

/* ---------- bootstrap ---------- */
S.newGame();
initMap();
renderAll();
computePlanPreview();
setHint("System startowy: Gaz CCGT zasila LIPNO. Kliknij dowolny heks, żeby budować i przyłączać kolejne miasta — zapotrzebowanie rośnie ~10% rocznie.", true);
