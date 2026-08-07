/* ============================================================
   ElectroNation prototype — simulation core
   Simplified game per docs/01 v0.9: hourly balance, pipe-like
   network flow (min-cost, capacities + length losses),
   weather + forecasts per docs/06.
   ============================================================ */
"use strict";

/* ---------- seeded RNG ---------- */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rng) { // Box-Muller
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/* ---------- global config (all tunables) ---------- */
const CFG = {
  seed: 20260807,
  hexKm: 25,
  startBudget: 10e9,
  // Economy tuned for game pacing (payback ~3 game years); doc 03 will formalize.
  tariff: 650,               // PLN/MWh delivered (doc baseline ~450 — too slow a loop)
  // 10000 zł/MWh (doc) proved ruinous: one under-built corridor snowballed into
  // budget −3.7 bld over 18 skipped days. 4000 still hurts (6× tariff) without
  // creating an inescapable debt spiral. Revisit in doc 03.
  unservedPenalty: 4000,     // PLN/MWh
  importPrice: 800,
  exportPrice: 150,
  chargePriority: 790,       // flow reward for charging: below import, above domestic
  cityConnectCost: 30e6,
  growthPerYear: 0.10,
  repDays: [10.9, 10.9, 8.7],
  latitude: 52.0,
  monthNames: ["STYCZEŃ","LUTY","MARZEC","KWIECIEŃ","MAJ","CZERWIEC","LIPIEC","SIERPIEŃ","WRZESIEŃ","PAŹDZIERNIK","LISTOPAD","GRUDZIEŃ"],
  dayTypeNames: ["DOBA ROBOCZA A","DOBA ROBOCZA B","DOBA WOLNA"],
  monthMidDay: [15,46,74,105,135,166,196,227,258,288,319,349],
  monthlyWind: [8.0,7.8,7.3,6.6,6.0,5.7,5.6,5.6,6.2,7.0,7.7,8.0], // m/s @100m
  seasonalDemand: [1.15,1.12,1.05,0.95,0.87,0.85,0.86,0.87,0.93,1.02,1.10,1.14],
  profileWork: [0.60,0.57,0.55,0.55,0.56,0.60,0.68,0.78,0.86,0.88,0.87,0.86,0.85,0.84,0.83,0.85,0.90,0.97,1.00,0.99,0.95,0.86,0.74,0.65],
  profileHoliday: [0.55,0.52,0.50,0.50,0.50,0.52,0.56,0.62,0.68,0.72,0.74,0.75,0.75,0.74,0.73,0.74,0.78,0.82,0.80,0.78,0.75,0.70,0.63,0.58],
  turbine: { vIn: 3, vRated: 12, vOut: 25 },
  pvSysEff: 0.85,
  // forecast sigma: sigma(h) = a + b*min(h,12); fraction of installed / of peak
  sigma: {
    wind: { a: 0.040, b: 0.022 },
    pv:   { a: 0.030, b: 0.020 },
    demand: { a: 0.010, b: 0.004 },
  },
  forecastLevels: [
    { name: "PODSTAWOWY", mult: 1.0, cost: 0 },
    { name: "ZAAWANSOWANY", mult: 0.7, cost: 600e6 },
    { name: "ANSAMBLOWY", mult: 0.5, cost: 1200e6 },
  ],
  ou: { windAmp: 0.25, windRho: Math.exp(-1/2.5), cloudAmp: 0.15, cloudRho: Math.exp(-1/0.8), demandAmp: 0.02, demandRho: Math.exp(-1/3) },
  regimeSwitchChance: 0.15,
};

/* technology catalog (doc 01 §5, values orientacyjne) */
const TECH = {
  nuclear: { label: "Jądrowa", kind: "plant", block: 1200, capexPerMW: 21e6, buildDays: 72, varCost: 60,  fixedPerMWYear: 600e3, maxBlocks: 4, color: "var(--c-nuclear)", sym: "N" },
  coal:    { label: "Węgiel",  kind: "plant", block: 500,  capexPerMW: 9e6,  buildDays: 36, varCost: 250, fixedPerMWYear: 300e3, maxBlocks: 6, color: "var(--c-coal)", sym: "C" },
  ccgt:    { label: "Gaz CCGT", kind: "plant", block: 400, capexPerMW: 5.5e6, buildDays: 18, varCost: 350, fixedPerMWYear: 150e3, maxBlocks: 6, color: "var(--c-gas)", sym: "G" },
  ocgt:    { label: "Gaz OCGT", kind: "plant", block: 100, capexPerMW: 3e6,  buildDays: 9,  varCost: 600, fixedPerMWYear: 100e3, maxBlocks: 6, color: "var(--c-gas)", sym: "g" },
  wind:    { label: "Wiatr lądowy", kind: "res", block: 100, capexPerMW: 3.6e6, buildDays: 9, varCost: 0, fixedPerMWYear: 200e3, maxBlocks: 3, color: "var(--c-wind)", sym: "W" },
  pv:      { label: "Farma PV", kind: "res", block: 50, capexPerMW: 1.8e6, buildDays: 4, varCost: 0, fixedPerMWYear: 100e3, maxBlocks: 4, color: "var(--c-pv)", sym: "S" },
  battery: { label: "Bateria (BESS)", kind: "storage", powerBlock: 50, energyBlock: 100, capexPerMW: 1.0e6, capexPerMWh: 0.8e6, buildDays: 4, fixedPerMWYear: 80e3, maxBlocks: 6, eff: 0.90, color: "var(--c-batt)", sym: "B" },
  pumped:  { label: "Szczytowo-pompowa", kind: "storage", powerBlock: 300, energyBlock: 2400, capexPerMW: 5e6, capexPerMWh: 0, buildDays: 36, fixedPerMWYear: 60e3, maxBlocks: 3, eff: 0.75, color: "var(--c-pumped)", sym: "P", site: "pumped" },
  substation: { label: "Stacja elektroenergetyczna", kind: "substation", capMW: 250, fields: 4, capex: 150e6, moduleCapex: 90e6, buildDays: 9, moduleBuildDays: 5, maxModules: 6, color: "#cfd8e3", sym: "▣" },
  border:  { label: "Przyłącze graniczne", kind: "border", capMW: 500, capex: 1.0e9, moduleCapex: 0.7e9, buildDays: 27, moduleBuildDays: 14, maxModules: 3, color: "var(--c-imp)", sym: "⇄" },
};
const LINE_TYPES = {
  l110: { label: "Linia 110 kV", cap: 150,  lossPer100: 0.04, costPerKm: 1.2e6, buildDays: 9 },
  l220: { label: "Linia 220 kV", cap: 500,  lossPer100: 0.02, costPerKm: 2.5e6, buildDays: 18 },
  l400: { label: "Linia 400 kV", cap: 1500, lossPer100: 0.01, costPerKm: 4.5e6, buildDays: 27 },
};
const TERRAIN = {
  p: { label: "nizina", mult: 1.0, color: "#232e27" },
  f: { label: "las", mult: 1.3, color: "#1e3d29" },
  h: { label: "wyżyna", mult: 1.5, color: "#3a3222" },
  m: { label: "góry", mult: 2.5, color: "#4a4034" },
  w: { label: "woda", mult: 2.2, color: "#1a3a52" },
  u: { label: "teren zurbanizowany", mult: 1.8, color: "#3d3444" },
};

/* weather regimes (doc 06 §8.2) */
const REGIMES = {
  winterHigh:  { label: "WYŻ ZIMOWY — MROŹNY", cloud: [0.10, 0.30], wind: 0.25, demand: 1.10 },
  winterFog:   { label: "WYŻ ZIMOWY — MGLISTY", cloud: [0.90, 1.00], wind: 0.20, demand: 1.06 },
  atlantic:    { label: "NIŻ ATLANTYCKI", cloud: [0.80, 1.00], wind: 1.40, demand: 1.00 },
  storm:       { label: "SZTORM", cloud: [0.90, 1.00], wind: 2.20, demand: 0.98 },
  summerHigh:  { label: "WYŻ LETNI", cloud: [0.00, 0.20], wind: 0.50, demand: 1.03 },
  summerLow:   { label: "NIŻ LETNI", cloud: [0.70, 0.90], wind: 1.20, demand: 0.99 },
  transitional:{ label: "POGODA PRZEJŚCIOWA", cloud: [0.40, 0.70], wind: 1.00, demand: 1.00 },
  coldWave:    { label: "FALA MROZÓW", cloud: [0.20, 0.50], wind: 0.40, demand: 1.15 },
};
const MONTH_REGIME_W = [
  { winterHigh:22, winterFog:10, atlantic:40, storm:8, transitional:15, coldWave:5 },
  { winterHigh:20, winterFog:10, atlantic:38, storm:8, transitional:19, coldWave:5 },
  { winterHigh:8, winterFog:4, atlantic:35, storm:8, transitional:45 },
  { atlantic:25, storm:5, transitional:55, summerLow:10, summerHigh:5 },
  { transitional:40, summerHigh:20, summerLow:25, atlantic:12, storm:3 },
  { summerHigh:32, summerLow:28, transitional:28, atlantic:10, storm:2 },
  { summerHigh:35, summerLow:28, transitional:25, atlantic:10, storm:2 },
  { summerHigh:33, summerLow:28, transitional:26, atlantic:11, storm:2 },
  { transitional:45, atlantic:25, summerLow:15, summerHigh:10, storm:5 },
  { transitional:40, atlantic:40, storm:8, winterHigh:6, winterFog:6 },
  { atlantic:42, winterHigh:15, winterFog:12, storm:8, transitional:20, coldWave:3 },
  { atlantic:40, winterHigh:20, winterFog:12, storm:8, transitional:14, coldWave:6 },
];

/* ---------- hex math (flat-top, odd-q offset like the handoff) ---------- */
const MAP_W = 14, MAP_H = 10;
const HEX_SIZE = 32, HEX_DX = 48, HEX_DY = 55.7, HEX_OX = 42, HEX_OY = 44;
function hexCenter(q, r) {
  return { x: HEX_OX + q * HEX_DX, y: HEX_OY + r * HEX_DY + (q % 2 ? HEX_DY / 2 : 0) };
}
function offsetToCube(q, r) {
  const x = q, z = r - (q - (q & 1)) / 2;
  return { x, y: -x - z, z };
}
function cubeToOffset(c) {
  const q = c.x, r = c.z + (c.x - (c.x & 1)) / 2;
  return { q, r };
}
function hexDist(q1, r1, q2, r2) {
  const a = offsetToCube(q1, r1), b = offsetToCube(q2, r2);
  return (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) + Math.abs(a.z - b.z)) / 2;
}
function cubeRound(x, y, z) {
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}
function hexLinePath(q1, r1, q2, r2) { // list of {q,r} incl. both ends
  const a = offsetToCube(q1, r1), b = offsetToCube(q2, r2);
  const n = Math.max(1, hexDist(q1, r1, q2, r2));
  const path = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const c = cubeRound(
      a.x + (b.x - a.x) * t + 1e-6, a.y + (b.y - a.y) * t + 2e-6, a.z + (b.z - a.z) * t - 3e-6
    );
    const o = cubeToOffset(c);
    if (!path.length || path[path.length - 1].q !== o.q || path[path.length - 1].r !== o.r) path.push(o);
  }
  return path;
}

