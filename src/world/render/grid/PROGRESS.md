# render/grid — progress

Hand-over between pipeline steps. Written at the start of a step, updated after every
finished sub-task, rewritten at the end.

## Step 3 (2026-09-21) — fix round after the critic (art 6,0 / dispatcher 5,0, contractOk false)

Found on arrival: critic captures in `captures/critic/grid/r1art/` (game-noon / game-evening,
night-strategic, construction-noon, upgrade-evening, corridor-golden, trunk-noon, lv/mv/hv +
pylon details) with eight ranked issues, all in this layer's scope. The integrator already
re-timed `corridor-golden` to turn 4 and moved the `construction-noon` focus to (11,10);
`tower-detail` is turn 4 transitional now (it doubles as the bend re-check). Port 5173 is
still held by another app — the harness ran against our server on 5174. This round's set is
`captures/grid/s3/` (`b-*` first pass, `c-*` upgrade night, `d-*` 18 km type read at day 16
turn 4 summerHigh, `e-*` final re-shoots, `f-*` headed).

### Checklist (step 3)

- [x] 1 [BLOCKER] Idle lines read as black dotted by day and vanish at night. `LOAD_FLAG`
  grew a fourth state (`none 0 / halo 1 / breath 2 / idle 3`); idle segments now use a
  cool-steel static twin (`IDLE_EMISSIVE 0,10 / 0,13 / 0,19`, no breath) whose daylight
  gain is its own uniform (`uIdleDay`, noon 0,45) instead of the load `enBreath` path —
  the glow pass discards `a < 0,5` and `a > 2,5`, so idle never grows a halo. Far tube
  lighter and less mirror-like (albedo 0,7 → 0,78, metalness 0,55 → 0,35; near 0,75 →
  0,55). Judged: night-strategic — dim blue-grey trunks vs the bright loaded corridors;
  e-bend / trunk-noon — visible grey multi-strand wires by day.
- [x] 2 Warn (≥ 75 %) halo dimmed to a 3 px stub at noon. Added `HALO_DAY_FLOOR = 0,62`:
  `haloShare = max(floor, 1 − (1 − share) × daylight)`, so a hot span keeps at least 62 %
  of its halo width at full noon, and the day colour scale moved to `DAY_SCALE_NOON
  (0,30 / 0,74 / 0,82)`. Judged: b-trunk-noon (amber warn on the trunk) and
  b-overload-evening (warn + ok side by side). The label next to the line is HUD copy —
  change request below.
- [x] 3 LV / MV / HV did not separate at 18 km in haze. Sharper type silhouettes at
  `HEIGHT_KM`: NN (lv) slimmer body (baseHalf 0,06, reach 0,22, one hang), SN (mv) lower
  arm reach 0,38 with two hangs (0,18 / 0,35), WN (hv) barrel with arms 0,27 / 0,38 / 0,27
  and middle hangs 0,36; insulator strings thicker (brace × 1,5) and **doubled in parallel**
  for SN/WN (`doubleStrings`, spread `max(0,012; insulator × 0,35)`); steel tints darker
  (`STEEL_NEW 0,34 / 0,35 / 0,38`, `STEEL_OLD 0,20 / 0,21 / 0,24`, `STEEL_RUST
  0,34 / 0,24 / 0,19`). Judged on d-lv / d-mv / d-hv at the same 18 km / 20° preset and on
  e-bend (idle SN reads as distinct strands).
- [x] 4 Upgrade ghosts read as ordinary pylons. New wireframe `ghostPylonGeometry`: corner
  poles + five hatch bands + arm bars + peak bars, `GHOST_TINT` (0,26 / 0,42 / 0,55 sRGB)
  poles with `GHOST_HATCH_TINT` (0,62 / 0,90 / 1) bands and hang drops; translucent
  (`opacity 0,72`) with an emissive term injected via `onBeforeCompile`
  (`diffuseColor × uGhostGlow`, 0,5) so night keeps them lit; grown by
  `upgrade.progress` (`scaleY 0,3 + 0,7 × clamp((progress − share) / 0,18)`) and offset
  raised 0,45 → **1,1 km** so the cage never overlaps the live line. Judged:
  c-upgrade-night — cyan cages clear of the live amber line; d-upgrade-day — dotted ghost
  lane parallel to the strung live line (66 calls / 324 014 tris closeup 7,8).
