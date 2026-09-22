# render/effects — progress

Hand-over between pipeline steps. Written at the START of step 1 (2026-09-21),
updated after every finished sub-task, rewritten at the end.

## Step 2 of 2 — close the gaps, measure, polish (started 2026-09-21, closed 2026-09-21)

Found on arrival: step 1 files (`geometry/materials/bands/hooks/index.ts`) and a
PROGRESS.md newer than all of them; capture set `captures/effects/s1/` complete.
The integrator applied the four change requests (showcase loads res/storage/nodes,
`border-import` frame, border export window day 0, `?select=` survives the
scenario) and filed one critic finding:

- **Bottleneck ring towers over closeups.** The audit frame
  `captures/showcase/s1/audit-bess-discharge.png` (detail 18 km, BESS Jasienica)
  is dominated by an 11,3 km-radius red ring: the hex ring is sized for the
  strategic view and is far wider than a detail frame. Fixed below.
- Reported also: `effects-dash` logged `'LinearTransferOETF' already has a body`
  in a whole-game capture (storage builder, 12:25 — before the dash rework).
  Swept and explained below.

### Checklist (this step) — closed

| # | Item | State | Evidence |
|---|---|---|---|
| 1 | Ring radius clamped by camera distance so closeups keep the line read | done | `b-bess-detail.png` — the critic's own URL after the clamp (vs the s1 audit frame) |
| 2 | Bottleneck segment-end marker that survives the hex ring leaving the frame | done | `b-bess-detail.png` (end brackets on the Centrum–BESS span) |
| 3 | Stronger dump marker (an arrow into the ground) | done | `c-dump-detail.png` |
| 4 | Strategic-scale crane read | done | `game-noon-summer.png` vs `captures/effects/s1/o-game-noon.png` (same URL): the crane is now an amber mark |
| 5 | Headed layer cost (with/without, strategic + closeup) | done | `cost-*.json`, table below |
| 6 | Polish pass, strategic frame first | done | dash underlay + alphas, all s2 frames |
| 7 | Re-shoot showcase + game frames under `captures/effects/s2/` | done | `show-*.png` (4) + `game-*.png` (4) |
| 8 | `effects-dash` shader error swept and reported | done | 29/29 s2 logs `consoleErrors []`; zero transfer-function declarations left in `materials.ts` |

### What changed (design notes)

- **Ring clamp.** `BandSpec.clampPx` (with `BandSpec.origin`) → `aClamp`/`aOrigin`
  vertex attributes; the band vertex shader shrinks a ring's radius about its origin
  to `uPxKm · distance · clampPx`, keeping the band's half-width floor — the mirror
  of the screen-space width floor. Bottleneck ring 44 px, its glow 62 px, status
  rings (dump / curtailment / disabled) 80 px. Blackout rings stay unclamped (their
  `radiusKm` is a docs value). The critic's 11,3 km ring becomes a hex-hugging ring
  at detail range; the overloaded line still reads (`b-bess-detail.png`).
- **Segment-end marker.** The ring now marks only the span's first and last hex, and
  each end gets a pair of crossbar "brackets" across the conductor (1,6 km half-length,
  0,9 km gap) perpendicular to the local tangent — 5 px band / 12 px glow, alphas
  0,75/0,24 and 0,9/0,32 — so the bottleneck reads as a span (start, end, direction)
  even when the hex ring leaves the frame.
- **Dump marker.** The four ticks are shorter (1,5 km) and a new instanced head-down
  chevron (`effects-arrows-dump`, capacity 8, vertical, billboarded about Y) drops
  1,1 km into the ground under a 2,0 km lift; opacity breathes with `motion.ambient`.
  Ring + arrow read as "energy thrown away", distinct from the curtailment ring
  (steel) and the warn line (amber).
- **Crane read.** Whole-crane scale floor about the base: the mast is grown to ≥ 7 px
  (`CRANE_MIN_PX`, cap 4×) at any distance, applied to mast/slew/rope/hook. A fifth
  instanced part is an amber aviation lamp (`effects-crane-lamp`),
  `lampKm = min(2,0, max(0,07, pxKm · distance · 3))`, blinking 0,5 Hz under
  `motion.ambient` and steady in the static twin.