/* ---------- map (curated layout, deterministic) ---------- */
const MAP_ROWS = [
  "ppffpppppphhpp",
  "pffppppppphmhp",
  "pfppppppphhmhp",
  "ppphwwpppphhpp",
  "pppwwppppppppp",
  "ppppppppppfppp",
  "ppfppppwhppffp",
  "pffpppwwpppfpp",
  "ppppppwppppppp",
  "pppppppppppppp",
];
const CITY_DEFS = [
  { name: "STOLICA", q: 7, r: 4, peak: 600 },
  { name: "HUTNIKI", q: 11, r: 7, peak: 350 },
  { name: "LIPNO",   q: 2, r: 8, peak: 250 },
  { name: "WEŁNA",   q: 3, r: 1, peak: 150 },
  { name: "ZDROJE",  q: 12, r: 3, peak: 120 },
  { name: "BORKI",   q: 5, r: 6, peak: 80 },
];
const BORDER_DEFS = [
  { name: "PG-WSCHÓD", q: 13, r: 5 },
  { name: "PG-POŁUDNIE", q: 6, r: 9 },
];

function buildMap() {
  const hexes = [];
  for (let r = 0; r < MAP_H; r++) for (let q = 0; q < MAP_W; q++) {
    let t = MAP_ROWS[r][q];
    if (CITY_DEFS.some(c => c.q === q && c.r === r)) t = "u";
    let windClass = r <= 2 ? 1.2 : r <= 4 ? 1.05 : r <= 6 ? 0.95 : 0.9;
    if (t === "h") windClass += 0.10;
    if (t === "m") windClass += 0.15;
    const sunClass = r <= 2 ? 0.95 : r <= 6 ? 1.0 : 1.06;
    hexes.push({ q, r, terrain: t, windClass: Math.min(1.35, windClass), sunClass });
  }
  return hexes;
}
function hexAt(state, q, r) { return state.hexes[r * MAP_W + q]; }
function isPumpedSite(state, q, r) {
  const h = hexAt(state, q, r);
  if (!h || (h.terrain !== "h" && h.terrain !== "m")) return false;
  return neighborsOf(q, r).some(n => { const nh = hexAt(state, n.q, n.r); return nh && nh.terrain === "w"; });
}
function neighborsOf(q, r) {
  const c = offsetToCube(q, r);
  const dirs = [[1,-1,0],[1,0,-1],[0,1,-1],[-1,1,0],[-1,0,1],[0,-1,1]];
  const out = [];
  for (const d of dirs) {
    const o = cubeToOffset({ x: c.x + d[0], y: c.y + d[1], z: c.z + d[2] });
    if (o.q >= 0 && o.q < MAP_W && o.r >= 0 && o.r < MAP_H) out.push(o);
  }
  return out;
}