- [x] 5 Construction head must read "under construction". New
  `constructionMarkerGeometry`: amber scaffold cage (four poles, three rings at
  0,34 / 0,62 / 0,90 bodyTop, diagonal braces) plus a gin-pole mast with a jib above the
  body, all `MARKING_TINT` (0,95 / 0,60 / 0,12 sRGB), pooled per type with the same
  material treatment as the ghosts (`uMarkerGlow` 0,45); the last span stays missing and
  the head is the only marked structure. Judged: b-construction (closeup 11,10,
  summerHigh turn 4) — amber scaffold + gin pole reads against the unstrung gap.
- [x] 6 [MINOR] Spans crossing the lattice at bends. `route.ts` already places a tower at
  every polyline vertex with the yaw on the bisector (`vertexDirection = normalize(back +
  forward)`), so both spans leave from the arm tips; re-checked on e-bend (detail 9,5 at
  the trunk bend) — no crossing through the lattice. No change needed, no code touched.
- [x] 7 Re-judged the two re-timed registry frames. `corridor-golden` (turn 4, summerLow,
  golden 110 km): the tower chain reads as dark specks over snow and the loaded amber line
  is the brightest thing in the frame — pass. `construction-noon` (closeup 11,10): the
  marker scaffolding is in frame (see 5) — pass.
- [x] 8 Bridge lane numbering left alone (integrator item, `buildWorldScene.buildLanes`);
  `route.ts` untouched this round. Kept in change requests.
- [x] 9 Gates: prettier (`--write src/world/render/grid`), `npm run lint`, `tsc -p
  tsconfig.json --noEmit`, `vitest run --project unit` (40 files / 516 tests) all green
  2026-09-21; this file rewritten. Determinism: two identical `trunk-noon` closeup runs
  (e-twin-a / e-twin-b) are byte-identical, md5 `630858d064859c1327ac5a38f8f20baf`.

### Measured (step 3)

- Headless SwiftShader, all `captures/grid/s3/*.json`: consoleErrors [] and pageErrors []
  in every capture that counts (the 08:12 `a-trunk-noon` was shot mid-HMR into a 500 and is
  superseded by `b-trunk-noon`), every module `ready`, budget ok in all.
  Calls / tris: trunk-noon 21 / 235 534; overload-evening 20 / 159 568; night-strategic
  12 / 132 564; corridor-golden 12 / 133 554; construction-noon 17 / 155 440; upgrade
  closeup 19 / 172 470 (night re-run identical); type read lv 17 / 188 816, mv 18 /
  208 208, hv 17 / 228 394; upgrade closeup day 16 (game state) 66 / 324 014; game
  strategic noon 49 / 246 962, evening 55 / 253 696 (HUD off — the HUD-on twins report the
  same grid calls).
