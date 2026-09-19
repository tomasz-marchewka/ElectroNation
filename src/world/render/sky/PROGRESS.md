# render/sky — progress

Hand-over for the next step (ARCHITECTURE.md §7–§8, §18; docs/08 §5–§6).
Step 2 (captures under `captures/sky/s2/`; step 1 under `captures/sky/s1/`).

## Checklist

- [x] 1 Sun light — `LightRig`: DirectionalLight on the engine sun, colour from
  atmospheric transmittance, intensity 3,8·peak^0,7 dimmed by cloud and fog, 0 below
  the horizon (`sunUp` ramp −1,5°…4°); shadow camera follows `view.target`, half-size
  0,8·distanceKm (30…420 km), normalBias from the texel; HemisphereLight; PMREM env
  map generated on finalize only; `EnvironmentProvider` registered in `init()` and
  mutated in place. Step 2 verified at closeup and golden zoom on the terrain
  (`closeup-frost`, `closeup-coldwave`, `closeup-atlantic`, `relief-june-closeup`,
  `relief-jan-golden`): no acne, no peter-panning, cloud shadows present at every
  zoom. The map v1 lowland shows no relief tall enough to cast a readable sun
  shadow at 15° — nothing to fix on the sky side.
- [x] 2 Dome — `SkyDome` + `atmosphere.ts`: single-scattering atmosphere (GLSL and CPU
  twin), seeded stars with a Milky Way band, sun/moon discs, Moon & Spencer overcast,
  twilight floor (−0,8°, fade −9°). Step 2: **aureole knee** (`AUREOLE_KNEE` = 1,2 in
  `atmosphere.ts`, applied in the dome shader and in the CPU `domeRadiance` twin) —
  the forward-scattering peak around a low sun is soft-clipped to ≈ 2,2 so it stays a
  warm glow and not a white sheet; the disc and its glow fade with altitude
  (`discGain` 0,05…1 over 0…20°, `glowGain` 0,25…1).
- [x] 3 Clouds — `Clouds.ts`: FBM coverage at 8 km (+11,5 km on high), sun-lit heaps,
  wind drift with ambient motion, 512² shadow texture on finalize. Step 2: the veil's
  cap at strategic distance lowered (`viewCap` 1 − 0,7·smoothstep(60, 300 km)) so
  heaps never sit between the camera and the board (docs/08 §3); the shadows carry
  the weather there. Verified: `show2-noon-summer-high`, `game-noon-2`.
- [~] 4 Fog, precipitation, transitions — FogExp2 from the regime wash and the view
  distance, colour from the horizon; rain verified at golden and closeup
  (`show-storm-afternoon`, `closeup-atlantic` drizzle streaks slanted by the wind).
  Snow: `coldWave` at 13:30 January regenerates with cloud cover below the 0,4
  precipitation threshold, so the engine gives `kind: "none"` — snowflakes still never
  captured (the shader path exists: round flakes, sway, 0,18 fall). The 1,5 s
  transition exists in code but cannot be verified by a pinned capture (headed run).
- [~] 5 Eight faces — step 1 judged seven regimes at 13:30 January (overview) and June
  summerHigh; step 2 added closeups: frostHigh bright cold snow with crisp air,
  coldWave the same with broken cloud shadows, atlanticLow dull grey-blue with
  drizzle, storm dark with rain, fogHigh milky with no shadows, June transitional
  19:30 warm low sun. Determinism: `det-a`/`det-b` (storm, golden, after every change
  of this step) byte-identical, md5 `331e51e1…`. Still not judged: snow under coldWave
  (see 4), dawn facing the sun (no camera preset looks east at a low pitch).

## Measured (latest JSON, all modules, SwiftShader, tier medium)

- draw calls 19–21 total (sky share ≤ 10), triangles 103 874 (strategic) / 203 234
  (golden and closeup — terrain LOD), points ≤ 11 235 (storm), lines 2 304,
  gpuBytesEstimate 5 051 866, readyMs 2 476–4 405 (showcase), 7 387–14 638 with the
  full HUD (software GL warning only).
- consoleErrors [], pageErrors [], budget.ok true, every module ready in all sky
  captures — except `game-evening` (two `ReferenceError: pxPerKm is not defined`
  from `src/world/hud/WorldLabels.tsx`, another builder's layer mid-change; the
  frame itself rendered).