/* ---------- astronomy (doc 06 §3-4) ---------- */
const RAD = Math.PI / 180;
function solarDeclination(n) { return 23.45 * Math.sin(RAD * 360 * (284 + n) / 365); }
function solarAltitudeSin(n, hour, lat) {
  const decl = solarDeclination(n);
  const omega = 15 * (hour - 12);
  return Math.sin(RAD * lat) * Math.sin(RAD * decl) + Math.cos(RAD * lat) * Math.cos(RAD * decl) * Math.cos(RAD * omega);
}
function ghiClear(sinA) {
  if (sinA <= 0) return 0;
  return 1098 * sinA * Math.exp(-0.057 / sinA);
}
function pvFactor(n, hour, cloud) { // fraction of installed capacity (national)
  const sinA = solarAltitudeSin(n, hour + 0.5, CFG.latitude);
  const ghi = ghiClear(sinA) * (1 - 0.75 * Math.pow(cloud, 3.4));
  return clamp(ghi / 1000, 0, 1) * CFG.pvSysEff;
}
function windPowerFrac(v) {
  const { vIn, vRated, vOut } = CFG.turbine;
  if (v < vIn || v >= vOut) return 0;
  if (v >= vRated) return 1;
  return (v ** 3 - vIn ** 3) / (vRated ** 3 - vIn ** 3);
}

/* ---------- game state ---------- */
let state = null;
let nextId = 1;
function newId() { return nextId++; }

function newGame(seed) {
  nextId = 1;
  state = {
    seed: seed ?? CFG.seed,
    year: 1, month: 0, dayIdx: 0, hour: 0,
    phase: "decision", // decision | resolving | report | dayReport
    budget: CFG.startBudget,
    forecastLevel: 0,
    hexes: buildMap(),
    objects: [],
    lines: [],
    monthRegime: null,
    day: null,
    lastDayResult: 0,
    log: [],
    stats: { totalUnservedMWh: 0, totalProfit: 0, daysPlayed: 0 },
  };
  for (const c of CITY_DEFS) {
    state.objects.push({ id: newId(), kind: "city", name: c.name, q: c.q, r: c.r, peak: c.peak, connected: false, state: "ready" });
  }
  for (const b of BORDER_DEFS) {
    state.objects.push({ id: newId(), kind: "borderSite", name: b.name, q: b.q, r: b.r, state: "ready" });
  }
  // Minimal starting endowment (docs/01 §3.4, v0.10): one CCGT already feeding
  // LIPNO through two substations and a 220 kV line. Free of charge — starting
  // capital stays at CFG.startBudget.
  const stPlant = { id: newId(), kind: "substation", tech: "substation", q: 4, r: 7, state: "ready", modules: 1, setpoint: 0, spentCapex: 0 };
  const stCity = { id: newId(), kind: "substation", tech: "substation", q: 2, r: 7, state: "ready", modules: 1, setpoint: 0, spentCapex: 0 };
  const starterPlant = { id: newId(), kind: "plant", tech: "ccgt", q: 5, r: 7, state: "ready", blocks: 1, setpoint: TECH.ccgt.block, spentCapex: 0 };
  state.objects.push(stPlant, stCity, starterPlant);
  const starterPath = hexLinePath(stPlant.q, stPlant.r, stCity.q, stCity.r);
  state.lines.push({
    id: newId(), type: "l220", aId: stPlant.id, bId: stCity.id, path: starterPath,
    km: (starterPath.length - 1) * CFG.hexKm, state: "ready", daysLeft: 0, flow: 0, spentCapex: 0,
  });
  const starterCity = state.objects.find(o => o.kind === "city" && o.name === "LIPNO");
  starterCity.connected = true;
  starterCity.stationId = stCity.id;
  rollMonthRegime();
  initDay();
  log(`SYSTEM STARTOWY: ${TECH.ccgt.label} 400 MW zasila miasto LIPNO`, "info");
  return state;
}

function log(msg, cls) {
  state.log.unshift({ t: `R${state.year} ${CFG.monthNames[state.month].slice(0,3)} d${state.dayIdx + 1} ${String(state.hour).padStart(2,"0")}:00`, msg, cls });
  state.log = state.log.slice(0, 60);
}

