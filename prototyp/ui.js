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

/* ---------- UI state ---------- */
const UI = {
  tab: "ops",
  buildMode: null,        // tech key armed for placement
  lineMode: null,         // line type armed
  lineFirst: null,        // first station id for line drawing
  selectedId: null,
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
    const p = el("polygon", {
      points: hexPoints(c.x, c.y, 32.2),
      fill: S.TERRAIN[hx.terrain].color, stroke: "#0a0e12", "stroke-width": 1,
      "data-q": hx.q, "data-r": hx.r,
    }, gTerrain);
    p.addEventListener("mousemove", (ev) => showHexTip(ev, hx));
    p.addEventListener("mouseleave", hideHexTip);
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
  const cap = o.kind === "border" ? S.objCapMW(o) : S.stationCap(o);
  const pct = cap > 0 ? (o.flowThrough || 0) / cap : 0;
  if (pct >= 0.95) return "#ff4d4f";
  if (pct >= 0.85) return "#ff7a45";
  if (pct >= 0.6) return "#ffb020";
  return null;
}
function nodeColorOf(o) {
  if (o.kind === "city") return o.connected ? "#e8f1f8" : "#5c6b7a";
  if (o.kind === "substation") return (o.state === "ready" && stationLoadColor(o)) || "#cfd8e3";
  if (o.kind === "border") return (o.state === "ready" && stationLoadColor(o)) || "#b07ce8";
  if (o.kind === "borderSite") return "#b07ce8";
  return S.TECH[o.tech].color.replace("var(--c-", "").length ? getComputedStyle(document.documentElement).getPropertyValue(S.TECH[o.tech].color.slice(4, -1)) || "#3ddc84" : "#3ddc84";
}
function nodeSymbol(o) {
  if (o.kind === "city") return "M";
  if (o.kind === "substation") return "▣";
  if (o.kind === "border" || o.kind === "borderSite") return "⇄";
  return S.TECH[o.tech].sym;
}
function nodeValueLine(o) {
  const st = S.state;
  if (o.state === "building") return `BUDOWA ${o.daysLeft}d`;
  if (o.kind === "city") {
    if (!o.connected) return "NIEPODŁĄCZONE";
    const hr = st.day.hours[st.hour] || st.day.hours[st.hour - 1];
    const d = S.cityDemandMW(o, Math.min(st.hour, 23));
    return `${Math.round(d)} MW`;
  }
  if (o.kind === "substation") {
    return `${Math.round(o.flowThrough || 0)}/${S.stationCap(o)} MW · ${S.usedFields(o)}/${S.stationFields(o)} pól`;
  }
  if (o.kind === "borderSite") return "PUNKT GRANICZNY";
  if (o.kind === "border") return `${Math.round(o.flowThrough || 0)}/${S.objCapMW(o)} MW · ${o.setpoint > 0 ? "IMP" : o.setpoint < 0 ? "EKS" : "—"}`;
  if (o.kind === "storage") return `${Math.round(o.soc)}/${S.objEnergyCap(o)} MWh`;
  if (o.kind === "res") {
    const h = Math.min(st.hour, 23);
    const mw = o.tech === "wind"
      ? (st.day.hours[h] ? mwOfFarmResolved(o, h) : farmForecastNow(o))
      : (st.day.hours[h] ? mwOfFarmResolved(o, h) : farmForecastNow(o));
    return `${Math.round(mw)}/${S.objCapMW(o)} MW`;
  }
  return `${Math.round(clamp0(o.setpoint || 0, S.objCapMW(o)))}/${S.objCapMW(o)} MW`;
}
function mwOfFarmResolved(o, h) {
  // approximation for display: farm truth at resolved hour
  return o.tech === "wind"
    ? S.objCapMW(o) * windDisplayFrac(o, h)
    : S.objCapMW(o) * pvDisplayFrac(o, h);
}
function windDisplayFrac(o, h) {
  const hx = S.hexAt(S.state, o.q, o.r);
  const v = S.state.day.vNat[h] * hx.windClass;
  const { vIn, vRated, vOut } = S.CFG.turbine;
  if (v < vIn || v >= vOut) return 0;
  if (v >= vRated) return 1;
  return (v ** 3 - vIn ** 3) / (vRated ** 3 - vIn ** 3);
}
function pvDisplayFrac(o, h) {
  const hx = S.hexAt(S.state, o.q, o.r);
  const f = S.forecastPvMW(h, h + 1); // truth (h < now)
  const inst = S.installedPv();
  return inst > 0 ? (f.mean / inst) * hx.sunClass : 0;
}
function farmForecastNow(o) {
  const st = S.state;
  const fleetF = o.tech === "wind" ? S.forecastWindMW(st.hour, st.hour) : S.forecastPvMW(st.hour, st.hour);
  const inst = o.tech === "wind" ? S.installedWind() : S.installedPv();
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
    const cap = S.LINE_TYPES[l.type].cap;
    const pct = l.state === "ready" ? (l.flow || 0) / cap : 0;
    const stroke = l.state === "ready" ? lineColor(pct) : "#3a4757";
    const pl = el("polyline", {
      points: ptStr, fill: "none", stroke,
      "stroke-width": pct >= 0.85 ? 3.5 : 2.5,
      "stroke-linejoin": "round", "stroke-linecap": "round",
      "stroke-dasharray": l.state === "building" ? "5 5" : "none",
      opacity: l.state === "building" ? 0.7 : 1,
    }, gLines);
    pl.style.cursor = "pointer";
    pl.addEventListener("click", (ev) => { ev.stopPropagation(); selectObject(l.id, true); });
    const mid = pts[Math.floor(pts.length / 2)];
    const label = l.state === "building" ? `${l.daysLeft}d` : `${Math.round(pct * 100)}%`;
    el("text", { x: mid.x + ox, y: mid.y + oy - 5, "font-size": 9, fill: stroke, "text-anchor": "middle", class: "mono" }, gLines).textContent = label;
  }
  // nodes
  for (const o of st.objects) {
    const c = S.hexCenter(o.q, o.r);
    const color = nodeColorOf(o);
    const g = el("g", { transform: `translate(${c.x},${c.y})`, cursor: "pointer" }, gNodes);
    const isSite = o.kind === "borderSite" && st.objects.some(b => b.kind === "border" && b.q === o.q && b.r === o.r);
    if (isSite) continue; // built border replaces its site marker
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
    if (UI.selectedId === o.id) el("circle", { r: r + 4, fill: "none", stroke: "#fff", "stroke-dasharray": "2 3" }, g);
    if (UI.lineFirst === o.id) el("circle", { r: r + 4, fill: "none", stroke: "var(--ok)", "stroke-dasharray": "4 2" }, g);
    g.addEventListener("click", (ev) => { ev.stopPropagation(); onNodeClick(o); });
  }
  // build-mode highlight of valid hexes
  if (UI.buildMode) {
    for (const hx of st.hexes) {
      if (S.canBuildAt(UI.buildMode, hx.q, hx.r).ok) {
        const c = S.hexCenter(hx.q, hx.r);
        el("polygon", { points: hexPoints(c.x, c.y, 30), fill: "none", stroke: "rgba(61,220,132,.35)", "stroke-width": 1 }, gOverlay);
      }
    }
  }
}

