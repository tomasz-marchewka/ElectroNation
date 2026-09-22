# render/sky — progress

Hand-over for the next step (ARCHITECTURE.md §7–§8, §18; docs/08 §5–§6).
Finishing step (2026-09-21): captures under `captures/sky/s3/`; step 2 under
`captures/sky/s2/`, step 1 under `captures/sky/s1/`.

## Checklist

- [x] 1 Sun light — `LightRig`: DirectionalLight on the engine sun, colour from
  atmospheric transmittance, intensity 3,8·peak^0,7 dimmed by cloud and fog, 0 below
  the horizon (`sunUp` ramp −1,5°…4°); shadow camera follows `view.target`, half-size
  0,8·distanceKm (30…420 km), normalBias from the texel; HemisphereLight; PMREM env
  map generated on finalize only; `EnvironmentProvider` registered in `init()` and
  mutated in place. Finishing step: under a heavy overcast (`overcastMix` ≥ ~0,9) the
  direct term is softened further (`×(1 − 0,35·overcastMix)`) and the hemispheric share
  is up (`1,25·(1 + 0,45·overcastMix)`), so machines stop showing hard black/white
  faces; cloud dimming is `1 − 0,9·cover^1,5`.
- [x] 2 Dome — `SkyDome` + `atmosphere.ts`: single-scattering atmosphere (GLSL and CPU
  twin), seeded stars with a Milky Way band, sun/moon discs, Moon & Spencer overcast,
  twilight floor (−0,8°, fade −9°). Aureole knee 1,2; disc/glow gains by altitude.
  Finishing step: stars are gated by the sun's altitude (`smoothstep(2, −8, alt)`) on
  top of `daylight`, and sub-pixel stars fade out (`vSize` cull): no more white
  speckle in a bright low sun.
- [x] 3 Clouds — `Clouds.ts`: FBM coverage at 8 km (+11,5 km on high), sun-lit heaps,
  wind drift with ambient motion, 512² shadow texture on finalize, veil cap at the
  strategic distance lowered (`viewCap`). Finishing step: a screen-space cull
  (`fwidth(n) > 0,15` discard) removes fragments smaller than a few pixels — those
  single-pixel white specks over sea and board at the strategic distance — and the
  faintest fragments (`a < 0,02`) are discarded too. Measured over the sea patch of
  the strategic summerHigh frame: bright dots 660/71 280 (0,93 %) → 43/51 084 (0,08 %).
- [x] 4 Fog, precipitation, transitions — `FogExp2` from the regime wash and the view
  distance; rain verified at golden and closeup; snow captured under `coldWave`
  (day 1 turn 3, −15,9 °C, `snow-coldwave.png`). Finishing step:
  - the fog reference never falls below 120 km, so a near camera sees a haze, not a
    wall (`foghigh-closeup`: the parked farm reads as silhouettes, mean luminance
    169,5 → 158,1);
  - at the strategic view the wash is capped (`STRATEGIC_WASH_CAP` = 0,24): the fog
    reached at the board's far edge (≈1,35× the camera distance) stays ≤ ~30 %, i.e.
    the far board keeps ≥ 70 % of its albedo contrast; closeup and golden keep the
    regime's full haze;
  - precipitation: kind from temperature and air mass (rain ≥ 2 °C, sleet 0,5–2, snow
    below; summer regimes never snow — a staged summerLow on the January judging day),
    shorter/thinner streaks, per-particle depth fade (density and alpha fall with the
    distance to the targeted view), alpha and colour multiplied by the ambient
    daylight (night streaks are darker than what they cover), density follows
    `intensity^1,6` so a moderate regime is a drizzle, sub-pixel grains culled.
  - the 1,5 s transition verified on the real clock: resolving turn 5 → 6 (frostHigh)
    gives three distinct frames at ~0 / ~0,75 / settled (mean abs diff 0 → 0,75 s
    22,1; 0,75 s → settled 37,7; 0 → settled 59,6): the sky eases, it does not snap.
    In capture mode the clock is pinned, so the transition deliberately snaps.
- [x] 5 Eight faces — all regimes judged across steps 1–2; finishing-step frames:
  `show-noon-summer-high` (June day 16, strategic, clean sea and far board),
  `game-noon-summer`, `game-evening-frost`, `storm-closeup` (night rain dim, turbines
  readable), `foghigh-closeup` + `foghigh-strategic`, `snow-coldwave`,
  `summerlow-rain-golden`, `dawn-facing-sun` (`--yaw 120 --pitch 20`, the eastern
  twilight band), `show-dawn-transitional`, `show-night-fog`, `show-storm-afternoon`.

## Measured (captures/sky/s3, SwiftShader, tier high, 1600×900)

- Every capture: `consoleErrors` [], `pageErrors` [], `budget.ok` true (the one
  exception is the headed perf closeup below). draw calls 24–123 (module set),
  triangles 210 k–1,18 M, points 0–17 505 (storm), gpuBytesEstimate 9–15 MB.
- Determinism: `det-a`/`det-b` (storm closeup, high, pinned clock) byte-identical,
  md5 `813519c7aa5ef2229b3271d6cfe54f12`.
