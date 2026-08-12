/* ============================================================
   ElectroNation prototype — simulation core
   Simplified game per docs/01 v0.12: 8 turns of 3 h per day,
   pipe-like network flow (min-cost, capacities + length losses),
   weather + forecasts per docs/06 (truth stays hourly; a turn
   sees block averages, energy scales with block length).
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
  // logistic growth saturation (doc 01 §2.7, v0.13 — provisional, doc 05 will rework):
  // yearly growth = growthPerYear * (1 - peak / (startPeak * cityPeakMaxMult))
  cityPeakMaxMult: 16,
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

/* turn structure (doc 01 §2.2, v0.12): 8 turns × 3 h, named after the phase of
   day they cover. Weather/demand truth stays hourly (doc 06); a turn's MW values
   are averages over its hour block, energy/money scale with the block length. */
const TURNS = [
  { label: "NOC",              from: 0,  to: 3 },
  { label: "PRZEDŚWIT",        from: 3,  to: 6 },
  { label: "RANO",             from: 6,  to: 9 },
  { label: "PRZEDPOŁUDNIE",    from: 9,  to: 12 },
  { label: "POŁUDNIE",         from: 12, to: 15 },
  { label: "POPOŁUDNIE",       from: 15, to: 18 },
  { label: "SZCZYT WIECZORNY", from: 18, to: 21 },
  { label: "PÓŹNY WIECZÓR",    from: 21, to: 24 },
];
const LAST_TURN = TURNS.length - 1;
function turnHours(t) { return TURNS[t].to - TURNS[t].from; }
function turnAvg(t, fn) {
  const { from, to } = TURNS[t];
  let s = 0;
  for (let h = from; h < to; h++) s += fn(h);
  return s / (to - from);
}

/* technology catalog (doc 01 §5, values orientacyjne)
   Build times per docs/01 §2.6 (K ≈ 40) — halved again in 0.12: with 8 turns
   per day the wait in clicks dropped 3x, but wall-clock waits were still the
   dominant complaint. Doc 03/04 to re-tune. */
const TECH = {
  nuclear: { label: "Jądrowa", kind: "plant", block: 1200, capexPerMW: 21e6, buildDays: 9, varCost: 60,  fixedPerMWYear: 600e3, maxBlocks: 4, color: "var(--c-nuclear)", sym: "N" },
  coal:    { label: "Węgiel",  kind: "plant", block: 500,  capexPerMW: 9e6,  buildDays: 5,  varCost: 250, fixedPerMWYear: 300e3, maxBlocks: 6, color: "var(--c-coal)", sym: "C" },
  ccgt:    { label: "Gaz CCGT", kind: "plant", block: 400, capexPerMW: 5.5e6, buildDays: 3, varCost: 350, fixedPerMWYear: 150e3, maxBlocks: 6, color: "var(--c-gas)", sym: "G" },
  ocgt:    { label: "Gaz OCGT", kind: "plant", block: 100, capexPerMW: 3e6,  buildDays: 1,  varCost: 600, fixedPerMWYear: 100e3, maxBlocks: 6, color: "var(--c-gas)", sym: "g" },
  wind:    { label: "Wiatr lądowy", kind: "res", block: 100, capexPerMW: 3.6e6, buildDays: 1, varCost: 0, fixedPerMWYear: 200e3, maxBlocks: 3, color: "var(--c-wind)", sym: "W" },
  pv:      { label: "Farma PV", kind: "res", block: 50, capexPerMW: 1.8e6, buildDays: 1, varCost: 0, fixedPerMWYear: 100e3, maxBlocks: 4, color: "var(--c-pv)", sym: "S" },
  battery: { label: "Bateria (BESS)", kind: "storage", powerBlock: 50, energyBlock: 100, capexPerMW: 1.0e6, capexPerMWh: 0.8e6, buildDays: 1, fixedPerMWYear: 80e3, maxBlocks: 6, eff: 0.90, color: "var(--c-batt)", sym: "B" },
  pumped:  { label: "Szczytowo-pompowa", kind: "storage", powerBlock: 300, energyBlock: 2400, capexPerMW: 5e6, capexPerMWh: 0, buildDays: 5, fixedPerMWYear: 60e3, maxBlocks: 3, eff: 0.75, color: "var(--c-pumped)", sym: "P", site: "pumped" },
  junction: { label: "Stacja rozdzielcza", kind: "junction", capMW: 250, fields: 6, capex: 150e6, moduleCapex: 90e6, buildDays: 1, moduleBuildDays: 1, maxModules: 6, color: "#cfd8e3", sym: "▣" },
  border:  { label: "Przyłącze graniczne", kind: "border", capMW: 500, capex: 1.0e9, moduleCapex: 0.7e9, buildDays: 4, moduleBuildDays: 2, maxModules: 3, color: "var(--c-imp)", sym: "⇄" },
};
/* transmission line types (doc 01 §4.2, v0.13): conventional voltage tiers.
   Higher voltage = higher cost, lower losses, slower build. */
