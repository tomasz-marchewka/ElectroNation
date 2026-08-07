# Handoff: ElectroNation — pulpit dyspozytorski (pętla tury)

## Overview
Interactive design prototype of the core gameplay screen for **ElectroNation**, a turn-based power-grid operator game (1 turn = 1 in-game hour, 24 turns per day). The screen implements the full turn loop from the game design doc (`01-mechanika-gry.md`, §2.2–2.4, §16): forecast with error bands → unit setpoints → animated resolution (frequency sweep, random failures) → per-turn report, plus a hex map with grid-routed transmission lines and a stacked day chart.

## About the Design Files
The files in this bundle are **design references created in HTML** — a working prototype showing intended look and behavior, **not production code to copy directly**. The task is to **recreate this design in the target codebase's environment** (game engine or web framework of your choice — none exists yet, so pick what fits: e.g. React/TypeScript + SVG/Canvas for a web build, or the equivalent UI layer in Godot/Unity) using its established patterns.

`ElectroNation Prototyp.dc.html` is authored as a "Design Component": the markup lives between `<x-dc>…</x-dc>` (a declarative template with `{{ }}` value holes, `<sc-for>` loops, `<sc-if>` conditionals) and the behavior in the `class Component` inside the `<script data-dc-script>` tag (a React-class-like component: `state`, `setState`, `renderVals()` returns everything the template binds). `support.js` is the prototype runtime — ignore it, it is not part of the design. **Read the template for structure/styling and the Component class for simulation logic and interaction behavior.**

## Fidelity
**High-fidelity.** Colors, typography, spacing, and interactions are final design intent. Recreate the UI pixel-perfectly; the simulation model in the Component class is a reference balance model (good enough for a vertical slice) — the real game will replace it with the DC-power-flow engine.

## Layout (top level)
Full-viewport, dark, column flex:
1. **Top status bar** (~64px, wraps below ~1100px viewport width): logo · 24-cell turn strip · frequency gauge (center) · budget · turn/phase indicator · **single contextual action button**.
2. **Main row** (flex): **map area** (flex:1) with a bottom-docked **day chart** (~130px), and a fixed **420–430px right panel** with the four phase cards stacked, scrollable.

Target: desktop + tablet. Minimum hit target 44px (action buttons ≥46px, sliders 26px tall, zoom buttons 34px).

## Design Tokens
Colors:
- Background `#0b0f14`, panel `#0e1319`, card `#0b0f14`, borders `#1e2733` / `#151d27`
- Text `#c8d4de`, bright `#e8f1f8`, muted `#8b9bab`, dim `#5c6b7a`, disabled `#3a4757`
- **OK green `#3ddc84`** (accent, buttons, wind), info cyan `#38bdf8`, warning amber `#ffb020`, high `#ff7a45`, alarm red `#ff4d4f` (+ event box bg `#2a1012`)
- Tech colors: coal `#7d8798`/`#9aa5b1`, gas `#e0913d`, PV `#f3d54e`, battery `#38bdf8`, import/export `#b07ce8`, demand line `#e8f1f8`
- Terrain (hex fills): water `#1a3a52`, plain `#232e27`, forest `#1e3d29`, hills `#3a3222`, urban `#3d3444`
- Button (primary): bg `#10251a`, border+text `#3ddc84`; disabled/resolving: bg `#1a1408`, border `#8a6a1a`, text `#b08a2a`

Typography:
- Labels/headers/buttons: **Barlow Condensed** 400–700, letter-spacing 1–3px, uppercase
- All numeric/data text: **IBM Plex Mono** 400–700
- Sizes: section labels 10–12px, card headers 15px/700, body 13–14px, big frequency 30px (top bar) / 38px (resolution card), map labels 8–9.5px (SVG units)

Spacing: 6–12px paddings, 6–10px gaps between cards; border-radius 3–4px throughout (sharp, technical).

## Screens / Components