- Headed (Apple M3 Pro, Chromium 1600×900, `captures/grid/s3/f-gpu-*`, midgame day 1 turn 4
  summerHigh strategic, modules terrain+sky ± grid): withGrid 12 calls / 133 554 tris /
  71,3 fps / gpu 4,70 ms vs noGrid 6 / 103 860 / 109,0 fps / gpu 5,37 ms → the grid layer
  adds **+6 calls, +29,7 k tris** and costs ~38 fps on this tier; the gpuMs sign is
  measurement noise (the layer's cost sits below it on this GPU), budget ok both runs.
- Step-2 low-tier deltas for comparison: +6 calls / +30,0 k tris strategic, +13 / +44,9 k
  closeup; step 1 high-tier: +6 / +28 k strategic.

## Step 2 (2026-09-11 → 2026-09-20) — done

Found on arrival: the step-1 module (six files + this file) untouched since 2026-09-06;
the showcase registry gained three grid frames (`construction-noon`, `upgrade-evening`,
`tower-detail` on the new `detail` camera preset — 18 km, 20°). The effects module was
still a stub, so the hooks had no consumer (it is `ready` in every final capture now).
Port 5173 is held by another app; the harness uses our server on 5174.

### Checklist (step 2)

- [~] 0 Baseline captures of the seven showcase frames + both game frames with the
  current tree (captures/grid/s2/a-*). Only `a-showcase-trunk-noon` landed on 2026-09-11
  (22 calls / 273 882 tris) — the `--all` run died on the next frame with a SwiftShader
  page crash. The interleaved rounds (b-* trunk / portal / detail, c-* round 2, d0 / d1
  detail rounds, e-* re-judges, verify-halo-*) served as the before/after trail, so a
  fresh 7+2 baseline was never re-shot.
- [x] 1 Type read: detail frames at ~18 km / 20° — NN Kamionka 19,6 (t-lv-a yaw 30°,
  t-lv-b −30°, t-lv-c −60° along the line), SN Łęgi–Centrum (t-mv-a 7,7 −30°, t-mv-b 8,7
  −30°, t-mv-c 7,7 +90° along the line — 7,8 is NOT on the route, the focus must sit on
  the offset polyline), WN trunk 8,5 / 8,6 (t-hv-a / t-hv-b 90°, t-hv-c 180° along). All
  three silhouettes read against the references: NN slim body + one arm level + peak
  phase, SN two levels, WN three levels with the widest middle and the cat-head; no
  proportion fix needed. Portals: t-mv-portal (6,9 yaw 0 — SN portal with the pale ghost
  WN tower of the in-progress upgrade behind it), t-hv-portal (9,6 yaw 120 — the Centrum
  portal pair), the NN portal in the t-lv-c crop.
- [x] 2 Halo tune: near gain 0,22 → 0,15, far 0,28 → 0,24, both × (1 − 0,6 ×
  daylight) so the halo dims by day the way core's bloom does; halo radius 2 → 1,6 px
  (near) and 3 → 2,6 px (far). Far tube: matte grey ACSR (metalness 0,55, roughness
  0,55, albedo 0,7) instead of mirror steel, floor 30 → 22 m, and a per-instance
  `enWidth` (pool.ts, conductors.ts) carrying the line type: NN 0,6 / SN 0,85 / WN 1,15
  of the pixel radius. Steel tints darker (0,5 → 0,3), near-LOD members ~25 % thicker.
  Done 2026-09-20 (all of the above; `enWidth` and the 22 m floor were already in
  place). Verified on captures/grid/s2/verify-halo-* (7 frames, consoleErrors [],
  budget ok): the red overload reads at night-strategic (a short stub, partly under
  the HUD chips) and clearly at the overload-evening closeup.
- [x] 3 Construction / upgrade judged. The registry `construction-noon` frame (closeup
  12,9, summerHigh, turn 4) does NOT contain the construction head: line-hv-jasienica-
  zalesie sits at progress 0,700 with the head ≈ (245,2; 270,6) km ≈ near (11,10), ~48 km
  from the 12,9 focus and behind the closeup camera — the f-showcase-construction-noon
  capture follows the registry and shows the same empty plot. t-construction-a / b
  (11,7 yaw 20° / 0°, frostHigh) and t-construction-c (11,10 yaw −40°) frame the lone
  unstrung head tower and the built run towards Zalesie; the head with no span beyond it
  reads as construction. Upgrade: t-upgrade-evening (registry frame, closeup 7,8,
  frostHigh turn 6) — pale taller translucent WN ghost towers 0,45 km beside the live
  amber MV line, the old line keeps its load colour; judged pass. Change request below:
  move the construction-noon focus (registry is not ours).
- [x] 4 3+-lane corridor verified with a synthetic line set (no such corridor in the
  midgame state) — found and fixed a real bug: `corridorSigns` scored every corridor
  STEP on its own; on the middle steps of a shared run the lane offsets are symmetric,
  so the score was 0 → sign +1, while a fork at the run's end could pick −1 — every lane
  mirrored at that vertex and all lanes crossed. The sign is now decided per RUN (a
  chain of steps shared by the same line set), in the travel frame of the walking line
  (the canonical direction of a corridor key flips relative to travel: `"10,6" <
  "9,6"`), and turned back into a canonical sign per step. Re-verified 2026-09-20 with
  the scratch test (4 cases): 2 and 3 lanes → 0 crossings anywhere; 5 and 9 lanes → 0
  crossings inside the run, all remaining crossings sit at the fork vertices (5 lanes:
  2, 9 lanes: 22), where a lane whose leg leaves on the far side must cut across the fan
  — inherent to the bridge's state-order lane numbering (integrator item). Scratch file
  deleted afterwards; tests/unit left clean.
- [x] 5 Headed GPU cost with and without the grid layer, low tier — post-tune runs
  (low2 / low3, 2026-09-20, frostHigh turn 6, modules terrain+sky+effects ± grid):
  strategic withGrid 3,67 / 2,98 ms (13 calls, 133 854 tris) vs noGrid 2,70 / 2,89 ms
  (7, 103 860) → delta +0,97 / +0,09 ms; closeup 19,6 withGrid 2,99 / 2,29 ms (20,
  199 782) vs noGrid 3,45 / 3,34 ms (7, 154 884) → delta −0,46 / −1,05 ms. The closeup
  sign inversion is consistent across all post-tune runs and the pre-tune trio — at low
  tier the grid's marginal closeup cost sits below the measurement noise floor; budget
  ok in every run. High tier (2026-09-19, pre-tune, kept as reference): noGrid closeup
  4,58 ms / 25 / 377 775, withGrid closeup 5,90 / 38 / 422 673; both strategic runs miss
  the 6,7 ms budget on terrain+sky (noGrid 7,31 / 25 / 210 519, withGrid 7,53 / 31 /
  240 513) — not on this layer.
- [x] 6 Polish toward the bar: the `enWidth` (NN 0,6 / SN 0,85 / WN 1,15), the matte
  sun-lit far tube and the dimmed halo from item 2 are the line-width / far-conductor
  pass. Judged on verify-halo-* and the final f-* set: at the strategic scale the three
  types separate by width and colour (slim bright NN, amber SN, white WN), the far
  conductors read as sun-lit hairlines instead of mirror steel.
- [x] 7 Gates: prettier, `npm run lint`, `tsc -p tsconfig.json --noEmit`,
  `vitest --project unit` green 2026-09-20; this file rewritten.

## Step 1 (2026-09-06) — what changed

Found on arrival: six files from an interrupted step (2026-09-05, no PROGRESS.md) —
`lattice.ts` (Truss: merged members with vertex colour), `pylons.ts` (three tower specs,
near/far geometry, terminal portal), `route.ts` (corridor signs, lane-offset polyline,
inset ends, structure placement, sag clearance), `conductors.ts` (unit catenary tube,
screen-space-radius material with per-instance `enLoad`), `pool.ts` (InstancedMesh
pool), `index.ts` (module: diff per line, pools, loads, construction and upgrade hooks).
They compiled and linted; nothing had been captured. Continued from that code:

- **Load colour that survives ACES** (conductors.ts). The first captures showed the
  overloaded NN 150/150 at Kamionka as cream and the SN 500/500 corridor as white: ACES'
  input matrix bleeds ~8 % of red into green, so any red bright enough to bloom
  (luminance ≥ 1 needs R ≈ 4,7) tone-maps to salmon. Now the wire core is hue-stable —
  ok (0,5, 0,46, 0,4), warn (1,25, 0,31, 0,01), over (1,55, 0,04, 0,02) — and warn/over get
  their glow from a second, wider (≈ 4–6 px), additive, unfogged halo pass drawn only for
  hot spans (`conductorGlowMaterial`; `LOAD_FLAG` 0/1/2 in `enLoad.a`: halo, halo + breath).
  The 0,5 Hz ±30 % breath multiplies both passes under `ctx.motion.ambient` only.
- **Near/far partition by camera distance** (index.ts). Every line's structures are built
  once and kept; each frame the camera position decides which towers / portals / ghosts /
  spans are near (full lattice, one tube per phase + earth wires) and which are far (a
  dozen members, one tube per side); instance buffers are refilled only when the camera
  moved > 3 km (`refreshLod`, `pack`). Radius = 1,2 × view distance + 24 km; nothing is
  near beyond NEAR_LOD_KM × QUALITY_PROFILES[tier].detail (250 / 150 / 75 km). Closeup
  triangles: 585 k → 362 k (grid ≈ 160 k of it, was ≈ 370 k).
- **Lattice members as open triangular prisms** (lattice.ts): 6 tris instead of 12 per
  member, indistinguishable at the pixel a member covers.
- **Weathered zinc** instead of mirror steel (metalness 0,55, roughness 0,62; tints
  0,55 → 0,36 sRGB with a 12 % rust chance from `ctx.rng("grid:weathering:<lineId>")`), so
  towers read as dark lattice against snow and haze instead of white scribbles.
- Halo set repacked whenever the set of warn/over segments changes (`hotSignature`).

## Checklist (brief)

- [x] 1 Pylons — three silhouettes at HEIGHT_KM (NN one arm level + peak phase; SN two
  levels; WN three levels, two earth-wire peaks); InstancedMesh per type × near/far;
  every PYLON_SPACING_KM along the lane-offset route; feet on `ctx.terrain.heightAt`
  (caisson at sea); yaw along the span, angle towers on the bisector; terminal portal at
  both ends (end portal only once built). Judged at closeup (c-close-centrum,
  c-golden-trunk) and at the low-camera type read added in step 2 (t-lv-*, t-mv-*,
  t-hv-*, t-*-portal).
- [x] 2 Conductors — catenary sag CONDUCTOR_SAG × span (clearance-reduced over ridges);
  NN 3, SN 6, WN 6 + 2 earth; screen-space radius; emissive = load, static twin = colour,
  breath only under ambient motion. Judged: red at Kamionka (closeup + strategic tick),
  amber trunk at 75 %, white ok lines, dark idle lines.
- [x] 3 Hooks — `ctx.root.userData.gridPolylines` (segmentKey → Vector3[] world space, sag
  included, 6 samples per span), `gridSegments` (load, ratio, MW, direction);
  `grid:construction-head:<lineId>` / `grid:upgrade-head:<lineId>` Object3Ds.
- [x] 4 Construction / upgrade — towers up to `progress` × route length, spans minus the
  last one (Jasienica → Zalesie at 0,8 reads as a dark line ending short of Zalesie in
  c-game-noon); upgrade ghosts of the target type 0,45 km beside the old line up to
  upgrade.progress (four ghost WN towers along Łęgi → Centrum at 0,35, c-close-upgrade),
  old line keeps its load colour. Step 2: judged again on t-construction-* /
  t-upgrade-evening.
- [~] 5 Corridors — lane offset via laneOffsetKm with a per-corridor sign chosen by the
  lines' continuations (route.ts `corridorSigns`); the two-lane corridors at Centrum
  (HV Jasienica + MV BESS) run parallel without crossing (c-close-centrum). The
  run-level sign fix is verified for 2 / 3 / 5 / 9 lanes (step 2, item 4); crossings
  remain at the fork vertices for 5–9 lanes (state-order bridge lane numbering —
  integrator item, see Change requests).
- [x] 6 Diff — rebuild key = id, type, built, progress, upgrade, lanes + sign, segment
  partition, seed, board, tier; loads refreshed every update; repack on camera moves.
- [x] 7 Budget — see Measured: +6 / +15 draw calls, +28 k / +106 k tris, +0,27 / +0,15 ms
  GPU (strategic / closeup, high tier, step 1). Step-2 low-tier re-measure: deltas at or
  under the noise floor (see Measured).
- [x] 8 Captures — showcase (4), game strategic evening + noon with and without HUD,
  closeups Centrum / upgrade / Zalesie, golden trunk; every JSON: consoleErrors [],
  pageErrors [], modules ready, headless budget ok; determinism md5 equal (step 1). The
  step-2 attempt to re-run determinism died with the same SwiftShader page crash as the
  baseline (captures/grid/s2/det.log), so step 2 has no fresh md5 pair.

## Measured

- Step 2 final headless set (SwiftShader, captures/grid/s2/f-*.json, all platforms fresh
  servers, modules ready, errors 0, budget ok, GPU estimate 9,3 MB showcase / 14,4 MB
  game): showcase trunk-noon 47 calls / 920 159 tris; corridor-golden 42 / 375 378;
  overload-evening 38 / 422 673; night-strategic 31 / 239 223; construction-noon 40 /
  815 945; upgrade-evening 37 / 438 223; tower-detail 38 / 466 247; game evening 68 /
  372 839; game noon 69 / 601 957; the HUD-off game pair identical in calls / tris.
- Headed (Apple M3 Pro, Chromium 1600×900, captures/grid/s2/p-*-low2 / low3, 2026-09-20,
  frostHigh turn 6, low tier, terrain+sky+effects ± grid): strategic withGrid 13 calls /
  133 854 tris / 3,67 / 2,98 ms vs noGrid 7 / 103 860 / 2,70 / 2,89 ms → **+6 calls,
  +30,0 k tris, +0,97 / +0,09 ms**; closeup 19,6 withGrid 20 / 199 782 / 2,99 / 2,29 ms
  vs noGrid 7 / 154 884 / 3,45 / 3,34 ms → **+13 calls, +44,9 k tris, −0,46 / −1,05 ms**
  (sign inversion = below the noise floor). All runs budget ok.
- Headed high tier, pre-tune reference (captures/grid/s2/p-*-high, 2026-09-19): strategic
  withGrid 31 / 240 513 / 7,53 ms vs noGrid 25 / 210 519 / 7,31 ms; closeup withGrid 38 /
  422 673 / 5,90 ms vs noGrid 25 / 377 775 / 4,58 ms. Both strategic runs fail the budget
  on terrain+sky, not on this layer.
- Step 1 headless (SwiftShader, medium tier, captures/grid/s1/c-*.json): showcase
  trunk-noon 42 calls / 362 408 tris; overload-evening 35 / 247 622; corridor-golden 37 /
  246 434; night-strategic 27 / 131 528; game evening strategic 37 / 188 906; game noon
  38 / 207 700; close-centrum 47 / 367 526; close-upgrade 43 / 318 662; golden-trunk 47 /
  375 074. GPU estimate 5 MB. Base terrain + sky (their PROGRESS): 19–21 calls, 104 k
  strategic / 203 k closeup → grid ≈ 6–8 calls + 28 k tris at strategic, ≈ 20–26 calls
  (shadow pass included) + ≈ 160 k at closeup.
- Determinism (captures/grid/s1/det.md5): det1/det2 closeup 19,6 =
  6c4eb5a0ac1c2ce74f705d2e0e82f601; det1/det2 game strategic =
  38bbd256f196c26360a41c9c2bd5832d. No step-2 re-run (harness crash, see checklist 8).
- Gates: prettier, `npm run lint`, `tsc -p tsconfig.json --noEmit`, `vitest --project
  unit` green at the end of both steps.

## Latest screenshots

- captures/grid/s3/e-bend.png — detail 9,5 at the trunk bend (the re-timed `tower-detail`
  frame): idle SN reads as distinct strands, angle tower takes both spans at the arm tips.
- captures/grid/s3/d-lv / d-mv / d-hv.png — the 18 km type separation at day 16 turn 4
  summerHigh (NN slim + one hang, SN two, WN three with the widest middle).
- captures/grid/s3/b-night-strategic.png — dim blue-grey idle trunks vs bright loaded
  corridors (issue 1).
- captures/grid/s3/b-trunk-noon.png / b-overload-evening.png — warn halo at noon and the
  warn + ok pair (issue 2).
- captures/grid/s3/b-construction.png (closeup 11,10) — amber scaffold + gin pole at the
  unstrung head (issue 5).
- captures/grid/s3/c-upgrade-night.png (ghost cages beside the live line) and
  captures/grid/s3/d-upgrade-day.png (dotted ghost lane by day, issue 4).
- captures/grid/s3/b-corridor.png — the re-timed corridor-golden (turn 4).
- captures/grid/s3/b-game-noon.png / b-game-evening.png (HUD on) and
  e-game-noon-hud0.png / e-game-evening-hud0.png (HUD off) — the strategic judging pair.
- captures/grid/s3/e-twin-a.png / e-twin-b.png — the determinism pair (md5 equal).
- captures/grid/s3/f-gpu-grid-on.png / f-gpu-grid-off.png — headed layer-cost pair.

Step 2 screenshots:

- captures/grid/s2/t-lv-a / b / c, t-mv-a / b / c, t-hv-a / b / c — the step-2 low-camera
  type read (NN / SN / WN at ~18 km / 20°), plus t-mv-portal and t-hv-portal for the
  terminal portals.
- captures/grid/s2/t-construction-a / b / c — the Jasienica construction head (the
  registry construction-noon frame misses it, see checklist 3).
- captures/grid/s2/t-upgrade-evening.png — ghost WN towers beside the live amber MV line.
- captures/grid/s2/f-showcase-trunk-noon.png — final showcase, trunk at the judging turn.
- captures/grid/s2/f-showcase-corridor-golden.png — two-lane corridor from the golden
  preset; sky still drops snow in summerLow (Change requests).
- captures/grid/s2/f-showcase-overload-evening.png — red NN line at Kamionka, halo.
- captures/grid/s2/f-showcase-night-strategic.png — only the loaded corridors show.
- captures/grid/s2/f-showcase-construction-noon.png / f-showcase-upgrade-evening.png —
  the registry frames as they currently stand (construction frame needs the new focus).
- captures/grid/s2/f-showcase-tower-detail.png — detail preset at turn 5 (dusk); towers
  read as silhouettes, conductors glow.
- captures/grid/s2/f-game-evening.png / f-game-noon.png (HUD on) and
  f-game-evening-clean.png / f-game-noon-clean.png — the strategic judging frames.

## References

- Polish 110 kV single-circuit lattice towers (series B2 / O24): slim body, one crossarm
  level, third phase on the peak — the triangle silhouette.
- 220 kV double-circuit two-level towers (Zweiebenenmast): wide lower arm with two phases
  per side, narrow upper arm with one.
- PSE 400 kV double-circuit barrel towers (series Y52 / Tonnenmast): three arm levels,
  the middle widest, cat-head with two earth-wire peaks.
- Substation dead-end gantries (portal frames) with tension insulator strings.
- Photography of HV lines at golden hour (wire = bright hairline, tower = dark lattice)
  and night satellite imagery of a grid (only the loaded corridors show).

## Known gaps

- Upgrade/construction ghost emission (`uGhostGlow` / `uMarkerGlow`) is washed out by the
  scene environment at high noon — by day the read leans on the wireframe + hatch bands
  and the 1,1 km offset, not on glow. Night is the strong read. If the day read is judged
  weak later, raise the day gain or darken the ghost albedo rather than the emissive.
- `scene.overlay.bottleneck` is read by nothing yet (the ring is effects'); the hooks
  carry what effects needs.
- Fork-vertex lane crossings at 5–9 lanes stay until the bridge numbers lanes by the
  departure side (integrator item; `route.ts` must not compensate).

## Change requests

- HUD/bridge (labels): the warn indication next to a line is only the line label; the
  critic asked for an explicit alarm. Proposed copy — append the load fraction and the
  warning glyph to the existing label, e.g. `` `${LINE_TYPE_LABELS[type]}
  ${ratioLabel(usedMw, capacityMw)} ▲` `` for the warn state (and `▼` for over). File is
  `src/world/bridge/labels.ts`, not this module.
- Integrator: number bridge lanes by departure side to remove the fork-vertex crossings
  (5–9 lanes); nothing in `route.ts` should compensate.
- effects: flow particles along `userData.gridPolylines` (direction in `gridSegments`),
  the bottleneck ground ring from `overlay.bottleneck`, a crane at
  `grid:construction-head:<lineId>` / `grid:upgrade-head:<lineId>`.
- core/PostFx: the bloom threshold is luminance-based, so no red signal can bloom without
  turning salmon under ACES; if bloom is wanted on alarms, a selective pass on
  `ctx.layers.bloom` (declared, unused) or a max(r,g,b) threshold would do it. Not needed
  for legibility now — the halo pass covers it.
- sky: summerLow still shows snow-like precipitation in the corridor-golden frame
  (confirmed again on b-corridor, 2026-09-21).

## Next step

1. Integrator: bridge lane numbering by departure side; then re-judge the corridor frames.
2. HUD: the warn/over label copy (change request above).
3. Re-run the headed pair after core/PostFx or sky changes (the layer's gpuMs sits under
   the noise floor at low tier; a high-tier run would need a quiet machine).

## Integrator notes (2026-09-19, before step 2 completes)

- Deferred and still open from your step-1/2 reports: the bridge lane numbering
  (`buildWorldScene.buildLanes`) numbers lanes in state order, which forces crossings at
  fork vertices with 5–9 lanes. Numbering lanes by the side a lane departs toward is the
  integrator's call; until it changes, judge your corridor frames with that in mind and do
  not compensate in `route.ts` (the run-level sign fix already in place stays).
- BoardOutline no longer draws over open sea — offshore frames are clean, so the
  corridor frames over the Baltic can be re-judged.
- Showcase registry now has `construction-noon` and `upgrade-evening` (your request) and
  the harness supports `?yaw=&pitch=` for low-camera type-read frames.