const LINE_TYPES = {
  lv: { label: "Linia NN (niskie napięcie)",  short: "NN", cap: 150,  lossPer100: 0.04, costPerKm: 1.2e6, buildHoursPerHex: 3 },
  mv: { label: "Linia SN (średnie napięcie)", short: "SN", cap: 500,  lossPer100: 0.02, costPerKm: 2.5e6, buildHoursPerHex: 6 },
  hv: { label: "Linia WN (wysokie napięcie)", short: "WN", cap: 1500, lossPer100: 0.01, costPerKm: 6.0e6, buildHoursPerHex: 12 },
};
const MAX_LINES_PER_HEX_TYPE = 9; // corridor density limit (doc 01 §3.3)
/* line slots per endpoint (doc 01 §3.3, v0.12): 6 — one per neighboring hex,
   so any object can branch; junctions add +2 per module on top of the base 6.
   A line crossing an object's hex taps it, consuming one slot (v0.13). */
const OBJ_LINE_SLOTS = 6;
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
    year: 1, month: 0, dayIdx: 0, turn: 0,
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
    state.objects.push({ id: newId(), kind: "city", name: c.name, q: c.q, r: c.r, peak: c.peak, peakMax: c.peak * CFG.cityPeakMaxMult, connected: false, state: "ready" });
  }
  for (const b of BORDER_DEFS) {
    state.objects.push({ id: newId(), kind: "borderSite", name: b.name, q: b.q, r: b.r, state: "ready" });
  }
  // Minimal starting endowment (docs/01 §3.4): one CCGT feeding LIPNO through
  // a direct line. Free of charge — starting capital stays at CFG.startBudget.
  const starterPlant = { id: newId(), kind: "plant", tech: "ccgt", q: 5, r: 7, state: "ready", blocks: 1, setpoint: TECH.ccgt.block, spentCapex: 0 };
  state.objects.push(starterPlant);
  const starterCity = state.objects.find(o => o.kind === "city" && o.name === "LIPNO");
  const starterPath = hexLinePath(starterPlant.q, starterPlant.r, starterCity.q, starterCity.r);
  state.lines.push({
    id: newId(), aId: starterPlant.id, bId: starterCity.id, type: "mv", path: starterPath,
    km: (starterPath.length - 1) * CFG.hexKm, taps: computeTaps(starterPath),
    state: "ready", hoursLeft: 0, flow: 0, spentCapex: 0,
  });
  starterCity.connected = true;
  rollMonthRegime();
  initDay();
  log(`SYSTEM STARTOWY: ${TECH.ccgt.label} 400 MW zasila miasto LIPNO`, "info");
  return state;
}

function log(msg, cls) {
  state.log.unshift({ t: `R${state.year} ${CFG.monthNames[state.month].slice(0,3)} d${state.dayIdx + 1} ${String(TURNS[state.turn].from).padStart(2,"0")}:00`, msg, cls });
  state.log = state.log.slice(0, 60);
}
function plDays(n) { // Polish plural for log strings (UI-facing)
  if (n === 1) return "1 doba";
  const d10 = n % 10, d100 = n % 100;
  return `${n} ${d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14) ? "doby" : "dób"}`;
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
    vNat, cloud, demandShape, // hourly truth (24 points, doc 06)
    errWind: ouSeries(rng, 0.75, 1, TURNS.length),
    errPV: ouSeries(rng, 0.75, 1, TURNS.length),
    errDemand: ouSeries(rng, 0.75, 1, TURNS.length),
    turns: [], // resolved results per turn
    fin: { revenue: 0, fuel: 0, importCost: 0, exportRev: 0, penalty: 0 },
  };
}

