# perf — progress

Owned by the perf builder (wave 3, step 1 of 2). Files: `budget.ts`, `fpsMeter.ts`,
`gpuTimer.ts`, plus `render/core/PostFx.ts` and `render/core/Quality.ts` (per the
brief); perf-only edits in other render folders carry a "Perf pass (wave 3)" section in
that folder's PROGRESS.md (terrain, sky — both added).

## Checklist (brief)

- [x] **Profile first** — per-module GPU cost by `--modules` subsets on the judging
      frame (`--scenario midgame --day 1 --turn 6 --regime frostHigh --camera strategic`,
      headed, 1600×900, dpr 1, `--quality high`). Tables below; raw logs in this folder.
- [x] **Quality knobs table** in `core/Quality.ts`, consumed through `ctx.quality` /
      `QUALITY_PROFILES`: `maxPixelRatio`, `shadows`, `shadowMapSize`, `bloom`,
      `bloomScale`, `bloomStrength`, `antialias`, `detail` (instance share + LOD reach),
      `cloudLayers`, `particles`, `envMapSize`, `stars`, `terrainNormalKm`,
      `terrainAltKm`, `terrainCellKm`, `terrainSamples`, `anisotropy`. Auto detection and
      `?quality=` unchanged; the HUD `JAKOŚĆ` control already exists
      (`hud/SettingsStrip.tsx`, with the active-tier readout) — no HUD request.
- [x] **First cuts**
  - Post chain: bloom at half of the stock chain resolution (`bloomScale` 0.5) +
    hue-preserving high-pass. Whole game 7.29 → **6.35 ms** median (quiet window).
  - Terrain: per-tier ground detail moved into the profile (high/medium values
    unchanged: 65/65/7.5/4, 32/32/3.5/2; low cell 3 → 4 km).
  - Sky: cloud layers / precipitation / env-map / stars moved into the profile
    (every tier keeps its value).
  - Measured, not assumed: no other module's geometry or textures were cut — at the
    strategic frame every module's marginal GPU cost is inside the ±1 ms timer noise.
- [x] **Bloom hue** (`bloom-hue`): high-pass thresholds on `max(r, g, b)`. The overloaded
      corridor now blooms red at the judging frame (`after1-game-high.png`), the amber
      warns bloom amber, the short-city rings bloom red (`after-sc-grid-night-strategic.png`).
      Change request 1 (grid halo pools).
- [x] **Bundle**: `npx vite build --outDir captures/perf/dist --emptyOutDir` — `three`
      chunk 181.28 kB gzip, app chunk 249.12 kB gzip, css 7.79 kB gzip, fonts
      ~200 kB raw; the `three` chunk split in `vite.config.ts` still holds.
- [x] **Evidence** under `captures/perf/s1/`: before/after JSON per module and tier,
      showcase frames read side by side, md5 determinism twins.

## Judging frame, whole game — headed, Apple M3 Pro, 1600×900, dpr 1

`fps.gpuMs` (EXT_disjoint_timer_query_webgl2, 120-frame average). Two windows:
**quiet** = machine load 3.6–8 (other builder idle), **contended** = load 16–18.

| tier   | before | after, quiet window (runs → median)      | after, contended | calls | tris  | gpuMB | readyMs |
|--------|--------|-------------------------------------------|------------------|-------|-------|-------|---------|
| high   | 7.29 ✗ | 6.14, 6.35, 6.25, 6.58 → **6.35** ✅      | 6.60–7.88 (med 7.23) | 122 | 436 k | 19.5 | 3.7–3.9 s |
| medium | 4.37   | 3.39, 3.13, 3.51, 3.40 → **3.40**         | —                | 117   | 313 k | 15.0  | ~3.6 s  |
| low    | 3.42   | 2.87, 2.36, 2.41, 2.34 → **2.41** ✅ ≤ 3 ms | 3.05–3.68      | 103   | 273 k | 15.0  | ~3.6 s  |

Noon frame (`summerHigh`, turn 4, whole game): 6.29–7.07, quiet-window runs 6.29/6.35;
133 calls, 669 k tris — the integrator's 6.07 ms reference predates this wave, so the
noon before/after is not a matched pair.

The dev machine is shared with a second builder: the same URL spread 6.14–7.88 ms
across 10 runs. The clean-window median is the number to compare against the 6.7 ms
budget; the contended numbers are reported, not hidden.

## Per-module marginal cost, judging frame, high (terrain,sky + X)

| layer       | before | after | note |
|-------------|--------|-------|------|
| board only  | 4.51   | —     | 19 calls: 2 board + ~17 post passes |
| terrain,sky | 6.93   | 6.41 / 5.33 / 6.07 / 6.37 (med 6.22) | post chain dominates the floor |
| + grid      | 11.82  | 8.38 / 6.15 / 5.68 / 5.76 / 5.85 (med **5.85**) | every run renders 31 calls / 240 513 tris: the high values are load spikes |
| + plants    | 6.87   | 6.16  | |
| + res       | 5.92   | 6.31  | |
| + storage   | 7.21   | 5.60  | |
| + nodes     | 6.14   | 6.16  | |
| + cities    | 6.95   | 6.30  | |
| + effects   | 6.17   | 5.36  | |

