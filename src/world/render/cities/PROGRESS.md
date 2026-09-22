# render/cities — progress

Hand-over between pipeline steps. Rewritten at the end of every step; updated after
every finished sub-task so an interruption loses at most one.

## Step 2 (2026-09-11 → 2026-09-20) — DONE, judged in captures

Resumed 2026-09-20 20:40 after a cancelled builder. Found on arrival: its uncommitted work
(lightmap tuning, LED share, far damp, two debug globals) and captures `s2/n1-*`
(2026-09-20 10:05, pixel-identical to the 09-11 `c-*` round — i.e. a pre-change baseline)
and `s2/probe-evening` (2026-09-19, captured on port **5173, the foreign app — discarded**).
The last source edits (11:59–12:00) postdated every capture: nothing of step 2 was verified.
Stale `chrome-headless-shell` processes from the killed run were hogging the CPU — killed;
the harness then worked normally. The debug globals were removed; the module now differs
from HEAD only in the four module files. Another builder was editing `render/res` and
`render/sky` concurrently all evening — its `console.error("DBG geo", …)` in
`res/index.ts:232` briefly failed every full-set capture's error gate; it was gone by 21:03.

### What changed this step (all inside this folder)

- `lightmap.ts` (inherited, verified): lamp blur 0,15 → 0,32 km with a 2-texel floor and a
  fixed energy per lamp (0,32 km²) so a street of lamps merges into a line instead of
  sparkle; knee 0,2 → 0,24; block glow 0,9 → 1,7; quilt gain 0,6 → 0,45.
- `layout.ts` (inherited + this run): LED share of side streets 0,08+0,32·scale →
  0,02+0,16·scale (sodium stays the signature); WALL_ALBEDO 0,42 → 0,45; mid-ring
  perimeter blocks 50 % → 62 % terracotta.
- `materials.ts` (inherited + this run): far facade average damped by camera distance
  (`farDamp`, −85 % past 420 km) so the quilt carries the strategic night; window-average
  band tightened 1,5–4,0 px → 1,2–2,8 px (the 18 km detail view keeps real windows, the
  42 km closeup averages); roof tones darkened — gravel 0,34 → 0,25, membrane 0,58 → 0,44,
  bitumen 0,14 → 0,115 — terracotta 0,56/0,23/0,12 → 0,58/0,21/0,10.
- `index.ts`: unchanged vs HEAD (the two debug globals the interrupted builder left were
  removed). The quilt, the house LOD and `HEIGHT_KM.landmark` were already in HEAD.

### Checklist (from the brief + step-1 gaps)

- [x] 1 Night at the strategic view: the light map is verified — warm sodium blobs where
      `n1`/`c` had white speckle (`t1`/`t7`/`v-game-evening-bare`, warm-pixel count at the
      metro 608–609 vs 598 with the halo absent in `n1`; the crop diff shows the halo).
      Atlas probe: 7 tiles for 10 cities (Solnica/Zalesie/Bystrzyca off-grid have none),
      street web + white LED arterials, max (168,142,104). Lamps hidden past
      `uLampFade.y+20`, quilt hidden under `uLampFade.x−20`, quilt × pow(lit,1.6) per
      vertex; `applyLit` drives both.
- [x] 2 Day read: darker core roofs + terracotta rim + wall albedo (above); vertex AO
      (`enAo` 0,58→1,0 over the lower half) was already in place. `t5`/`v-game-noon-bare`:
      the metro reads as a grey built-up patch with an orange rim; `t6-jasienica-day`: the
      closeup reads as a coherent city — dark core, terracotta suburbs, green courtyards.
      Honest limit: at 400 km the patch still shows grass between blocks; a day ground
      decal would fix that (see gaps).
- [x] 3 Closeup facades: band tightened (above), far average lowered (`farDamp` + 0,85 →
      0,7 factor was inherited), office spill already 0,035 (half of homes). The 18 km
      `v-show-metro-detail-night` is the proof: dense lit windows, sodium streets.