/* ---------- calendar & weather truth ---------- */
function dayRngSeed() {
  return (state.seed * 7919 + state.year * 373 + state.month * 37 + state.dayIdx * 7 + 1) >>> 0;
}
function pickWeighted(rng, weights) {
  let total = 0; for (const k in weights) total += weights[k];
  let x = rng() * total;
  for (const k in weights) { x -= weights[k]; if (x <= 0) return k; }
  return Object.keys(weights)[0];
}
function rollMonthRegime() {
  const rng = mulberry32((state.seed * 31 + state.year * 977 + state.month * 101) >>> 0);
  state.monthRegime = pickWeighted(rng, MONTH_REGIME_W[state.month]);
}
function ouSeries(rng, rho, amp, len) {
  const out = []; let x = gauss(rng);
  for (let i = 0; i < len; i++) { out.push(x * amp); x = x * rho + Math.sqrt(1 - rho * rho) * gauss(rng); }
  return out;
}
function initDay() {
  const rng = mulberry32(dayRngSeed());
  let regimeKey = state.monthRegime;
  // occasional regime change inside the month (day 3 most often)
  if (rng() < CFG.regimeSwitchChance && state.dayIdx === 2) {
    regimeKey = pickWeighted(rng, MONTH_REGIME_W[state.month]);
  }
  const reg = REGIMES[regimeKey];
  const n = CFG.monthMidDay[state.month] + state.dayIdx;
  const vBase = CFG.monthlyWind[state.month] * reg.wind * (0.9 + 0.2 * rng());
  const cBase = reg.cloud[0] + (reg.cloud[1] - reg.cloud[0]) * rng();
  const ouW = ouSeries(rng, CFG.ou.windRho, CFG.ou.windAmp, 24);
  const ouC = ouSeries(rng, CFG.ou.cloudRho, CFG.ou.cloudAmp, 24);
  const ouD = ouSeries(rng, CFG.ou.demandRho, CFG.ou.demandAmp, 24);
  const profile = state.dayIdx === 2 ? CFG.profileHoliday : CFG.profileWork;
  const vNat = [], cloud = [], demandShape = [];
  for (let h = 0; h < 24; h++) {
    vNat.push(Math.max(0, vBase * (1 + ouW[h])));
    cloud.push(clamp(cBase + ouC[h], 0, 1));
    demandShape.push(profile[h] * CFG.seasonalDemand[state.month] * reg.demand * (1 + ouD[h]));
  }
  state.day = {
    regimeKey, regimeLabel: reg.label, n,
    vNat, cloud, demandShape,
    errWind: ouSeries(rng, 0.75, 1, 24),
    errPV: ouSeries(rng, 0.75, 1, 24),
    errDemand: ouSeries(rng, 0.75, 1, 24),
    hours: [], // resolved results
    fin: { revenue: 0, fuel: 0, importCost: 0, exportRev: 0, penalty: 0 },
  };
}

/* ---------- fleet helpers ---------- */
function readyObjects(kind) { return state.objects.filter(o => o.kind === kind && o.state === "ready"); }
function objCapMW(o) {
  const t = TECH[o.tech];
  if (!t) return 0;
  if (t.kind === "storage") return o.powerBlocks * t.powerBlock;
  if (o.kind === "substation") return (1 + o.modules) * TECH.substation.capMW;
  if (o.kind === "border") return (1 + o.modules) * TECH.border.capMW;
  return o.blocks * t.block;
}
function objEnergyCap(o) { return o.energyBlocks * TECH[o.tech].energyBlock; }
function stationCap(o) { return (1 + (o.modules || 0)) * TECH.substation.capMW; }
function stationFields(o) { return TECH.substation.fields + 2 * (o.modules || 0); }
function usedFields(st) {
  return state.lines.filter(l => l.aId === st.id || l.bId === st.id).length;
}
function findStationFor(obj) {
  // nearest ready substation within cube distance <= 1 (border sites carry their own)
  let best = null, bestD = 99;
  for (const s of state.objects) {
    if (s.kind !== "substation" || s.state !== "ready") continue;
    const d = hexDist(obj.q, obj.r, s.q, s.r);
    if (d <= 1 && (d < bestD || (d === bestD && s.id < (best?.id ?? 1e9)))) { best = s; bestD = d; }
  }
  return best;
}

/* farm production (MW) for given hour using truth series */
function farmWindMW(o, h) {
  const hx = hexAt(state, o.q, o.r);
  const v = state.day.vNat[h] * hx.windClass;
  return objCapMW(o) * windPowerFrac(v);
}
function farmPvMW(o, h) {
  const hx = hexAt(state, o.q, o.r);
  return objCapMW(o) * pvFactor(state.day.n, h, state.day.cloud[h]) * hx.sunClass;
}
function fleetWindMW(h) { return readyObjects("res").filter(o => o.tech === "wind").reduce((s, o) => s + (findStationFor(o) ? farmWindMW(o, h) : 0), 0); }
function fleetPvMW(h) { return readyObjects("res").filter(o => o.tech === "pv").reduce((s, o) => s + (findStationFor(o) ? farmPvMW(o, h) : 0), 0); }
function installedWind() { return readyObjects("res").filter(o => o.tech === "wind").reduce((s, o) => s + objCapMW(o), 0); }
function installedPv() { return readyObjects("res").filter(o => o.tech === "pv").reduce((s, o) => s + objCapMW(o), 0); }
function connectedCities() { return state.objects.filter(o => o.kind === "city" && o.connected); }
function connectedPeak() { return connectedCities().reduce((s, c) => s + c.peak, 0); }
function cityDemandMW(c, h) { return c.peak * state.day.demandShape[h]; }
function totalDemandMW(h) { return connectedCities().reduce((s, c) => s + cityDemandMW(c, h), 0); }

/* ---------- forecast (doc 06 §8.6) ---------- */
function sigmaAt(series, horizon) {
  const s = CFG.sigma[series];
  const mult = CFG.forecastLevels[state.forecastLevel].mult;
  return (s.a + s.b * Math.min(horizon, 12)) * mult;
}
/* h < now → resolved history (truth); h >= now → forecast with horizon error.
   The turn being decided is itself a forecast at horizon +1 h. */
function forecastWindMW(h, now) {
  const truth = fleetWindMW(h);
  const inst = installedWind();
  if (h < now || state.day.hours[h]) return { mean: truth, band: 0 };
  const hor = Math.max(1, h - now);
  const band = sigmaAt("wind", hor) * inst;
  return { mean: clamp(truth + state.day.errWind[h] * band, 0, inst), band };
}
function forecastPvMW(h, now) {
  const truth = fleetPvMW(h);
  const inst = installedPv();
  if (h < now || state.day.hours[h]) return { mean: truth, band: 0 };
  const hor = Math.max(1, h - now);
  const sunUp = solarAltitudeSin(state.day.n, h + 0.5, CFG.latitude) > 0;
  const band = sunUp ? sigmaAt("pv", hor) * inst : 0;
  return { mean: clamp(truth + state.day.errPV[h] * band, 0, inst), band };
}
function forecastDemandMW(h, now) {
  const truth = totalDemandMW(h);
  const base = connectedPeak() * CFG.seasonalDemand[state.month];
  if (h < now || state.day.hours[h]) return { mean: truth, band: 0 };
  const hor = Math.max(1, h - now);
  const band = sigmaAt("demand", hor) * base;
  return { mean: Math.max(0, truth + state.day.errDemand[h] * band), band };
}

/* ---------- network flow solver ----------
   Greedy successive cheapest augmenting paths on the capacity graph.
   Approximates deterministic min-cost flow (doc 01 §4.4); losses are
   multiplicative per line, substations are node-split capacity edges. */
