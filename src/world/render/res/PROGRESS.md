# render/res — progress

Hand-over between pipeline steps. Written at the start of a step, updated after every
finished sub-task, rewritten at the end.

## Step 1 (2026-09-07, resumed 2026-09-11) — module core built and judged

Found on arrival (2026-09-11): the interrupted run of 2026-09-07 had left the whole
module (`index.ts`, `layout.ts`, `lights.ts`, `materials.ts`, `pool.ts`, `pv.ts`,
`turbine.ts`) and two capture series (`captures/res/s1/a-*`, `b-*`) it never recorded;
`tsc` and ESLint were clean. This run judged the b-series and the code, captured the
arrival state on today's terrain/sky (`c-*`), fixed what follows, and re-captured (`d-*`,
`e-*`, headed `h-*`).

### What changed this run

1. **Lockstep rotors fixed** — `rebuild` used to copy the scene's rotor state into the
   runtime, so the first `applyState` never seeded the per-turbine phases and a spinning
   farm under a pinned clock showed every rotor at angle 0 (a parked "Y"). Now
   `FarmRuntime.seeded` gates the seeding; a farm never starts in lockstep
   (e-night-lawica: 24 rotors, no two alike).
2. **Rotor disc as a real static twin** — the additive lit `MeshStandardMaterial` disc was
   invisible. Replaced by `createDiscMaterial` (lights.ts): a translucent swept disc, denser
   toward the hub, a faint tip ring, soft edge; density = `instanceColor.r` from the rotor
   speed (0,3 at cut-in → 0,75 at rated), colour following `environment.daylight` (white by
   day, dim grey at night), fog-faded. Drawn only for spinning turbines.
3. **Storm parking** — `FEATHERED_ANGLE = π/3` (one blade straight down, "rabbit ears"),
   so a feathered farm has its own silhouette next to the "Y" of a becalmed one even where
   the edge-on pitch cannot be read (d-detail-storm / e-detail-storm-high).
4. **Blade section** mirrored (leading edge on +X, the side the rotor turns toward) and the
   twist now carries the leading edge upwind — the real blade, not a mirror image.
5. **Hardstand** 0,2 km radius (the ×8 footprint factor for ground features, not ×20): the
   lily pads of the b-series are gone (c-dunkelflaute onward).
6. **Aviation lights actually visible** — the lamp point sat inside the lens sphere merged
   into the nacelle, so the fixture won the depth test against the billboard's core pixel
   and only a dim halo survived (0 red pixels in d-night-lawica / d-onshore-storm). The
   billboard is now pulled 50 m toward the camera in view space, 4 px minimum, and the
   core uses a well-defined `1 − smoothstep(0, 0.5, r)`. `BLINK_OFF` raised to 0,3: the
   fixture's steady low-intensity lamp — a frozen frame between flashes still shows every
   lit farm (the static twin docs/08 §4 demands).
7. **PV ground** — the light-grey gravel hexagon (a parking lot at closeup) became mown
   grass over sandy soil with worn lanes (`res:pv-ground`), tables 0,55 km deep on the
   0,9 km pitch (GCR ≈ 0,6, a dense modern farm), and the ground now takes **snow** from
   `ctx.terrain.snowlineKm` (`padSnow` uniform via `onBeforeCompile`), so under frostHigh
   the farm is dark rows on white instead of a black hexagon on a snowfield.
8. `QUALITY_PROFILES[tier].detail` scales the detail LOD distance (300 / 180 / 90 km).

### State encoding (docs/08 §3) as it stands

| State | Encoding | Judged in |
|---|---|---|
| spinning | rotor turns at rotorSpeed × 12 rpm under `motion.stateful`, per-turbine phase and ±4 % speed; swept disc (static twin) | e-night-lawica (phases), disc pending a daylight spinning frame (see open) |
| still (< 3 m/s) | parked "Y", identical across the farm, no disc | d-detail-atlantic, d-dunkelflaute, d-still-wydmy |
| feathered (≥ 25 m/s) | blades pitched 86° edge-on, parked one blade down | d-detail-storm, e-detail-storm-high |
| off (farm disabled) | parked, nacelle lamps out | code path (`intensity = enabled ? … : 0`); no disabled farm in midgame — frame owed |
| night | red lamp per nacelle, synchronised blink per farm under `motion.ambient`, dim phase 0,3 | e-night-lawica, e-night-strategic |
| yaw | every nacelle into `weather.windFromDeg` (+ ±3,4° error) | d-detail-atlantic |
| PV | south-facing (+Z) 30° tables, dark navy cells, clearcoat sheen, inverters east, fence, grass/soil ground with snow | d-pv-noon, d-pv-wzgorze, e-game-evening |
| hooks | `res:base:<farmId>` Object3D at each farm centre (userData: farmId, tech, offshore, radiusKm) — rings are effects' | code |