Marginal cost per module at the strategic frame is within the ±1 ms noise band: the
frame is post chain + sky + terrain, and every module is well inside the budget.
Draw calls 122 ≤ 800, triangles 436 k ≤ 3 M, GPU estimate 19.5 MB ≤ 400 MB.

## What changed, file by file

- `render/core/Quality.ts` — the knobs table (new fields documented above). High/medium
  behaviour is unchanged except the intended bloom change; low is genuinely cheaper.
- `render/core/PostFx.ts` — (1) hue-preserving high-pass: the stock
  `LuminosityHighPassShader`'s `luminance(texel.xyz)` is replaced with
  `max(r, g, b)` on the pass's own material, so a saturated alarm blooms without the
  salmon ACES shift and without a second halo pass; (2) `sizeBloom()` runs the bright
  pass and every blur mip at `bloomScale` × the pass resolution (0.5 = a quarter of the
  viewport); (3) `setDaylight()` keeps the old strength curve shape (0.25 noon /
  0.80 night at the high tier) sourced from the profile.
- `render/terrain/index.ts`, `render/sky/index.ts` — read the profile knobs instead of
  local per-tier records; values identical (except low's cell size).

## Evidence (`captures/perf/s1/`)

- Judging frame before/after: `before-game-high.png` → `after1-game-high.png`
  (the overloaded corridor blooms red after the high-pass change).
- Module subset pairs: `before-{board,sky,terrain-sky,grid,plants,res,storage,nodes,cities,effects}-high`
  vs `after2-*`; tier runs `before-game-{medium,low}` vs `rep*-game-{high,medium,low}`.
- Showcase frames of the touched modules, after: `after-sc-grid-{overload-evening,night-strategic}`,
  `after-sc-sky-{evening-frost,night-fog}`, `after-sc-terrain-winter-frost`; read against
  the module builders' step frames (`captures/grid/s1/`, `captures/sky/s3/`,
  `captures/terrain/s3/`) — note those predate the CameraRig change, so the framing
  differs while the read (alarms, weather, relief) is unchanged.
- Full walks (SwiftShader) landed anyway: `after-showcase-sky-*` (5 frames) and
  `after-showcase-terrain-*` (4); the `sky noon-summer-high` pair against
  `captures/sky/s3/show-noon-summer-high.png` is pixel-for-pixel the same read (the
  sky/terrain knob values did not move at high).
- Daylight closeup check (bloom must stay quiet at noon): `after-sc-cities-jasienica-day`
  — 4.89 ms, 44 calls, 837 513 tris, 10 MB, budget ok, no halo or blown white.
- Determinism: `det-a.png` / `det-b.png` md5 `a7bd9c520582ff09f4144ab24d153e14`
  (pinned clock, same URL). No new randomness anywhere.
- Bundle: `captures/perf/dist/` (vite build output; never `dist/`).

## Known gaps / notes

- The bloom change deliberately lifts saturated colours into the composite: at night the
  amber city pools and the warn / over conductors are brighter than before. That is the
  requested `bloom-hue` behaviour (alarms bloom in their own hue); if the art critic
  finds it too hot, the one number to turn is `bloomStrength` in `Quality.ts`.
- `readyMs` (first interactive) stays 3.5–3.9 s headed on the dev server, under the 4 s
  budget but close to it; the harness's own `firstInteractive` failure appeared twice on
  a contended machine. That is the `first-interactive` open issue (procedural texture
  generation at boot) — untouched this step.
- The `--repeat N` median option the brief mentions does not exist; `scripts/capture.mjs`
  was being edited by the integrator, so repeats were driven by hand (`rep1..3-*`).
- The two showcase walks run in SwiftShader took ~2 min/frame, so the showcase evidence
  is single frames driven with explicit parameters instead of `--all`.

## Change requests

1. **grid** — the conductor halo pools (`glowNear` / `glowFar`, `conductorGlowMaterial`)
   existed because luminance bloom was blind to the alarm radiances. With the
   hue-preserving high-pass the alarms bloom red on their own
   (`captures/perf/s1/after1-game-high.png`, `after-sc-grid-overload-evening.png`), so
   the halo is now a second additive glow over the same spans. Proposal: judge the halo
   against the bloom on `overload-evening`; if bloom carries the read, drop the halo
   pools (frees 6 draw calls and additive overdraw over the whole hot corridor); if the
   noon read needs it, gate it by daylight or by camera distance instead of keeping the
   2.6 px-wide far halos at the strategic view.
2. **capture harness** — add `--repeat N` (median of N runs). On this shared machine one
   run of the same URL ranged 5.7–11.8 ms on the grid frame; perf numbers need medians
   to be comparable wave over wave.
3. **art/critic note (not a code change)** — the night frames after the bloom change read
   hotter; the tuning number is `bloomStrength` in `Quality.ts` (0.55 high), and the
   curve is `strength × (0.45 + (1 − daylight))`.