/* ---------- fleet helpers ---------- */
function readyObjects(kind) { return state.objects.filter(o => o.kind === kind && o.state === "ready"); }
function objCapMW(o) {
  const t = TECH[o.tech];
  if (!t) return 0;
  if (t.kind === "storage") return o.powerBlocks * t.powerBlock;
  if (o.kind === "junction") return junctionCap(o);
  if (o.kind === "border") return (1 + o.modules) * TECH.border.capMW;
  return o.blocks * t.block;
}
function objEnergyCap(o) { return o.energyBlocks * TECH[o.tech].energyBlock; }
function junctionCap(o) { return (1 + (o.modules || 0)) * TECH.junction.capMW; }
function lineSlots(o) {
  return o.kind === "junction" ? TECH.junction.fields + 2 * (o.modules || 0) : OBJ_LINE_SLOTS;
}
function lineTouches(l, objId) {
  return l.aId === objId || l.bId === objId || l.taps.some(t => t.id === objId);
}
function usedSlots(o) {
  return state.lines.filter(l => lineTouches(l, o.id)).length;
}
function hasNetLink(o) {
  return state.lines.some(l => l.state === "ready" && lineTouches(l, o.id));
}
/* objects crossed by a line's interior hexes become taps (doc 01 §3.3, v0.13) */
function computeTaps(path) {
  const taps = [];
  for (let i = 1; i < path.length - 1; i++) {
    const o = state.objects.find(x => x.q === path[i].q && x.r === path[i].r && x.kind !== "borderSite");
    if (o) taps.push({ id: o.id, idx: i });
  }
  return taps;
}

/* farm production (MW, block average over the turn's hours) from truth series */
function farmWindMW(o, t) {
  const hx = hexAt(state, o.q, o.r);
  return objCapMW(o) * turnAvg(t, h => windPowerFrac(state.day.vNat[h] * hx.windClass));
}
function farmPvMW(o, t) {
  const hx = hexAt(state, o.q, o.r);
  return objCapMW(o) * turnAvg(t, h => pvFactor(state.day.n, h, state.day.cloud[h])) * hx.sunClass;
}
function resActive(o) { return o.enabled !== false; } // whole-farm on/off switch (doc 01 §4.1)
function fleetWindMW(t) { return readyObjects("res").filter(o => o.tech === "wind" && resActive(o)).reduce((s, o) => s + (hasNetLink(o) ? farmWindMW(o, t) : 0), 0); }
function fleetPvMW(t) { return readyObjects("res").filter(o => o.tech === "pv" && resActive(o)).reduce((s, o) => s + (hasNetLink(o) ? farmPvMW(o, t) : 0), 0); }
function installedWind() { return readyObjects("res").filter(o => o.tech === "wind").reduce((s, o) => s + objCapMW(o), 0); }
function installedPv() { return readyObjects("res").filter(o => o.tech === "pv").reduce((s, o) => s + objCapMW(o), 0); }
function connectedCities() { return state.objects.filter(o => o.kind === "city" && o.connected); }
function connectedPeak() { return connectedCities().reduce((s, c) => s + c.peak, 0); }
function cityDemandMW(c, t) { return c.peak * turnAvg(t, h => state.day.demandShape[h]); }
function totalDemandMW(t) { return connectedCities().reduce((s, c) => s + cityDemandMW(c, t), 0); }

/* ---------- forecast (doc 06 §8.6) ---------- */
function sigmaAt(series, horizon) { // horizon in hours
  const s = CFG.sigma[series];
  const mult = CFG.forecastLevels[state.forecastLevel].mult;
  return (s.a + s.b * Math.min(horizon, 12)) * mult;
}
/* horizon between turns measured in hours (block starts); the turn being
   decided is itself a forecast at horizon +1 h */