## Latest screenshots

- captures/sky/s2/show-{noon-summer-high,dawn-transitional,evening-frost,night-fog,storm-afternoon}.png (showcase set)
- captures/sky/s2/show2-noon-summer-high.png (after the strategic cloud cap)
- captures/sky/s2/game-evening.png, game-noon.png, game-noon-2.png, game-noon-static.png (HUD on)
- captures/sky/s2/closeup-{frost,coldwave,atlantic}.png (13:30 January, closeup)
- captures/sky/s2/relief-june-closeup.png, relief-jan-golden.png (shadow/bias check)
- captures/sky/s2/june-evening-lowsun{,2,3}.png, jan-evening-lowsun{,2}.png (low sun, golden)
- captures/sky/s2/dawn-north.png (07:30 January looking south)
- captures/sky/s2/det-a.png, det-b.png (determinism twin)

## Known gaps

- The white blob at the low June sun (`june-evening-lowsun3`, upper left) is NOT the
  dome: three dome changes (disc gain, aureole knee 2,5, knee 1,2) left it pixel-for-
  pixel the same. It sits on the terrain below the horizon line — a glancing specular
  glint of the DirectionalLight on the terrain material. Routed to terrain (change
  request 3).
- The white heaps at the bottom edge of the strategic game frames (`game-noon-2`) do
  not respond to the cloud cap (alpha is multiplied by `uCap`, cap 0,3 there) — they
  are the terrain's south-coast foam/ice, not clouds.
- Snow flakes never captured (engine weather under coldWave/frostHigh stays dry at
  13:30 January); try `--turn 0` or `--day 2/3` under coldWave next.
- Dawn facing the sun needs a camera looking east at ≤ 30° pitch.
- January `noon-summer-high` showcase frame cannot show a deep blue sky (15° sun).

## Change requests

1. `src/world/showcase/registry.ts`: optional `day` on `ShowcaseFrame`; set
   `noon-summer-high` to a June day (16) — a 15° January sun cannot show summer.
2. `scripts/capture.mjs`: `--hud 0` in scenario mode still renders the shell (it only
   drops the world labels/overlays and moves the camera fit); either honour it or add
   `--yaw`/`--pitch` so a dawn frame can face the sun.
3. `src/world/render/terrain`: at a sun below ~8° the land shows a mirror-like white
   glint (`captures/sky/s2/june-evening-lowsun3.png`, top left); raise the land
   roughness at grazing angles / cap `specularIntensity` (≈ 0,3) so a low sun reads as
   warm light on the relief, not a wet sheet.
4. `src/world/hud/WorldLabels.tsx`: `pxPerKm is not defined` (two page errors in
   `captures/sky/s2/game-evening.json`).

## Next step

1. Snow capture: coldWave at `--turn 0` (01:30) or day 2/3; judge flakes at closeup.
2. Dawn facing the sun once a camera option exists (change request 2).
3. Re-run the showcase set and both game frames after any change; keep the
   determinism twin.

## Integrator notes (2026-09-05, before the finishing step)

- Change requests from the terrain builder, routed to you: (1) at the strategic
  distance the haze/fog washes the far half of the board even under summerHigh — cap
  the fog wash reached at fitDistance(55) so the far board keeps ≥ 70 % of its albedo
  contrast, keep the full haze at closeup/golden; (2) every daytime strategic frame
  carries a fine white speckle over ground AND sky (stars or precipitation drawn by
  day) — gate that layer to night / active precipitation and cull by pixel size.
- `?hud=0` now renders the bare world in game mode (App.tsx), so clean sky frames of
  the game state are possible: `--scenario midgame --day 1 --turn 6 --regime frostHigh --camera strategic --hud 0`.
- Performance gate (headed, Apple M3 Pro, high tier, strategic): GPU 9,0 ms/frame
  against 6,7 ms. Cloud layers, the dome and bloom are yours to measure — see the
  terrain notes for the command; report `fps.gpuMs` with and without your layers.

- (2026-09-07, from the grid builder) The grid corridor-golden showcase frame (turn 5,
  summerLow, 16:30) is full of large snow-like precipitation particles in summer —
  check the precipitation kind/size mapping: rain drops must not read as 8 px
  snowflakes (captures/grid/s1/c-showcase-corridor-golden.png).
