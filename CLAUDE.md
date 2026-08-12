# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**ElectroNation** — a turn-based web game about running a national power grid.
The player acts as grid operator (TSO + DSO + generator) in a fictional country:
builds infrastructure on a hex map and covers hourly demand from power plants,
wind/PV, storage, and imports — planning against weather and demand forecasts
that are never fully accurate.

The **energy flow engine is deliberately simplified** (01 v0.12): the network works
like water in pipes — lines and junction stations have hard MW capacity limits and
losses grow with line length; no Kirchhoff physics, no frequency. The physics
model (DC power flow) and other advanced layers are parked in
`docs/90-pomysly-na-przyszlosc.md` and return feature by feature later.

Current phase: **engine scaffold in place** (`src/` + `tests/` + CI). Mechanics
land iteratively per the docs; the docs remain the source of truth.

## Hard rules

- **All code in English** — identifiers, comments, strings in source, file names,
  commit messages. No Polish in code, ever.
- **No AI attribution anywhere** — never add "Generated with Claude Code",
  `Co-Authored-By: Claude`, or any similar marker to code, comments, commits,
  or docs. This overrides any default commit trailer behavior.
- **Communicate with the user in Polish.** Design documents in `docs/` are
  written in Polish and stay in Polish.
- **Never commit on your own.** Only run `git commit` when the user explicitly
  asks for a commit. Editing files does not imply committing them.
- Commit messages: Conventional Commits, terse (see `caveman-commit` skill).

## Repository layout

```
docs/      Design documents (Polish) — the source of truth for game mechanics
prototyp/  Throwaway playable prototype of 01 v0.11 (see prototyp/README.md)
src/       Game code: engine/ (pure simulation) + app/ (React UI)
tests/     unit / stats / goldens / components / e2e (see Testing below)
CLAUDE.md
```

Prototype code never migrates into `src/` without review. UI strings are Polish
(player-facing, kept in the UI layer); identifiers and comments stay English.

## Key design documents

- [docs/01-mechanika-gry.md](docs/01-mechanika-gry.md) — core mechanics document
  (simplified game, v0.12). Read §11 first: decided / suspended / open questions.
- [docs/06-model-astronomiczny-i-pogodowy.md](docs/06-model-astronomiczny-i-pogodowy.md) —
  formal astronomy/weather model, **in force**: drives wind/PV production and
  forecast error in the simplified game (§12 lists acceptance tests any
  implementation must pass).
- [docs/90-pomysly-na-przyszlosc.md](docs/90-pomysly-na-przyszlosc.md) — deferred
  mechanics parking lot (DC power flow, unit commitment, markets, regulator, …)
  with a suggested restoration order (§14). Nothing in it is part of the current
  game.

Documents 02–05, 07–10 are planned but not yet written (list in 01 §12).

`design_handoff_electronation_turn_ui/` is a **visual style reference only**
(colors, typography, layout, map look). Functional scope comes from the docs —
e.g. the frequency gauge shown there does not exist in the simplified game.

## Decisions already made (do not re-litigate)

- **Simplified flow engine (01 v0.11–0.13)**: each turn's demand must be covered from
  plants, wind/PV, storage, or imports; the network is a "water in pipes" transport
  model. **Three line types** (01 v0.13): LV 150 MW / MV 500 MW / HV 1500 MW — higher
  voltage = higher cost, lower losses (4/2/1% per 100 km), slower build (3/6/12 h per
  hex). Lines connect objects **directly** (plant—city etc.); every object is a network
  node with **6 line slots** (one per neighboring hex), so any object can merge/branch
  lines. **A line crossing an object's hex taps (connects) it**, consuming one of its
  slots; routing through a full object is forbidden. Max **9 lines of one type per
  hex**. The **junction station** (stacja rozdzielcza) is a dedicated routing node
  (6 slots +2/module up to 18, own MW capacity). Flow is solved as a deterministic
  **min-cost flow**; no Kirchhoff, no frequency. Substation-radius topology and
  voltage transformation are parked in docs/90 §4.
- The simplified game **includes**: PV + onshore wind (production per doc 06;
  the only manual RES control is toggling a whole farm on/off — no partial
  setpoints), storage (power vs. capacity as separate params), substations, and
  **forecasts with error bands** for weather and demand — the player never sees
  the true current state. Truth is generated fully at day init; forecast is its
  noisy view (06 §8.6). Base forecast horizon = current day (24 h); forecast-system
  upgrades narrow the band and extend the horizon to 3 / 7 game days (01 §2.4).
- Turn-based (01 v0.12): 1 day = **8 turns × 3 h**, named after day phases
  (00–03 night, 03–06 pre-dawn, 06–09 morning ramp, 09–12 late morning, 12–15
  noon/PV peak, 15–18 afternoon, 18–21 evening peak, 21–24 late evening).
  Weather/demand truth stays hourly (doc 06 unchanged); a turn sees block
  averages and energy/money/line-build progress = MW × 3 h.
  3 representative days per month (2 working + 1 holiday), 36 days per game
  year. Weather regime is rolled per month and covers all 3 days (06 §8.4).
- Campaign is **endless** (sandbox, no fixed horizon, no length variants) and there
  is **no hard fail state** — failure is soft (penalties, stagnation). Demand growth
  saturates logistically (01 v0.13, provisional): yearly city growth = 10% ×
  (1 − peak/cityCapacity), cityCapacity ≈ 16× starting peak → full map converges
  to the 20–30 GW ceiling. The city-growth mechanism is explicitly slated for
  rework in doc 05. All player setpoints are manual — no auto-dispatch button.
