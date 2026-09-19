# render/grid — progress

Hand-over between pipeline steps. Written at the start of a step, updated after every
finished sub-task, rewritten at the end.

## Step 2 (2026-09-11) — in progress

Found on arrival: the step-1 module (six files + this file) untouched since 2026-09-06;
the showcase registry gained three grid frames (`construction-noon`, `upgrade-evening`,
`tower-detail` on the new `detail` camera preset — 18 km, 20°). The effects module is
still a stub, so the hooks have no consumer yet. Port 5173 is held by another app; the
harness uses our server on 5174.

### Checklist (step 2)

- [ ] 0 Baseline captures of the seven showcase frames + both game frames with the
  current tree (captures/grid/s2/a-*).
- [ ] 1 Type read: detail frames of NN (Kamionka 19,6), SN (Łęgi–Centrum 7,8) and WN
  (trunk 9,5) plus the terminal portals; proportions against the references.
- [~] 2 Halo tune: near gain 0,22 → 0,15, far 0,28 → 0,24, both × (1 − 0,6 ×
  daylight) so the halo dims by day the way core's bloom does; halo radius 2 → 1,6 px
  (near) and 3 → 2,6 px (far). Far tube: matte grey ACSR (metalness 0,55, roughness
  0,55, albedo 0,7) instead of mirror steel, floor 30 → 22 m, and a per-instance
  `enWidth` (pool.ts, conductors.ts) carrying the line type: NN 0,6 / SN 0,85 / WN 1,15
  of the pixel radius. Steel tints darker (0,5 → 0,3), near-LOD members ~25 % thicker.
  To judge in the b-* captures.
- [ ] 3 Construction line at a sunny closeup (construction-noon) and the upgrade frame.
- [x] 4 3+-lane corridor verified with a synthetic line set (no such corridor in the
  midgame state) — found and fixed a real bug: `corridorSigns` scored every corridor
  STEP on its own; on the middle steps of a shared run the lane offsets are symmetric,
  so the score was 0 → sign +1, while a fork at the run's end could pick −1 — every lane
  mirrored at that vertex and all lanes crossed. The sign is now decided per RUN (a
  chain of steps shared by the same line set), in the travel frame of the walking line
  (the canonical direction of a corridor key flips relative to travel: `"10,6" <
  "9,6"`), and turned back into a canonical sign per step. Check (scratch vitest, 5
  cases): 2 and 3 lanes → 0 crossings anywhere; 5 and 9 lanes → parallel at full
  spacing (1,8 / 1,5 km) inside the run, crossings only at the fork vertices (4 / 31),
  where a lane whose leg leaves on the far side must cut across the fan — inherent to
  the bridge's state-order lane numbering (change request below).
- [ ] 5 Headed GPU cost with and without the grid layer (strategic + closeup), low tier.
- [ ] 6 Polish toward the bar: strategic frame first (line width by type, sun-lit far
  conductors), then closeups.
- [ ] 7 Gates: prettier, lint, tsc, unit tests; rewrite this file.

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
  c-golden-trunk); a low-camera type-read frame (NN vs SN vs WN at ~20 km) is still owed.
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
  old line keeps its load colour.
- [~] 5 Corridors — lane offset via laneOffsetKm with a per-corridor sign chosen by the
  lines' continuations (route.ts `corridorSigns`); the two-lane corridors at Centrum
  (HV Jasienica + MV BESS) run parallel without crossing (c-close-centrum). No 3+-lane
  corridor exists in the midgame state, so 9 lanes are untested.
- [x] 6 Diff — rebuild key = id, type, built, progress, upgrade, lanes + sign, segment
  partition, seed, board, tier; loads refreshed every update; repack on camera moves.
- [x] 7 Budget — see Measured: +6 / +15 draw calls, +28 k / +106 k tris, +0,27 / +0,15 ms
  GPU (strategic / closeup, high tier).
- [x] 8 Captures — showcase (4), game strategic evening + noon with and without HUD,
  closeups Centrum / upgrade / Zalesie, golden trunk; every JSON: consoleErrors [],
  pageErrors [], modules ready, headless budget ok; determinism md5 equal.

## Measured

