# render/plants — progress

Hand-over between pipeline steps. Written at the start of a step, updated after every
finished sub-task, rewritten at the end.

## Step 1 (2026-09-07) — module core: DONE, judged in captures

Found on arrival: `geometry.ts` (21 archetype builders with `color` / `aEmit` / `aWall`
vertex attributes and km-planar UVs, 2026-09-06) from an interrupted step, no PROGRESS.md,
no captures; its header named `layout.ts` and `materials.ts`, which did not exist, and
`index.ts` was the stub. Kept `geometry.ts` as found (its sizes come from HEIGHT_KM and
STRUCTURE_EXAGGERATION) and built the rest on it.

### What exists now

- `layout.ts` — one deterministic site plan per plant from `ctx.rng("plants:<id>")`: four
  technology plans (nuclear: dome + turbine-hall bay + auxiliary per block, two
  natural-draught towers behind, switchyard east, offices west; coal: boiler house + tall
  stack per block, brick turbine hall in front, one tower west (two from four blocks),
  coal yard with 1–3 stockpiles and an inclined conveyor gallery behind, switchyard;
  CCGT: HRSG + gas-turbine enclosure + intake + medium stack per block, steel turbine
  hall, air-cooled condenser banks east, gas pipe rack and metering station west,
  switchyard in front; OCGT: package unit with short exhaust stack + transformer per
  block, pipe rack, two portals, control building, offices). Units stand in a row along
  the site axis, hall segments tile per block into one long hall, unit width scales with
  the block's rung (0,55–1). The pad is an ellipse sized by the plan's extent, clamped to
  the terrain's flat building pad (PLANT_SITE_KM / 2 = PAD_FLAT_KM 4 km), fence and masts
  on its rim, floodlight pools inside; the front faces south so the close presets never
  see the units hidden behind the towers (yaw jitter ±30°). Plume mouths, obstruction
  lights, per-block state glows and hook anchors come out of the same plan.
- `materials.ts` — seven PBR surfaces with procedural albedo + normal maps (concrete with
  form-panel seams and stains, painted corrugated steel with rust runs in two tints,
  brick courses sooted at the foot, coal lumps, yard asphalt/slabs/gravel, the stack's
  banded concrete with red-white obstruction bands over the top fifth and soot at the
  lip); one `onBeforeCompile` hook shared by all of them reads `aEmit` / `aWall` and the
  instanced `enState` (online, warm-up, load, seed): a window band on the halls (glass by
  day, warm × night × online, ORANGE × warm-up at any hour, per-window hash keeps some
  dark), furnace louvres on the bunker bay following the load (orange while starting),
  lamp heads on the masts at night, a faint exhaust heat on the gas units; snow on
  up-facing surfaces above `ctx.terrain.snowlineKm` (not on coal or stacks). Plume
  ShaderMaterial: camera-facing soft puffs (gaussian × noise texture), position computed
  in the vertex shader from the puff's phase and the plume clock — buoyant rise levelling
  off, drift with the wind, seeded wobble by gustiness, growth and thinning with age,
  the tail cut by strength (load), a 2,5 px floor; lit by the sun's view-space direction
  and the sky ambient, warmed from below at night; fogged. Glow ShaderMaterial (per
  instance colour, ≥ N px, night-gated unless `enGlow.y` says always): red obstruction
  lights blinking at 0,5 Hz only under ambient motion, and the block-state glows.
  Floodlight pools: additive ground quads grown to ≥ 2 px, paying in brightness.
- `index.ts` — one InstancedMesh per archetype for the whole country (21) + puffs +
  obstruction lights + block glows + floodlight pools; rebuild key = seed, board, tier,
  plant id / hex / tech / capacity / footprint / block MWs; a turn that changes block
  states rewrites one vec4 per instance and one float per puff and eases them over 1,5 s
  (`ctx.motion.transitions`, never with a pinned clock). Plume clock advances only under
  `ctx.motion.stateful`, blink clock only under `ambient` (steady red otherwise); every
  animated signal has its static twin (emission, glow, the frozen plume shape). Detail
  archetypes (fence, masts, racks, portals, transformers, offices, conveyor) and the
  floodlight pools hide beyond 300 km × quality.detail; big silhouettes cast shadows only
  within 220 km. Hooks for effects: `plants:base:<plantId>` (userData: plantId, tech,
  radiusKm, padKm, yaw, outputMw, usedMw, dumpMw, controlMode, automation, shown) and
  `plants:block:<plantId>:<index>` (mw, status, load, warmup).

