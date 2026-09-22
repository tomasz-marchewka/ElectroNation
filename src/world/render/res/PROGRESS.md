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

## Step 2 (2026-09-20) — the swept disc works; pass and shadow trim; verification

What the interrupted run of 2026-09-19 left: `discGeometry()` stripped the `uv` attribute,
and the disc shader reads its radial density from exactly that (`length(uv * 2 - 1)`) —
every disc was drawn with alpha 0, so the step-1 "swept disc" existed in no frame. Kept as
the opening repair. It also left unrecorded arrival captures (`captures/res/s2/{probe,pre,base}-*`)
on this week's terrain/sky. `tsc` and ESLint were clean.

### What changed this run

1. **The disc is visible again** — uv restored (`turbine.ts`), and once drawn it needed
   strength: density at cut-in / rated 0,42 → 0,90, denser body (0,62) and tip ring (0,55),
   haze fade gentler (`alpha *= 1 - 0,45 * fogFactor`), and `uOpacity = 0,3 + 0,7 * daylight`
   per frame — the disc is the *daylight* signal; after dusk the lamps carry the state, and a
   lit grey disc on the night sky would be a lie (step 1 judged mostly at night, which is
   exactly why its absence went unnoticed).
2. **Glow pass culled when nothing is lit** — `pools.glow.setVisible(lampsLit)`; in a
   daylight frame every lamp intensity is 0, so the additive pass draws nothing and is
   skipped outright.
3. **Rotor shadows follow the detail LOD** — `rotor` / `rotorFeathered` cast only when
   `profile.shadows && detailVisible` (kept in sync in `applyQuality` and `setDetail`).
   Past the detail distance a blade is sub-pixel; its shadow was a second ~1 k-tri draw per
   turbine for nothing. Towers, nacelles and foundations keep casting at every distance.

### Judged this run (docs/08 §3 encoding)

| State | Result | Frame |
|---|---|---|
| spinning, day | translucent disc (density ∝ speed), per-turbine blade phases; a sliver at the near edge-on atlantic yaw (wind 250° against the closeup camera), unmistakable face-on | `t1-discfix-day`, `c3-offshore-atlantic`, `c2-disc-faceon` (yaw 70) |
| spinning, night | red lamps per nacelle, disc a whisper (uOpacity 0,3) — night reads as in step 1 | `t2-discfix-night`, `c3-offshore-night` |
| still | parked "Y", no disc | `d1-turbine-detail` (day 16 turn 4, summerHigh lull 2,7 m/s < cut-in) |
| feathered | one blade down, no disc | `c3-onshore-storm`, `f-detail-storm-high` (s1) |
| off, wind | parked + lamps out — code path only; no disabled wind farm is staged | — |
| off, PV | **no res encoding**: disabled `farm-pv-wzgorze` (set off by `bridge/showcase.ts` before day 1 turn 4) is pixel-identical to the enabled `farm-pv-rownina` at the golden camera | `e4-pv-off-pair` |
| PV, glint | in-lobe noon = bright silver tables (30° south tables reflecting the noon sun) | `e3-pv-glint-lobe` (yaw 180, pitch 75) |

### Verification

- **Showcase, high tier, headless** (`c3-*`): atlantic turn 4 (49 calls / 924 663 tris),
  night turn 7 (40 / 478 931), storm turn 5 (41 / 346 520), pv-noon turn 4 (49 / 924 231),
  dunkelflaute turn 4 fogHigh (47 / 923 367) — all modules ready, 0 console / 0 page errors,
  budget ok (software GL: fps not a gate); the same cameras without the layer are `base-*`.
- **Determinism**: res-only twin (`terrain,sky,res`, same URL twice) byte-identical, md5
  `af19e1e477dbbf747fb72b2d93aae1f4` (`e2-*`). Full-game twin (`e1-*`) differs: 103 464 px
  differ, 6 739 beyond channel tolerance, bbox x 0–1198, y 160–557 — outside the res layer
  (its twin is exact); see the change requests.