### Checklist (brief)

- [x] 1 Wind archetypes instanced — 13 pools (tower, pedestal, foundation, nacelle, rotor,
  feathered rotor, disc, glow, substation, platform, PV table, PV frame, inverter) + merged
  fence and ground per farm.
- [x] 2 Rotor state — spinning / still / feathered / off as above.
- [x] 3 Yaw toward `scene.weather.windFromDeg`.
- [x] 4 Layout — staggered lattice inside FARM_FOOTPRINT, seeded jitter, feet on the
  terrain; offshore sites filtered to water ≥ 0,15 km deep, monopile + TP + boat landing.
- [x] 5 Aviation lights — fixed this run.
- [x] 6 PV — tables, frames, inverters, fence, ground, snow.
- [x] 7 Hooks for effects.
- [x] 8 Diff by farm signature (id, tech, capacity, enabled, offshore, units, footprint,
  hex) + seed + tier + terrain identity; turn state = refill of the small pools only.
- [x] 9 Budget — see Measured.
- [x] 10 Captures — see Latest screenshots.

### Open / next step

- A **daylight spinning** frame to judge the swept disc and the blade motion phase spread
  by day: the registry's `offshore-atlantic` (turn 4, atlanticLow) lands in a lull of the
  day's wind series (open 2,6 m/s, baltic ≈ 3,6 m/s → `still` / slow) — change request
  below. Until then the disc is judged only at night (dim by design).
- A **disabled farm** frame (`enabled: false`): no such farm in `midgame`; a showcase
  action or a second scenario is a change request.
- Sun glint on PV from the strategic camera at noon (geometry says the reflection of the
  noon sun off a 30° south table lands within ~5° of the strategic camera) — not yet
  captured at high tier; the closeup camera sits ~30° off the lobe, hence no glint in
  d-pv-noon (correct, not missing).
- Tower streak/weld normal map and the PV cell texture are only visible from the detail
  camera; a `detail` frame at high tier in daylight is owed for the art score.
- Offshore: sea ice / storm foam interplay at the monopiles belongs to terrain's water;
  a wake/foam ring at the pile is a possible effects hook.

## References

- Vestas V90 / V112 and Siemens SWT-3.0 onshore class (tubular tower, 4,5 m foot,
  three-blade upwind rotor turning clockwise seen from upwind, nacelle with the cooler
  at the tail, pre-bent blades; storm parking one blade down).
- Baltic monopile foundations (Baltic 2, Kriegers Flak): yellow transition piece with
  boat landing, platform and ladder; grey-white towers above.
- Polish aviation obstruction lighting on turbines: red, synchronised night flashing,
  with a steady low-intensity lamp in the fixture.
- Utility PV in Poland (fixed-tilt south-facing tables ~30°, GCR 0,5–0,6, inverter
  stations on the internal road, perimeter fence, mown grass between rows); winter
  aerial photographs (dark rows on snow).

## Measured

All numbers from `captures/res/s1/*.json` (1600×900, dpr 1, clock pinned at 0). GPU time
is the renderer's timer query on the **Apple M3 Pro, headed Chromium**; the mid-range
projection divides by 2,5 (perf/budget.ts).

Layer cost, headed, `--quality high`, with res minus without (`--modules terrain,sky[,res]`):

| Frame | with res | without | **res delta** |
|---|---|---|---|
| midgame day 1 turn 6 frostHigh, strategic, hud 0 (h2-evening-*) | 9,01 ms · 34 calls · 283 667 tris | 9,35 ms · 25 calls · 210 519 tris | **+9 calls · +73 148 tris · GPU within noise (−0,34 ms)** |
| showcase turn 7 atlanticLow, closeup 10,2 — 24 offshore turbines spinning, lamps on (h2-night-lawica-*) | 6,26 ms · 40 calls · 477 635 tris | 4,50 ms · 26 calls · 377 775 tris | **+14 calls · +99 860 tris · +1,76 ms** |
| showcase turn 4 summerHigh, closeup 12,9 — PV Równina, all four farms in view (h2-pv-noon-*) | 5,97 ms · 49 calls · 923 439 tris | 4,55 ms · 27 calls · 754 007 tris | **+22 calls · +169 432 tris · +1,42 ms** |

Whole game at the judging frame (h2-game-evening, all modules, high): 9,47 ms GPU, 67 calls,
389 041 tris, 14 MB est, 120 fps on the M3 Pro. The budget failure there (9,47 > 6,7 ms) is
terrain + sky (9,35 ms on their own); the res layer's share at the strategic view is inside
the timer's noise. Closeup shares (≤ 22 calls, ≤ 170 k tris, ≤ 1,8 ms) stay inside the brief's
40 calls / 500 k tris. Headless (software GL) logs of every frame: 0 console errors,
0 page errors, budget ok, all modules ready; `f-det-1.png` and `f-det-2.png` (same URL twice)
are byte-identical: md5 `489f30580ad71c39a32749e5e3817f7f`.