- [x] 4 LOD: houses hidden beyond 300 km on medium/low; lamps hidden beyond the crossfade.
      Probed (module globals): medium/low strategic house=false lamp=false quilt=true;
      high strategic house=true; closeup house/lamp=true quilt=false.
- [x] 5 `HEIGHT_KM.landmark` from `render/core/exaggeration.ts` (layout.ts:306; no local
      constant left).
- [x] 6 Verification: see below — showcase set, game frames with/without HUD, closeups
      Kamionka 19,6 / Jasienica 11,7 / Solnica 15,2, determinism twin, headed perf pair.
- [x] 7 Gates: prettier (unchanged), `npm run lint`, `npx tsc -p tsconfig.json --noEmit`,
      `npx vitest run --project unit` (40 files, 516 tests) — all green.

### Judgement of the frames (harsh art director + dispatcher)

- `v-show-metro-detail-night.png` (18 km, 22:30 atlanticLow) — the hero read: dense rows of
  lit windows, sodium lamps along the streets, warm dome, the landmark tower, dark fields.
  This is a city at night; AD ≈ 8,5.
- `v-show-metro-night.png` / `v-det-1.png` (42 km closeup): a moonlit pale mass with the
  window cells now visible (band change) and a warm halo behind — reads as a city under a
  clear moon, though the moonlit walls still outweigh the windows (AD ≈ 7).
- `v-close-kamionka.png` (19,6, frostHigh, lit 0,845): warm core, halo, the −88 MW label
  and the red overloaded line tell the story; proportional, not black.
- `v-close-solnica.png` (15,2, atlanticLow): off-grid — a dark patch with no light at all;
  at a closeup alone it is nearly invisible (the label carries it). FogHigh
  (`v-show-dark-town-night`) reads better.
- `v-show-day-strategic.png` / `v-game-noon-bare.png`: grey patches with orange rims,
  class tellable by size; the metro still loses grass between blocks at 400 km.
- `t6-jasienica-day.png` (closeup): dark core roofs, saturated terracotta rim, courtyards;
  the noon city reads without the night lights.

### Measured

- Headed, Apple M3 Pro, Chromium 1600×900, high tier, strategic 19:30 frostHigh,
  `--modules` with vs without cities, two samples each: **with** 6,80 / 7,44 ms GPU,
  68 calls, 372 839 tris; **without** 7,74 / 8,25 ms, 58 calls, 324 071 tris
  → cities = **+10 draw calls, +48,8 k tris, GPU share under the noise floor**. The 6,7 ms
  line fails on the base alone (open issue `perf-gpu-terrain-sky`), as grid reported.
- Headless showcase set (SwiftShader, `--fps-frames 2`): 5/5 frames 31–36 calls,
  442 843–461 055 tris, 10,4 MB est, errors 0, budget ok.
- Whole game (headless): evening strategic 68 calls / 372 839 tris; noon strategic
  69 / 601 957; closeups 85–90 / 603 k–642 k; 14,4 MB est.
- Determinism: `v-det-1` / `v-det-2` (headless, closeup 11,7, turn 7 atlanticLow)
  md5 `e1e4c8a9a938e93a127b13ba9f593f53` both.
- Every JSON of this step: consoleErrors [], pageErrors [], all modules ready. Budget ok
  on every art frame; the two headed perf pairs fail the GPU-ms line on the base.

### Known gaps → step 3

1. Day strategic still shows grass between blocks: a day ground decal (the atlas as a grey
   multiply patch) is the obvious next move; keep it off for off-grid cities.
2. The 42 km night closeup is a pale moonlit mass; windows only read at 18 km. If the
   critics want more, raise the far average at close range or enlarge the window pitch.
3. Off-grid closeup under a clear moon is nearly invisible — acceptable semantics, but a
   moonlit roof sheen would help the silhouette.
4. The 1,5 s lit transition is still verified by code only; a headed free-clock check remains.
5. `probe-evening` (s2) is a foreign-app capture — delete it when the folder is cleaned.

### Change requests (outside this folder)