- **GPU (M3 Pro, headed, high, `--fps-frames 120`)**, same frames with and without the
  layer — numbers in Measured. Verdict: the strategic frame fails the 6,7 ms budget with
  *and* without res (terrain + sky are 6,97 ms on their own); the closeup with res misses it
  by 0,12 ms (6,82) while the base passes (5,21).
- **Gates**: `prettier` unchanged, `npm run lint` clean, `tsc` (app + engine wall) clean,
  `vitest run --project unit` 516/516 in 40 files (one cold-start run failed a single test
  before any of this run's files changed; it did not reproduce in six repeats).

### Open / next step

- **Strategic PV glint cannot resolve** — the farm is ~10 px and the lobe meets the
  strategic camera only at low sun (June noon reflects at ~3° elevation south). Judge the
  glass from a lobed camera (`e3-*`) or accept.
- **Disabled PV farm has no res encoding** (off is a wind state in docs/08 §3) — needs an
  effects marker on `res:base:<farmId>` (still unconsumed) if the game wants it readable.
- **Disc art at grazing yaw** — geometry, not code: a show frame with the rotor plane more
  face-on to the closeup camera would judge the disc and the phase spread better.
- **`onshore-storm` frame** is the `golden` camera at focus 7,3 — the turbines are ~10 px
  and the feathered silhouette cannot be judged; a `detail` / `closeup` frame is owed.
- **`dunkelflaute` closeup** is near white-out; the parked farm reads as a grey ghost.
- **Terrain sheen** is still drawn over the PV tables in noon closeups (repeat of the s1 ask).
- **Budget**: the res share at the strategic view is inside the timer noise; at the closeup it
  is +1,61 ms / +15 calls / +101 156 tris. Both trims landed inside the timer's noise (step 1:
  +1,76 ms on the same frame; that run's baselines moved by ~+0,7 ms with terrain/sky).
  Nothing big left on the layer itself.

## Step 3 (2026-09-21) — critic fix round (nine ranked issues)

The critic's r2 read of step 2 raised nine issues; this run fixed all nine in-module and
captured the evidence (`captures/res/s3/`). `tsc` and ESLint were clean on arrival.

### What changed this run

1. **Disc read as hard plates at dusk** — the cap fell too late and too flat. `lights.ts`:
   hub mask `mix(1.0, 0.28, smoothstep(0, 0.85, r))`, edge `1 − smoothstep(0.3, 1, r)`, tip
   ring removed, `alpha = uOpacity · vStrength · 0.62 · hub · edge`; `index.ts`:
   `uColor = 0.25 + 0.5 · daylight`, `discOpacity = 0.75 · daylight²`, pool hidden below
   0.01 — the disc now lives in the day band and fades out well before the lamps take over.
   Judged: `f6-dusk-atlantic` (turn 5, civil dusk ≈ 0.35) — no plates, lamps carry the read.
2. **Disabled farm had no encoding** (docs/08 §3) — new `marker.ts` (terrain-following
   bands, LIFT 0.035 km): a stencil `offMarkerGeometry` (band + boss, `offMarker` grey) on
   every disabled wind farm, `pvTableOff` pool with `offPanel` for disabled PV tables, plus
   per-farm identity bands — hex `frameWind` (0.8 km) for onshore wind, fence band `framePv`
   (0.7 km) for PV; offshore farms get none (the sea already says it). Judged:
   `f5-pv-off-golden` (Wzgórze grey rows + frame vs dark enabled Równina),
   `g1b-strategic-noon` (all four farms identified).
3. **Blade normals inverted** — the blade winding faced inward on the sides *and* both caps
   (verified numerically), so the white blade read black against the sky. `turbine.ts`:
   sides `a, c, b / a, d, c`, root cap `root, p, p+1`, tip cap `tip, tipBase+p+1, tipBase+p`.
   Judged: `f7-atlantic-onshore` — bright blades against the dark overcast terrain.
4. **Strategic accents** — the frames in (2) are the accent: at strategic the farm reads as
   a frame, not a cluster of sub-pixel rotors.
5. **Dunkelflaute near-white-out** — not a res bug: sky's fog fix landed; `f4-dunkelflaute`
   now reads the parked farm.
6. **PV inverter blocks** — pad 0.52 × 0.38 km, smaller container, `CONCRETE_BEIGE`,
   reworked transformer/radiator, portal posts + beam (`pv.ts`).
7. **Offshore transition piece** — platform radius 0.15 → 0.105 km, weathered yellow
   (0.72, 0.55, 0.14), boat landing added (deck + rails + ladder). Judged: `f3-offshore-storm`.
8. **PV fence** — `chainLinkAlpha()` alphaMap, brighter wire (0.5 + 0.35), fence colour 0.72
   at 0.9 opacity. Judged: `f8-pv-detail` (18 km, fence line + inverter stations).
9. **Showcase verification** — every frame of the suite re-captured bare (below), plus a
   full-game HUD pair (`g3`/`g4`), a determinism twin (`t1`) and the headed layer-cost pair
   (`h1`/`h2`).

New colour/material surface: `offPanel` (0.33, 0.34, 0.35), `framePv` (0.66 grey),
`frameWind` (0.54, 0.51, 0.44 gravel), `offMarker` (0.52 grey); `ResMaterials` interface and
`dispose` extended; `clearStatic` disposes frame/off meshes per rebuild.

### Judged this run

| Issue | Frame | Result |
|---|---|---|
| 1 disc / dusk plates | `f6-dusk-atlantic` | no plates; lamps carry the read; disc fades by design |
| 2 disabled farm | `f5-pv-off-golden`, `g1b-strategic-noon` | Wzgórze grey + frame; enabled Równina dark; offshore has no frame |
| 3 blades overcast | `f7-atlantic-onshore` | blade read bright; normal fix verified |
| 4 strategic accents | `g1b-strategic-noon` | four farms identified by frames at strategic |
| 5 dunkelflaute | `f4-dunkelflaute` | farm legible (sky fix) |
| 6 inverters | `f8-pv-detail` | beige boxes at fence line, no white slabs |
| 7 TP / boat landing | `f3-offshore-storm`, `f9-offshore-night` | smaller weathered TP, landing present |
| 8 PV fence | `f8-pv-detail` | fence line reads at 18 km |
| 9 suite | `f1`–`f9`, `g3`, `g4` | all frames 0 errors, budget ok |

### Verification

- **Showcase (headless, high, bare)**: `f1-pv-noon` (53 calls / 926 789 tris),
  `f2-offshore-atlantic`, `f3-offshore-storm` (53 / 927 221), `f4-dunkelflaute`,
  `f5-pv-off-golden`, `f6-dusk-atlantic`, `f7-atlantic-onshore` (53 / 927 221),
  `f8-pv-detail` (53 / 926 789), `f9-offshore-night` (43 / 479 737) — all modules ready,
  0 console / 0 page errors, budget ok, HUD off.
- **Game frames**: `g3-game-frost-hud` / `g4-game-frost-nohud` (day 1 turn 6 frostHigh,
  strategic, 41 calls / 132 076 tris) — res coexists with the HUD; at strategic the turbines
  are sub-pixel, the frames carry the read (same as step 2's finding).
- **Determinism twin**: `t1-twin-a/b` byte-identical, md5
  `dc99bf80b77afe93a84d425e0de732aa`.
- **Headed layer cost** (M3 Pro, high, `--showcase res` summerHigh strategic, `--fps-frames 30`):
  without 20 calls / 103 874 tris / 15.34 ms; with 36 / 203 652 / 15.23 ms →
  **+16 calls · +99 778 tris · GPU within noise**. Both runs fail the 6.7 ms budget
  identically (two foreign SwiftShader captures saturated the CPU during the measurement) —
  the failure is not attributable to res.
- **Gates** (2026-09-21): `prettier --write` unchanged (8 files); `npm run lint` exit 0;
  `tsc -p tsconfig.json --noEmit` exit 0; `vitest run --project unit` 515/516 — the one
  failure (`perf-year.test.ts`, 288-turn loop 448 ms > 300 ms) is engine timing under the
  CPU load of two foreign SwiftShader captures and passed 2/2 on immediate re-run.

### Open / next step (step 3)

- **Wind off is still unstaged** — only the PV farm can be switched off by the showcase, so
  the wind off-marker is judged from `f5` on PV only; the wind stencil shares the code path
  but has no frame. Change request below.
- **Strategic turbines are sub-pixel** — the frames are the honest strategic accent; per-farm
  icons belong to effects/cities, not res.
- **`h1-layers-nores`/`h2-layers-res`** — re-measure the headed pair when no foreign
  capture is running to get a clean gpu delta.

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
and lamps are two transparent passes. **Step-2 status:** both candidates landed — the glow
pass is skipped when no lamp is lit (daylight) and rotor shadow casting follows the detail
LOD; the remaining res share is the tower / nacelle / foundation shadow pass and the disc
pass itself.

### Step 2 (2026-09-20, `captures/res/s2/*.json`)

Headed, high, clock pinned; with res minus without (`--modules terrain,sky[,res]`):

| Frame | with res | without | **res delta** |
|---|---|---|---|
| strategic day 1 turn 6 frostHigh (`h2-strategic-*`) | 6,79 ms · 34 calls · 283 667 tris · 10 MB est | 6,97 ms · 25 calls · 210 519 tris · 9 MB est | +9 calls · +73 148 tris · GPU inside noise; **both fail** 6,7 ms — baseline terrain+sky alone is 6,97 |
| showcase turn 7 atlanticLow closeup 10,2, night lamps (`h2-closeup-*`) | 6,82 ms · 40 calls · 478 931 tris · 10 MB est | 5,21 ms · 25 calls · 377 775 tris · 9 MB est | +15 calls · +101 156 tris · +1,61 ms; with res misses the budget by 0,12 ms |

Headless showcase pairs (`c3-*` vs `base-*`) confirm the same draw calls / triangle counts
at 0 errors with the layer on and off; the full logs are in `captures/res/s2/logs/`.

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

`captures/res/s2/` (step 2; high tier unless noted, HUD off):

- `probe-*`, `pre-*`, `base-*` — arrival state, the five showcase cameras before the fixes,
  and the same cameras without the layer (terrain+sky only).
- `t1-discfix-day.png`, `t2-discfix-night.png` — first frames after the uv repair (day disc;
  night lamps).
- `c2-disc-faceon.png` — detail camera yaw 70 on the offshore farm: the swept disc face-on,
  blade phases spread; `c3-offshore-atlantic.png` shows the same disc near edge-on.
- `c3-*` — the five showcase frames at high tier with HUD off: atlantic turn 4, night turn 7,
  storm turn 5, pv-noon turn 4, dunkelflaute turn 4.
- `d1-noon-strategic(-hud).png`, `d1-evening-strategic(-hud).png` — the step-1 judging cameras
  re-taken for comparison; `d1-pv-detail.png`, `d1-turbine-detail.png` — day-16 detail frames
  (PV tables in the sun; a parked "Y" in the summerHigh lull).
- `e1-twin-a/b.png` — the full game twice (differs outside res); `e2-res-twin-a/b.png` — the
  res-layer twin, byte-identical (`af19…`).
- `e3-pv-glint-lobe.png` — yaw 180 / pitch 75 at PV Równina at noon: the sun glint in the lobe.
- `e4-pv-off-pair.png` — golden camera on both PV farms after Wzgórze is switched off: no
  difference visible (change request).
- `h2-strategic-{res,base}.png`, `h2-closeup-{res,base}.png` — the headed GPU pairs.

`captures/res/s3/` (step 3; high tier, HUD off unless noted):

- `f1-pv-noon`, `f2-offshore-atlantic`, `f3-offshore-storm`, `f4-dunkelflaute`,
  `f5-pv-off-golden`, `f6-dusk-atlantic`, `f7-atlantic-onshore`, `f8-pv-detail`,
  `f9-offshore-night` — the showcase suite captured one frame at a time (the `--all` batch
  still dies mid-run, see integrator notes).
- `g3-game-frost-hud`, `g4-game-frost-nohud` — the day 1 turn 6 frostHigh strategic pair.
- `t1-twin-a/b` — determinism twin, md5 `dc99bf80b77afe93a84d425e0de732aa`.
- `h1-layers-nores`, `h2-layers-res` — headed layer-cost pair (see Step 3 verification).

## Cross-module needs (change requests, not workarounds)

Resolved since step 2 (do not re-request): the disabled-farm marker (res now draws the
`off` stencil and the `pvTableOff` rows in-module, Step 3 issue 2), the offshore lull (the
integrator's `?regime=` override drives the wind now; `c3-offshore-atlantic` spins), the
board outline over the sea, and the disabled-farm action (`bridge/showcase.ts` turns
`farm-pv-wzgorze` off before day 1 turn 4). Still open:

1. **Showcase scenarios (bridge/showcase.ts, integrator)** — a wind farm switched
   `enabled: false` has no staging: `?showcase=res` can only turn off `farm-pv-wzgorze`
   (PV). The wind off stencil (Step 3 issue 2) shares the code path but cannot be captured;
   proposal: a scenario action or a capture parameter that disables a named wind farm.
2. **Showcase frames (src/world/showcase/registry.ts, integrator)** — `onshore-storm`
   (turn 5) uses the `golden` camera at focus 7,3; the turbines are ~10 px and the feathered
   silhouette cannot be judged. Proposal: `detail` or `closeup` on a turbine cluster.
3. **Showcase frames (registry, integrator)** — a spinning-offshore frame with the rotor
   plane more face-on to the camera would let the disc and the phase spread be judged as art
   (atlantic wind 250° makes the closeup see the disc nearly edge-on, by geometry).
4. **Terrain (render/terrain)** — the white sheen overlay is still drawn over my PV tables in
   summerHigh noon closeups (`c3-pv-noon`, `d1-pv-detail`), hiding the glass; it should stay
   on the terrain surface.
5. **Sky / terrain** — `c3-dunkelflaute` (fogHigh closeup) is near white-out; the parked farm
   reads as a grey ghost. Soften the fog at that frame or the state cannot be judged.
6. **Sky / effects / cities (owner TBD)** — the full-game twin (`e1-a` vs `e1-b`, same URL,
   pinned clock) is not byte-identical: 103 464 px differ, 6 739 beyond channel tolerance,
   bbox x 0–1198, y 160–557. The res-only twin (`terrain,sky,res`) is exact, so the
   difference is in another layer; worth a look at dt/time accumulation under `?clock=0`.

## Integrator notes (2026-09-11)

- **Dev server**: port 5173 is held by ANOTHER project's Vite server (never touch it). ElectroNation runs on **5174** — `.claude/launch.json` config `game-alt`, or let `scripts/capture.mjs` find/start it: the harness detects a foreign server by the page title and falls back to 5174/5183/5193 on its own (`capture: using the ElectroNation server at …`).
- **Showcase day**: `?showcase=<module>` stages the judging day (ShowcaseSpec.day = 1) unless `--day` overrides it.
- **Layer cost**: `--modules terrain,sky,<module>` vs `--modules terrain,sky` on the same frame gives a like-for-like GPU/draw-call delta.
- **Textures**: `proceduralTexture` and `normalMapFromHeight` pass the texture's own `Rng` as the fourth argument of the pixel/height callback.
- **Showcase batch (2026-09-20)**: `--showcase res --all` (headless) died at the third frame
  ("Target page, context or browser has been closed"); capturing frames one at a time worked
  every time.
- **`--clock 0`** freezes the clock: rotors hold their seeded per-turbine phases (deterministic),
  the lamp blink sits wherever the phase puts it (`BLINK_OFF` keeps every lamp lit). `--yaw` /
  `--pitch` are in the harness and are the way to judge grazing geometry (`c2-*`, `e3-*`).
- **Twin check**: same URL twice, compare PNG md5; the res-layer twin is exact
  (`e2-*`: `af19e1e477dbbf747fb72b2d93aae1f4`), the full-game twin is not (`e1-*`).