function turnHorizon(t, now) { return Math.max(1, TURNS[t].from - TURNS[now].from); }
function turnSunUp(t) {
  const { from, to } = TURNS[t];
  for (let h = from; h < to; h++) if (solarAltitudeSin(state.day.n, h + 0.5, CFG.latitude) > 0) return true;
  return false;
}
/* t < now → resolved history (truth); t >= now → forecast with horizon error */
function forecastWindMW(t, now) {
  const truth = fleetWindMW(t);
  const inst = installedWind();
  if (t < now || state.day.turns[t]) return { mean: truth, band: 0 };
  const band = sigmaAt("wind", turnHorizon(t, now)) * inst;
  return { mean: clamp(truth + state.day.errWind[t] * band, 0, inst), band };
}
function forecastPvMW(t, now) {
  const truth = fleetPvMW(t);
  const inst = installedPv();
  if (t < now || state.day.turns[t]) return { mean: truth, band: 0 };
  const band = turnSunUp(t) ? sigmaAt("pv", turnHorizon(t, now)) * inst : 0;
  return { mean: clamp(truth + state.day.errPV[t] * band, 0, inst), band };
}
function forecastDemandMW(t, now) {
  const truth = totalDemandMW(t);
  const base = connectedPeak() * CFG.seasonalDemand[state.month];
  if (t < now || state.day.turns[t]) return { mean: truth, band: 0 };
  const band = sigmaAt("demand", turnHorizon(t, now)) * base;
  return { mean: Math.max(0, truth + state.day.errDemand[t] * band), band };
}

/* ---------- network flow solver ----------
   Greedy successive cheapest augmenting paths on the capacity graph.
   Approximates deterministic min-cost flow (doc 01 §4.4); losses are
   multiplicative per line. Every object is a node (lines plug into objects
   directly); only junctions and border links have a throughput cap. */
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
  for (const o of state.objects) {
    if (o.state !== "ready" || o.kind === "borderSite") continue;
    const capped = o.kind === "junction" || o.kind === "border";
    const cap = o.kind === "junction" ? junctionCap(o) : o.kind === "border" ? objCapMW(o) : Infinity;
    edge(`n${o.id}:in`, `n${o.id}:out`, cap, 0, capped ? { stationId: o.id } : {});
  }
  for (const l of state.lines) {
    if (l.state !== "ready") continue;
    const lt = LINE_TYPES[l.type];
    // chain: endpoint — ready taps — endpoint; taps on still-building objects
    // are bridged (the line conducts past them, losses accumulate by distance)
    const chain = [{ id: l.aId, idx: 0 }];
    for (const t of l.taps) {
      const o = state.objects.find(x => x.id === t.id);
      if (o && o.state === "ready") chain.push(t);
    }
    chain.push({ id: l.bId, idx: l.path.length - 1 });
    for (let i = 1; i < chain.length; i++) {
      const km = (chain[i].idx - chain[i - 1].idx) * CFG.hexKm;
      const loss = clamp(lt.lossPer100 * km / 100, 0, 0.95);
      edge(`n${chain[i - 1].id}:out`, `n${chain[i].id}:in`, lt.cap, loss, { lineId: l.id, seg: i - 1, dir: "ab" });
      edge(`n${chain[i].id}:out`, `n${chain[i - 1].id}:in`, lt.cap, loss, { lineId: l.id, seg: i - 1, dir: "ba" });
    }
  }
  return { nodes, edges, adjOut, node: (n) => nodes.get(n) };
}

function solveFlow(sources, sinks) {
  // sources: {key, nodeId, avail, cost}; sinks: {key, nodeId, want, reward}
  const g = buildFlowGraph();
  const N = g.nodes.size;
  // reverse adjacency for backward Dijkstra from sinks
  const adjIn = new Map();
  for (let i = 0; i < N; i++) adjIn.set(i, []);
  g.edges.forEach((e, i) => adjIn.get(e.to).push(i));

  // sources inject at their :in (through own capacity edge if any), sinks draw at :out
  const srcs = sources.filter(s => s.avail > 1e-6 && g.node(`n${s.nodeId}:in`) !== undefined)
    .map(s => ({ ...s, node: g.node(`n${s.nodeId}:in`) }));
  const snks = sinks.filter(s => s.want > 1e-6 && g.node(`n${s.nodeId}:out`) !== undefined)
    .map(s => ({ ...s, node: g.node(`n${s.nodeId}:out`) }));
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
        if (e.lineId !== undefined) addMap(result.lineFlowDir, `${e.lineId}:${e.seg}:${e.dir}`, inflow);
        if (e.stationId !== undefined) addMap(result.stationFlow, e.stationId, inflow);
        const out = inflow * (1 - e.loss);
        result.losses += inflow - out;
        inflow = out;
      }
      progress = true;
    }
  }
  // net flow per line segment (opposite directions cancel); a line's load is
  // its busiest segment — the display and overload metric
  const segNet = new Map();
  for (const [k, v] of result.lineFlowDir) {
    const [id, seg, dir] = k.split(":");
    addMap(segNet, `${id}:${seg}`, dir === "ab" ? v : -v);
  }
  result.lineFlow = new Map();
  for (const [k, net] of segNet) {
    const id = +k.split(":")[0];
    result.lineFlow.set(id, Math.max(result.lineFlow.get(id) || 0, Math.abs(net)));
  }
  return result;
}