- **Worst-bottleneck tie-break.** Ratio ties (1e-6) now pick the larger `usedMw`
  (`FlowMark.usedMw`); at the judging turn that is the 500/500 Centrum–BESS span.
  The step-1 note ("ties → the smaller capacity") was wrong: the tie-break was
  iteration order. The docs ask for "the one worst bottleneck" and the heavier span
  is the honest reading.
- **Dash pass.** Additive blending vanished on snow and on the conductor at noon;
  the pass is now `NormalBlending` with straight alpha plus a dark underlay twin
  (`effects-dashes-under`, renderOrder 6.9, uScale 1,5) so the dashes read on bright
  ground. Min size 2,1 px, stretch 3,4, base size 0,13 km, alphas ok 0,5 / warn 0,72
  / over 0,76.
- **`LinearTransferOETF`.** The s1-era `effects-dash` ShaderMaterial declared
  `LinearTransferOETF`/`sRGBTransferEOTF`/`sRGBTransferOETF` itself, colliding with
  the functions three's own fragment prefix injects (WebGLProgram then logs the
  duplicate body). The current dash shader declares none (`materials.ts`: zero hits)
  and 29/29 s2 logs are clean — not reproducible on this tree.

### Measured

Headed Chromium, Apple M3 Pro, 1600×900, `--quality high`, pinned clock, median of 3.
The machine was shared with other builders — read the deltas, not the absolutes.

| Frame | draw calls | triangles | gpuMs |
|---|---|---|---|
| strategic turn 6 with effects (`cost-strategic-with-b`) | 125 | 438 975 | 10,16 |
| strategic turn 6 without effects (`cost-strategic-without-b`) | 107 | 432 841 | 10,71 |
| **effects layer, strategic** | **+18** | **+6 134** | **−0,55 (noise)** |
| closeup 19,6 with effects (`cost-close-with`) | 144 | 674 489 | 7,94 |
| closeup 19,6 without effects (`cost-close-without`) | 126 | 668 355 | 9,09 |
| **effects layer, closeup** | **+18** | **+6 134** | **−1,15 (noise)** |

The first strategic pair (17,57 ms with effects) was a machine-noise outlier; the
re-run is the row above. Both "without" runs also fail the 6,7 ms absolute budget —
the overrun is the whole scene (terrain+sky+grid+cities+plants), not this layer.
18 draw calls of the 60 allowed, 6,1 k of the 300 k triangles allowed.

Showcase/game frames (headless, software GL — fps not a gate): bottleneck-night 146
calls / 674 549 tris, site-noon 178 / 1 173 689, flow-strategic 127 / 436 785,
border-import 139 / 664 437; game evening 127 / 439 035, noon 139 / 673 559, night
127 / 436 785, storm 143 / 673 805; every capture `consoleErrors []`,
`pageErrors []`, all modules `ready`.

Determinism: `q-twin-a`/`q-twin-b` (`--motion none`) md5
`6aa5d2eedbad915c598a3a5385377b6c` both; `q-motion-a`/`q-motion-b` (`--motion full`)
md5 `634cf977f437cd9b5b611e28edd3779e` both. `show-site-noon` re-shot at the end of
the step is byte-identical (md5 `301286951de4cb26969b44f1dd10b18d`).

### Screenshots that back every claim (all in `captures/effects/s2/`)

- `b-bess-detail.png` — the critic's URL (`scenario=midgame&day=1&turn=6&regime=frostHigh&camera=detail&focus=12,6`) after the clamp: the ring hugs the BESS hex, the
  overloaded Centrum–BESS span carries red dashes, Jasienica reads — compare
  `captures/showcase/s1/audit-bess-discharge.png` (same URL, flooded red).
- `c-dump-detail.png` — Łęgi coal plant at the judging turn: amber ring + the head-down
  arrow into the ground.
- `e-crane-grid.png` — a grid construction head at detail: cranes beside the works.
- `d-site-detail.png` — the coal site (progress 0,2): five cranes on the pad (re-shot
  after the lamp clamp).
- `game-noon-summer.png` vs `captures/effects/s1/o-game-noon.png` (same URL) — the
  strategic crane is now a visible amber mark.
- `show-bottleneck-night.png`, `show-site-noon.png`, `show-flow-strategic.png`,
  `show-border-import.png` — the four effects showcase frames (registry,
  integrator-owned).
- `game-evening-peak-frost.png`, `game-noon-summer.png`, `game-night-atlantic.png`,
  `game-storm-offshore.png` — the four judging game frames.