### 1. Top status bar
- **Logo**: "ELECTRO" white + "NATION" green, 20px/700, ls 3px; sub-line `STYCZEŃ · ROK 1 · DOBA ROBOCZA A` (mono 10px dim).
- **Turn strip**: 24 cells 17×24px, 2px gap, wraps at max-width 440px. Cell states: future (bg `#131b24`, text `#3a4757`), resolved OK (bg `#0f2418`, green), resolved warning |Δf|>0.05 Hz (bg `#33260c`, amber), resolved alarm |Δf|>0.2 (bg `#3d1214`, red); current cell has green border. Label: hour number every 4th cell, `·` otherwise; tooltip `HH:00`.
- **Frequency gauge** (always visible, center): value `XX.XX Hz` mono 30px, color by deviation (≤0.05 green / ≤0.2 amber / red); 230×8px gradient scale red→amber→green→amber→red with a 2px white needle (position = (f−49.5)/1.0 · 100%, clamped), scale labels 49.50/50.00/50.50.
- **Budget**: `XX.X mln` mono 20px + day result `doba: ±X.XX mln zł` (green/red).
- **Turn/phase**: `TURA HH:00` caption + phase name 22px/700 colored (NASTAWY green, ROZSTRZYGNIĘCIE amber, RAPORT white).
- **Action button** (the ONLY turn-advance control, always visible): 46px tall, changes with phase: `ZATWIERDŹ TURĘ ▸` → `ROZSTRZYGANIE…` (disabled style, cursor wait) → `NASTĘPNA TURA ▸` (or `RAPORT DOBY ▸` at hour 23) → `NOWA DOBA ▸`.

### 2. Hex map (infrastructure layer)
- Header row: title `MAPA — WARSTWA INFRASTRUKTURY` + line-load legend (<60% green, 60–85 amber, 85–100 orange, >100 red) + terrain legend.
- SVG viewBox `0 0 620 500`. Flat-top hexes, size 32, **odd-q offset grid** 12×8, centers `x = 40 + q·48`, `y = 42 + r·55.7 + (q odd ? 27.8 : 0)`; hexes drawn ~0.5% oversized so they visually touch (stroke 1px `#0a0e12`).
- **Pan & zoom**: drag to pan (mouse + single-touch), wheel zooms toward cursor (factor 1.15/0.87, clamp 0.6–4×), overlay buttons `+ / − / ⟲` (34px) top-right. Implemented as `translate(x,y) scale(k)` on a `<g>` wrapping all map content.
- **Nodes** (circle r10, bg `#0c1117`, 2px colored stroke, mono symbol inside 8px): coal plant C (2,5), wind farm W (4,1), PV (6,6), gas G (9,4), substation GPZ ▣ (7,3, label above), city M (8,3), battery B (6,4), border point ⇄ (11,2). Below (or above for GPZ): name label 9.5px Barlow Condensed white + live MW value 8.5px mono in node color. All SVG text uses `paint-order: stroke` halo (3px, bg color) for legibility.
- **Transmission lines**: routed **through hex centers** using cube-coordinate hex line-drawing between endpoint hexes (lerp + cube-round), rendered as polylines (round joins), stroke 2.5px (3.5px when ≥85% load), color by load %; import line dashed `6 4`. **Parallel corridors**: for every hex-to-hex edge, count lines sharing it; each line gets slot offset `(slot − (n−1)/2) · 5px` perpendicular to the edge, computed in a **canonical edge orientation** (smaller hex key → larger) so opposite-direction lines land on opposite sides; interior vertices average adjacent segment offsets, endpoints take the adjacent segment's full offset. Load % label at path midpoint, 9px mono with halo.
- Line loads update **live** while dragging sliders (flows = current setpoints + forecast RES).

### 3. Day chart (bottom of map column)
SVG 960×150 stretched full width. Stacked areas for resolved hours in order coal/gas/import⁺/battery⁺/wind/PV (tech colors, opacity 0.8), white 2px demand line over resolved hours, dashed white forecast-demand line for future hours, green dashed "now" vertical, hour ticks 00/04/…/23. Legend in header row.

### 4. Right panel — four phase cards, all visible simultaneously
Cards stacked with 10px gap; **active card** gets its accent-colored border + subtle glow (`0 0 0 1px accent@20%`), inactive cards `opacity 0.62`. Chip in each header: `● AKTYWNA` (accent) / `OCZEKUJE` / `ZAKOŃCZONA` / `TURA HH:00` (for result cards, showing which turn they describe).

