# render/cities — progress

Hand-over between pipeline steps. Rewritten at the end of every step; updated after
every finished sub-task so an interruption loses at most one.

## Step 2 (2026-09-11) — IN PROGRESS (started; nothing verified yet)

Found on arrival: step 1 complete (four module files 2026-09-07 03:05, PROGRESS.md with the
integrator's notes 2026-09-11 15:08, captures `captures/cities/s1/`); no partial step-2
work. Dev server: 5173 is a foreign app, ElectroNation answers on 5174 (the harness finds it).

### Checklist (from the brief + step-1 gaps)

- [ ] 1 Night at the strategic view: a per-city light map (satellite-style, structured by
      streets/parks/outline, sodium core + LED arterials) on a terrain-conforming merged
      quad grid, crossfaded with the lamps by camera distance; × lit; hidden for off-grid.
- [ ] 2 Day read: facade AO gradient (vertex height), darker core roofs, terracotta rim
      kept saturated, a touch more wall albedo so sunlit tops separate from the fields.
- [ ] 3 Closeup facades: window-average fade band tightened (px), lower far average,
      office spill halved.
- [ ] 4 LOD: houses hidden beyond 300 km on medium/low; lamps hidden beyond the crossfade.
- [ ] 5 `HEIGHT_KM.landmark` from the exaggeration table (drop the local constant).
- [ ] 6 Verification: showcase set, judging frames (turn 6 frostHigh / turn 4 summerHigh,
      strategic, with and without HUD), closeups (Kamionka, Jasienica, Solnica under a clear
      moon), determinism twin (md5), headed GPU cost with/without the module.
- [ ] 7 Gates: prettier, lint, tsc, unit tests; PROGRESS.md rewritten.

## Step 1 (2026-09-07) — module core: DONE, judged in captures

Found on arrival: the four module files (`archetypes.ts`, `layout.ts`, `materials.ts`,
`index.ts`, 2026-09-06 23:02) and five capture rounds (`captures/cities/s1/a-* … e-*`,
`det-1/2`, `perf-*`) from an interrupted step whose PROGRESS.md still said "started".
The code compiled and linted; the captures were never judged. Judged, then continued.

### What changed this step

- `materials.ts`: the halo is a camera-facing quad (`HALO_PROJECT_VERTEX`, depth test
  off) with a gaussian falloff — a dome of scattered light over the city, not a grey
  disc on the ground. Window cells fade to their average by ON-SCREEN cell size
  (fwidth-based, 2–6 px) instead of camera distance, so the 42 km closeup averages
  (no sparkle) and the 18 km detail view shows real windows. Energy-consistent facade
  average (`uEmissive` 1,6, far = area × keep × 0,85); per-building occupancy (offices
  0,45, homes 0,55–1,0 from the seed hash) so no two blocks glow alike; a two-floor
  sodium spill on facade bases (0,12 km, 0,07 × lit × night); lamp minimum 1,6 px;
  roof tones: darker gravel, brighter terracotta, greyer membrane.
- `layout.ts`: `WALL_ALBEDO` 0,48 → 0,36; lamp pools 0,16 / 0,12 km, LED share
  0,08 + 0,32·scale (sodium dominates towns), brightness 0,4–0,7; mid-ring perimeter
  blocks 50 % terracotta.
- `index.ts`: halo lifted 0,3 × radius over the centre, span 2,4 × radius × (1, 0,55);
  lamp opacity 0,6·night, halo 0,11·night; blocks cast shadows only within 160 km of
  the camera (sub-texel beyond).

### Checklist (from the brief)

- [x] 1 Layout — deterministic settlement per city from `ctx.rng("cities:<id>")`:
      footprint CITY_FOOTPRINT × scale, dense centre → mid ring → low suburbs, irregular
      rotated street grid with jittered block widths, avenues, a ring road gap, parks and
      green courtyards, a landmark tower for metros; buildings stand on `ctx.terrain`.
- [x] 2 Archetypes — six instanced masses (slab, tower, perimeter block with courtyard,
      pitched-roof house, industrial hall, landmark spire), one InstancedMesh each,
      one shared PBR material; roofs and facade tint vary per instance.
- [x] 3 Materials — procedural wall grain + roof membrane textures, analytic window
      cells in world units (a window stays 70 × 60 m whatever the block's scale), no
      shininess on concrete (roughness 0,88), glass a little smoother.
- [x] 4 Night — window emission × `lit` (fewer windows AND dimmer), instanced street
      lamps × `lit`, halo × `lit`; unconnected city: no light at all, greyer sparser
      masses, a moonlit silhouette; hook `cities:base:<cityId>` (userData: cityId,
      radiusKm, connected, blackout, ensMw, lit — `lit` follows the eased value).
- [x] 5 Motion — 1,5 s ease of `lit` on a turn resolution (transitions), slow window
      wander (ambient), static twins everywhere (emission, silhouette).
- [x] 6 Verification — showcase set (headed high + headless), game frames (turn 6
      frostHigh, turn 4 summerHigh, with and without HUD), closeups (Kamionka, Jasienica
      day/night, Solnica), determinism twin, headed perf with/without — see below.

### Judgement of the latest frames (harsh art director + dispatcher)

- `g-jasienica-detail-night.png` (18 km): rows of lit windows on dark-roofed blocks, the
  office tower mostly dark, sodium lamps along the streets, suburban houses with a
  window or two, a warm haze dome, pylons silhouetted — reads as a city at night.
  Facades still a touch pale overall (AD ≈ 7,5).
- `g-metro-night.png` (closeup 42 km): warm glowing core under the dome, roofs dark;
  window structure is sub-pixel here by design (averaged, no sparkle).
- `g-blackout-evening.png`: Kamionka at lit 0,63 — proportionally dimmer; at a closeup
  alone the shortfall is carried by the label (the red ring is effects').
- `g-game-evening-bare.png` / `f-game-evening-hud.png` (strategic, judging turn): seven
  warm blobs sized by class (Jasienica ≫ Modrzyca / Turów); Kamionka visibly dimmer than
  Wierzbnik and Brzegowo; Solnica / Zalesie / Bystrzyca dark smudges — the dispatcher's
  "which city is short / off grid" answers without clicking.
- `g-day-strategic.png` / `f-game-noon-*.png`: grey-brown patches, class tellable by
  size; still weak as "a city" at 400 km — a darker core / warmer rim is step 2.
- `f-jasienica-day.png`: massing reads (perimeter blocks with courtyards, slab estates,
  towers, terracotta houses, halls); flat "paper model" lighting, no occlusion between
  blocks. `f-solnica-day.png`: the off-grid town greyer and sparser.
- `h-show-dark-town-night.png` (headless, fogHigh 01:30): faint moonlit squares — the
  dark settlement is findable and unlit.

### Measured

- Headed, Apple M3 Pro, Chromium 1600×900, high tier (`captures/cities/s1/g-perf-*.json`):
  strategic 19:30 frostHigh, terrain + sky + board: **6,86 / 6,86 ms** GPU, 25 calls,
  210 519 tris; with cities (+ effects stub): **6,95 / 7,37 ms**, 35 calls, 275 587 tris
  → cities ≈ **+0,1…+0,5 ms, +10 draw calls, +65 k tris** at the strategic view.
  Closeup Jasienica 22:30 (showcase): 6,54 ms, 36 calls, 442 843 tris. Whole game:
  strategic evening 6,71 ms / 41 calls / 305 581 tris; noon 5,98 ms / 37 / 490 749;
  detail 18 km night 5,69 ms / 48 / 500 413; closeup Jasienica day 5,77 ms / 58 / 946 303.
  The 6,7 ms line fails on the base alone (6,86 ms without cities) — as grid reported;
  the cities' share stays inside its budget (≤ 40 calls, ≤ 600 k tris).
- GPU estimate 9,6–9,8 MB for the whole scene; this module's textures: 256² wall + roof,
  64² lamp dot, 128² halo.
- Headless showcase set as the harness runs it (SwiftShader, tier medium,
  `h-show-*.json`): metro-night / blackout-evening / dark-town-night 32 / 32 / 31 calls,
  258 272 tris; day-strategic 26 calls, 140 940 tris; 5,3 MB; budget ok, no errors,
  all modules ready.
- Determinism: `g-det-1` / `g-det-2` (headless, closeup 11,7, turn 7 atlanticLow) md5
  `2e4345b158e3202246f3525317fa6c24` both.
- Every JSON of this step: consoleErrors [], pageErrors [], all modules ready;
  budget.ok true except the GPU-ms line on frames where the base is already over.
- Gates at the end of the step: prettier, `npm run lint`, `tsc -p tsconfig.json`,
  `vitest --project unit` (516 tests) — all green.

### Known gaps → step 2

1. Day read at strategic: still a grey patch. Try dark core roofs + terracotta rim,
   vertex ambient occlusion on the archetypes, shadow-casting towers at golden hour.
2. Facade bases at closeup a touch pale: shape the far average by orientation (street
   side vs courtyard), lower the spill on office blocks.
3. Blackout read at closeup relies on the label; docs/08 §3 says proportional, so a
   per-quarter cut is only worth it if the critics ask.
4. Unconnected city at night judged only under fogHigh; check under a clear moon.
5. LOD: beyond ~300 km hide houses (sub-pixel); cheap now but worth it on medium/low.
6. The 1,5 s transition is verified by code only; a headed free-clock check remains.

### Change requests (outside this folder)

- `render/core/exaggeration.ts`: add `REAL_HEIGHT_KM.landmark` (0,12 km — a 120 m
  office tower) so `LANDMARK_HEIGHT_KM` in `layout.ts` stops deriving it locally.
- `render/effects`: the red ground ring at `cities:base:<cityId>` (userData.radiusKm,
  blackout, ensMw, lit).
- `showcase/registry.ts`: add a `detail` frame on Jasienica at night (turn 7,
  atlanticLow, focus 11,7) — the 18 km view is the module's best read and has no frame.

### References (used)

- Night satellite imagery of Poland (Warsaw / Silesia conurbation vs small towns):
  sodium-orange cores, whiter LED arterials, the glow falling off with density.
- Aerial photography of Polish cities: 19th-century perimeter blocks around courtyards,
  1970s slab estates (lift houses on the roof), pitched-roof suburbs, steel halls along
  the arterials; a stepped-crown office tower (Warsaw's Rondo 1 / Q22) as the landmark.
- Anno 1800 / Transport Fever 2 for readable massing at map distance.

### Latest screenshots (captures/cities/s1/)

- `g-jasienica-detail-night.png` — the hero read (18 km, 22:30 atlanticLow).
- `g-metro-night.png`, `g-blackout-evening.png`, `g-day-strategic.png`,
  `h-show-*.png` — the showcase set (headed high tier / headless as the harness runs it).
- `g-game-evening-bare.png`, `f-game-evening-hud.png`, `f-game-noon-bare.png`,
  `f-game-noon-hud.png` — judging frames with and without HUD.
- `f-kamionka-evening.png`, `f-jasienica-day.png`, `f-solnica-day.png` — closeups.
- `g-det-1.png` / `g-det-2.png` — determinism twin; `g-perf-with-*.png`,
  `g-perf-without-*.png`, `g-perf-with-closeup.png` — perf runs.
- `f-*` = after the halo/lamp pass, before the exposure fix; `e-*` and earlier = inherited.

## Integrator notes (2026-09-11)

- **Dev server**: port 5173 is held by ANOTHER project's Vite server (never touch it). ElectroNation runs on **5174** — `.claude/launch.json` config `game-alt`, or let `scripts/capture.mjs` find/start it: the harness now detects a foreign server by the page title and falls back to 5174/5183/5193 on its own (`capture: using the ElectroNation server at …`). Pass `--url http://localhost:5174` only if you need to be explicit.
- **Showcase day**: `?showcase=<module>` now stages the judging day (ShowcaseSpec.day = 1) unless `--day` overrides it — `--showcase <module> --all` walks the frames at day 1 (nuclear online, Łęgi corridor mid-upgrade, second coal block starting).
- **Layer cost**: `--modules terrain,sky,<module>` vs `--modules terrain,sky` on the same frame gives a like-for-like GPU/draw-call delta.
- **Textures**: `proceduralTexture` and `normalMapFromHeight` pass the texture's own `Rng` as the fourth argument of the pixel/height callback (deterministic per-texel draws).
- Applied from your step-1 change requests: `HEIGHT_KM.landmark` (0.12 km real) is in `render/core/exaggeration.ts` — read it and drop the local LANDMARK_HEIGHT_KM; showcase frame `metro-detail-night` (turn 7, atlanticLow, camera detail, focus 11,7) added to SHOWCASES.cities; the `cities:base:<id>` hook is recorded in docs/STATUS.json for effects.
- The perf line still fails on terrain+sky alone (open issue `perf-gpu-terrain-sky`); keep judging cities by its delta.
