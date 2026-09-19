# Handoff: ElectroNation — Design System & Dispatcher Screen

## Overview

ElectroNation is a turn-based simulation game: the player runs a national power grid,
building plants, renewables, storage and transmission lines, and closing the power balance
every turn under an uncertain weather forecast. This bundle hands off the visual design
system and the one fully designed screen — the **Dispatcher screen** (map + control panel,
the game's main loop screen) — plus a clickable reference build and the source game-design
docs the numbers and rules came from.

Three product rules are load-bearing and should survive any reimplementation:

1. **The forecast is always a band**, never a single number (e.g. `320 ±60 MW`) — the game
   is about betting under uncertainty.
2. **Every hex has terrain.** An empty map tile is a biome with a build-cost multiplier, not
   blank background; an object on a hex never fully hides the biome under it.
3. **One primary action per screen**: `ZATWIERDŹ TURĘ` (commit turn). Everything else is a
   secondary/ghost action.

## About the Design Files

The bundled `design-system/` folder is a **design reference**, produced in HTML/React/CSS
outside the real game codebase — not code to import verbatim into production. Two things make
this bundle more concrete than a typical mockup handoff, worth knowing before you start:

- `design-system/components/**/*.jsx` are already written as small, dependency-free React
  components (`import React from "react"`, nothing else) styled entirely through CSS custom
  properties and a handful of `.en-*` classes. If the real game's front end is React (or a
  webview/Electron-style UI), these are close enough to production that adapting them (wiring
  real data instead of the sample data, fixing import paths) may be faster than a rewrite.
- If the real game UI is **not** React/web (Unity UI Toolkit, a native engine, etc.), treat the
  `.jsx` files as the authoritative layout/behavior spec and reimplement in that stack's idioms.
  The tokens in `design-system/tokens/*.css` are the source of truth for every value regardless
  of stack — port them to USS/ScriptableObjects/whatever your engine uses, don't re-derive them
  from screenshots.

Either way: **recreate this design in the game's actual environment**, using its own patterns,
rather than embedding these HTML/React files as-is.

## Fidelity

**High-fidelity.** Every color, font size, spacing value and layout dimension is a token with
an exact value (see Design Tokens below and `design-system/tokens/*.css`). The interactive
reference build (`design-system/ui_kits/dispatcher/index.html`) is a working implementation of
the real logic (setpoints, bilans/balance math, commit → report), not a static picture — open it
in a browser to see and click through the intended behavior before you build.

## Screens / Views

Only one screen is fully designed, in two panel states and two themes (dark default / light,
toggled by `data-theme="dark"|"light"` on `<html>` — same layout, same meaning per color, only
values change).

### Dispatcher screen

**Purpose:** the core turn loop. Read the forecast, set generation/storage/import setpoints
until the plan closes the balance, commit the turn, read the settlement report.

**Layout** (reference viewport 1500×~900, desktop-first, fixed 400px right column):
```
┌─────────────────────────────────────────────── en-topbar (52px) ───┐
│ ⬡ ELECTRONATION   ROK 3 · LISTOPAD · DOBA A · reżim: ...   KPIs →  │
├───────────────────────────────────────────────┬────────────────────┤
│                                                 │  en-panel (400px)  │
│  HexMap svg, viewBox 0 0 1060 640               │  fixed, docked     │
│  (flex: 1, fills remaining width)               │  right, always     │
│                                                 │  visible           │
├─────────────────────────────────────────────────┤                  │
│  en-turnbar — 8 equal cells (one per 3h turn)   │                  │
├─────────────────────────────────────────────────┤                  │
│  DayChart svg, viewBox 0 0 1060 130             │                  │
├─────────────────────────────────────────────────┴────────────────────┤
│  en-report — full width, appears only after commit, 2px top accent   │
└────────────────────────────────────────────────────────────────────┘
```
- Top bar: 52px, `--en-bg-header`, bottom border 1px. Wordmark left (⬡ + game name, mono
  600, letter-spacing 2px), context text center-left, 3 KPIs pushed right with `margin-left:auto`.
