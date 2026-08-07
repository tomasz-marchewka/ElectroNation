# ElectroNation — playable prototype (simplified game, docs/01 v0.9)

Throwaway prototype. **Never migrate this code into `src/` without review.**

## Run

```
python3 -m http.server 8123 --directory prototyp
```

then open http://localhost:8123 (or open `index.html` via any static server).

## What is implemented

- Hex map (14×10, curated), terrain cost multipliers, per-hex wind/sun classes,
  pumped-storage sites (hills/mountains adjacent to water).
- Minimal starting endowment per docs/01 §3.4 (v0.10): 10 bld PLN plus a free
  starter system (one CCGT + two substations + a 220 kV line feeding the town
  of LIPNO). Further cities connect as an explicit player act.
- Turn loop: 24×1h, 3 representative days/month (A/B/holiday), 36 days/year,
  ~10%/yr demand growth applied at year end, day results scaled ×10.9 / ×8.7.
- Weather per docs/06: solar geometry + Haurwitz clear-sky + cloud attenuation,
  Weibull-scaled monthly wind with power curve and 25 m/s storm cutoff, monthly
  weather regimes (Dunkelflaute, storms...), OU intra-day noise, truth generated
  at day init from a seed.
- Forecasts with horizon-growing error bands (σ per docs/06 §8.6.2), purchasable
  accuracy levels, forecast-vs-truth reveal each turn.
- Network: substations as capacity nodes (radius-1 hookup, line fields),
  3 line types with MW caps and %-per-100km losses, "water in pipes" flow =
  greedy cheapest augmenting paths (approx. deterministic min-cost flow),
  automatic curtailment/trimming, unserved-energy penalties.
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

`dbg.summary()`, `dbg.build(tech,q,r)`, `dbg.line(type,aId,bId)`,
`dbg.connect(cityId)`, `dbg.set(objId,MW)`, `dbg.expand(objId)`, `dbg.turn()`,
`dbg.day()`, `dbg.days(n)`, `dbg.money(x)` (test only), `dbg.newGame(seed)`.