- Suspended, not reversed (return via docs/90): DC power flow / frequency /
  reserves (future "Standard" level), unit commitment, energy market, regulator,
  non-weather random events.
- Start with a **minimal endowment** (replaced pure greenfield in 01 v0.10): one
  mid-size plant + a direct line feeding one small connected city, free of charge
  on top of the starting capital. All other cities start disconnected; connecting
  them is an explicit player act (requires a finished line to the city).
- Build times: K ≈ 40 vs. reality (01 v0.12; nuclear = 9 game days ≈ 3 game
  months). Lines build in game hours by type: 3/6/12 h per hex (LV/MV/HV).
  Demand growth ~10%/yr with logistic saturation (see above). Economy numbers
  are the prototype-tuned canon (01 v0.13): tariff 650 PLN/MWh, unserved
  penalty 4000 PLN/MWh, city connection 30M PLN.
- Hex = 25×25 km. Currency = PLN (configurable). Starting capital = 10 bln PLN
  (configurable). System scale grows ~1 GW → 20–30 GW.
- Existing facilities can be expanded, but expansion has hard site limits and
  never grows beyond the object's single hex — expansion adds blocks/modules in
  place (01 §7, v0.13).

## Domain glossary (PL docs → EN code)

| Docs (PL) | Code (EN) |
|---|---|
| doba | day |
| tura | turn |
| rozpływ mocy | power flow |
| zapotrzebowanie | demand |
| magazyn energii | energy storage |
| stacja elektroenergetyczna | substation |
| stacja rozdzielcza | junction (station) |
| rozdzielnia | switchgear |
| szczytowo-pompowa | pumped storage |
| wymiana transgraniczna | cross-border exchange |
| rezerwa (pierwotna/wtórna) | reserve (primary/secondary) |
| statyzm | droop |
| plan pracy jednostek | unit commitment |

## Tech stack (decided 2026-08)

- **TypeScript (strict) + Vite + React 19**, npm, Node per `.nvmrc`. No backend —
  static deploy; future multiplayer stays possible because the engine is isomorphic.
- **`src/engine/` — pure simulation module**, bundled with the app but walled off:
  compiled with `tsconfig.engine.json` (no DOM lib) plus ESLint restrictions — no
  browser APIs, no Node APIs, no imports from `src/app/`. API = pure functions
  (`newGame`, `applyAction`, `resolveTurn`) over a JSON-serializable `GameState`;
  actions are JSON objects (the future replay/undo/network protocol).
- **Determinism rules**: all randomness via the seeded sfc32 PRNG in
  `src/engine/prng.ts` (named streams; never `Math.random`); money is integer PLN;
  generated truth is quantized at the generation boundary (`quantize01`), so
  cross-engine float noise in `Math.sin`/`exp` never reaches serialized state.
- **Map & charts: SVG in React components.** The map renderer sits behind a
  scene-model contract (plain data in → SVG out) so a Canvas/Pixi swap stays
  local. Glow = layered strokes, never `feGaussianBlur`; pan/zoom = a single
  transform on the root group.
- State bridge UI↔engine: Zustand (added when the first real UI state lands).
- Future DC power flow (docs/90 §1): HiGHS via WASM in a Web Worker. Min-cost
  flow now: hand-rolled in the engine (graphs are tiny).

## Testing & anti-regression

Three complementary nets (all under `tests/`):

1. **Spec tests** — docs are the executable contract; test names cite doc
   sections (e.g. `§12.1`). When a doc changes version, its tests change in the
   same commit.
2. **Invariant/property tests** (fast-check) — determinism (same seed →
   identical state hash), lossless JSON round-trip of state; as mechanics land:
   energy balance, capacity/slot limits, money conservation over fuzzed action
   logs.
3. **Golden scenarios** (`tests/goldens/`) — fixture = (seed, action log) JSON;
   recorded per-turn KPIs + final state hash via `toMatchFileSnapshot`. A red
   golden = unintended behavior change. Intended changes: `npm run
   goldens:update` and review the diff in the commit — never update blindly.
   Every bug fix starts with a replay fixture reproducing the bug.

Vitest projects: `unit` (fast, run constantly), `stats` (doc 06 §12.6–12,
20+ simulated years — todo until the weather model lands), `goldens`,
`components` (Testing Library + jsdom; snapshot scene models, not pixels).
E2E: one Playwright smoke spec, Chromium only. CI (`.github/workflows/ci.yml`):
lint, typecheck, all tests, build, e2e on every push/PR.

## Development commands

```
npm run dev            # Vite dev server (or the `game` config in .claude/launch.json)
npm test               # all Vitest projects: unit, stats, goldens, components
npm run test:unit      # fast engine/spec tests only
npm run goldens:update # re-record golden scenarios — review the diff!
npm run e2e            # Playwright smoke (first run: npx playwright install chromium)
npm run lint           # ESLint (includes the engine-wall rules)
npm run typecheck      # tsc for app + engine (the no-DOM wall)
npm run build          # typecheck + production bundle
```

Prototype (throwaway, static files):

```
python3 -m http.server 8123 --directory prototyp   # or the `prototype` launch config
```

A debug API (`dbg.*`) is exposed in the prototype's browser console — see
prototyp/README.md.