/* hex tooltip */
function showHexTip(ev, hx) {
  const tip = $("#hex-tip");
  const t = S.TERRAIN[hx.terrain];
  let extra = "";
  if (S.isPumpedSite(S.state, hx.q, hx.r)) extra = "<br>✓ lokalizacja szczytowo-pompowa";
  tip.innerHTML = `[${hx.q},${hx.r}] ${t.label} · koszt ×${t.mult}<br>wiatr ×${hx.windClass.toFixed(2)} · słońce ×${hx.sunClass.toFixed(2)}${extra}`;
  tip.hidden = false;
  const wrap = $("#map-wrap").getBoundingClientRect();
  tip.style.left = `${ev.clientX - wrap.left + 14}px`;
  tip.style.top = `${ev.clientY - wrap.top + 10}px`;
}
function hideHexTip() { $("#hex-tip").hidden = true; }

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

function onMapClick(ev) {
  const w = clientToWorld(ev);
  const hx = worldToHex(w.x, w.y);
  if (!hx) return;
  if (UI.buildMode) {
    const res = S.build(UI.buildMode, hx.q, hx.r);
    if (res.ok) {
      setHint(`Rozpoczęto budowę: ${S.objName(res.obj)} — koszt ${fmtMoney(res.obj.spentCapex)}. Kliknij kolejny heks albo ESC.`, true);
      renderAll();
    } else setHint(`Nie można budować: ${res.why}.`, false);
    return;
  }
  const obj = S.state.objects.find(o => o.q === hx.q && o.r === hx.r && o.kind !== "borderSite")
    || S.state.objects.find(o => o.q === hx.q && o.r === hx.r);
  if (obj) onNodeClick(obj);
  else { UI.selectedId = null; renderAll(); }
}
function onNodeClick(o) {
  if (UI.lineMode) {
    if (o.kind !== "substation" && o.kind !== "border") { setHint("Linie łączą tylko stacje i przyłącza graniczne.", false); return; }
    if (!UI.lineFirst) {
      UI.lineFirst = o.id;
      setHint(`${S.LINE_TYPES[UI.lineMode].label}: początek ${S.objName(o)}. Kliknij drugą stację.`, true);
      renderMapDynamic();
      return;
    }
    const res = S.buildLine(UI.lineMode, UI.lineFirst, o.id);
    if (res.ok) setHint(`Rozpoczęto budowę linii ${res.line.km} km — koszt ${fmtMoney(res.line.spentCapex)}.`, true);
    else setHint(`Nie można: ${res.why}.`, false);
    UI.lineFirst = null;
    renderAll();
    return;
  }
  UI.selectedId = o.id;
  UI.tab = "build";
  renderAll();
}
function selectObject(id) { UI.selectedId = id; UI.tab = "build"; renderAll(); }