- `h-game-evening-hud.png` / `h-game-noon-hud.png` — the same turns with the HUD.
- `i-overlay-select.png` — `?select=19,6` now survives the scenario (integrator fix).
- `q-twin-*`, `q-motion-*` — the determinism twins; `cost-*` — the headed cost pairs.

### Change requests (outside this folder)

1. **`src/world/showcase/registry.ts` (integrator)** — `site-noon` uses
   `camera: closeup` (42 km) while the site (`nodes`, progress 0,2) is a 14 km pad:
   at that range it reads as a snowfield. The frame is correctly centred (focus 14,12
   is the site hex — `project` puts it at (800, 442) against the frame centre
   (800, 450)); `camera: detail` (18 km) makes the site and its five cranes the
   subject. Evidence: `show-site-noon.png` vs `d-site-detail.png`.
2. **`src/world/bridge/buildWorldScene.ts` (integrator)** — publish the worst
   bottleneck (step 1 request, still open) so the ring, the HUD and the SVG map can
   never disagree.
3. **`scripts/capture.mjs` (integrator)** — no way to stage `overlay.route` from a
   URL (step 1 request, still open).

### Known gaps (module)

1. `direction = 0` segments (the heuristic's unknown) still flow in the polyline's own
   order with the load colour — honest but not distinguishable from a known direction
   in a still.
2. The storage arrows' scroll is per-frame CPU (≤16 matrices) — fine now, worth an
   instanced phase attribute if the count ever grows.
3. `scene.overlay.showcase` is read by nothing (no overlay is hidden in a showcase).
4. `plants:block` is unused (a block-level warm-up marker is the `plants` module's own
   read).

References for this step: the critic PNG above; `docs/08 §3` (the encoding and
the "one worst bottleneck gets a red ground ring"), §4 (motion twins);
sibling patterns: `grid/conductors.ts` screen-space width floor, `res`'s
distance LOD, `cities` hue-stable emission.

## Step 1 of 2 — module core (arrival 2026-09-21, closed 2026-09-21)

Found on arrival: `index.ts`, the registry's 15-line stub; nothing else, no
`PROGRESS.md`, nothing under `captures/effects/`. All sibling modules publish the hooks the
brief lists (verified in their code, not only their docs) and every one of them is `ready`
in my captures.

### What this step delivers (docs/08 §3, ARCHITECTURE §18)

| # | Overlay | State it encodes | Evidence |
|---|---|---|---|
| 1 | hover outline | the hex under the cursor | `i-overlay-select-hover.png` |
| 2 | selection ring | the selected hex (accent + soft glow) | `i-overlay-select-hover.png`, `j-route-preview.png` |
| 3 | route ribbon | `overlay.route`: solid action-colour valid / red dashed invalid, width codes the line type, waypoint posts | `j-route-preview.png`, `k-route-invalid.png` |
| 4 | bottleneck ring | `overlay.bottleneck`, or the worst warn/over segment when the interface named none | `g-showcase-bottleneck-night.png`, `o-game-noon.png` |
| 5 | blackout ring | `cities:base` with `blackout` | `g-showcase-bottleneck-night.png`, `o-game-noon.png` |
| 6 | flow dashes | every loaded segment of `gridPolylines`: density ∝ ratio, colour = load, direction from the heuristic bit | `g-showcase-flow-strategic.png`, `o-game-noon.png`, `n-game-evening.png` |
| 7 | cranes | `grid:construction-head:*`, `grid:upgrade-head:*`, `site:crane:*` | `d-crane-grid.png`, `v-crane-site.png` |
| 8 | curtailment / disabled rings | `scene.farms` by id (`curtailedMw`, `enabled`) | `t-farm-rings.png` (disabled, noon), `n-game-evening.png` (curtailed, night) |
| 9 | storage arrows | `storage:base` mode + `|flowMw|/powerMw` | `s-storage-arrows.png` |
| 10 | border pulse | `nodes:base.borderPolyline`, import inward / export outward, ratio | `u-border-import.png` |
| 11 | dump marker | `plants:base` with `dumpMw > 0` (amber ring + four ticks) | `o-game-noon.png` (rings on the dumping plants) |

### Design (as built)

- **Two band passes carry every ground mark.** A band is a quad strip along a
  terrain-conforming spine with per-vertex colour / alpha / dash rate / scroll / pulse; the
  vertex shader grows it around `aCentre` to a screen-space minimum width (the conductors'
  trick, `grid/conductors.ts`), so one draw call per pass covers every mark at every zoom.
  `effects-band-solid` (normal blending, a dark rim under every mark so it reads on snow at
  noon) and `effects-band-glow` (additive, the night twin). Both are `MeshBasicMaterial`
  patched with `onBeforeCompile`, so ACES tone mapping and the colour-space chunks behave
  exactly as for the built-in materials in both the composer and the bare-canvas path.
- **Hue stability**: the alarm radiances are the grid's own (`over 1,55/0,04/0,02`,
  `warn 1,25/0,31/0,01`). Measured on `h-bottleneck-night.png`: the ring's saturated pixels sit
  at hue 0–7° (red), not salmon — the bloom put the *glow* at 10–14°, the core stays red.