- `render/res/index.ts`: the `console.error("DBG geo", …)` left at line 232 (since removed
  by its builder at 21:03) — watch for such leftovers; they fail every capture's error gate.
- `render/core/exaggeration.ts`: nothing left to add; `HEIGHT_KM.landmark` is in use.
- `showcase/registry.ts`: a `day-closeup` frame on Jasienica (turn 4, summerHigh) would
  show the facade day work; the set has no day closeup today.

### Latest screenshots (captures/cities/s2/)

- `v-show-metro-detail-night.png` — the hero read (18 km, 22:30 atlanticLow).
- `v-show-metro-night.png`, `v-show-blackout-evening.png`, `v-show-dark-town-night.png`,
  `v-show-day-strategic.png` — the showcase set (headless, as the harness runs it).
- `v-game-evening-bare/hud.png`, `v-game-noon-bare/hud.png` — judging frames with and
  without HUD (headless; `v-game-evening-bare` is byte-identical to `t7`).
- `v-close-kamionka.png`, `v-det-1/2.png` (Jasienica under a clear moon),
  `v-close-solnica.png` — closeups; `t6-jasienica-day.png` — the day closeup.
- `v-perf-with{,-b}.png` / `v-perf-without{,-b}.png` — headed perf pair.
- `t1…t7-*` — the iteration frames of this run; `n1-*` / `c-*` — the pre-change baseline
  (`n1` is pixel-identical to `c`); `probe-evening.*` — foreign-app capture, discard.

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

## Integrator notes (2026-09-11, updated 2026-09-20)

- **Art iteration speed**: on headless SwiftShader the harness's default `--fps-frames 120`
  costs minutes per frame (0,2–0,7 fps); pass `--fps-frames 2` while iterating — the PNG is
  the same, only the fps sample shrinks. Keep 120 for the headed perf runs.
- **Stale browsers**: a killed capture leaves `chrome-headless-shell` processes that keep
  eating CPU (and hang the next run for the whole timeout); `pkill -f chrome-headless-shell`
  before starting if a capture seems stuck.
- **Concurrent builders**: on 2026-09-20 other agents were editing `render/res` and
  `render/sky` all evening; HMR can reload the page mid-capture and their debug
  `console.error`s show up in this module's logs (the `DBG geo` one in `res/index.ts` did,
  21:00–21:03). Re-capture and check the error list before blaming cities.
- **Ports**: 5173 is a foreign app (a capture on it produces a valid-looking JSON of
  ANOTHER game — `s2/probe-evening` is one); always capture with `--url
  http://localhost:5174` or let the harness fall back.
- **Dev server**: port 5173 is held by ANOTHER project's Vite server (never touch it). ElectroNation runs on **5174** — `.claude/launch.json` config `game-alt`, or let `scripts/capture.mjs` find/start it: the harness now detects a foreign server by the page title and falls back to 5174/5183/5193 on its own (`capture: using the ElectroNation server at …`). Pass `--url http://localhost:5174` only if you need to be explicit.
- **Showcase day**: `?showcase=<module>` now stages the judging day (ShowcaseSpec.day = 1) unless `--day` overrides it — `--showcase <module> --all` walks the frames at day 1 (nuclear online, Łęgi corridor mid-upgrade, second coal block starting).
- **Layer cost**: `--modules terrain,sky,<module>` vs `--modules terrain,sky` on the same frame gives a like-for-like GPU/draw-call delta.
- **Textures**: `proceduralTexture` and `normalMapFromHeight` pass the texture's own `Rng` as the fourth argument of the pixel/height callback (deterministic per-texel draws).
- Applied from your step-1 change requests: `HEIGHT_KM.landmark` (0.12 km real) is in `render/core/exaggeration.ts` — read it and drop the local LANDMARK_HEIGHT_KM; showcase frame `metro-detail-night` (turn 7, atlanticLow, camera detail, focus 11,7) added to SHOWCASES.cities; the `cities:base:<id>` hook is recorded in docs/STATUS.json for effects.
- The perf line still fails on terrain+sky alone (open issue `perf-gpu-terrain-sky`); keep judging cities by its delta.
