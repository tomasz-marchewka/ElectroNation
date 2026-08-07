# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**ElectroNation** — a turn-based web game about running a national power grid.
The player acts as grid operator (TSO + DSO + generator) in a fictional country:
builds infrastructure on a hex map and covers hourly demand from power plants,
wind/PV, storage, and imports — planning against weather and demand forecasts
that are never fully accurate.

The **energy flow engine is deliberately simplified** (01 v0.9): the network works
like water in pipes — lines and substations have hard MW capacity limits and
losses grow with line length; no Kirchhoff physics, no frequency. The physics
model (DC power flow) and other advanced layers are parked in
`docs/90-pomysly-na-przyszlosc.md` and return feature by feature later.

Current phase: **concept & documentation**. No game code exists yet.

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
prototyp/  Throwaway playable prototype of 01 v0.9 (see prototyp/README.md)
CLAUDE.md
```

Planned as the project grows: `src/` (game code), `tests/`. Prototype code never
migrates into `src/` without review. Prototype UI strings are Polish (player-facing,
kept in the UI layer); identifiers and comments stay English.

## Key design documents

- [docs/01-mechanika-gry.md](docs/01-mechanika-gry.md) — core mechanics document
  (simplified game, v0.9). Read §11 first: decided / suspended / open questions.
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

- **Simplified flow engine (01 v0.9)**: each turn's demand must be covered from
  plants, wind/PV, storage, or imports; the network is a "water in pipes" transport
  model — lines have max transfer [MW], losses are a fixed % per 100 km of length,
  substations are nodes with their own MW capacity (objects hook up within radius
  1 hex). Flow is solved as a deterministic **min-cost flow**; no Kirchhoff,
  no frequency.
- The simplified game **includes**: PV + onshore wind (production per doc 06),
  storage (power vs. capacity as separate params), substations, and **forecasts
  with error bands** for weather and demand — the player never sees the true
  current state. Truth is generated fully at day init; forecast is its noisy
  view (06 §8.6).
- Turn-based: 1 turn = 1 game hour, 24 turns per day, 3 representative days
  per month (2 working + 1 holiday), 36 days per game year. Weather regime is
  rolled per month and covers all 3 days (06 §8.4).
- Campaign is **endless** (sandbox, no fixed horizon, no length variants) and there
  is **no hard fail state** — failure is soft (penalties, stagnation). Long-term
  demand growth must therefore saturate (open question for doc 05; ceiling
  ~20–30 GW). All player setpoints are manual — no auto-dispatch button.
- Suspended, not reversed (return via docs/90): DC power flow / frequency /
  reserves (future "Standard" level), unit commitment, energy market, regulator,
  non-weather random events.
- Start with a **minimal endowment** (replaced pure greenfield in 01 v0.10): one
  mid-size plant + substations + line feeding one small connected city, free of
  charge on top of the starting capital. All other cities start disconnected;
  connecting them is an explicit player act.
- Build times: K ≈ 5 vs. reality (nuclear = 2 game years), demand growth ~10%/yr.
- Hex = 25×25 km. Currency = PLN (configurable). Starting capital = 10 bln PLN
  (configurable). System scale grows ~1 GW → 20–30 GW.
- Existing facilities can be expanded, but expansion has hard site limits (01 §7).

## Domain glossary (PL docs → EN code)

| Docs (PL) | Code (EN) |
|---|---|
| doba | day |
| tura | turn |
| rozpływ mocy | power flow |
| zapotrzebowanie | demand |
| magazyn energii | energy storage |
| stacja elektroenergetyczna | substation |
| rozdzielnia | switchgear |
| szczytowo-pompowa | pumped storage |
| wymiana transgraniczna | cross-border exchange |
| rezerwa (pierwotna/wtórna) | reserve (primary/secondary) |
| statyzm | droop |
| plan pracy jednostek | unit commitment |

## Tech stack

**TBD** — to be filled in when chosen. Candidates will be evaluated against:
runs in the browser, cheap graph/flow computation (transport model now; a linear
solver for DC power flow later, per docs/90 §1), deterministic simulation from
a seed (required for replayable days — weather truth is generated at day init,
06 §8.6.1).

<!-- When decided, document here: framework/engine, language, build tool,
     test runner, lint/format commands, dev server command. -->

## Development commands

No build yet (no `src/`). Prototype is static files:

```
python3 -m http.server 8123 --directory prototyp   # then open http://localhost:8123
```

`.claude/launch.json` has a `prototype` config for the in-app preview. A debug
API (`dbg.*`) is exposed in the browser console — see prototyp/README.md.