- **Flow dashes** are instanced quads positioned in the vertex shader from
  `(aFrom, aTo, aPhase, aSpeed)` — zero CPU per frame, byte-identical captures. The spine is
  resampled to 25 km travel units, so every dash moves at the docs' ~1 hex/s whatever the
  segment's own sampling. Density ∝ ratio (1–4 dashes per unit), colour = the load palette,
  `direction = −1` reverses the run, `direction = 0` still flows (the heuristic's honest
  "unknown" is not shown as a claim — the colour is the load, the motion is the heuristic).
- **Static twins** (docs/08 §4): with `motion.ambient` off the breath is `uPulseAmp = 0` →
  every alarm stays at full brightness; with `motion.stateful` off `flowTime` freezes → the
  dashes stand still at fixed phases and the storage arrows park. Cranes keep a fixed slew.
- **Derived worst bottleneck**: `overlay.bottleneck` wins; without it the module rings the
  highest-ratio warn/over segment (ties → the smaller capacity, which picks the LV 150/150
  Kamionka line over the 500/500 Centrum–BESS one at the judging turn). `docs/08 §3` demands the
  ring read without a click; the bridge could publish the same derivation (change request).
- **Dedup**: a hex that already carries a blackout ring is not ringed again as a bottleneck
  end — two concentric reds read as one.
- **Cranes** are four instanced parts (mast + ballast, slewing jib + counter-jib + apex ties,
  rope, hook); the jib points at the hook the object module published and slews slowly under
  `motion.ambient`. `HEIGHT_KM.crane` (= 1,2 km), the grid's own exaggeration.