- Body is a row: map (`flex:1, min-width:0`) + panel (`400px, flex:none`, left border 1px).
  The panel is **never hidden, never tabbed** — it's part of the frame.
- Turn bar: 8 flex-equal cells, one per 3-hour turn, thin dividers, current cell filled solid
  with the action color, past cells dimmed, click any cell to jump (see Interactions).
- Day chart: stacked-area actual generation by technology (hard color steps, not gradients)
  up to "now", then a lighter forecast band to the right of a dashed "TERAZ" (now) line.
- Report strip: renders full-width below the map+panel row only after the player commits a
  turn — a label cell plus up to 7 metric tiles (wind realized, delivered, shortfall, revenue,
  fuel+import cost, penalty, net turn result).

**Right panel has exactly two mutually-exclusive states, same 400px column:**

1. **Dispatcher panel** (default) — top→bottom: turn meta + name, forecast band rows
   (demand/wind/PV, each with a track+band+value), balance-at-current-setpoints preview for
   this turn and the next two, a scrollable setpoints list (one row per dispatchable unit),
   a sunken summary section (demand, losses, planned coverage, reserve with tone, one-line
   diagnosis), and the commit + skip buttons pinned at the bottom.
2. **Hex panel** — replaces the dispatcher panel entirely when a hex is clicked; see Interactions.

**Components used** (full contracts in each component's own `.d.ts` + `.prompt.md` — read
those before wiring real data; this is just the inventory):

| File | Component(s) | Role |
|---|---|---|
| `components/shell/TopBar` | `TopBar` | header bar: mark, context, KPIs |
| `components/shell/Panel`, `PanelSection` | `Panel`, `PanelSection` | right-column shell + its sections |
| `components/shell/TurnBar` | `TurnBar`, `DAY_TURNS` | 8-turn axis |
| `components/controls/SetpointSlider` | `SetpointSlider` | one dispatchable unit's slider row |
| `components/controls/SegmentedControl` | `SegmentedControl` | BESS 3-way ŁADUJ/STOP/ODDAWAJ |
| `components/controls/TogglePill` | `TogglePill` | renewable manual WŁ./WYŁ. cutoff |
| `components/controls/Button` | `Button` | primary (commit) + ghost (secondary) |
| `components/data/ForecastRow` | `ForecastRow` | one forecast band row (demand/wind/PV) |
| `components/data/BalanceSummary` | `BalanceSummary` | sunken summary block |
| `components/data/ReportStrip` | `ReportStrip` | post-commit settlement strip |
| `components/data/StatusDot` | `StatusDot` | ok/warn/danger dot, reused across map legend + lists |
| `components/map/HexMap` | `HexMap`, `BIOMES`, `hexCenter`, `hexLine`, `routeLines` | the map itself |
| `components/chart/DayChart` | `DayChart` | stacked generation + forecast band chart |

The **Hex panel** (catalog on an empty hex / object detail on a built hex) only exists inline
inside `ui_kits/dispatcher/DispatcherScreen.jsx` (function `HexPanel`) — it was assembled from
the primitives above to satisfy the game doc's requirement for a hex panel (01 §8 pt. 6), but
was never split into its own reusable component. Treat its markup in that file as the spec:
  - **Empty hex** → title = biome name + cost multiplier; a "TEREN" section (biome type, cost
    multiplier, wind m/s at 100m, solar multiplier, pumped-storage feasibility); a build catalog
    (8 entries, each showing size, build time in days, and price = base capex × biome multiplier,
    formatted as `mln zł`/`mld zł`); a per-hex transmission-line cost table for NN/SN/WN
    (capacity, loss %, price per hex, build hours).
  - **Built hex** → title = object name; an "OBIEKT" section (tech description, status ok/alert,
    connections used e.g. `2 / 6`); ghost actions (`POPROWADŹ LINIĘ STĄD`, `ROZBUDUJ (+1 BLOK)`,
    and — only when the object is in alert — `POKAŻ WĄSKIE GARDŁO`).
  - Both states end with a sunken `◂ WRÓĆ DO PANELU DYSPOZYTORA` ghost button that clears the
    selection and restores the dispatcher panel.