/* build source/sink lists for a given turn; res/demand from truth or forecast.
   Storage power is bounded so the energy holds for the whole block. */
function buildInjections(t, useTruth) {
  const sources = [], sinks = [];
  const hrs = turnHours(t);
  for (const o of state.objects) {
    if (o.state !== "ready") continue;
    if (o.kind !== "city" && o.kind !== "border" && !hasNetLink(o)) continue;
    if (o.kind === "plant") {
      const sp = clamp(o.setpoint || 0, 0, objCapMW(o));
      if (sp > 0) sources.push({ key: `o${o.id}`, nodeId: o.id, avail: sp, cost: TECH[o.tech].varCost });
    } else if (o.kind === "res") {
      if (!resActive(o)) continue; // farm switched off by the player
      let mw;
      if (useTruth) mw = o.tech === "wind" ? farmWindMW(o, t) : farmPvMW(o, t);
      else {
        const fleetT = o.tech === "wind" ? fleetWindMW(t) : fleetPvMW(t);
        const f = o.tech === "wind" ? forecastWindMW(t, state.turn) : forecastPvMW(t, state.turn);
        const ratio = fleetT > 1e-6 ? f.mean / fleetT : 0;
        mw = (o.tech === "wind" ? farmWindMW(o, t) : farmPvMW(o, t)) * ratio;
      }
      if (mw > 0) sources.push({ key: `o${o.id}`, nodeId: o.id, avail: mw, cost: 0 });
    } else if (o.kind === "storage") {
      const sp = o.setpoint || 0;
      if (sp > 0) { // discharge for the whole block
        const avail = Math.min(sp, objCapMW(o), o.soc / hrs);
        if (avail > 0) sources.push({ key: `o${o.id}`, nodeId: o.id, avail, cost: 1 });
      } else if (sp < 0) { // charge for the whole block
        const room = (objEnergyCap(o) - o.soc) / (TECH[o.tech].eff * hrs);
        const want = Math.min(-sp, objCapMW(o), room);
        if (want > 0) sinks.push({ key: `o${o.id}`, nodeId: o.id, want, reward: CFG.chargePriority });
      }
    } else if (o.kind === "border") {
      const sp = o.setpoint || 0;
      if (sp > 0) sources.push({ key: `o${o.id}`, nodeId: o.id, avail: Math.min(sp, objCapMW(o)), cost: CFG.importPrice });
      else if (sp < 0) sinks.push({ key: `o${o.id}`, nodeId: o.id, want: Math.min(-sp, objCapMW(o)), reward: CFG.exportPrice });
    } else if (o.kind === "city" && o.connected) {
      let d;
      if (useTruth) d = cityDemandMW(o, t);
      else {
        const tot = totalDemandMW(t);
        const f = forecastDemandMW(t, state.turn);
        d = tot > 1e-6 ? cityDemandMW(o, t) * (f.mean / tot) : 0;
      }
      if (d > 0) sinks.push({ key: `c${o.id}`, nodeId: o.id, want: d, reward: CFG.unservedPenalty });
    }
  }
  return { sources, sinks };
}

/* live plan check (forecast-based) for the setpoints card & map preview */
function planFlow(t) {
  const inj = buildInjections(t, false);
  const res = solveFlow(inj.sources, inj.sinks);
  return { inj, res };
}

