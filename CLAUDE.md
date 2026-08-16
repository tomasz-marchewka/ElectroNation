# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**ElectroNation** — a turn-based web game about running a national power grid.
The player acts as grid operator (TSO + DSO + generator) in a fictional country:
builds infrastructure on a hex map and covers hourly demand from power plants,
wind/PV, storage, and imports — planning against weather and demand forecasts
that are never fully accurate.

The **energy flow engine is deliberately simplified** (doc 01): the network works
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
- **Never name a branch `claude/*`.** Branches follow the commit-type
  convention: `feat/…`, `fix/…`, `docs/…`, `ci/…`, `refactor/…`. If a harness
  hands you a `claude/*` branch, rename it before pushing.

## Repository layout

```
docs/      Design documents (Polish) — the source of truth for game mechanics
prototyp/  Throwaway playable prototype (its README states the 01 version it implements)
src/       Game code: engine/ (pure simulation) + app/ (React UI)
tests/     unit / stats / goldens / components / e2e (see Testing below)
CLAUDE.md
```

Prototype code never migrates into `src/` without review. UI strings are Polish
(player-facing, kept in the UI layer); identifiers and comments stay English.

## Key design documents

- [docs/01-mechanika-gry.md](docs/01-mechanika-gry.md) — core mechanics document
  (simplified game). Read §11 first: decided / suspended / open questions.
- [docs/06-model-astronomiczny-i-pogodowy.md](docs/06-model-astronomiczny-i-pogodowy.md) —
  formal astronomy/weather model, **in force**: drives wind/PV production and
  forecast error in the simplified game (§12 lists acceptance tests any
  implementation must pass).
- [docs/90-pomysly-na-przyszlosc.md](docs/90-pomysly-na-przyszlosc.md) — deferred
  mechanics parking lot (DC power flow, unit commitment, markets, regulator, …)
  with a suggested restoration order (§14). Nothing in it is part of the current
  game.

Docs are canon for every parameter value; the engine mirrors them in constants
(`CONFIG`, tech tables). When they disagree, docs win — fix code and its tests
in the same commit.

Documents 02–05, 07–10 are planned but not yet written (list in 01 §12).

`design_handoff_electronation_design_system/` is the **UI reference** for the
game's front end: design tokens (source of truth for every visual value),
reusable React components, copy rules, and the fully designed dispatcher screen
(`design-system/ui_kits/dispatcher/`). Build the UI on it — but functional
scope and ALL parameter values still come from the docs and engine `CONFIG`;
numeric values embedded in the design files (e.g. biome cost multipliers, the
mock balance math in the reference build) are illustrative and may be stale —
when they disagree with docs, docs win.

## Decisions already made (do not re-litigate)

Decision headlines only — current parameter values live in doc 01 (esp. §11)
and in engine constants, not here.

- **Water-in-pipes network** (01 §3–§4): hard MW caps on lines and junctions,
  length-based losses, three line types (LV/MV/HV); lines connect objects
  directly — every object is a node with one line slot per neighboring hex and
  can merge/branch lines; a line crossing an object's hex taps it; junction
  stations are dedicated routing nodes; flow = deterministic min-cost flow, no
  Kirchhoff, no frequency. Substation-radius topology parked in docs/90 §4.
- **Scope** (01 §2, 06 §8.6): PV + onshore wind (whole-farm on/off is the only
  manual RES control), storage (power vs. capacity as separate params), and
  forecasts with error bands for weather and demand — the player never sees the
  true current state; truth is generated fully at day init, forecasts are its
  noisy view; forecast-system upgrades narrow the band and extend the horizon.
- **Turn loop** (01 §2, 06 §8.4): 1 day = 8 turns × 3 h named after day phases;
  truth stays hourly, a turn sees block averages (energy = MW × 3 h);
  3 representative days per month, 36 game days per year; weather regime is
  rolled per month.
- **Endless sandbox, no hard fail state**: failure is soft (penalties,
  stagnation); demand growth saturates logistically toward the ~20–30 GW
  ceiling (mechanism slated for rework in doc 05); all setpoints are manual —
  no auto-dispatch button.
- **Suspended, not reversed** (return via docs/90): DC power flow / frequency /
  reserves, unit commitment, energy market, regulator, non-weather random
  events.
- **Start = minimal endowment**: one mid-size plant + a direct line feeding one
  small connected city, free on top of starting capital; every other city
  connects only via an explicit player act (finished line required).
- **Scale & pacing**: hex = 25×25 km; currency PLN (configurable); build times
  ~40× compressed vs. reality; economy values are the prototype-tuned canon
  (01 §6, §11).
- **Expansion in place** (01 §7): blocks/modules within the object's single
  hex, hard site limits — an object never outgrows its hex.

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
- Saves: IndexedDB via `idb-keyval` + JSON export/import (added when save/load
  lands); save = serialized `GameState`, schema-versioned from day one.
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
npx vitest run <path>  # single test file (add -t "name" for one test)
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