## Interactions & Behavior

All of this is implemented and clickable in `design-system/ui_kits/dispatcher/DispatcherScreen.jsx`
— read it alongside this list, it's the actual logic, not just a description of it.

- **Click an empty hex** → right panel swaps to the Hex panel's catalog state for that hex's biome.
- **Click a hex with an object** → right panel swaps to the Hex panel's object-detail state.
- **`◂ WRÓĆ DO PANELU DYSPOZYTORA`** → clears selection, right panel returns to the Dispatcher panel.
- **Setpoint sliders** (coal/gas/OCGT/import): a native `<input type="range">` transparent and
  stacked over a custom track+fill+thumb (thumb is a 3×12px bar, not a circle); step 10 MW;
  every change live-recomputes plan, losses, reserve and its tone.
- **BESS segmented control** (`ŁADUJ` / `STOP` / `ODDAWAJ`): charging is subtracted from the
  plan (as extra load); discharging is added to the plan (as coverage). State of charge (SOC)
  is shown as a percentage bar next to the control.
- **Renewable toggles** (`WŁ.`/`WYŁ.` pill on wind/PV): the only manual OZE control (per game
  doc 01 §4.1). Turning a farm off removes it from the forecast band **and** from the plan
  entirely — it does not just display as zero.
- **Balance math** (recomputed on every input change):
  `plan = coal + gas + ocgt + windForecast + max(0, bess) + import`
  `losses = round(plan × 2.9%)`
  `reserve = plan − losses − charging − demand`
  tone = **danger** if `reserve < 0`, **warn** if `reserve < windBand` (i.e. the forecast's
  downside case would already dip into deficit), else **ok**.
- **`ZATWIERDŹ TURĘ ▸`** (commit, the one primary action): resolves the turn — wind is realized
  at its *lower* forecast bound in this reference build (a placeholder for a real weather roll,
  see `game-design-docs/06-*.md` §8.6), delivered energy is capped at demand, any shortfall is
  computed, and revenue/fuel+import cost/penalty/net result are calculated from the tariff and
  penalty rates in `game-design-docs/01-*.md` (§4.5, §6). The report strip fills with the result
  and the turn index advances. **Confirm with design whether the real game allows revisiting a
  committed turn** — the reference build does not attempt to model that.
- **`PRZEWIŃ ⏭`** (skip): calls the same commit function in this reference build. Confirm the
  intended difference between "commit with current setpoints" and "skip" with design before
  building — they may need to diverge (e.g. skip = accept a system-suggested plan).
- **Turn bar cells**: clickable to jump directly to any of the 8 turns. The reference build
  allows free scrubbing for demo purposes; confirm whether the real game should restrict this
  to "current turn only" once a game is in progress.
- **Theme switch**: flips `data-theme` on `<html>`; every token repaints, no layout changes.

## State Management

From the reference build (`DispatcherScreen.jsx`) — treat as the minimum state shape:

| State | Type | Notes |
|---|---|---|
| `turn` | int 0–7 | index into the 8 turns of the day |
| `coal`, `gas`, `ocgt` | number (MW) | dispatchable setpoints |
| `bess` | enum `ŁADUJ`\|`STOP`\|`ODDAWAJ` | storage mode |
| `imp` | number (MW) | import setpoint |
| `windOn`, `pvOn` | boolean | manual renewable cutoff |
| `sel` | hex or `null` | selected hex; presence swaps the right panel |
| `report` | object or `null` | last commit's result; presence shows the report strip |