### Checklist (from the brief)

- [x] 1 Layout — four plans, one unit per block, shared structures, pad by extent.
- [x] 2 Materials — PBR + procedural normals, shared state hook, roof snow.
- [x] 3 State encoding — offline dark / cold, starting orange (windows, louvres, glow,
      wisp), online warm windows × night + plume / vapour by `load` (output, not setpoint).
- [x] 4 Plumes — instanced billboards, seeded phases, wind drift, stateful clock.
- [x] 5 Night — mast heads + pools, windows, red obstruction lights (ambient blink).
- [x] 6 Module — instancing, diff, LOD, shadows, hooks.
- [x] 7 Verification — see below. Headless day-1 showcase walk (`h-*`) was still running
      at the end of the step; `a-*` is the harness's own day-0 walk.

### Judgement of the latest frames (harsh art director + dispatcher)

- `g-detail-coal-evening.png` (detail 18 km, 19:30 frostHigh, whole game): the hero read —
  block 1 (online 750 MW) warm-white windows and its half of the turbine hall, block 2
  (starting, 1 turn left) ORANGE windows, orange bunker louvres and its half of the hall,
  smoke only from the running stack, a wisp from the other, red obstruction lights, the
  tower's vapour, floodlit yard, switchyard, the HV lines arriving. Dispatcher: "which
  block runs / starts" answered without a click. Art: halls glow like lanterns (window
  band too uniform, AD ≈ 7), yard and coal pile lost in the dark, no shadows at night.
- `c-coal-evening.png` / `-zoom.png` (showcase closeup, day 1): the same read at 42 km.
- `c-nuclear-noon.png` (showcase closeup, day 1): two dense white vapour columns from
  the towers, domes / halls / switchyard in front, grey pad. Vapour still a little
  cottony; domes small beside the towers (real proportions, kept).
- `g-close-nuclear-evening.png`: vapour lit warm from the yard at night, floodlights, the
  amber trunk leaving the site, the wind farm beside it — a strong frame.
- `g-evening-bare.png` + `-zoom-*.png` (strategic judging frame): EW Łęgi a warm speck
  with an orange half and a smoke smudge, EJ Bałtyk a dot with a lit vapour wisp and the
  amber trunk; present but MARGINAL at 1× — the strategic-distance read is the first item
  of step 2. `g-noon-bare.png`: EJ Bałtyk's plume and EW Łęgi's pad + smoke visible.
- `c-ccgt-golden.png`: unusable — the golden preset at 110 km in transitional haze shows a
  speck; the CCGT needs a closeup frame (change request below).
- `c-ocgt-night.png`: a ring of floodlight pools around a warm-lit package — "a small lit
  yard"; the 0,3 km units are 8 px at 42 km, so the OCGT identity lives in the yard.
- `g-close-ccgt-evening.png`: lit site with a stack light; the online state of a 400 MW
  CCGT is not distinguishable from the OCGT at night — the wisp is too faint.
- `a-nuclear-noon.png` (harness walk, day 0): orange glows on the domes and no vapour —
  correct: at day 0 turn 4 the nuclear blocks are still in their 8-turn cold start.

### Measured (Apple M3 Pro, headed Chromium 1600×900, high tier, day 1)

- Nuclear closeup 13:30 summerHigh: terrain + sky + board 6,70 ms GPU / 27 calls /
  754 007 tris → with plants 6,99–7,13 ms / 63 / 778 985 → **plants +0,3 ms, +36 calls
  (shadow pass included), +25 k tris**. Coal closeup 19:30 frostHigh: 7,22 / 26 / 377 775
  → 7,44 / 51 / 393 113 → **+0,2 ms, +25 calls, +15 k tris**. Strategic 19:30 frostHigh:
  7,14 / 25 / 210 519 → 7,23 / 42 / 220 831 → **+0,1 ms, +17 calls, +10 k tris**. GPU
  ms is noisy run to run (identical det frames: 8,04 vs 6,95 ms); the base alone sits at
  the 6,7 ms line, as terrain / grid / cities reported.