- Headed (Apple M3 Pro, 1600×900, high tier, strategic, `--hud 0`, frostHigh,
  60-frame window, machine shared with other builders):
  - with sky 5,88 / 6,19 ms GPU, 72 calls; the same scene without the sky module
    5,83 ms, 67 calls → the sky's share is within noise (≤ 0,4 ms) at the gate view.
  - storm closeup: with sky 6,86–7,80 ms (93 calls), without sky 5,17 ms (88 calls) —
    the sky layers (cloud veil + rain) cost ~1,7–2,6 ms there; high-tier closeup storm
    sits at/above the 6,7 ms budget on a contended machine. `perf-without-sky` also
    tripped the first-interactive warning (4,6 s > 4 s) once — a load flake, not perf.
- Fog cap evidence: the strategic summerHigh sea patch is 16 % brighter (less fog) and
  the far board reads; the fogHigh strategic frame no longer whites out (the cap bites
  only past ~160 km of view distance).

## Latest screenshots

- captures/sky/s3/show-{noon-summer-high,dawn-transitional,evening-frost,night-fog,storm-afternoon}.png
- captures/sky/s3/game-evening-frost.png, game-noon-summer.png (bare world, `--hud 0`)
- captures/sky/s3/dawn-facing-sun.png (transitional, golden, yaw 120°, pitch 20°)
- captures/sky/s3/storm-closeup.png (night storm, turbines readable)
- captures/sky/s3/foghigh-{closeup,strategic}.png
- captures/sky/s3/snow-coldwave.png (coldWave, day 1 turn 3, snow — light flurry)
- captures/sky/s3/summerlow-rain-golden.png (June day 16, rain streaks, no flakes)
- captures/sky/s3/det-a.png, det-b.png (determinism twin)
- captures/sky/s3/perf-{with,without}-sky.png, perf-closeup-{with,without}-sky.png (headed)

## Known gaps

- Sleet never captured: on the judging day the engine's wet regimes are at +5…+6 °C
  (rain) and the cold ones at −12…−17 °C (snow); the 0,5–2 °C window exists only under
  `transitional` (0,5–2,7 °C) but its cloud cover stays below the 0,7 precipitation
  threshold across days 33/34 turns 0–7 (probe table in the step report). The sleet
  path is the rain path with smaller, slower streaks; no frame exercises it.
- The daytime speckle has two sources: the cloud veil's sub-pixel fragments (culled,
  measured 0,93 % → 0,08 % dots) and, in twilight, the star field (gated by sun
  altitude + pixel size). The residual 0,08 % is real small cumulus, not noise.
- The 1,5 s transition is only visible outside capture mode (a pinned clock snaps by
  design), so evidence is the three real-clock frames, not two pinned captures.
- The strategic `summerLow` frame (day 1) is inherently milky (cover 0,84, fog 0,30,
  full snow cover) — the winter staging day, not the renderer; a `day: 16` showcase
  frame would show the real summer rain (see change requests).
- High-tier storm closeup is at/over the 6,7 ms GPU budget on a busy machine; the
  cloud veil's heap normals sample the coverage field five times per fragment, which
  is the first candidate if the gate view ever regresses.

## Change requests

1. `src/world/showcase/registry.ts`: the `grid` corridor-golden frame stages
   `summerLow` on the January judging day, so its temperature is −5 °C over snow.
   A `day: 16` on that frame (or on a new sky frame) would show the regime's real
   summer face.
2. `src/world/render/res`: the black/white nacelle faces under overcast are material
   side (the nacelle/lamp fixture stays black while the tower is white); the sky's
   direct light is already softened under `overcastMix` (see checklist 1).
3. `capture`: a mode that pins the clock *after* a turn resolution (or a
   `--transition` step option) would let the harness capture the 1,5 s ease itself.

## Next step

1. Sleet: a scenario day whose mean temperature lands in 0,5–2 °C with cover > 0,7,
   or a bridge-level probe; then capture and judge.
2. Re-run the showcase set after any other module changes; keep the determinism twin.
3. If the closeup storm budget matters, halve the cloud heap-normal taps (forward
   differences) or drop the height field under heavy cover.

## Perf pass (wave 3, 2026-09-21) — perf builder

- Star count, env-map size, cloud layers and precipitation share moved from local
  tier records in `index.ts` into the knobs table in `render/core/Quality.ts`
  (`stars`, `envMapSize`, `cloudLayers`, `particles`); **every tier keeps its
  previous values** (high 3200/256/2 layers/full rain, medium 2000/128/1/0.6,
  low 1000/64/1-lit-flat/none). `cloudLit` stays a sky-local rule (low = flat).
- Post chain (core, perf builder): bloom now runs at half the stock chain
  resolution and the high-pass thresholds on `max(r,g,b)`, so the amber/red
  conductor alarms bloom in their own hue — the veil's cost at the strategic
  frame dropped with the whole-game number (7.29 → 6.35 ms median). The clouds
  themselves were not touched (the heap-normal taps stay).