/* ---------- turn resolution ---------- */
function resolveTurn() {
  const t = state.turn;
  const hrs = turnHours(t);
  // snapshot what the forecast promised for this turn (horizon +1 h) before resolving
  const fcDemand = forecastDemandMW(t, t).mean;
  const fcWind = forecastWindMW(t, t).mean;
  const fcPv = forecastPvMW(t, t).mean;
  const inj = buildInjections(t, true);
  const res = solveFlow(inj.sources, inj.sinks);

  const byTech = { nuclear: 0, coal: 0, ccgt: 0, ocgt: 0, wind: 0, pv: 0, battery: 0, pumped: 0, import: 0 };
  let charge = 0, exportMW = 0, availRes = 0, usedRes = 0, importCost = 0, exportRev = 0, fuel = 0;

  for (const o of state.objects) {
    if (o.state !== "ready") continue;
    const used = res.sourceUsed.get(`o${o.id}`) || 0;
    if (o.kind === "plant") { byTech[o.tech] += used; fuel += used * TECH[o.tech].varCost * hrs; }
    else if (o.kind === "res") {
      byTech[o.tech] += used; usedRes += used;
      if (hasNetLink(o) && resActive(o)) availRes += o.tech === "wind" ? farmWindMW(o, t) : farmPvMW(o, t);
    }
    else if (o.kind === "storage") {
      if ((o.setpoint || 0) > 0) { byTech[o.tech] += used; o.soc = Math.max(0, o.soc - used * hrs); }
      else if ((o.setpoint || 0) < 0) {
        const got = res.sinkServed.get(`o${o.id}`) || 0;
        charge += got;
        o.soc = Math.min(objEnergyCap(o), o.soc + got * TECH[o.tech].eff * hrs);
      }
    }
    else if (o.kind === "border") {
      if ((o.setpoint || 0) > 0) { byTech.import += used; importCost += used * CFG.importPrice * hrs; }
      else if ((o.setpoint || 0) < 0) {
        const ex = res.sinkServed.get(`o${o.id}`) || 0;
        exportMW += ex; exportRev += ex * CFG.exportPrice * hrs;
      }
    }
  }

  let demand = 0, served = 0;
  const cityRes = [];
  for (const c of connectedCities()) {
    const d = cityDemandMW(c, t);
    const s = res.sinkServed.get(`c${c.id}`) || 0;
    demand += d; served += s;
    cityRes.push({ name: c.name, demand: d, served: s, unserved: Math.max(0, d - s) });
  }
  const unserved = Math.max(0, demand - served);
  const revenue = served * CFG.tariff * hrs;
  const penalty = unserved * CFG.unservedPenalty * hrs;

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
    if ((o.kind === "junction" || o.kind === "border") && o.state === "ready") {
      o.flowThrough = res.stationFlow.get(o.id) || 0;
      const cap = o.kind === "border" ? objCapMW(o) : junctionCap(o);
      maxStationPct = Math.max(maxStationPct, o.flowThrough / cap);
    }
  }

  // line construction advances by the turn's block length (3/6/12 h per hex by type)
  for (const l of state.lines) {
    if (l.state === "building" && (l.hoursLeft -= hrs) <= 0) {
      l.state = "ready";
      log(`UKOŃCZONO: ${LINE_TYPES[l.type].label} ${l.km} km`, "ok");
    }
  }

  // storm detection (any wind farm at cutoff during any hour of the block)
  const stormCut = readyObjects("res").some(o => {
    if (o.tech !== "wind") return false;
    const wc = hexAt(state, o.q, o.r).windClass;
    const { from, to } = TURNS[t];
    for (let h = from; h < to; h++) if (wc * state.day.vNat[h] >= CFG.turbine.vOut) return true;
    return false;
  });

  const turnRes = {
    t, hours: hrs, demand, served, unserved, byTech, charge, exportMW, losses: res.losses,
    curtail: Math.max(0, availRes - usedRes), availRes,
    revenue, fuel, importCost, exportRev, penalty,
    cityRes, maxLoadPct, maxStationPct, stormCut,
    truthWind: fleetWindMW(t), truthPv: fleetPvMW(t),
    fcDemand, fcWind, fcPv,
  };
  state.day.turns[t] = turnRes;
  const f = state.day.fin;
  f.revenue += revenue; f.fuel += fuel; f.importCost += importCost; f.exportRev += exportRev; f.penalty += penalty;
  state.stats.totalUnservedMWh += unserved * hrs;
  if (unserved > 0.5) log(`NIEDOBÓR ${Math.round(unserved)} MW (${cityRes.filter(c=>c.unserved>0.5).map(c=>c.name).join(", ")})`, "alarm");
  if (stormCut) log("WYŁĄCZENIE SZTORMOWE TURBIN — wiatr ≥ 25 m/s", "warn");
  return turnRes;
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
  return { varResult, fixed, result, scale, fin: { ...f } };
}

