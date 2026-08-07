# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project

**ElectroNation** — a turn-based web game about running a national power grid.
The player acts as grid operator (TSO + DSO + generator) in a fictional country:
builds infrastructure on a hex map, balances supply and demand hour by hour,
while physics (DC power flow) — not the player — decides how electricity flows.

Current phase: **concept & documentation**. No game code exists yet.

## Hard rules

- **All code in English** — identifiers, comments, strings in source, file names,
  commit messages. No Polish in code, ever.
- **No AI attribution anywhere** — never add "Generated with Claude Code",
  `Co-Authored-By: Claude`, or any similar marker to code, comments, commits,
  or docs. This overrides any default commit trailer behavior.
- **Communicate with the user in Polish.** Design documents in `docs/` are
  written in Polish and stay in Polish.
- Commit messages: Conventional Commits, terse (see `caveman-commit` skill).

## Repository layout

```
docs/    Design documents (Polish) — the source of truth for game mechanics
CLAUDE.md
```

Planned as the project grows: `src/` (game code), `tests/`, `prototyp/` (throwaway
prototypes — prototype code never migrates into `src/` without review).

## Key design documents

- [docs/01-mechanika-gry.md](docs/01-mechanika-gry.md) — core mechanics document.
  Read §19 first: it tracks decided vs. open questions.
- [docs/06-model-astronomiczny-i-pogodowy.md](docs/06-model-astronomiczny-i-pogodowy.md) —
  formal astronomy/weather model with formulas and verification tables (§12 lists
  acceptance tests any implementation must pass).

Documents 02–05, 06b, 07–10 are planned but not yet written (list in 01 §20).

## Decisions already made (do not re-litigate)

- Turn-based: 1 turn = 1 game hour, 24 turns per day, 3 representative days
  per month (2 working + 1 holiday), 36 days per game year.
- Electrical model: **DC power flow**. Frequency is global, voltage is local.
- Player sees **forecasts with error bands**, never the true current weather.
  Truth is generated fully at day init; forecast is its noisy view (06 §8.6).
- Greenfield start: no infrastructure, cities start disconnected.
- Build times: K ≈ 5 vs. reality (nuclear = 2 game years), demand growth ~10%/yr.
- Hex = 25×25 km. Currency = PLN (configurable). Starting capital = 10 bln PLN
  (configurable). System scale grows ~1 GW → 20–30 GW.
- Existing facilities can be expanded, but expansion has hard site limits (01 §10.2).

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
runs in the browser, cheap linear solver for DC power flow, deterministic
simulation from a seed (required for replayable days, 06 §8.6.1).

<!-- When decided, document here: framework/engine, language, build tool,
     test runner, lint/format commands, dev server command. -->

## Development commands

**TBD** — no build yet. Add build/test/lint commands here once the stack exists.