Derived every render (demand, wind forecast/band, bess MW, plan, losses, reserve, tone) — cheap
enough not to need memoization at this scale, but will need to move into your real game-state/
save system, wired to the actual weather RNG (`06-*.md`), city demand model (`05-*.md`) and
economy model (`01-*.md` §4–§6) instead of the hardcoded example numbers used here.

## Content & Copy Rules

The game ships in **Polish**; keep the register if you extend the copy:

- Industry terminology, untranslated: *nastawa* (setpoint), *bilans* (balance), *przepustowość*
  (capacity), *energia niedostarczona* (undelivered energy), *reżim pogodowy* (weather regime).
- Section labels and object names are **uppercase, monospace**: `NASTAWY`, `EW JARNOWO`.
  Technology is a lowercase suffix: `EC DOLINA CCGT`.
- Impersonal, present tense. Never "Twoje miasto" (your city), never "Świetna robota!" (praise).
- Diagnosis, not alarm: not "Uwaga, ryzyko!" but `⚠ dolne pasmo wiatru = −60 MW → ryzyko
  niedoboru` — always say **where the number comes from**.
- Actions are imperative + arrow: `ZATWIERDŹ TURĘ ▸`, `PRZEWIŃ ⏭`.
- Numbers: comma as decimal separator, space as thousands separator (`4 000 zł/MWh`), setpoints
  always `value / max`, bands always `±`, units always stated (MW, MWh, zł/MWh, m/s, %, h).
- Allowed glyphs, nothing else, **no emoji anywhere**: `✓ ⚠ ✕ ◂ ▸ ⏭ ⬡`.

## Design Tokens