- Headless (SwiftShader, medium tier, captures/grid/s1/c-*.json): showcase trunk-noon
  42 calls / 362 408 tris; overload-evening 35 / 247 622; corridor-golden 37 / 246 434;
  night-strategic 27 / 131 528; game evening strategic 37 / 188 906; game noon 38 /
  207 700; close-centrum 47 / 367 526; close-upgrade 43 / 318 662; golden-trunk 47 /
  375 074. GPU estimate 5 MB. Base terrain + sky (their PROGRESS): 19–21 calls, 104 k
  strategic / 203 k closeup → grid ≈ 6–8 calls + 28 k tris at strategic, ≈ 20–26 calls
  (shadow pass included) + ≈ 160 k at closeup.
- Headed (Apple M3 Pro, Chromium 1600×900, high tier, captures/grid/s1/perf-*.json):
  strategic grid showcase 8,03 ms GPU / 31 calls / 238 173 tris vs terrain + sky alone
  7,76 ms / 25 / 210 519 → **grid +0,27 ms, +6 calls, +27,7 k tris**; closeup (9,6)
  7,27 ms / 41 / 484 131 vs 7,12 ms / 26 / 377 775 → **+0,15 ms, +15 calls, +106 k
  tris**; whole game evening strategic 7,73 ms / 41 / 305 581. The budget line fails on
  the base's 7,1–7,8 ms (being cut by terrain/sky), not on this layer.
- Determinism (captures/grid/s1/det.md5): det1/det2 closeup 19,6 =
  6c4eb5a0ac1c2ce74f705d2e0e82f601; det1/det2 game strategic =
  38bbd256f196c26360a41c9c2bd5832d.
- Gates: prettier, `npm run lint`, `tsc -p tsconfig.json --noEmit`, `vitest --project
  unit` green at the end of the step.

## Latest screenshots

- captures/grid/s1/c-showcase-overload-evening.png — red NN line at Kamionka, halo.
- captures/grid/s1/c-close-centrum.png — amber WN trunk arriving at SR Centrum, lattice
  towers, dark idle Ławica line, two-lane corridor to Jasienica / BESS.
- captures/grid/s1/c-golden-trunk.png — golden preset on the trunk at the judging turn.
- captures/grid/s1/c-game-evening.png / c-game-noon.png — strategic judging frames
  (amber trunk, red Kamionka tick, white ok, dark idle, construction line to Zalesie).
- captures/grid/s1/c-close-upgrade.png — ghost WN towers beside the live MV line.
- captures/grid/s1/c-showcase-corridor-golden.png, c-showcase-night-strategic.png,
  c-showcase-trunk-noon.png; b-game-*-hud.png (HUD on); a-* = the inherited code before.

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

- The near halo at closeup is heavy ("neon tube", c-close-centrum); tune nearGlow gain
  0,22 → ~0,15 and width after a critic look.
- Idle far tubes (min radius 30 m) read as black strokes at the noon strategic view; a
  distance fade or thinner floor may read better than pure black.
- Pylon type read (NN / SN / WN) not yet judged from a low camera at ~20 km; the closeup
  preset sits at 42 km / 32°. Terminal portals never seen close.
- Construction line judged only at strategic and through the noon haze at closeup.
- 3+-lane corridors untested (none in the midgame state).
- `scene.overlay.bottleneck` is read by nothing yet (the ring is effects'); the hooks
  carry what effects needs.

## Change requests

- effects: flow particles along `userData.gridPolylines` (direction in `gridSegments`),
  the bottleneck ground ring from `overlay.bottleneck`, a crane at
  `grid:construction-head:<lineId>` / `grid:upgrade-head:<lineId>`.
- core/PostFx: the bloom threshold is luminance-based, so no red signal can bloom without
  turning salmon under ACES; if bloom is wanted on alarms, a selective pass on
  `ctx.layers.bloom` (declared, unused) or a max(r,g,b) threshold would do it. Not needed
  for legibility now — the halo pass covers it.
- showcase/registry: add `construction-noon` (closeup 12,9, turn 4, summerHigh) and
  `upgrade-evening` (closeup 7,8, turn 6, frostHigh) to SHOWCASES.grid so the two
  states have a frame of their own.
- sky: summerLow shows snow-like precipitation in the corridor-golden frame.

## Next step (step 2)

1. Low-camera type-read frame per tower (NN / SN / WN side by side) and the portals;
   fix proportions against the references if a silhouette misreads.
2. Tune the halo (gain, width) and the idle far tube; judge a sunny closeup without haze.
3. Verify a 3-lane corridor with a synthetic scene (or a start-scenario line pair).
4. Re-measure headed after terrain/sky land their cuts.