- **Route ribbon**: colour = action amber / danger red, **width codes the line type** (the SVG
  map's own rule: NN/SN/WN) — the brief's "colour by lineType" is superseded by
  ARCHITECTURE §9 and the SVG canon. Recorded here as a deliberate deviation.

### Bug found and fixed (before closing step 1)

A region-aware A/B pixel diff (`with effects` vs `without effects`, same URL and clock) caught
the dump ring contributing **zero pixels** at the closeup while the mesh was drawn. Cause: in
`BandBatch.add()` the local `base` counter restarted at 0 for every band, so all of a batch's
indices pointed back into the **first** band's vertices — every ring but the first was drawn in
the first ring's shape and place (`commit`'s `vertexCount` was the last band's, too). It hid
well: single-band frames (route, border) and same-spine pairs (hover + selection on one hex)
were unaffected, and at the strategic view the first ring happened to be on screen. Fix:
`let vertex = this.vertexCount;` (bands.ts:88-90). Verified per-region after the fix:
`farm-pv-wzgorze[off]` 11 059 px at dead centre (`t-farm-rings` URL), `city-kamionka[blackout]`
32 969 px in `bottleneck-night`, and each of the four dumping plants carries its own ring at the
strategic turn (438/1 411/1 262/943 px in their own regions). No other builder in this module
merges geometry with a running base (`membersToGeometry` is single-pass).

### Files

- `geometry.ts` — conformed spines (≤1,5 km sampling), hex/ring/tick spines, arc resampling,
  chevron/post/dash-quad props, tower-crane parts (lattice prisms + boxes).
- `materials.ts` — band shader (solid + glow), dash shader, unlit chevron/post materials,
  crane PBR set, the hue-stable `EFFECT_COLORS` palette.
- `bands.ts` — `BandBatch`: one merged geometry per pass, rebuilt only when its key moves.
- `hooks.ts` — one `scene.traverse` builds a name index; the per-turn read of
  `cities:base` / `plants:base` / `res:base` / `storage:base` / `nodes:base` (+
  `borderPolyline`) / `site:crane` / grid heads / `gridPolylines` into a compact state.
- `index.ts` — the module: batch rebuild keys (state / overlay / dashes / arrows / cranes),
  per-frame uniforms, cranes and arrows, dispose.

### Measured (all numbers from the JSON logs in `captures/effects/s1/`)

Headed Chromium, Apple M3 Pro, 1600×900, `--quality high`, pinned clock. Re-measured after the
index fix with the machine shared with another builder's captures: the absolute gpuMs moved
(5–8 ms → 10–15 ms) but the **paired deltas stayed flat**, so read the deltas, not the absolutes.

| Frame (modules) | draw calls | triangles | gpuMs |
|---|---|---|---|
| strategic turn 6, terrain+sky+grid+cities+plants+**effects** (`p-cost-with`) | 72 | 306 439 | 12,68 |
| strategic turn 6, the same **without** effects (`p-cost-without`) | 59 | 300 595 | 13,37 |
| **effects layer, strategic** | **+13** | **+5 844** | **−0,69 (noise)** |
| closeup 19,6 with effects (`p-cost-close-with`) | 87 | 508 083 | 10,97 |
| closeup 19,6 without effects (`p-cost-close-without`) | 74 | 502 239 | 11,04 |
| **effects layer, closeup** | **+13** | **+5 844** | **−0,07 (noise)** |

Budget: **13 draw calls of the 60 allowed, 5,8 k of the 300 k triangles allowed** — the layer
is essentially free. Both cost pairs sit above the 6,7 ms budget in the "without" run too
(terrain+sky+grid+cities+plants at high tier), so the overrun is not this layer; the machine was
under load for every run in this table. Showcase frames: bottleneck-night 87 calls / 510 139 tris
/ 10,29 ms, site-noon 99 / 898 623 / 11,97, flow-strategic 72 / 303 081 / 15,07; whole game
evening with HUD 122 / 436 027 / 13,28, evening without HUD 122 / 436 027 / 12,28, noon
133 / 669 383 / 15,20. Every capture: `consoleErrors []`, `pageErrors []`, all modules `ready`,
no diagnostics.

Determinism (re-shot after the fix): `q-twin-a`/`q-twin-b` (`--motion none`) md5
`a3c12eb0c55d0fd024f7a46a16974b83` both; `q-motion-full-a`/`-b` md5
`0c5ec4b73f7a6120e93bc5f4d398f61e` both — byte-identical twins with and without motion.

Hue (re-measured on the fresh frames, saturated + red-dominant pixels): `h-bottleneck-night` —
mode at 350°, 11 617 px in 350–360°, 4 021 + 1 755 px in 330–350°, plus an 10–20° cluster (5 283
px) that is the amber family (warn lines / dump rings); the alarm core stays red.
`o-game-noon` — mode 30–50° (amber rings), 594 px of 0–20° red (blackout).

### Screenshots that back every claim

Every capture below was re-shot after the index fix (same URLs, `--headed`); the two
interaction frames (`i`, `j`, `k`) were re-driven through the UI with the same scripts.

- `g-showcase-bottleneck-night.png` (the registry frame, final): Kamionka short → red
  blackout ring (32 969 layer pixels at the city), the overloaded LV line leaving it;
  `h-bottleneck-night.png` is the same frame shot for the hue measurement.
- `g-showcase-flow-strategic.png` — turn 7 strategic: the loaded corridors carry dashes, the
  short city keeps its ring; `o-game-noon.png` — turn 4 noon: rings and dashes read on green
  terrain, and the four dumping plants each carry their own amber ring (verified per region:
  438/1 411/1 262/943 px around their own hexes, not stacked on one).
- `j-route-preview.png` / `k-route-invalid.png` — a real routing session (valid 105,0 mln zł,
  8 hexes; then a far target → invalid): solid amber ribbon with a waypoint post vs red dashed;
  the selection ring sits on the route's start hex.
- `i-overlay-select-hover.png` — selection (amber hex + glow) and hover (thin cool outline) at
  18 km on snow at noon.
- `d-crane-grid.png` — the tower crane beside the Jasienica→Zalesie construction head, jib
  over the works; `v-crane-site.png` — the crane at the coal site (nodes site).
- `s-storage-arrows.png` — BESS Jasienica discharging: eight warm-white chevrons pointing out
  of the yard; `t-farm-rings.png` — FPV Wzgórze switched off: the dark steel ring, noon
  (11 059 layer pixels at the farm, the single-band case that proved the fix).
- `u-border-import.png` — PG Zachód at day 0 turn 2: cyan dashes running in over the foreign
  line (import).
- `m-game-evening-hud.png` / `n-game-evening.png` — the judging turn with and without the HUD;
  `o-game-noon.png` — the noon twin.
- `p-cost-*` — the headed layer-cost pairs; `q-twin-*` — the determinism twins.

### Known gaps (step 2 candidates)

1. The bottleneck ring around the LV line's *plant* hex is often out of frame in the
   bottleneck-night closeup (the city ring is the frame's subject); a segment-end marker
   facing the camera is not implemented (the hex ring is the docs' encoding).
2. `direction = 0` segments (the heuristic's unknown) flow in the polyline's own order with
   the load colour — honest but not distinguishable from a known direction in a still.
3. Cranes at 500 km are ~2 px: the construction read at the strategic view still leans on the
   grid's own amber scaffold marker.
4. The dump ring shares the amber family with the curtailment ring and the warn line; its four
   ticks separate it, but a stronger shape (an arrow into the ground) is owed.
5. The storage arrows' scroll is per-frame CPU (≤16 matrices) — fine now, worth an instanced
   phase attribute if the count ever grows.
6. `scene.overlay.showcase` is read by nothing (no overlay is hidden in a showcase).
7. Only `cities`, `plants`, `res`, `storage`, `nodes`, `grid` hooks were exercised;
   `plants:block` is unused (a block-level warm-up marker is the `plants` module's own read).

### Change requests (outside this folder)

1. **`src/world/showcase/registry.ts` (integrator)** — the effects showcase loads
   `terrain, sky, grid, cities, plants, effects` only, so four of the ten overlays cannot be
   judged on its frames: the `site-noon` frame is an empty snowfield (the site is `nodes`')
   and storage arrows / curtailment rings / the border pulse never appear. Proposal: add
   `nodes`, `storage`, `res` to `SHOWCASES.effects.modules`, and consider a `border-import`
   frame (day 0 turn 0–3 is the only live import in the midgame script, `nodes` PROGRESS).
2. **`scripts/capture.mjs` / `src/world/capture/api.ts` (integrator)** — there is no way to
   stage `overlay.route` from a URL: the route must be clicked through the hex panel
   (`POPROWADŹ LINIĘ STĄD` needs an object with a free slot; Kamionka and SR Centrum have
   none, Zalesie started it). Proposal: `?route=col,row[,type]` (start at an object, preview
   to a hex) or `__en.route(from,to,type)`, so critic rounds can screenshot the ribbon.
3. **`src/world/capture/params.ts`/`App` (integrator)** — `?select=col,row` is wiped by the
   `?scenario`/`?day` effect (`replaceGame` resets `selectedHex`), so a capture cannot pin a
   selection together with a curated state; `__en.select` after boot is the only way today.
4. **`src/world/bridge/buildWorldScene.ts` (integrator)** — publish the worst bottleneck
   (`overlay.bottleneck` when clicked; the highest-ratio warn/over segment otherwise) so the
   ring, the HUD and the SVG map can never disagree on which line is "the" bottleneck.
5. **`src/world/render/grid/**` (module)** — `gridSegments.direction` is the bridge's
   heuristic; the flow dashes render it as motion. If the engine ever gains a signed
   `usedMw`, nothing in this module changes (the bit is read, not computed).
6. **`src/world/render/nodes/**` (module)** — while writing this step `nodes` failed once with
   `borderIndex is not defined` (diagnostics line, node capture); it was healthy in every run
   after that. Worth a look if it recurs.
7. **`src/world/render/storage/**` (module)** — the storage PROGRESS asks for the flow arrows;
   they are here, but a *charge* frame is still unowned: no showcase stages a charging BESS
   with `flowMw > 0` (day 0 charge has flow, but no showcase frame points at it).

### Integrator notes

None (first step in this folder).