document.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") { disarmBuild(); renderAll(); }
});
function disarmBuild() {
  UI.buildMode = null; UI.lineMode = null; UI.lineFirst = null;
  svg.classList.remove("build");
  setHint("Tryb: podgląd. Kliknij obiekt, żeby zobaczyć szczegóły.", false);
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
  const W = 960, H = 150, x0 = 34, x1 = 950, y0 = 128, y1 = 10;
  const xh = (h) => x0 + (x1 - x0) * (h + 0.5) / 24;
  let peak = 100;
  for (let h = 0; h < 24; h++) {
    const f = S.forecastDemandMW(h, st.hour);
    peak = Math.max(peak, f.mean + f.band);
    const hr = st.day.hours[h];
    if (hr) peak = Math.max(peak, hr.demand, hr.served + hr.charge + hr.exportMW);
  }
  const ys = (v) => y0 - (y0 - y1) * v / (peak * 1.12);
  // stacked areas for resolved hours
  let baseVals = new Array(24).fill(0);
  for (const [tech, cssVar] of STACK_ORDER) {
    let d = "", started = false;
    const tops = [];
    for (let h = 0; h < 24; h++) {
      const hr = st.day.hours[h];
      const v = hr ? (hr.byTech[tech] || 0) : 0;
      tops.push(baseVals[h] + v);
    }
    for (let h = 0; h < 24; h++) {
      if (!st.day.hours[h]) continue;
      d += (started ? "L" : "M") + `${xh(h)},${ys(tops[h])} `;
      started = true;
    }
    if (started) {
      for (let h = 23; h >= 0; h--) {
        if (!st.day.hours[h]) continue;
        d += `L${xh(h)},${ys(baseVals[h])} `;
      }
      el("path", { d: d + "Z", fill: `var(${cssVar})`, opacity: 0.8, stroke: "none" }, c);
    }
    baseVals = tops;
  }
  // demand: actual solid / forecast dashed
  let dAct = "", dFc = "", bandUp = [], bandDn = [];
  for (let h = 0; h < 24; h++) {
    const hr = st.day.hours[h];
    if (hr) dAct += (dAct ? "L" : "M") + `${xh(h)},${ys(hr.demand)} `;
    else {
      const f = S.forecastDemandMW(h, st.hour);
      dFc += (dFc ? "L" : "M") + `${xh(h)},${ys(f.mean)} `;
      bandUp.push(`${xh(h)},${ys(f.mean + f.band)}`);
      bandDn.unshift(`${xh(h)},${ys(Math.max(0, f.mean - f.band))}`);
    }
  }
  if (bandUp.length > 1) el("polygon", { points: bandUp.join(" ") + " " + bandDn.join(" "), fill: "rgba(232,241,248,.08)", stroke: "none" }, c);
  if (dAct) el("path", { d: dAct, fill: "none", stroke: "#e8f1f8", "stroke-width": 2 }, c);
  if (dFc) el("path", { d: dFc, fill: "none", stroke: "#e8f1f8", "stroke-width": 1.4, "stroke-dasharray": "5 4", opacity: 0.8 }, c);
  // now line
  el("line", { x1: xh(st.hour) - 8, y1: 6, x2: xh(st.hour) - 8, y2: y0, stroke: "var(--ok)", "stroke-dasharray": "4 4", opacity: 0.8 }, c);
  // hour ticks
  for (let h = 0; h < 24; h += 4) {
    el("text", { x: xh(h), y: 144, "font-size": 9, fill: "#5c6b7a", "text-anchor": "middle", class: "mono" }, c).textContent = hh(h);
  }
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
  // turn strip
  const strip = $("#turn-strip");
  strip.innerHTML = "";
  for (let h = 0; h < 24; h++) {
    const cell = document.createElement("div");
    cell.className = "ts-cell";
    const hr = st.day.hours[h];
    if (hr) {
      if (hr.unserved > 0.5) cell.classList.add("alarm");
      else if (hr.maxLoadPct >= 0.85 || (hr.maxStationPct || 0) >= 0.85 || hr.stormCut || (hr.availRes > 50 && hr.curtail > 0.4 * hr.availRes)) cell.classList.add("warn");
      else cell.classList.add("ok");
    }
    if (h === st.hour && st.phase !== "dayReport") cell.classList.add("now");
    cell.textContent = h % 4 === 0 ? h : "·";
    cell.title = hh(h);
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
  $("#turn-caption").textContent = st.phase === "dayReport" ? "DOBA ZAKOŃCZONA" : `TURA ${hh(st.hour)}`;
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
    st.phase === "report" ? (st.hour >= 23 ? "RAPORT DOBY ▸" : "NASTĘPNA TURA ▸") :
    "NOWA DOBA ▸";
}
function updateBalanceBox() {
  const st = S.state;
  const v = $("#bb-value"), sub = $("#bb-sub"), needle = $("#bb-needle");
  if (st.phase === "decision" || st.phase === "dayReport") {
    const h = Math.min(st.hour, 23);
    const fd = S.forecastDemandMW(h, h);
    const plan = planSupplyTotal(h);
    const saldo = plan - fd.mean;
    v.textContent = `${saldo >= 0 ? "+" : "−"}${Math.abs(Math.round(saldo))} MW`;
    v.className = "bb-value " + (saldo < 0 ? "alarm" : saldo < fd.band ? "warn" : "");
    sub.textContent = `plan ${Math.round(plan)} · popyt ${Math.round(fd.mean)}±${Math.round(fd.band)}`;
    needle.style.left = `${clampPct(50 + saldo / 8)}%`;
  } else {
    const hr = st.day.hours[st.hour];
    if (!hr) return;
    if (hr.unserved > 0.5) {
      v.textContent = `−${Math.round(hr.unserved)} MW`;
      v.className = "bb-value alarm";
      sub.textContent = "ENERGIA NIEDOSTARCZONA";
      needle.style.left = `${clampPct(50 - hr.unserved / 8)}%`;
    } else {
      v.textContent = "OK";
      v.className = "bb-value";
      sub.textContent = `dostarczone ${Math.round(hr.served)} MW · straty ${Math.round(hr.losses)}`;
      needle.style.left = "50%";
    }
  }
}
function clampPct(x) { return Math.max(2, Math.min(98, x)); }
function planSupplyTotal(h) {
  const st = S.state;
  let sum = 0;
  for (const o of st.objects) {
    if (o.state !== "ready") continue;
    if (!S.findStationFor(o) && o.kind !== "border" && o.kind !== "city") continue;
    if (o.kind === "plant") sum += clamp0(o.setpoint || 0, S.objCapMW(o));
    else if (o.kind === "res") {
      const f = o.tech === "wind" ? S.forecastWindMW(h, st.hour) : S.forecastPvMW(h, st.hour);
      const inst = o.tech === "wind" ? S.installedWind() : S.installedPv();
      sum += inst > 0 ? S.objCapMW(o) * f.mean / inst : 0;
    }
    else if (o.kind === "storage") { const sp = o.setpoint || 0; if (sp > 0) sum += Math.min(sp, o.soc); else sum -= Math.min(-sp, (S.objEnergyCap(o) - o.soc) / S.TECH[o.tech].eff); }
    else if (o.kind === "border") { const sp = o.setpoint || 0; sum += sp > 0 ? sp : sp; }
  }
  return sum;
}
function clamp0(x, hi) { return Math.max(0, Math.min(hi, x)); }

/* ============================================================
   OPS CARDS
   ============================================================ */
function miniChart(id, series, opts) {
  // series: [{pts: [{x,y}], color, dash, width}], band: {up:[],dn:[],color}
  const W = 380, H = opts.h || 100;
  let out = `<svg class="mini-chart${opts.small ? " small" : ""}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  const ymax = opts.ymax || 100;
  const X = (i) => 6 + (W - 12) * i / 23;
  const Y = (v) => (H - 14) - (H - 22) * clampN(v, 0, ymax) / ymax;
  if (opts.band) {
    const up = opts.band.up.map((v, i) => `${X(i + opts.band.from)},${Y(v)}`).join(" ");
    const dn = opts.band.dn.map((v, i) => `${X(opts.band.from + opts.band.dn.length - 1 - i)},${Y(v)}`).join(" ");
    if (opts.band.up.length > 1) out += `<polygon points="${up} ${dn}" fill="${opts.band.color}" stroke="none"/>`;
  }
  for (const s of series) {
    let d = "";
    s.pts.forEach((p, i) => { if (p.y == null) return; d += (d ? "L" : "M") + `${X(p.x)},${Y(p.y)} `; });
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
  const h0 = st.hour;
  // demand chart data
  let ymax = 100;
  const actPts = [], fcPts = [], bandUp = [], bandDn = [];
  let bandFrom = null;
  for (let h = 0; h < 24; h++) {
    const hr = st.day.hours[h];
    if (hr) { actPts.push({ x: h, y: hr.demand }); ymax = Math.max(ymax, hr.demand); }
    else {
      const f = S.forecastDemandMW(h, h0);
      fcPts.push({ x: h, y: f.mean });
      if (bandFrom == null) bandFrom = h;
      bandUp.push(f.mean + f.band); bandDn.push(Math.max(0, f.mean - f.band));
      ymax = Math.max(ymax, f.mean + f.band);
    }
  }
  // wind / pv chart
  const wInst = S.installedWind(), pInst = S.installedPv();
  const wPts = [], wUp = [], wDn = [], pPts = [];
  let wFrom = null, ymax2 = Math.max(50, wInst, pInst);
  for (let h = 0; h < 24; h++) {
    const resolved = !!st.day.hours[h];
    const fw = S.forecastWindMW(h, h0), fp = S.forecastPvMW(h, h0);
    wPts.push({ x: h, y: fw.mean }); pPts.push({ x: h, y: fp.mean });
    if (!resolved) { if (wFrom == null) wFrom = h; wUp.push(Math.min(wInst, fw.mean + fw.band)); wDn.push(Math.max(0, fw.mean - fw.band)); }
  }
  // briefing
  let peakH = 0, peakV = 0;
  for (let h = h0; h < 24; h++) { const f = S.forecastDemandMW(h, h0); if (f.mean > peakV) { peakV = f.mean; peakH = h; } }
  const wNow = S.forecastWindMW(Math.min(h0 + 1, 23), h0).mean, wLater = S.forecastWindMW(Math.min(h0 + 6, 23), h0).mean;
  const windTrend = wInst < 1 ? "—" : wLater < wNow * 0.6 ? "SŁABNIE ⚠" : wLater > wNow * 1.5 ? "wzmaga się" : "stabilny";
  // 6h plan check
  let chips = "";
  for (let i = 1; i <= 6; i++) {
    const h = h0 + i;
    if (h > 23) { chips += `<div class="h6">—</div>`; continue; }
    const f = S.forecastDemandMW(h, h0);
    const plan = planSupplyTotal(h);
    const cls = plan >= f.mean + f.band ? "ok" : plan >= f.mean - f.band ? "warn" : "alarm";
    const txt = plan >= f.mean + f.band ? "OK" : plan >= f.mean - f.band ? "RYZ" : "DEF";
    chips += `<div class="h6 ${cls}" title="plan ${Math.round(plan)} vs popyt ${Math.round(f.mean)}±${Math.round(f.band)}">${hh(h).slice(0,2)}<br>${txt}</div>`;
  }
  card.innerHTML = `
    <div class="card-head"><span class="card-title" style="color:var(--info)">PROGNOZA</span>
      <span class="chip info">TURA ${hh(h0)}</span></div>
    <div class="rowline"><span class="k">REŻIM MIESIĄCA</span><span class="info">${st.day.regimeLabel}</span></div>
    ${miniChart("fc-demand", [
      { pts: actPts, color: "#e8f1f8", width: 2 },
      { pts: fcPts, color: "#e8f1f8", dash: "5 4", width: 1.4 },
    ], { ymax: ymax * 1.1, now: h0, label: "POPYT [MW]", band: { from: bandFrom ?? 0, up: bandUp, dn: bandDn, color: "rgba(232,241,248,.09)" } })}
    ${miniChart("fc-res", [
      { pts: wPts, color: "var(--c-wind)", width: 1.8 },
      { pts: pPts, color: "var(--c-pv)", width: 1.6 },
    ], { ymax: ymax2 * 1.05, now: h0, small: true, label: "WIATR/PV [MW]", band: { from: wFrom ?? 0, up: wUp, dn: wDn, color: "rgba(61,220,132,.10)" } })}
    <div class="rowline"><span class="k">SZCZYT</span><span>${hh(peakH)} · ${Math.round(peakV)} MW ±${Math.round(S.forecastDemandMW(peakH, h0).band)}</span></div>
    <div class="rowline"><span class="k">WIATR +6h</span><span class="${windTrend.includes("⚠") ? "warn" : ""}">${windTrend}</span></div>
    <div class="rowline"><span class="k">BILANS PRZY OBECNYCH NASTAWACH</span><span></span></div>
    <div class="h6-strip">${chips}</div>`;
}

function unitRowHTML(o) {
  const st = S.state;
  const t = S.TECH[o.tech];
  const noStation = !S.findStationFor(o);
  const cap = S.objCapMW(o);
  if (o.kind === "plant") {
    return `<div class="unit">
      <div class="unit-head"><span class="unit-name">${t.label} #${o.id}</span>
        ${noStation ? '<span class="chip alarm">BRAK STACJI</span>' : `<span class="chip ${o.setpoint > 0 ? "on" : ""}">${o.setpoint > 0 ? "W RUCHU" : "POSTÓJ"}</span>`}</div>
      <div class="unit-meta">${t.varCost} zł/MWh · 0–${cap} MW${o.expansion ? ` · rozbudowa ${o.expansion.daysLeft}d` : ""}</div>
      <div class="unit-row"><input type="range" min="0" max="${cap}" step="10" value="${Math.round(o.setpoint || 0)}" data-sp="${o.id}" ${noStation ? "disabled" : ""}>
        <span class="unit-val" id="spv-${o.id}">${Math.round(o.setpoint || 0)} MW</span></div></div>`;
  }
  if (o.kind === "res") {
    const fNow = farmForecastNow(o);
    return `<div class="unit">
      <div class="unit-head"><span class="unit-name">${t.label} #${o.id}</span>
        ${noStation ? '<span class="chip alarm">BRAK STACJI</span>' : '<span class="chip info">NIESTEROWALNE</span>'}</div>
      <div class="unit-meta">moc zainst. ${cap} MW · prognoza teraz: <b style="color:${o.tech === "wind" ? "var(--c-wind)" : "var(--c-pv)"}">${Math.round(fNow)} MW</b></div></div>`;
  }
  if (o.kind === "storage") {
    const soc = o.soc, ecap = S.objEnergyCap(o);
    return `<div class="unit">
      <div class="unit-head"><span class="unit-name">${t.label} #${o.id}</span>
        ${noStation ? '<span class="chip alarm">BRAK STACJI</span>' : `<span class="chip ${o.setpoint ? "on" : ""}">${o.setpoint > 0 ? "ODDAJE" : o.setpoint < 0 ? "ŁADUJE" : "CZUWA"}</span>`}</div>
      <div class="unit-meta">${cap} MW / ${ecap} MWh · sprawność ${Math.round(S.TECH[o.tech].eff * 100)}% · SOC ${Math.round(soc)} MWh</div>
      <div class="unit-row"><input class="batt" type="range" min="${-cap}" max="${cap}" step="10" value="${Math.round(o.setpoint || 0)}" data-sp="${o.id}" ${noStation ? "disabled" : ""}>
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
    html += `<div class="unit-meta">Brak jednostek. Zbuduj elektrownię, stację i linię (zakładka BUDOWA), potem przyłącz miasto.</div>`;
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
  $("#skip-event")?.addEventListener("click", () => skipTurns(true));
  $("#skip-day")?.addEventListener("click", () => skipTurns(false));
  updateBalanceSummary();
}
function updateBalanceSummary() {
  const st = S.state;
  const box = $("#balance-summary");
  if (!box || st.phase !== "decision") { if (box) box.innerHTML = ""; return; }
  const h = st.hour;
  const fd = S.forecastDemandMW(h, h);
  const plan = planSupplyTotal(h);
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
  UI.planCache = S.planFlow(st.hour);
  for (const l of st.lines) if (l.state === "ready") l.flow = UI.planCache.res.lineFlow.get(l.id) || 0;
  for (const o of st.objects) {
    if ((o.kind === "substation" || o.kind === "border") && o.state === "ready") {
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
  const hr = st.day.hours[st.hour] && st.phase !== "decision" ? st.day.hours[st.hour] : lastResolved();
  let html = `<div class="card-head"><span class="card-title" style="color:var(--warn)">ROZSTRZYGNIĘCIE</span>
    <span class="chip ${st.phase === "resolving" ? "warn" : ""}">${hr ? "TURA " + hh(hr.h) : "OCZEKUJE"}</span></div>`;
  if (!hr) html += `<div class="unit-meta">Jeszcze nic się nie rozstrzygnęło.</div>`;
  else {
    const dW = hr.truthWind - hr.fcWind;
    html += `
      <div class="rowline"><span class="k">POPYT</span><span>prog. ${Math.round(hr.fcDemand)} → <b>${Math.round(hr.demand)}</b> MW</span></div>
      <div class="rowline"><span class="k">WIATR</span><span class="${Math.abs(dW) > 30 ? "warn" : ""}">prog. ${Math.round(hr.fcWind)} → <b>${Math.round(hr.truthWind)}</b> MW (${dW >= 0 ? "+" : ""}${Math.round(dW)})</span></div>
      <div class="rowline"><span class="k">PV</span><span>prog. ${Math.round(hr.fcPv)} → <b>${Math.round(hr.truthPv)}</b> MW</span></div>
      <div class="rowline"><span class="k">DOSTARCZONO</span><span class="${hr.unserved > 0.5 ? "neg" : "pos"}">${Math.round(hr.served)} / ${Math.round(hr.demand)} MW</span></div>
      <div class="rowline"><span class="k">STRATY SIECIOWE</span><span>${Math.round(hr.losses)} MW</span></div>
      ${hr.curtail > 1 ? `<div class="rowline"><span class="k">PRZYCIĘTE OZE</span><span class="warn">${Math.round(hr.curtail)} MW</span></div>` : ""}
      ${hr.exportMW > 1 ? `<div class="rowline"><span class="k">EKSPORT</span><span>${Math.round(hr.exportMW)} MW</span></div>` : ""}
      ${hr.charge > 1 ? `<div class="rowline"><span class="k">ŁADOWANIE MAGAZYNÓW</span><span>${Math.round(hr.charge)} MW</span></div>` : ""}`;
    if (hr.unserved > 0.5) {
      const cities = hr.cityRes.filter(c => c.unserved > 0.5).map(c => `${c.name} −${Math.round(c.unserved)} MW`).join(", ");
      html += `<div class="event-box">⚠ NIEDOBÓR MOCY: ${cities}</div>`;
    }
    if (hr.stormCut) html += `<div class="event-box warn">⚠ WYŁĄCZENIE SZTORMOWE — wiatr ≥ 25 m/s, turbiny stają</div>`;
    if (UI.stopNote) html += `<div class="event-box warn">⏸ PRZEWIJANIE ZATRZYMANE: ${UI.stopNote}</div>`;
  }
  card.innerHTML = html;
}
function lastResolved() {
  const st = S.state;
  for (let h = 23; h >= 0; h--) if (st.day.hours[h]) return st.day.hours[h];
  return null;
}

function renderReportCard() {
  const st = S.state;
  const card = $("#card-report");
  const hr = lastResolved();
  card.className = "card card-report" + (st.phase === "report" || st.phase === "dayReport" ? " active" : "");
  let html = `<div class="card-head"><span class="card-title">RAPORT</span>
    <span class="chip">${hr ? "TURA " + hh(hr.h) : "OCZEKUJE"}</span></div>`;
  if (hr) {
    const result = hr.revenue + hr.exportRev - hr.fuel - hr.importCost - hr.penalty;
    html += `
      <div class="rowline"><span class="k">PRZYCHÓD (${S.CFG.tariff} zł/MWh)</span><span class="pos">+${fmtMoney(hr.revenue)}</span></div>
      ${hr.exportRev > 0 ? `<div class="rowline"><span class="k">EKSPORT</span><span class="pos">+${fmtMoney(hr.exportRev)}</span></div>` : ""}
      <div class="rowline"><span class="k">PALIWO</span><span class="neg">−${fmtMoney(hr.fuel)}</span></div>
      ${hr.importCost > 0 ? `<div class="rowline"><span class="k">IMPORT</span><span class="neg">−${fmtMoney(hr.importCost)}</span></div>` : ""}
      ${hr.penalty > 0 ? `<div class="rowline"><span class="k">KARY (niedostarczenie)</span><span class="neg">−${fmtMoney(hr.penalty)}</span></div>` : ""}
      <div class="rowline total"><span class="k">WYNIK TURY</span><span class="${result >= 0 ? "pos" : "neg"}">${fmtMoneySigned(result)} zł</span></div>`;
  } else html += `<div class="unit-meta">Rozegraj pierwszą turę.</div>`;
  card.innerHTML = html;
}

/* ============================================================
   BUILD TAB
   ============================================================ */
const CATALOG = [
  { sec: "Wytwarzanie sterowalne", items: ["nuclear", "coal", "ccgt", "ocgt"] },
  { sec: "OZE (pogodozależne)", items: ["wind", "pv"] },
  { sec: "Magazyny energii", items: ["battery", "pumped"] },
  { sec: "Sieć", items: ["substation", "LINE:l110", "LINE:l220", "LINE:l400"] },
  { sec: "Granica", items: ["border"] },
];
function catItemHTML(key) {
  if (key.startsWith("LINE:")) {
    const lt = S.LINE_TYPES[key.slice(5)];
    const armed = UI.lineMode === key.slice(5);
    return `<div class="cat-item ${armed ? "armed" : ""}" data-cat="${key}">
      <div><div class="nm">${lt.label}</div>
      <div class="meta">⩽${lt.cap} MW · straty ${lt.lossPer100 * 100}%/100 km · ${lt.buildDays} dób</div></div>
      <div class="price">${fmtMoney(lt.costPerKm)}/km</div></div>`;
  }
  const t = S.TECH[key];
  const armed = UI.buildMode === key;
  let meta = "", price = "";
  if (t.kind === "plant") { meta = `blok ${t.block} MW · ${t.varCost} zł/MWh · ${t.buildDays} dób`; price = fmtMoney(t.block * t.capexPerMW); }
  else if (t.kind === "res") { meta = `${t.block} MW · koszt zmienny ~0 · ${t.buildDays} dób`; price = fmtMoney(t.block * t.capexPerMW); }
  else if (t.kind === "storage") { meta = `${t.powerBlock} MW / ${t.energyBlock} MWh · η ${Math.round(t.eff * 100)}% · ${t.buildDays} dób${t.site ? " · wyżyna/góry + woda" : ""}`; price = fmtMoney(t.powerBlock * t.capexPerMW + t.energyBlock * t.capexPerMWh); }
  else if (key === "substation") { meta = `${t.capMW} MW · ${t.fields} pola · ${t.buildDays} dób · obsługa ≤1 heks`; price = fmtMoney(t.capex); }
  else if (key === "border") { meta = `${t.capMW} MW · imp ${S.CFG.importPrice} / eks ${S.CFG.exportPrice} zł/MWh · ${t.buildDays} dób`; price = fmtMoney(t.capex); }
  return `<div class="cat-item ${armed ? "armed" : ""}" data-cat="${key}">
    <div><div class="nm">${t.label}</div><div class="meta">${meta}</div></div>
    <div class="price">${price}</div></div>`;
}
function renderCatalog() {
  const card = $("#card-catalog");
  let html = `<div class="card-head"><span class="card-title">KATALOG BUDOWY</span>
    <span class="chip">BUDŻET ${fmtMoney(S.state.budget)}</span></div>
    <div class="unit-meta">Kliknij pozycję, potem heks na mapie (linie: dwie stacje). Koszt × mnożnik terenu. ESC przerywa.</div>`;
  for (const sec of CATALOG) {
    html += `<div class="sec-label">${sec.sec}</div>` + sec.items.map(catItemHTML).join("");
  }
  card.innerHTML = html;
  card.className = "card on";
  card.querySelectorAll(".cat-item").forEach(it => {
    it.addEventListener("click", () => {
      const key = it.dataset.cat;
      disarmBuild();
      if (key.startsWith("LINE:")) {
        UI.lineMode = key.slice(5);
        setHint(`${S.LINE_TYPES[UI.lineMode].label}: kliknij pierwszą stację na mapie.`, true);
      } else {
        UI.buildMode = key;
        svg.classList.add("build");
        setHint(`${S.TECH[key].label}: kliknij heks na mapie (podświetlone = dozwolone).`, true);
      }
      renderAll();
    });
  });
}
function renderQueue() {
  const st = S.state;
  const card = $("#card-queue");
  const items = [];
  for (const o of st.objects) {
    if (o.state === "building") items.push({ id: o.id, name: S.objName(o), left: o.daysLeft, total: S.TECH[o.tech].buildDays });
    if (o.expansion) items.push({ id: o.id, name: `${S.objName(o)} (rozbudowa)`, left: o.expansion.daysLeft, total: o.expansion.daysLeft + 1, exp: true });
  }
  for (const l of st.lines) if (l.state === "building") items.push({ id: l.id, name: `${S.LINE_TYPES[l.type].label} ${l.km} km`, left: l.daysLeft, total: S.LINE_TYPES[l.type].buildDays });
  let html = `<div class="card-head"><span class="card-title">BUDOWY W TOKU</span><span class="chip">${items.length}</span></div>`;
  if (!items.length) html += `<div class="unit-meta">Nic się nie buduje.</div>`;
  for (const it of items) {
    html += `<div class="q-item"><div class="q-head"><span>${it.name}</span>
      <button class="q-cancel" data-cancel="${it.id}" title="Anulowanie = utrata nakładów">✕ anuluj</button></div>
      <div class="q-bar"><div class="q-fill" style="width:${(1 - it.left / it.total) * 100}%"></div></div>
      <div class="q-meta"><span>pozostało ${it.left} dób gry</span><span>${Math.round((1 - it.left / it.total) * 100)}%</span></div></div>`;
  }
  if (items.length) {
    const minLeft = Math.min(...items.map(i => i.left));
    html += `<button class="ghost-btn" id="ff-build" title="Przewija całe doby z bieżącymi nastawami — ryzyko kar!">⏩ PRZEWIŃ ${minLeft} DÓB (DO UKOŃCZENIA)</button>`;
  }
  card.innerHTML = html;
  card.className = "card on";
  card.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", () => { S.cancelConstruction(+b.dataset.cancel); renderAll(); }));
  $("#ff-build")?.addEventListener("click", () => {
    const minLeft = Math.min(...items.map(i => i.left));
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
function renderSelected() {
  const st = S.state;
  const card = $("#card-selected");
  card.className = "card on";
  const o = st.objects.find(x => x.id === UI.selectedId) || st.lines.find(l => l.id === UI.selectedId);
  if (!o) {
    card.innerHTML = `<div class="card-head"><span class="card-title">OBIEKT</span><span class="chip">BRAK</span></div>
      <div class="unit-meta">Kliknij obiekt na mapie, żeby zobaczyć szczegóły i rozbudowę.</div>`;
    return;
  }
  if (o.type) { // line
    const lt = S.LINE_TYPES[o.type];
    card.innerHTML = `<div class="card-head"><span class="card-title">${lt.label}</span>
      <span class="chip ${o.state === "ready" ? "on" : "warn"}">${o.state === "ready" ? "PRACUJE" : `BUDOWA ${o.daysLeft}d`}</span></div>
      <div class="rowline"><span class="k">DŁUGOŚĆ</span><span>${o.km} km (${o.path.length - 1} heksów)</span></div>
      <div class="rowline"><span class="k">PRZEPUSTOWOŚĆ</span><span>${lt.cap} MW</span></div>
      <div class="rowline"><span class="k">STRATY</span><span>${(lt.lossPer100 * o.km / 100 * 100).toFixed(1)}% przesyłanej mocy</span></div>
      <div class="rowline"><span class="k">PRZESYŁ TERAZ</span><span>${Math.round(o.flow || 0)} MW (${Math.round((o.flow || 0) / lt.cap * 100)}%)</span></div>`;
    return;
  }
  let rows = "";
  const chip = o.state === "building" ? `<span class="chip warn">BUDOWA ${o.daysLeft}d</span>` :
    o.kind === "city" ? `<span class="chip ${o.connected ? "on" : ""}">${o.connected ? "PRZYŁĄCZONE" : "NIEPODŁĄCZONE"}</span>` :
    `<span class="chip on">PRACUJE</span>`;
  if (o.kind === "city") {
    const st1 = S.findStationFor(o);
    rows = `<div class="rowline"><span class="k">SZCZYT ZAPOTRZEBOWANIA</span><span>${Math.round(o.peak)} MW</span></div>
      <div class="rowline"><span class="k">TARYFA</span><span>${S.CFG.tariff} zł/MWh dostarczonej</span></div>
      <div class="rowline"><span class="k">STACJA W ZASIĘGU</span><span>${st1 ? S.objName(st1) : '<span class="neg">brak (≤1 heks)</span>'}</span></div>`;
    if (!o.connected) rows += `<button class="ghost-btn" id="connect-city" ${st1 ? "" : "disabled"}>PRZYŁĄCZ MIASTO — ${fmtMoney(S.CFG.cityConnectCost)}</button>`;
  } else if (o.kind === "substation") {
    const pct = Math.round((o.flowThrough || 0) / S.stationCap(o) * 100);
    rows = `<div class="rowline"><span class="k">PRZEPUSTOWOŚĆ</span><span>${S.stationCap(o)} MW (transformatory)</span></div>
      <div class="rowline"><span class="k">PRZEPŁYW TERAZ</span><span class="${pct >= 85 ? "warn" : ""}">${Math.round(o.flowThrough || 0)} MW (${pct}%)</span></div>
      <div class="rowline"><span class="k">POLA LINIOWE</span><span>${S.usedFields(o)} / ${S.stationFields(o)}</span></div>
      <div class="rowline"><span class="k">OBSŁUGA</span><span>obiekty ≤ 1 heks</span></div>`;
  } else if (o.kind === "border") {
    rows = `<div class="rowline"><span class="k">ZDOLNOŚĆ</span><span>${S.objCapMW(o)} MW</span></div>
      <div class="rowline"><span class="k">CENY</span><span>imp ${S.CFG.importPrice} / eks ${S.CFG.exportPrice} zł/MWh</span></div>`;
  } else if (o.kind === "borderSite") {
    rows = `<div class="unit-meta">Punkt graniczny — zbuduj tu przyłącze graniczne (katalog: GRANICA).</div>`;
  } else if (o.kind === "storage") {
    rows = `<div class="rowline"><span class="k">MOC / POJEMNOŚĆ</span><span>${S.objCapMW(o)} MW / ${S.objEnergyCap(o)} MWh</span></div>
      <div class="rowline"><span class="k">SOC</span><span>${Math.round(o.soc)} MWh</span></div>
      <div class="rowline"><span class="k">SPRAWNOŚĆ CYKLU</span><span>${Math.round(S.TECH[o.tech].eff * 100)}%</span></div>`;
  } else {
    const hx = S.hexAt(st, o.q, o.r);
    rows = `<div class="rowline"><span class="k">MOC</span><span>${S.objCapMW(o)} MW (${o.blocks || 1}× blok)</span></div>`;
    if (o.kind === "res") rows += `<div class="rowline"><span class="k">LOKALIZACJA</span><span>wiatr ×${hx.windClass.toFixed(2)} · słońce ×${hx.sunClass.toFixed(2)}</span></div>`;
    if (o.kind === "plant") rows += `<div class="rowline"><span class="k">KOSZT ZMIENNY</span><span>${S.TECH[o.tech].varCost} zł/MWh</span></div>`;
    const st1 = S.findStationFor(o);
    rows += `<div class="rowline"><span class="k">STACJA</span><span>${st1 ? S.objName(st1) : '<span class="neg">brak w zasięgu 1 heksa!</span>'}</span></div>`;
  }
  let expBtn = "";
  if (o.state === "ready" && !o.expansion && o.kind !== "city" && o.kind !== "borderSite") {
    const info = S.expansionInfo(o);
    expBtn = info
      ? `<button class="ghost-btn" id="expand-obj">ROZBUDUJ: ${info.label} — ${fmtMoney(info.cost)} · ${info.days}d</button>`
      : `<div class="unit-meta">Limit lokalizacji osiągnięty — jedyną drogą jest nowa lokalizacja.</div>`;
  }
  card.innerHTML = `<div class="card-head"><span class="card-title">${S.objName(o)}</span>${chip}</div>${rows}${expBtn}`;
  $("#connect-city")?.addEventListener("click", () => {
    const r = S.connectCity(o.id);
    if (!r.ok) setHint(`Nie można: ${r.why}.`, false);
    renderAll();
  });
  $("#expand-obj")?.addEventListener("click", () => {
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
    if (st.hour >= 23) {
      openDayReport();
    } else {
      st.hour++;
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
  while (st.hour <= 23) {
    const hr = S.resolveTurn();
    if (untilEvent) {
      note = S.eventfulHour(hr);
      if (note) break;
    }
    if (st.hour >= 23) break;
    st.hour++;
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
    while (st.hour <= 23 && !st.day.hours[st.hour]) { S.resolveTurn(); if (st.hour >= 23) break; st.hour++; }
    if (!st.day.hours[23]) { st.hour = 23; if (!st.day.hours[23]) S.resolveTurn(); }
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
  const unservedDay = st.day.hours.reduce((s, h) => s + (h?.unserved || 0), 0);
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
   TABS + RENDER ALL
   ============================================================ */
document.querySelectorAll(".tab").forEach(t => t.addEventListener("click", () => {
  UI.tab = t.dataset.tab;
  renderAll();
}));
function renderAll() {
  document.querySelectorAll(".tab").forEach(t => t.classList.toggle("active", t.dataset.tab === UI.tab));
  $("#tab-ops").hidden = UI.tab !== "ops";
  $("#tab-build").hidden = UI.tab !== "build";
  renderTopbar();
  renderMapDynamic();
  renderDayChart();
  if (UI.tab === "ops") {
    renderForecastCard();
    renderSetpointsCard();
    renderResolveCard();
    renderReportCard();
  } else {
    renderSelected();
    renderCatalog();
    renderQueue();
    renderSystems();
  }
}

/* ============================================================
   DEBUG API (for automated testing; not part of the game UI)
   ============================================================ */
window.dbg = {
  state: () => S.state,
  build: (tech, q, r) => { const r2 = S.build(tech, q, r); renderAll(); return r2; },
  line: (type, a, b) => { const r2 = S.buildLine(type, a, b); renderAll(); return r2; },
  connect: (cityId) => { const r2 = S.connectCity(cityId); renderAll(); return r2; },
  set: (id, mw) => { const o = S.state.objects.find(x => x.id === id); if (o) o.setpoint = mw; renderAll(); computePlanPreview(); return o; },
  expand: (id) => { const r2 = S.expand(id); renderAll(); return r2; },
  turn: () => { if (S.state.phase === "decision") { S.resolveTurn(); S.state.phase = "report"; } renderAll(); return S.state.day.hours[S.state.hour]; },
  next: () => { onAction(); return `${S.state.phase} ${hh(S.state.hour)}`; },
  day: () => { skipTurns(false); return S.state.day.fin; },
  days: (n) => { fastForwardDays(n); return `${S.state.year}/${S.state.month + 1}/d${S.state.dayIdx + 1}`; },
  money: (x) => { S.state.budget += x; renderAll(); return S.state.budget; },
  find: (name) => S.state.objects.filter(o => (S.objName(o) || "").includes(name)),
  summary: () => {
    const st = S.state;
    return {
      date: `R${st.year} ${S.CFG.monthNames[st.month]} d${st.dayIdx + 1} ${hh(st.hour)}`,
      phase: st.phase, budget: Math.round(st.budget / 1e6) + " mln",
      connected: S.connectedCities().map(c => c.name),
      objects: st.objects.filter(o => o.kind !== "city" && o.kind !== "borderSite").map(o => `${o.id}:${S.objName(o)}:${o.state}${o.state === "building" ? ":" + o.daysLeft + "d" : ""}`),
      lines: st.lines.map(l => `${l.id}:${l.type}:${l.aId}-${l.bId}:${l.state}`),
      regime: st.day.regimeLabel,
      unservedTotal: Math.round(st.stats.totalUnservedMWh),
    };
  },
  newGame: (seed) => { S.newGame(seed); UI.selectedId = null; disarmBuild(); initMap(); renderAll(); computePlanPreview(); return "ok"; },
};

/* ---------- bootstrap ---------- */
S.newGame();
initMap();
renderAll();
computePlanPreview();
setHint("System startowy: Gaz CCGT zasila LIPNO. Rozbudowuj sieć i przyłączaj kolejne miasta (zakładka BUDOWA) — zapotrzebowanie rośnie ~10% rocznie.", true);
