# ElectroNation — playable prototype (simplified game, docs/01 v0.13)

Throwaway prototype. **Never migrate this code into `src/` without review.**

## Run

```
python3 -m http.server 8123 --directory prototyp
```

then open http://localhost:8123 (or open `index.html` via any static server).

## What is implemented

- Hex map (14×10, curated), terrain cost multipliers, per-hex wind/sun classes,
  pumped-storage sites (hills/mountains adjacent to water).
- Minimal starting endowment per docs/01 §3.4: 10 bld PLN plus a free starter
  system (one CCGT + a direct line feeding the town of LIPNO). Further cities
  connect as an explicit player act (requires a finished line to the city).
- Turn loop per docs/01 v0.12: 8 turns × 3 h/day (00–03, 03–06, …, 21–24, named
  after day phases); truth stays hourly — a turn's MW values are block averages,
  energy/money = MW × 3 h. 3 representative days/month (A/B/holiday), 36
  days/year, day results scaled ×10.9 / ×8.7. Demand growth at year end is
  logistic (docs/01 §2.7, provisional): 10% × (1 − peak/cityCapacity),
  cityCapacity = 16× starting peak.
- Weather per docs/06: solar geometry + Haurwitz clear-sky + cloud attenuation,
  Weibull-scaled monthly wind with power curve and 25 m/s storm cutoff, monthly
  weather regimes (Dunkelflaute, storms...), OU intra-day noise, truth generated
  at day init from a seed.
- Forecasts with horizon-growing error bands (σ per docs/06 §8.6.2), purchasable
  accuracy levels, forecast-vs-truth reveal each turn. Horizon is the current
  day only — the multi-day horizon per level (3/7 days, docs/01 v0.13 §2.4) is
  NOT implemented yet.
- Network per docs/01 v0.13: three line types (LV 150 MW 4%/100 km 3 h/hex,
  MV 500 MW 2% 6 h/hex, HV 1500 MW 1% 12 h/hex); lines connect objects
  directly, every object is a node with 6 line slots (one per neighboring
  hex); a line crossing an object's hex taps it (auto-connects, consumes a
  slot, forbidden if the object is full); max 9 lines of one type per hex;
  junction stations (stacje rozdzielcze) are dedicated routing nodes (6 slots
  +2/module up to 18, own MW cap). "Water in pipes" flow = greedy cheapest
  augmenting paths per line segment (approx. deterministic min-cost flow),
  automatic curtailment/trimming, unserved-energy penalties. RES farms have
  a whole-farm on/off switch (the only manual RES control).
- Build times per docs/01 §2.6 (K≈40); lines build in game hours (3 h/hex =
  1 hex per resolved turn).
- Clicking any hex (also empty) opens a panel docked to the map's right edge:
  hex info (terrain, cost multiplier, wind/sun), the build catalog available on
  that hex (the only way to build), object details and actions (connect city,
  expand, cancel), and info on lines crossing the hex. Lines are drawn from an
  object's panel ("draw line from here" → click the target object's hex). The
  dispatcher panel on the right stays always visible — there is no build tab;
  the construction queue and forecast-system cards live under the ops cards.
- Storage (battery/pumped) with power vs. energy and round-trip efficiency,
  border import/export at fixed prices, expansions with hard site limits,
  construction queue with cancel (sunk costs), fast-forward that halts on
  penalty days.

Numbers are gameplay-tuned where the docs' baseline broke pacing (tariff 650,
CAPEX ×~0.6, penalty 4000) — see comments in `sim.js` CFG/TECH and doc 03 notes.

## Files

- `sim.js` — simulation core (config, weather, flow solver, economy, calendar).
- `ui.js` — map/cards/turn-loop UI (visual style per the design handoff).
- `style.css`, `index.html` — shell and tokens.

## Debug API (browser console)

`dbg.summary()`, `dbg.build(tech,q,r)`, `dbg.line(aId,bId,type)` (type: lv/mv/hv),
`dbg.connect(cityId)`, `dbg.set(objId,MW)`, `dbg.expand(objId)`, `dbg.turn()`,
`dbg.day()`, `dbg.days(n)`, `dbg.money(x)` (test only), `dbg.newGame(seed)`.