Where the closeup milliseconds go (step 2 candidates): at the high tier every tower, nacelle,
rotor and foundation casts a shadow (a second draw of ~1 k-tri rotors × 24), the swept discs
and lamps are two transparent passes; dropping rotor shadow casting beyond the detail
distance and merging the two glow/disc passes into one should halve the delta.

## Latest screenshots

All under `captures/res/s1/` (PNG + JSON). Series: `b-*` arrival state (2026-09-07 code,
old terrain/sky), `c-*` arrival state on today's world, `d-*` after the first fix round,
`f-*`/`g-*` final code (headless, low tier by auto-quality), `h2-*` final code headed at
high quality.

- `g-night-lawica.png` — 22:30 atlanticLow closeup: 24 spinning rotors in different phases,
  red lamp on every nacelle, yellow transition pieces and the platform in the sea.
- `f-night-strategic.png` — the two wind farms as clusters of red lamps from the strategic
  camera (night-satellite read), PV dark.
- `f-game-evening.png` / `h2-game-evening.png` — the judging frame (frostHigh 19:30, all
  modules): red lamp clusters at Ławica and Wydmy, PV as dark rows on snow-white hexes.
- `f-detail-storm-high.png` — storm at the detail camera, high tier: driving rain, every
  rotor parked one blade down with edge-on blades, lamps lit.
- `d-detail-atlantic.png` — the machines up close by day (tower taper, nacelle with tail
  cooler, twisted pre-bent blades, consistent yaw); becalmed in this turn (`still`).
- `d-still-wydmy.png`, `d-dunkelflaute.png` — parked "Y" rotors in frost and in fog.
- `f-pv-noon.png`, `d-pv-wzgorze.png` — PV Równina (16 rows) and Wzgórze (8 rows): dark
  navy rows on a green-brown ground, inverter stations on the east edge, substation yard.
- `f-game-noon.png` — summerHigh noon strategic without HUD (wind farms as white
  clusters, PV as dark hexes).
- `d-game-evening-hud.png`, `d-game-noon-hud.png` — the same frames with the HUD.

## Cross-module needs (change requests, not workarounds)

1. **Showcase frames (src/world/showcase/registry.ts, integrator)** — `offshore-atlantic`
   (turn 4, atlanticLow) lands in a lull of the day's wind series (HUD weather strip under
   the override: open 2,6 m/s, baltic ≈ 3,6 m/s → `still` / crawling, label `~0`), so the
   frame meant to show a spinning offshore farm shows a becalmed one. Proposal: turn 7
   (22:30) or turn 0 under atlanticLow (verified spinning at turn 7, g-night-lawica), and a
   daylight spinning frame, e.g. `{ name: "offshore-running", turn: 2, regime: "atlanticLow",
   camera: "closeup", focus: { col: 10, row: 2 } }` after checking the wind at that turn.
2. **A disabled farm in the judging state (src/world/bridge/showcase.ts)** — no farm in
   `midgame` is `enabled: false`, so the "off" encoding (parked, lamps out) is only a code
   path. Proposal: a scripted `toggleFarm` (or the engine's equivalent action) on
   `farm-pv-wzgorze` or a second onshore farm before the judging turn.
3. **Terrain (render/terrain)** — the white swirl overlay on fields and on my PV tables in
   summerHigh noon closeups (d-pv-noon, d-pv-wzgorze) covers the panels; whichever layer it
   is (wet sheen or cloud), the PV glass should not carry it.
4. **Effects (render/effects)** — the `res:base:<farmId>` hooks (userData farmId, tech,
   offshore, radiusKm) are in place for the curtailment ring / disabled marker; nothing
   consumes them yet.
5. **Board outline (render/core/BoardOutline)** — hex edges are drawn over the sea through
   the offshore farm (visible in every offshore frame).

## Integrator notes (2026-09-11)

- **Dev server**: port 5173 is held by ANOTHER project's Vite server (never touch it). ElectroNation runs on **5174** — `.claude/launch.json` config `game-alt`, or let `scripts/capture.mjs` find/start it: the harness detects a foreign server by the page title and falls back to 5174/5183/5193 on its own (`capture: using the ElectroNation server at …`).
- **Showcase day**: `?showcase=<module>` stages the judging day (ShowcaseSpec.day = 1) unless `--day` overrides it.
- **Layer cost**: `--modules terrain,sky,<module>` vs `--modules terrain,sky` on the same frame gives a like-for-like GPU/draw-call delta.
- **Textures**: `proceduralTexture` and `normalMapFromHeight` pass the texture's own `Rng` as the fourth argument of the pixel/height callback.