Full source: `design-system/tokens/*.css` (framework-agnostic CSS custom properties — port the
values, the format doesn't matter). Two themes, same variable names, `[data-theme="light"]`
overrides `:root`.

**Color — surfaces** (dark → light):
`--en-bg-app` `#0b0f15`→`#eef1f5` · `--en-bg-header` `#0e141d`→`#e7eff7` ·
`--en-bg-map` `#070b10`→`#e6ebf1` · `--en-bg-panel` `#0f151e`→`#f3f8fc` ·
`--en-bg-panel-sunk` `#0c1219`→`#dde8f3` · `--en-bg-chart` `#0a0f16`→`#f2f5f8` ·
`--en-border` `#1e2a3a`→`#c2d2e0`

**Color — system state** (used for line load, balance tone, alarms — same meaning both themes):
`--en-ok` `#37d67a`/`#1f9e5a` (≤75% load, healthy reserve) · `--en-warn` `#f5a623`/`#c07c14`
(>75%, thin reserve — also the **action/commit-button color**) · `--en-danger` `#ff5252`/`#d63b3b`
(limit, deficit) · `--en-info` `#38bdd8`/`#1583a0` (weather/renewables) · `--en-idle` `#33465c`/`#a9b8c6`

**Color — technologies** (constant across chart bars, sliders, map icons):
coal `--en-coal` `#7a6248`/`#8a6d4e` · gas `--en-gas` `#d99a3d`/`#c8892a` · wind `--en-wind`
`#38bdd8`/`#3b9ec0` · PV `--en-pv` `#f5d76e`/`#b8931c` · storage `--en-storage` `#9b7fd4`/`#6f5aa8`

**Color — biomes** (fill / edge / texture, cost multiplier in the label): nizina ×1.0, wyżyna
×1.3, góry ×2.2, las ×1.4, bagno ×1.8, jezioro ×2.6, morze ×3.0, teren zurbanizowany ×1.9 — see
`--en-biome-<name>-{fill,edge,tex}` for all 8 × 2 themes (16 triples) in `tokens/colors.css`.

**Typography:** IBM Plex Mono for every number, label, object name and action; IBM Plex Sans
only for prose longer than a label. Scale runs 9px→19px (`--en-fs-micro` 9px through
`--en-fs-display` 19px) — **never below 9px**. Section headers: 10px, letter-spacing 1.5px,
uppercase. Numbers use `font-variant-numeric: tabular-nums` so they don't jitter turn to turn.

**Shape & spacing:** `--en-radius: 0` everywhere — no rounded corners, no shadows anywhere in
the system. Spacing scale `--en-space-1` (3px) through `--en-space-11` (24px). Divisions are
1px hairlines in `--en-border`; the one accent border is 2px (report strip top edge). Hex
grid: flat-top, radius 34px, column step 51px, row step 59px (1 hex = 25 km in-fiction).

**Motion:** intentionally none. The interface is static — state reads from color and numbers,
not movement. Only instant control-state transitions exist: `--en-dur-ui` 120ms,
`--en-ease-ui`. (Animated power-flow lines and a pulsing alert ring were designed and then
deliberately cut — see `tokens/motion.css` header comment — pending a decision on a more
cinematic turn-resolution phase. Don't reintroduce motion without checking there first.)

## Assets

**None bundled, by design** — the source game docs contained no logo, art, or fonts
(`design-system/assets/README.md`):
- **Logo**: doesn't exist. The wordmark is set typographically — `⬡` + `ELECTRONATION`,
  IBM Plex Mono 600, letter-spacing 2px. Don't design a placeholder logo; ask design first.
- **Icons**: no external icon set (no Lucide/Heroicons/icon font). Every object icon is a small
  inline-SVG line drawing defined directly in `components/map/HexMap.jsx` (`ICONS` map) — stroke
  2px, minimal fill. Extend that same file/convention for new object types rather than pulling
  in a library.
- **Fonts**: IBM Plex Sans / IBM Plex Mono, currently loaded from Google Fonts CDN
  (`tokens/fonts.css`). For an offline/shipped build, self-host the woff2 files and swap the
  `@font-face` source.

## Files

```
design_handoff_electronation_design_system/
├── README.md                        this file
├── design-system/
│   ├── readme.md                    full design-system doc (source list, voice rules, visual
│   │                                 foundations, "what's deliberately not here" — read this too)
│   ├── SKILL.md                     entry point used to invoke this system as a prompting skill
│   ├── styles.css                   single CSS entry point (imports tokens/ + css/)
│   ├── tokens/                      fonts.css, colors.css, typography.css, layout.css, motion.css
│   ├── css/                         base.css (reset/app shell), components.css (.en-* classes)
│   ├── components/
│   │   ├── shell/                   TopBar, Panel, PanelSection, TurnBar
│   │   ├── controls/                SetpointSlider, SegmentedControl, TogglePill, Button
│   │   ├── data/                    ForecastRow, BalanceSummary, ReportStrip, StatusDot
│   │   ├── map/                     HexMap (+ hexLine/routeLines routing, sampleWorld.js sample data)
│   │   └── chart/                   DayChart
│   │       (each component folder has .jsx source + .d.ts prop contract + .prompt.md usage notes,
│   │        plus one *.card.html per folder you can open directly in a browser to see it rendered)
│   ├── guidelines/                  20 single-purpose spec cards (open any .html directly): colors
│   │                                 (both themes, state, tech, biomes), type, grid, wordmark, line
│   │                                 coding, icons, "no motion" rationale
│   └── ui_kits/dispatcher/          **the reference build** — index.html + DispatcherScreen.jsx,
│                                     fully clickable, both themes, no build step (React + Babel
│                                     from CDN) — open index.html directly in a browser
└── game-design-docs/                the four source docs everything above was derived from
    ├── 01-mechanika-gry.md          core mechanics: turns, line types, CAPEX, tariff, penalty, screen spec
    ├── 05-model-zapotrzebowania.md  city demand model
    ├── 06-model-astronomiczny-i-pogodowy.md   weather/forecast-error model — why forecasts are bands
    └── 90-pomysly-na-przyszlosc.md  deferred mechanics — what NOT to build yet (frequency, N-1, market...)
```