function advanceDay() {
  state.dayIdx++;
  if (state.dayIdx > 2) {
    state.dayIdx = 0; state.month++;
    if (state.month > 11) {
      state.month = 0; state.year++;
      // logistic growth: fast while young, dying out near the city's capacity
      let before = 0, after = 0;
      for (const c of state.objects) if (c.kind === "city") {
        before += c.peak;
        c.peak *= 1 + CFG.growthPerYear * Math.max(0, 1 - c.peak / c.peakMax);
        after += c.peak;
      }
      log(`NOWY ROK ${state.year} — zapotrzebowanie miast +${((after / before - 1) * 100).toFixed(1)}%`, "info");
    }
    rollMonthRegime();
  }
  state.turn = 0;
  state.phase = "decision";
  initDay();
}

/* ---------- player actions ---------- */
function objName(o) {
  if (o.kind === "city") return o.name;
  if (o.kind === "borderSite" || o.kind === "border") return o.name;
  if (o.kind === "junction") return `SR-${o.id}`;
  return `${TECH[o.tech].label} #${o.id}`;
}
function terrainMult(q, r) { return TERRAIN[hexAt(state, q, r).terrain].mult; }
function hexOccupied(q, r) {
  return state.objects.some(o => o.q === q && o.r === r && o.kind !== "city" && o.kind !== "borderSite");
}
function buildCost(techKey, q, r) {
  const t = TECH[techKey];
  const mult = terrainMult(q, r);
  if (techKey === "junction" || techKey === "border") return t.capex * mult;
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
  if (techKey === "junction") { o.kind = "junction"; o.modules = 0; }
  if (techKey === "border") { o.kind = "border"; o.modules = 0; o.name = state.objects.find(s => s.kind === "borderSite" && s.q === q && s.r === r).name; }
  if (t.kind === "plant" || t.kind === "res") o.blocks = 1;
  if (t.kind === "res") o.enabled = true;
  if (t.kind === "storage") { o.powerBlocks = 1; o.energyBlocks = 1; o.soc = 0; }
  state.objects.push(o);
  log(`BUDOWA: ${objName(o)} (${plDays(o.daysLeft)})`, "info");
  return { ok: true, obj: o };
}
function lineCost(path, typeKey) {
  let cost = 0;
  for (let i = 1; i < path.length; i++) cost += LINE_TYPES[typeKey].costPerKm * CFG.hexKm * terrainMult(path[i].q, path[i].r);
  return cost;
}
function linesOfTypeThroughHex(typeKey, q, r) {
  return state.lines.filter(l => l.type === typeKey && l.path.some(p => p.q === q && p.r === r)).length;
}
function buildLine(aId, bId, typeKey) {
  const lt = LINE_TYPES[typeKey || "mv"];
  if (!lt) return { ok: false, why: "nieznany typ linii" };
  typeKey = typeKey || "mv";
  const a = state.objects.find(o => o.id === aId), b = state.objects.find(o => o.id === bId);
  if (!a || !b) return { ok: false, why: "brak obiektu" };
  if (a.kind === "borderSite" || b.kind === "borderSite") return { ok: false, why: "najpierw zbuduj przyłącze graniczne" };
  if (a.id === b.id) return { ok: false, why: "ten sam obiekt" };
  if (usedSlots(a) >= lineSlots(a)) return { ok: false, why: `brak wolnych przyłączy: ${objName(a)}` };
  if (usedSlots(b) >= lineSlots(b)) return { ok: false, why: `brak wolnych przyłączy: ${objName(b)}` };
  const path = hexLinePath(a.q, a.r, b.q, b.r);
  // crossed objects become taps and need a free slot each (doc 01 §3.3, v0.13)
  const taps = computeTaps(path);
  for (const t of taps) {
    const o = state.objects.find(x => x.id === t.id);
    if (usedSlots(o) >= lineSlots(o)) return { ok: false, why: `trasa mija ${objName(o)} bez wolnych przyłączy` };
  }
  // corridor density: at most 9 lines of one type through any hex of the route
  for (const p of path) {
    if (linesOfTypeThroughHex(typeKey, p.q, p.r) >= MAX_LINES_PER_HEX_TYPE) {
      return { ok: false, why: `korytarz pełny na [${p.q},${p.r}] (${MAX_LINES_PER_HEX_TYPE} linii ${lt.short})` };
    }
  }
  const km = (path.length - 1) * CFG.hexKm;
  const cost = lineCost(path, typeKey);
  if (state.budget < cost) return { ok: false, why: "brak środków" };
  state.budget -= cost;
  const hours = (path.length - 1) * lt.buildHoursPerHex;
  const l = { id: newId(), aId, bId, type: typeKey, path, km, taps, state: "building", hoursLeft: hours, flow: 0, spentCapex: cost };
  state.lines.push(l);
  log(`BUDOWA: ${lt.label} ${km} km (${hours} h)${taps.length ? ` — odgałęzienia: ${taps.map(t => objName(state.objects.find(x => x.id === t.id))).join(", ")}` : ""}`, "info");
  return { ok: true, line: l };
}
function connectCity(cityId) {
  const c = state.objects.find(o => o.id === cityId && o.kind === "city");
  if (!c || c.connected) return { ok: false, why: "brak miasta / już przyłączone" };
  if (!hasNetLink(c)) return { ok: false, why: "brak gotowej linii do miasta" };
  if (state.budget < CFG.cityConnectCost) return { ok: false, why: "brak środków" };
  state.budget -= CFG.cityConnectCost;
  c.connected = true;
  log(`PRZYŁĄCZONO MIASTO ${c.name} (${Math.round(c.peak)} MW szczytu)`, "ok");
  return { ok: true };
}
function expansionInfo(o) {
  const t = TECH[o.tech];
  if (o.kind === "junction") {
    if (o.modules >= t.maxModules) return null;
    return { label: `+${TECH.junction.capMW} MW, +2 przyłącza`, cost: t.moduleCapex * terrainMult(o.q, o.r), days: t.moduleBuildDays };
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
  log(`ROZBUDOWA: ${objName(o)} (${plDays(info.days)})`, "info");
  return { ok: true };
}
function applyExpansion(o) {
  if (o.kind === "junction" || o.kind === "border") o.modules++;
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
function eventfulTurn(tr) {
  if (tr.unserved > 0.5) return "niedobór mocy";
  if (tr.maxLoadPct >= 0.95) return "linia ≥ 95% obciążenia";
  if ((tr.maxStationPct || 0) >= 0.95) return "stacja ≥ 95% obciążenia";
  if (tr.stormCut) return "wyłączenie sztormowe turbin";
  if (installedWind() > 0 && Math.abs(tr.truthWind - tr.fcWind) > 0.20 * installedWind()) return "wiatr daleko od prognozy";
  return null;
}

window.SIM = {
  CFG, TECH, LINE_TYPES, MAX_LINES_PER_HEX_TYPE, TERRAIN, REGIMES, TURNS, LAST_TURN, turnHours,
  MAP_W, MAP_H, hexCenter, hexDist, hexLinePath, hexAt, neighborsOf, isPumpedSite,
  newGame, get state() { return state; },
  initDay, resolveTurn, settleDay, advanceDay,
  build, buildLine, buildCost, lineCost, canBuildAt, connectCity, expand, expansionInfo,
  cancelConstruction, buyForecastUpgrade,
  objCapMW, objEnergyCap, junctionCap, lineSlots, usedSlots, hasNetLink, objName,
  farmWindMW, farmPvMW, fleetWindMW, fleetPvMW, installedWind, installedPv,
  forecastWindMW, forecastPvMW, forecastDemandMW, totalDemandMW, cityDemandMW,
  connectedCities, connectedPeak, planFlow, buildInjections, solveFlow,
  fixedCostPerDay, eventfulTurn, log, sigmaAt,
};