function buildFlowGraph() {
  const nodes = new Map(); // name -> index
  const edges = []; // {from,to,cap,loss,used,lineId,stationId}
  const adjOut = new Map(); // nodeIdx -> [edgeIdx]
  function node(name) {
    if (!nodes.has(name)) { nodes.set(name, nodes.size); adjOut.set(nodes.size - 1, []); }
    return nodes.get(name);
  }
  function edge(from, to, cap, loss, tag) {
    const e = { from: node(from), to: node(to), cap, loss, used: 0, ...tag };
    edges.push(e); adjOut.get(e.from).push(edges.length - 1);
    return e;
  }
  for (const s of state.objects) {
    if ((s.kind === "substation" || s.kind === "border") && s.state === "ready") {
      const cap = s.kind === "border" ? objCapMW(s) : stationCap(s);
      edge(`n${s.id}:in`, `n${s.id}:out`, cap, 0, { stationId: s.id });
    }
  }
  for (const l of state.lines) {
    if (l.state !== "ready") continue;
    const loss = clamp(LINE_TYPES[l.type].lossPer100 * l.km / 100, 0, 0.95);
    edge(`n${l.aId}:out`, `n${l.bId}:in`, LINE_TYPES[l.type].cap, loss, { lineId: l.id, dir: "ab" });
    edge(`n${l.bId}:out`, `n${l.aId}:in`, LINE_TYPES[l.type].cap, loss, { lineId: l.id, dir: "ba" });
  }
  return { nodes, edges, adjOut, node: (n) => nodes.get(n) };
}