**Card 1 — PROGNOZA** (cyan `#38bdf8`, never dimmed, chip = current turn):
- Demand chart 380×100: white solid actual (past), dashed forecast (future), white 10%-opacity error-band polygon **widening with horizon** (demand ±1%→±5% per doc §2.4), green dashed "now" line, y-axis 550–1050 MW.
- RES chart 380×90: wind green (solid past/dashed future) + band ±4%→±20% of 300 MW installed, PV yellow line, y-axis 0–320.
- Briefing rows (mono key + text): POPYT peak time ±band, WIATR trend warning when slackening, REZERWA vs N-1 (≥ largest running unit), UWAGA (coal start-up 6h reminder).

**Card 2 — NASTAWY** (green `#3ddc84`):
- Unit rows (bordered sub-cards): name 14px + status chip (`W RUCHU` green / `POSTÓJ` dim / `ROZRUCH Xh` cyan / `AWARIA` red), meta line (variable cost zł/MWh, min/max MW, start-up time), then either a range slider (min→max, step 5, green accent) + MW readout + `ODSTAW` ghost button, or `URUCHOM · rozruch Xh` button. Units: Węgiel B-1 400 MW (min 160, 180 zł), Węgiel B-2 400 (off, start 6h), Gaz CCGT 250 (min 100, 380 zł), Gaz OCGT 80 (start 1h, 700 zł).
- Battery card: 100 MW / 200 MWh, SOC readout, slider −100 (ŁADUJ) … +100 (ODDAJ), 90% charge efficiency.
- Cross-border card: slider −150 (EKSPORT, 300 zł/MWh) … +150 (IMPORT, 450 zł/MWh).
- Balance box: plan supply vs forecast demand ±band, **SALDO** (green <30 MW, amber <80, red beyond — border tints likewise), spinning reserve vs N-1 (red when below largest unit).
- `PRZEWIŃ, AŻ COŚ SIĘ STANIE ▸▸` ghost button: auto-resolves consecutive turns with current setpoints until |Δf|≥0.12 Hz, an event fires, or hour 23; then reports with an amber stop-note.

**Card 3 — ROZSTRZYGNIĘCIE** (amber `#ffb020`):
- During resolution (~1.8s, clock-driven easing with a hard-timeout fallback): header pulses, big frequency value 38px animates from 50.00 to the outcome with a slight tremor; then the card keeps showing the last turn's outcome.
- Rows: demand forecast→actual, wind forecast→actual (+delta, amber if shortfall >20 MW), residual imbalance (red if >30 MW).
- Event box (blinking red border): `⚠ AWARIA: <unit> wypada z ruchu` (5%/turn chance, trips a running unit >100 MW).

**Card 4 — RAPORT** (white):
- Rows (mono, hairline separators): marginal price (= highest variable cost among running units, import counts at 450), revenue (served MWh × price), fuel+import, penalties (|Δf|>0.2 → 0.25 mln; SCO → 3 mln + 0.01/MW shed), frequency, primary regulation MW, SCO shed row when >0; bold `WYNIK TURY` ±mln zł green/red.
- After turn 24 the day-summary card appears on top (green border): revenues, fuel, penalties, energy-not-served, day result, and **result ×10.9 days** (representative-day scaling per doc §2.5), with `NOWA DOBA ▸`.

## Interactions & State (summary)
- Phase state machine per turn: `2 NASTAWY → 3 ROZSTRZYGNIĘCIE (auto, ~1.8s) → 4 RAPORT → next turn`. Day starts at hour 05 (00–04 pre-resolved as history); after hour 23 → day settlement.
- Result cards persist across turns (chip shows source turn). Reserve, saldo, map flows recompute on every slider change.
- Simulation reference (Component class): actual = profile + fixed noise arrays; forecast error grows with horizon and is purchasable-down in the full game; primary regulation covers up to 35% of online headroom (cap 150 MW); `f = 50 − residual/600`, SCO below 49.0 Hz sheds ~70% of residual; battery SOC integrates per hour.
- Tweakable params exposed in the prototype: forecast-error multiplier (0.5–2), random failures on/off, resolution-animation speed.

## Assets
No image assets. Fonts from Google Fonts: Barlow Condensed (400–700), IBM Plex Mono (400–700). All graphics are inline SVG.

## Files
- `ElectroNation Prototyp.dc.html` — the design (template + Component logic; read as described above)
- `support.js` — prototype runtime only, not part of the design
- `01-mechanika-gry.md` — game design document the screen implements (Polish)