- Whole game (all modules): strategic evening 7,0–8,0 ms / 67 calls / 389 041 tris; noon
  6,3–8,2 ms / 69 / 643 403; closeups 86–114 calls / 605 k–1,11 M tris (res and cities
  in). GPU estimate 13–14 MB for the whole scene; this module's textures: six 256² albedo
  / normal pairs (coal 128²), a 64² puff, a 64² dot.
- Headless (SwiftShader, as the harness runs it): `a-*` day-0 walk tier low (auto),
  24–32 calls, 125–170 k tris, 8,2 MB, budget ok, no errors, all modules ready;
  `h-nuclear-noon` (day 1) 30 calls / 169 946 tris, budget ok.
- Determinism: `det-1` / `det-2` (headed, closeup 6,9, turn 6 frostHigh, bare) md5
  `6acb7197c4ae212488d05564bdcff224` both (`det.md5`).
- Every JSON of this step: consoleErrors [], pageErrors [], all modules ready; budget.ok
  true on every headless frame; headed frames fail only the GPU-ms line the base already
  fails.
- Gates at the end of the step: prettier, `npm run lint`, `tsc -p tsconfig.json`
  (clean for this folder; `render/res/lights.ts` has another builder's error),
  `vitest --project unit` (516 tests) — green.

### Known gaps → step 2

1. Strategic read at night: the block glows (≥ 4,5 px) drown in the windows; try a warm
   site halo scaled by output (like the cities' dome), a brighter lit vapour, a larger
   orange glow while starting; by day the smoke needs more contrast on grass.
2. Halls glow as lanterns at closeup: shape the window band (fewer, taller panes, dark
   piers, a per-block occupancy), dim the far average further, add a roof monitor glow.
3. Vapour is still a little cottony; smoke too pale by day and too faint at night — tune
   per kind (albedo, alpha, lit-from-below), add a second thin "heat" puff kind for CCGT.
4. Coal yard invisible at night; the stockpiles need a floodlit sheen; conveyor gallery
   lights. Nothing yet reads "coal" at the strategic view except the stacks.
5. OCGT / CCGT identity at night is only the yard; give the gas units an exhaust heat
   glow proportional to load and the ACC a fan-deck light.
6. Only the midgame plants (1–2 blocks) were judged; 3–6 block layouts never seen.
7. The 1,5 s state transition is verified by code only (pinned clock in every capture).
8. `dumpMw` (surplus nobody took) has no encoding yet.

### Change requests (outside this folder)

- `showcase/registry.ts`: (a) showcase walks are built at DAY 0 (`App.tsx`:
  `dayIndex: params.day ?? 0`), where EJ Bałtyk is still starting; give `ShowcaseSpec`
  a `day` (1 for plants) or default showcase captures to `DEFAULT_SHOWCASE.dayIndex`;
  (b) replace `ccgt-golden` (110 km in haze, a speck) with a closeup on 17,8 at turn 6
  frostHigh; (c) add a `detail` frame on 6,9 at turn 6 frostHigh — the module's best read.
- `bridge/labels.ts`: the plant label prints `plant.setpointMw` (`EW ŁĘGI · 0/1 500`,
  `EC WIERZBNIK · 0/400`) while the blocks run under block control — the sum of block
  setpoints (or outputs) would match what the world shows.
- `render/effects`: rings at `plants:base:<id>`, cranes at `plants:block:<id>:<i>` for
  expansions; a dump/curtailment marker from `userData.dumpMw`.
- `scripts/capture.mjs`: a `--modules` override (or `--without <module>`) so a layer can be
  measured against the same frame without it; today the terrain showcase stands in.
- `render/core/textures.ts`: `normalMapFromHeight` takes a `fields` map that may be
  empty — fine — but a seeded `Rng` is not reachable from the height callback; a
  `rng` argument would let normal maps carry the same grain as their albedo.

### References (used)

- Nuclear: Temelín / Dukovany (two PWR containments beside a pair of natural-draught
  cooling towers, long turbine hall, switchyard); Sizewell B's single dome.
- Coal: Bełchatów and Kozienice — boiler houses ~100 m tall in a row, one 250 m stack per
  block with red-white obstruction bands, coal yard with long stockpiles and inclined
  conveyor galleries, cooling towers; Battersea for the brick turbine hall.
- CCGT: Płock and Stalowa Wola CCGT — HRSG boxes with medium stacks, long turbine hall,
  air-cooled condenser bank on legs, gas pipe rack.
- OCGT: peaking plants of container-sized package units (GE LM6000 / TM2500 sites): short
  exhaust stacks, filter houses, fenced gravel yard, pipe rack, small switchyard.
- Cooling-tower plumes and stack smoke photography at golden hour; night aerial
  photography of power plants (floodlit yards, red obstruction lights); Anno 1800 /
  Transport Fever 2 for readable industry at map distance.

### Latest screenshots (captures/plants/s1/)

- `g-detail-coal-evening.png` — the hero read (18 km, 19:30 frostHigh, whole game).
- `c-nuclear-noon.png`, `c-coal-evening.png`, `c-ccgt-golden.png`, `c-ocgt-night.png`
  (+ `-zoom.png`) — showcase set, headed high tier, day 1.
- `g-evening-bare.png`, `g-evening-hud.png`, `g-noon-bare.png`, `g-noon-hud.png`
  (+ `g-evening-bare-zoom-*.png`, `g-noon-bare-zoom-west.png`) — judging frames.
- `g-close-nuclear-evening.png`, `g-close-ccgt-evening.png`, `g-close-ocgt-noon.png`,
  `g-close-modrzyca-noon.png` — closeups per plant.
- `p-strategic-with.png` / `p-strategic-without.png`, `b-base-*.png` — perf pairs.
- `det-1.png` / `det-2.png`, `det.md5` — determinism twin.
- `a-*.png` — headless harness walk (day 0, tier low); `h-*.png` — headless day-1 walk;
  `b-*.png` — headed day-0 walk before the art fixes.

## Integrator notes (2026-09-11)

- **Dev server**: port 5173 is held by ANOTHER project's Vite server (never touch it). ElectroNation runs on **5174** — `.claude/launch.json` config `game-alt`, or let `scripts/capture.mjs` find/start it: the harness now detects a foreign server by the page title and falls back to 5174/5183/5193 on its own (`capture: using the ElectroNation server at …`). Pass `--url http://localhost:5174` only if you need to be explicit.
- **Showcase day**: `?showcase=<module>` now stages the judging day (ShowcaseSpec.day = 1) unless `--day` overrides it — `--showcase <module> --all` walks the frames at day 1 (nuclear online, Łęgi corridor mid-upgrade, second coal block starting).
- **Layer cost**: `--modules terrain,sky,<module>` vs `--modules terrain,sky` on the same frame gives a like-for-like GPU/draw-call delta.
- **Textures**: `proceduralTexture` and `normalMapFromHeight` pass the texture's own `Rng` as the fourth argument of the pixel/height callback (deterministic per-texel draws).
- Applied from your step-1 change requests: showcase frames now `nuclear-noon`, `coal-evening`, `ccgt-evening` (closeup 17,8, turn 6, frostHigh — replaces ccgt-golden), `coal-detail-evening` (camera detail 6,9, turn 6, frostHigh), `ocgt-night`; the plant label prints the STANDING ORDER — the sum of block orders under manual control (`EW ŁĘGI WĘGIEL · 1 250/1 500` at the judging turn), via `src/app/dispatch.ts` in the SVG map and the world alike; `--modules` exists; the Rng reaches the height callback; hooks `plants:base:<id>` / `plants:block:<id>:<i>` are recorded in docs/STATUS.json for effects.
- Verified by the integrator: `captures/integrator/modules-with-plants.png` (day 1 turn 6, detail 6,9): block 1 warm-white, block 2 orange, one smoking stack, red obstruction lights — 0 errors.