function solveFlow(sources, sinks) {
  // sources: {key, stationId, avail, cost, atOut?}; sinks: {key, stationId, want, reward, atIn?}
  const g = buildFlowGraph();
  const N = g.nodes.size;
  // reverse adjacency for backward Dijkstra from sinks
  const adjIn = new Map();
  for (let i = 0; i < N; i++) adjIn.set(i, []);
  g.edges.forEach((e, i) => adjIn.get(e.to).push(i));

  const srcs = sources.filter(s => s.avail > 1e-6 && g.node(`n${s.stationId}:in`) !== undefined)
    .map(s => ({ ...s, node: g.node(s.atOut ? `n${s.stationId}:out` : `n${s.stationId}:in`) }));
  const snks = sinks.filter(s => s.want > 1e-6 && g.node(`n${s.stationId}:out`) !== undefined)
    .map(s => ({ ...s, node: g.node(s.atIn ? `n${s.stationId}:in` : `n${s.stationId}:out`) }));
  snks.sort((a, b) => b.reward - a.reward || (a.key < b.key ? -1 : 1));

  const result = { sourceUsed: new Map(), sinkServed: new Map(), lineFlowDir: new Map(), stationFlow: new Map(), losses: 0 };
  const addMap = (m, k, v) => m.set(k, (m.get(k) || 0) + v);

  let guard = 0;
  let progress = true;
  while (progress && guard++ < 4000) {
    progress = false;
    for (const sink of snks) {
      if (sink.want <= 1e-6) continue;
      // backward Dijkstra: minimal multiplier M(node) from node to sink
      const dist = new Array(N).fill(Infinity); // ln(M)
      const parentEdge = new Array(N).fill(-1);
      const done = new Array(N).fill(false);
      dist[sink.node] = 0;
      for (;;) {
        let u = -1, best = Infinity;
        for (let i = 0; i < N; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
        if (u < 0) break;
        done[u] = true;
        for (const ei of adjIn.get(u)) {
          const e = g.edges[ei];
          if (e.cap - e.used <= 1e-6) continue;
          const w = -Math.log(1 - e.loss);
          if (dist[u] + w < dist[e.from] - 1e-12) { dist[e.from] = dist[u] + w; parentEdge[e.from] = ei; }
        }
      }
      // pick cheapest source by delivered cost
      let bestSrc = null, bestCost = Infinity;
      for (const s of srcs) {
        if (s.avail <= 1e-6 || dist[s.node] === Infinity) continue;
        const M = Math.exp(dist[s.node]);
        const c = s.cost * M;
        if (c < bestCost - 1e-9 || (Math.abs(c - bestCost) <= 1e-9 && s.key < bestSrc?.key)) { bestCost = c; bestSrc = { s, M }; }
      }
      if (!bestSrc || bestCost >= sink.reward) continue;
      // walk path source -> sink, find max deliverable D
      const { s, M } = bestSrc;
      const pathEdges = [];
      let nodeI = s.node;
      while (nodeI !== sink.node) {
        const ei = parentEdge[nodeI];
        if (ei < 0) break;
        pathEdges.push(ei);
        nodeI = g.edges[ei].to;
      }
      if (nodeI !== sink.node) { s.avail = 0; continue; } // safety
      let D = Math.min(sink.want, s.avail / M);
      let mult = M;
      for (const ei of pathEdges) {
        const e = g.edges[ei];
        D = Math.min(D, (e.cap - e.used) / mult);
        mult *= (1 - e.loss);
      }
      if (D <= 1e-6) { continue; }
      // apply
      let inflow = D * M;
      s.avail -= inflow;
      sink.want -= D;
      addMap(result.sourceUsed, s.key, inflow);
      addMap(result.sinkServed, sink.key, D);
      for (const ei of pathEdges) {
        const e = g.edges[ei];
        e.used += inflow;
        if (e.lineId !== undefined) addMap(result.lineFlowDir, `${e.lineId}:${e.dir}`, inflow);
        if (e.stationId !== undefined) addMap(result.stationFlow, e.stationId, inflow);
        const out = inflow * (1 - e.loss);
        result.losses += inflow - out;
        inflow = out;
      }
      progress = true;
    }
  }
  // net line flow (opposite directions cancel — display and load metric)
  result.lineFlow = new Map();
  for (const [k, v] of result.lineFlowDir) {
    const [id] = k.split(":");
    const prev = result.lineFlow.get(+id) || 0;
    result.lineFlow.set(+id, prev);
  }
  for (const l of state.lines) {
    const ab = result.lineFlowDir.get(`${l.id}:ab`) || 0;
    const ba = result.lineFlowDir.get(`${l.id}:ba`) || 0;
    if (ab || ba) result.lineFlow.set(l.id, Math.abs(ab - ba));
  }
  return result;
}

/* build source/sink lists for a given hour; res/demand from truth or forecast */
function buildInjections(h, useTruth) {
  const sources = [], sinks = [];
  for (const o of state.objects) {
    if (o.state !== "ready") continue;
    const st = o.kind === "border" ? o : findStationFor(o);
    if (!st && o.kind !== "city") continue;
    if (o.kind === "plant") {
      const sp = clamp(o.setpoint || 0, 0, objCapMW(o));
      if (sp > 0) sources.push({ key: `o${o.id}`, stationId: st.id, avail: sp, cost: TECH[o.tech].varCost });
    } else if (o.kind === "res") {
      let mw;
      if (useTruth) mw = o.tech === "wind" ? farmWindMW(o, h) : farmPvMW(o, h);
      else {
        const fleetT = o.tech === "wind" ? fleetWindMW(h) : fleetPvMW(h);
        const f = o.tech === "wind" ? forecastWindMW(h, state.hour) : forecastPvMW(h, state.hour);
        const ratio = fleetT > 1e-6 ? f.mean / fleetT : 0;
        mw = (o.tech === "wind" ? farmWindMW(o, h) : farmPvMW(o, h)) * ratio;
      }
      if (mw > 0) sources.push({ key: `o${o.id}`, stationId: st.id, avail: mw, cost: 0 });
    } else if (o.kind === "storage") {
      const sp = o.setpoint || 0;
      if (sp > 0) { // discharge
        const avail = Math.min(sp, objCapMW(o), o.soc);
        if (avail > 0) sources.push({ key: `o${o.id}`, stationId: st.id, avail, cost: 1 });
      } else if (sp < 0) { // charge
        const room = (objEnergyCap(o) - o.soc) / TECH[o.tech].eff;
        const want = Math.min(-sp, objCapMW(o), room);
        if (want > 0) sinks.push({ key: `o${o.id}`, stationId: st.id, want, reward: CFG.chargePriority });
      }
    } else if (o.kind === "border") {
      const sp = o.setpoint || 0;
      if (sp > 0) sources.push({ key: `o${o.id}`, stationId: o.id, avail: Math.min(sp, objCapMW(o)), cost: CFG.importPrice });
      else if (sp < 0) sinks.push({ key: `o${o.id}`, stationId: o.id, want: Math.min(-sp, objCapMW(o)), reward: CFG.exportPrice });
    } else if (o.kind === "city" && o.connected) {
      const st2 = state.objects.find(s => s.id === o.stationId && s.state === "ready");
      if (!st2) continue;
      let d;
      if (useTruth) d = cityDemandMW(o, h);
      else {
        const tot = totalDemandMW(h);
        const f = forecastDemandMW(h, state.hour);
        d = tot > 1e-6 ? cityDemandMW(o, h) * (f.mean / tot) : 0;
      }
      if (d > 0) sinks.push({ key: `c${o.id}`, stationId: st2.id, want: d, reward: CFG.unservedPenalty });
    }
  }
  return { sources, sinks };
}

/* live plan check (forecast-based) for the setpoints card & map preview */
function planFlow(h) {
  const inj = buildInjections(h, false);
  const res = solveFlow(inj.sources, inj.sinks);
  return { inj, res };
}

/* ---------- turn resolution ---------- */
function resolveTurn() {
  const h = state.hour;
  // snapshot what the forecast promised for this hour (horizon +1) before resolving
  const fcDemand = forecastDemandMW(h, h).mean;
  const fcWind = forecastWindMW(h, h).mean;
  const fcPv = forecastPvMW(h, h).mean;
  const inj = buildInjections(h, true);
  const res = solveFlow(inj.sources, inj.sinks);

  const byTech = { nuclear: 0, coal: 0, ccgt: 0, ocgt: 0, wind: 0, pv: 0, battery: 0, pumped: 0, import: 0 };
  let charge = 0, exportMW = 0, availRes = 0, usedRes = 0, importCost = 0, exportRev = 0, fuel = 0;

  for (const o of state.objects) {
    if (o.state !== "ready") continue;
    const used = res.sourceUsed.get(`o${o.id}`) || 0;
    if (o.kind === "plant") { byTech[o.tech] += used; fuel += used * TECH[o.tech].varCost; }
    else if (o.kind === "res") {
      byTech[o.tech] += used; usedRes += used;
      availRes += o.tech === "wind" ? farmWindMW(o, h) : farmPvMW(o, h);
    }
    else if (o.kind === "storage") {
      if ((o.setpoint || 0) > 0) { byTech[o.tech] += used; o.soc = Math.max(0, o.soc - used); }
      else if ((o.setpoint || 0) < 0) {
        const got = res.sinkServed.get(`o${o.id}`) || 0;
        charge += got;
        o.soc = Math.min(objEnergyCap(o), o.soc + got * TECH[o.tech].eff);
      }
    }
    else if (o.kind === "border") {
      if ((o.setpoint || 0) > 0) { byTech.import += used; importCost += used * CFG.importPrice; }
      else if ((o.setpoint || 0) < 0) {
        const ex = res.sinkServed.get(`o${o.id}`) || 0;
        exportMW += ex; exportRev += ex * CFG.exportPrice;
      }
    }
  }

  let demand = 0, served = 0;
  const cityRes = [];
  for (const c of connectedCities()) {
    const d = cityDemandMW(c, h);
    const s = res.sinkServed.get(`c${c.id}`) || 0;
    demand += d; served += s;
    cityRes.push({ name: c.name, demand: d, served: s, unserved: Math.max(0, d - s) });
  }
  const unserved = Math.max(0, demand - served);
  const revenue = served * CFG.tariff;
  const penalty = unserved * CFG.unservedPenalty;

  // line + station loads
  const lineFlows = {};
  let maxLoadPct = 0, maxStationPct = 0;
  for (const l of state.lines) {
    if (l.state !== "ready") continue;
    const f = res.lineFlow.get(l.id) || 0;
    lineFlows[l.id] = f;
    l.flow = f;
    maxLoadPct = Math.max(maxLoadPct, f / LINE_TYPES[l.type].cap);
  }
  for (const o of state.objects) {
    if ((o.kind === "substation" || o.kind === "border") && o.state === "ready") {
      o.flowThrough = res.stationFlow.get(o.id) || 0;
      const cap = o.kind === "border" ? objCapMW(o) : stationCap(o);
      maxStationPct = Math.max(maxStationPct, o.flowThrough / cap);
    }
  }

  // storm detection (any wind farm at cutoff while national wind high)
  const stormCut = readyObjects("res").some(o => o.tech === "wind" && hexAt(state, o.q, o.r).windClass * state.day.vNat[h] >= CFG.turbine.vOut);

  const hourRes = {
    h, demand, served, unserved, byTech, charge, exportMW, losses: res.losses,
    curtail: Math.max(0, availRes - usedRes), availRes,
    revenue, fuel, importCost, exportRev, penalty,
    cityRes, maxLoadPct, maxStationPct, stormCut,
    truthWind: fleetWindMW(h), truthPv: fleetPvMW(h),
    fcDemand, fcWind, fcPv,
  };
  state.day.hours[h] = hourRes;
  const f = state.day.fin;
  f.revenue += revenue; f.fuel += fuel; f.importCost += importCost; f.exportRev += exportRev; f.penalty += penalty;
  state.stats.totalUnservedMWh += unserved;
  if (unserved > 0.5) log(`NIEDOBÓR ${Math.round(unserved)} MW (${cityRes.filter(c=>c.unserved>0.5).map(c=>c.name).join(", ")})`, "alarm");
  if (stormCut) log("WYŁĄCZENIE SZTORMOWE TURBIN — wiatr ≥ 25 m/s", "warn");
  return hourRes;
}

/* fixed costs of the whole fleet per representative day */
function fixedCostPerDay() {
  let perYear = 0;
  for (const o of state.objects) {
    if (o.state !== "ready") continue;
    const t = TECH[o.tech];
    if (!t || !t.fixedPerMWYear) continue;
    perYear += objCapMW(o) * t.fixedPerMWYear;
  }
  return perYear / 365 * CFG.repDays[state.dayIdx];
}

function settleDay() {
  const f = state.day.fin;
  const scale = CFG.repDays[state.dayIdx];
  const varResult = (f.revenue + f.exportRev - f.fuel - f.importCost - f.penalty) * scale;
  const fixed = fixedCostPerDay();
  const result = varResult - fixed;
  state.budget += result;
  state.lastDayResult = result;
  state.stats.totalProfit += result;
  state.stats.daysPlayed++;
  // construction progress (1 game day)
  for (const o of state.objects) {
    if (o.state === "building" && --o.daysLeft <= 0) { o.state = "ready"; log(`UKOŃCZONO: ${objName(o)}`, "ok"); }
    if (o.expansion && --o.expansion.daysLeft <= 0) {
      applyExpansion(o);
      log(`ROZBUDOWANO: ${objName(o)}`, "ok");
    }
  }
  for (const l of state.lines) {
    if (l.state === "building" && --l.daysLeft <= 0) { l.state = "ready"; log(`UKOŃCZONO: ${LINE_TYPES[l.type].label}`, "ok"); }
  }
  return { varResult, fixed, result, scale, fin: { ...f } };
}

function advanceDay() {
  state.dayIdx++;
  if (state.dayIdx > 2) {
    state.dayIdx = 0; state.month++;
    if (state.month > 11) {
      state.month = 0; state.year++;
      for (const c of state.objects) if (c.kind === "city") c.peak *= (1 + CFG.growthPerYear);
      log(`NOWY ROK ${state.year} — zapotrzebowanie miast +${Math.round(CFG.growthPerYear*100)}%`, "info");
    }
    rollMonthRegime();
  }
  state.hour = 0;
  state.phase = "decision";
  initDay();
}

/* ---------- player actions ---------- */
function objName(o) {
  if (o.kind === "city") return o.name;
  if (o.kind === "borderSite" || o.kind === "border") return o.name;
  if (o.kind === "substation") return `GPZ-${o.id}`;
  return `${TECH[o.tech].label} #${o.id}`;
}
function terrainMult(q, r) { return TERRAIN[hexAt(state, q, r).terrain].mult; }
function hexOccupied(q, r) {
  return state.objects.some(o => o.q === q && o.r === r && o.kind !== "city" && o.kind !== "borderSite");
}
function buildCost(techKey, q, r) {
  const t = TECH[techKey];
  const mult = terrainMult(q, r);
  if (techKey === "substation" || techKey === "border") return t.capex * mult;
  if (t.kind === "storage") return (t.powerBlock * t.capexPerMW + t.energyBlock * t.capexPerMWh) * mult;
  return t.block * t.capexPerMW * mult;
}
function canBuildAt(techKey, q, r) {
  const hx = hexAt(state, q, r);
  if (!hx) return { ok: false, why: "poza mapą" };
  const t = TECH[techKey];
  if (techKey === "border") {
    const site = state.objects.find(o => o.kind === "borderSite" && o.q === q && o.r === r);
    if (!site) return { ok: false, why: "tylko na punkcie granicznym" };
    if (state.objects.some(o => o.kind === "border" && o.q === q && o.r === r)) return { ok: false, why: "już istnieje" };
    return { ok: true };
  }
  if (hexOccupied(q, r)) return { ok: false, why: "heks zajęty" };
  if (hx.terrain === "w") return { ok: false, why: "woda" };
  if (hx.terrain === "u") return { ok: false, why: "teren miejski" };
  if (t.site === "pumped" && !isPumpedSite(state, q, r)) return { ok: false, why: "wymaga wyżyny/gór przy wodzie" };
  return { ok: true };
}
function build(techKey, q, r) {
  const chk = canBuildAt(techKey, q, r);
  if (!chk.ok) return { ok: false, why: chk.why };
  const cost = buildCost(techKey, q, r);
  if (state.budget < cost) return { ok: false, why: "brak środków" };
  state.budget -= cost;
  const t = TECH[techKey];
  const o = {
    id: newId(), kind: t.kind === "storage" ? "storage" : t.kind, tech: techKey, q, r,
    state: "building", daysLeft: t.buildDays, setpoint: 0, spentCapex: cost,
  };
  if (techKey === "substation") { o.kind = "substation"; o.modules = 0; }
  if (techKey === "border") { o.kind = "border"; o.modules = 0; o.name = state.objects.find(s => s.kind === "borderSite" && s.q === q && s.r === r).name; }
  if (t.kind === "plant" || t.kind === "res") o.blocks = 1;
  if (t.kind === "storage") { o.powerBlocks = 1; o.energyBlocks = 1; o.soc = 0; }
  state.objects.push(o);
  log(`BUDOWA: ${objName(o)} (${o.daysLeft} dób)`, "info");
  return { ok: true, obj: o };
}
function lineCost(type, path) {
  let cost = 0;
  for (let i = 1; i < path.length; i++) cost += LINE_TYPES[type].costPerKm * CFG.hexKm * terrainMult(path[i].q, path[i].r);
  return cost;
}
function buildLine(type, aId, bId) {
  const a = state.objects.find(o => o.id === aId), b = state.objects.find(o => o.id === bId);
  if (!a || !b) return { ok: false, why: "brak stacji" };
  const okKind = (o) => o.kind === "substation" || o.kind === "border";
  if (!okKind(a) || !okKind(b)) return { ok: false, why: "linie łączą tylko stacje/przyłącza graniczne" };
  if (a.id === b.id) return { ok: false, why: "ta sama stacja" };
  if (a.kind === "substation" && usedFields(a) >= stationFields(a)) return { ok: false, why: `brak pól w GPZ-${a.id}` };
  if (b.kind === "substation" && usedFields(b) >= stationFields(b)) return { ok: false, why: `brak pól w GPZ-${b.id}` };
  const path = hexLinePath(a.q, a.r, b.q, b.r);
  const km = (path.length - 1) * CFG.hexKm;
  const cost = lineCost(type, path);
  if (state.budget < cost) return { ok: false, why: "brak środków" };
  state.budget -= cost;
  const l = { id: newId(), type, aId, bId, path, km, state: "building", daysLeft: LINE_TYPES[type].buildDays, flow: 0, spentCapex: cost };
  state.lines.push(l);
  log(`BUDOWA: ${LINE_TYPES[type].label} ${km} km (${l.daysLeft} dób)`, "info");
  return { ok: true, line: l };
}
function connectCity(cityId) {
  const c = state.objects.find(o => o.id === cityId && o.kind === "city");
  if (!c || c.connected) return { ok: false, why: "brak miasta / już przyłączone" };
  const st = findStationFor(c);
  if (!st) return { ok: false, why: "brak stacji w zasięgu 1 heksa" };
  if (state.budget < CFG.cityConnectCost) return { ok: false, why: "brak środków" };
  state.budget -= CFG.cityConnectCost;
  c.connected = true; c.stationId = st.id;
  log(`PRZYŁĄCZONO MIASTO ${c.name} (${Math.round(c.peak)} MW szczytu)`, "ok");
  return { ok: true };
}
function expansionInfo(o) {
  const t = TECH[o.tech];
  if (o.kind === "substation") {
    if (o.modules >= t.maxModules) return null;
    return { label: `+${TECH.substation.capMW} MW, +2 pola`, cost: t.moduleCapex * terrainMult(o.q, o.r), days: t.moduleBuildDays };
  }
  if (o.kind === "border") {
    if (o.modules >= t.maxModules) return null;
    return { label: `+${TECH.border.capMW} MW zdolności`, cost: t.moduleCapex, days: t.moduleBuildDays };
  }
  if (o.kind === "plant" || o.kind === "res") {
    if (o.blocks >= t.maxBlocks) return null;
    return { label: `+${t.block} MW (blok ${o.blocks + 1}/${t.maxBlocks})`, cost: t.block * t.capexPerMW * 0.85 * terrainMult(o.q, o.r), days: Math.round(t.buildDays * 0.7) };
  }
  if (o.kind === "storage") {
    if (o.powerBlocks >= t.maxBlocks) return null;
    return { label: `+${t.powerBlock} MW / +${t.energyBlock} MWh`, cost: (t.powerBlock * t.capexPerMW + t.energyBlock * t.capexPerMWh) * 0.85, days: Math.round(t.buildDays * 0.7) };
  }
  return null;
}
function expand(objId) {
  const o = state.objects.find(x => x.id === objId);
  if (!o || o.state !== "ready" || o.expansion) return { ok: false, why: "niedostępne" };
  const info = expansionInfo(o);
  if (!info) return { ok: false, why: "limit lokalizacji osiągnięty" };
  if (state.budget < info.cost) return { ok: false, why: "brak środków" };
  state.budget -= info.cost;
  o.expansion = { daysLeft: info.days, cost: info.cost };
  log(`ROZBUDOWA: ${objName(o)} (${info.days} dób)`, "info");
  return { ok: true };
}
function applyExpansion(o) {
  if (o.kind === "substation" || o.kind === "border") o.modules++;
  else if (o.kind === "storage") { o.powerBlocks++; o.energyBlocks++; }
  else o.blocks++;
  delete o.expansion;
}
function cancelConstruction(id) {
  const oi = state.objects.findIndex(o => o.id === id && o.state === "building");
  if (oi >= 0) { log(`ANULOWANO BUDOWĘ: ${objName(state.objects[oi])} — nakłady przepadają`, "warn"); state.objects.splice(oi, 1); return { ok: true }; }
  const li = state.lines.findIndex(l => l.id === id && l.state === "building");
  if (li >= 0) { log(`ANULOWANO BUDOWĘ LINII — nakłady przepadają`, "warn"); state.lines.splice(li, 1); return { ok: true }; }
  const o = state.objects.find(x => x.id === id && x.expansion);
  if (o) { delete o.expansion; log(`ANULOWANO ROZBUDOWĘ: ${objName(o)}`, "warn"); return { ok: true }; }
  return { ok: false };
}
function buyForecastUpgrade() {
  const next = CFG.forecastLevels[state.forecastLevel + 1];
  if (!next) return { ok: false, why: "maksymalny poziom" };
  if (state.budget < next.cost) return { ok: false, why: "brak środków" };
  state.budget -= next.cost;
  state.forecastLevel++;
  log(`SYSTEM PROGNOZ: ${next.name} (błąd ×${next.mult})`, "ok");
  return { ok: true };
}

/* stop-condition check used by "skip until something happens" */
function eventfulHour(hr) {
  if (hr.unserved > 0.5) return "niedobór mocy";
  if (hr.maxLoadPct >= 0.95) return "linia ≥ 95% obciążenia";
  if ((hr.maxStationPct || 0) >= 0.95) return "stacja ≥ 95% obciążenia";
  if (hr.stormCut) return "wyłączenie sztormowe turbin";
  if (installedWind() > 0 && Math.abs(hr.truthWind - hr.fcWind) > 0.20 * installedWind()) return "wiatr daleko od prognozy";
  return null;
}

window.SIM = {
  CFG, TECH, LINE_TYPES, TERRAIN, REGIMES,
  MAP_W, MAP_H, hexCenter, hexDist, hexLinePath, hexAt, neighborsOf, isPumpedSite,
  newGame, get state() { return state; },
  initDay, resolveTurn, settleDay, advanceDay,
  build, buildLine, buildCost, lineCost, canBuildAt, connectCity, expand, expansionInfo,
  cancelConstruction, buyForecastUpgrade,
  findStationFor, objCapMW, objEnergyCap, stationCap, stationFields, usedFields, objName,
  fleetWindMW, fleetPvMW, installedWind, installedPv,
  forecastWindMW, forecastPvMW, forecastDemandMW, totalDemandMW, cityDemandMW,
  connectedCities, connectedPeak, planFlow, buildInjections, solveFlow,
  fixedCostPerDay, eventfulHour, log, sigmaAt,
};
