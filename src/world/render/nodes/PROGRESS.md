# render/nodes — progress

Hand-over between pipeline steps. Written at the START of a step; updated after every
finished sub-task; rewritten at the end.

## Step 2 (2026-09-21) — step-1 gaps closed, layer measured, art polish

Brief: close the remaining step-1 items — (1) disconnectors, strain clamps and cable
trenches; (2) lit hall windows; (3) a stronger strategic silhouette from `slotsUsed`
(night yard glow scaled by occupancy); (4) the reserved-but-unstrung bay read (a line end
of an *unbuilt* line: equipped bay, no conductor — distinct from a plain bare bay);
(5) capture the border **export** branch — then measure the headed cost and polish
strategic frame first. Captures under `captures/nodes/s2/`.

Integrator note acted on: `junction-noon` + `site-progress` are now `detail` frames and a
`border-import` frame (day 0 turn 0 frostHigh detail) exists — the cyan read is stageable
and verified (see the screenshot list). `render/effects` is still a stub; the crane hook
is untouched.

### Checklist (step 2)

- [x] 0 PROGRESS.md s2 section; probed the export branch (no export in the whole midgame
      script — staged it by driving the dispatcher slider, see below)
- [x] 1 `geometry.ts`: `disconnector`, `trench`, `windows` archetypes; the dead-end string
      got its strain clamp (yoke plate, clamp body, arcing horn)
- [x] 2 `layout.ts`: 6 radial trenches + a 12-segment ring trench; a line and a bus
      disconnector per occupied bay; window bands on every hall (junction + border);
      reserved bays get a pile-cap plinth, dead-end strings and apparatus but no jumper
- [x] 3 `index.ts`: new pools/materials, occupancy-scaled lamps + pools + windows, the
      number of lit masts counts used bays (2 + round(2·occ) of 4), floodlit-steel
      emissive at night, detail LOD, diff key unchanged in shape
- [x] 4 All five showcase frames + game frames (day/night, hud 0/1) + closeup + the export
      branch captured and every PNG read; JSONs: console/pageErrors empty, budget ok
- [x] 5 Headed cost measured (strategic and detail, terrain,sky,grid ± nodes); determinism
      pairs byte-identical with `motion none` **and** `motion full`
- [x] 6 Gates: prettier, lint, tsc, vitest unit — green; this file rewritten

### What changed (files)

- `src/world/render/nodes/geometry.ts` — `disconnector` (two porcelain posts, blades,
  motor drive), `trench` (concrete channel + cover plates, unit 1 km along X),
  `windows` (unit band box, unlit material), `TRENCH`/`WINDOW_BAND_KM`; the insulator
  string now ends in a strain clamp; galvanised/gravel textures brightened.
- `src/world/render/nodes/materials.ts` — `windowAlbedo()` (6×2 panes, dark mullions),
  the unlit `window` material; steel roughness 0,5 / metalness 0,38 (the s1 lattice went
  near-black against snow at 0,58); gravel 0,28–0,66 (was 0,14–0,5).
- `src/world/render/nodes/layout.ts` — `junctionEnds` splits live vs reserved (by
  `line.built`); occupied bays get breaker + 2 disconnectors; trench system; `hallWindows`
  on both facades of every hall; site laydown props scaled down (0,45 container / 0,6
  pipe — the s1 sizes read as white buildings); border flow spots sit on the equipment
  now, not floating above it.
- `src/world/render/nodes/index.ts` — pools for the new archetypes; `GlowRecord.owner` +
  `Entry.occupancy` (junction slotsUsed/slots, border 0,65, site 1); `paintWindows` (dark
  glass by day, warm panes at night, ∝ occupancy); per-entry pool brightness; `flow`
  glow now indexes its **entry** (bug fix, see below); night floodlight emissive.

### Bug found and fixed in this step

- The border flow glow indexed `entries` by *border ordinal*; with two junctions ahead of
  the border every border read the first junction's `flowShown` and painted the idle blue
  whisper regardless of the import/export. Found while staging the export capture; fixed
  to the entry index. The registry `border-import` frame is cyan and the export frame is
  amber now (before the fix both were dim blue).

### Export staging (not in the registry)

`MIDGAME_SCRIPT` never sets an export setpoint, so no harness URL can stage the export
read. It was staged by driving the real UI in a scripted Playwright session (dispatcher
panel, `EKSPORT PG ZACHÓD` slider → 500 MW, `__en.resolve()` twice): day 1 turn 5,
`exportDeliveredMw` 332, `ratio` 0,665, `importUsedMw` 100 → amber. Console/page errors
empty. The HUD-on frame shows the order (`PG ZACHÓD · -400`); the bare frames hide the
overlay via injected CSS in the same session (see Change requests for a registry frame).

### Measured (step 2)

- Headless SwiftShader, every run `consoleErrors []`, `pageErrors []`, all modules ready,
  `budget.ok` (captures/nodes/s2/*.json):
  junction-noon detail 43 calls / 288 100 tris; border-import detail 39 / 248 100;
  border-golden golden 25 / 180 476; junction-night detail 44 / 283 954; site-progress
  detail 34 / 240 704; junction closeup 43 / 281 426; game evening (all modules,
  strategic, hud 1 and 0) 105 / 314 068; game noon (all modules, strategic, hud 1 and 0)
  96 / 305 180.
- Headed Apple M3 Pro, Chromium 1600×900, medium tier, judging state day 1 turn 6
  frostHigh:
  - strategic: `terrain,sky,grid` 13 calls / 133 854 tris / gpu 3,98 ms / 104 fps vs
    `+nodes` 26 / 180 476 / 3,79 ms / 102 fps → the layer adds **+13 draw calls,
    +46,6 k triangles, +0,0 ms** (inside the noise floor; budget ok).
  - detail (focus 9,6): `terrain,sky,grid` 23 / 236 306 / 3,07 ms vs `+nodes` 59 /
    340 808 / 3,08 ms → **+36 draw calls** (17–18 in the main pass, the rest are the
    shadow-map re-draws of the same meshes), **+104,5 k triangles, +0,01 ms GPU**. Layer
    budget ≤ 30 main-pass draws / ≤ 250 k tris: 17–18 / 104,5 k in the busiest frame.
- Determinism: two identical `--motion none` runs are byte-identical (md5
  `7c4885009408ea0aa27cbc8a2c1317f6`); with `motion full` the pair is also identical
  (md5 `f08363e4d889179d1f2b1c8b8cb5b1e0`) — the s1 variant split did not reproduce here.
- Reserved-bay path verified against a synthetic scene (one built HV end + one unbuilt MV
  end, rolldown-bundled scratch): 12 gantries, 8 insulators, 1 plinth, 2 breakers,
  4 disconnectors, 18 trenches, 2 window bands, signature `0:hv:1,4:mv:0` — no crash, and
  the unbuilt end is fully equipped but conductor-less in the counts.

### Screenshots that back the claims

- `captures/nodes/s2/nodes-junction-noon.png` — the registry detail frame: grey gravel
  yard, portal ring, busbar ring, trench system, transformer bay, hall; the grid's lines
  land on the outer bays.
- `captures/nodes/s2/nodes-junction-night.png` — 22:30: floodlit steel, 3 of 4 masts lit
  (occupancy 5/12), warm light pools, the lit window band on the hall, the red obstruction
  light on the tallest gantry.
- `captures/nodes/s2/nodes-border-import.png` — day 0 turn 0 (ratio 0,4): cyan on the
  terminal strings, the transformer and the metering hall; the foreign line runs off the
  board.
- `captures/nodes/s2/nodes-border-golden.png` — the registry frame (day 1 turn 6, idle):
  the station at 110 km in the dusk (see Change request 1).
- `captures/nodes/s2/nodes-site-progress.png` — stage 0 site: cleared earth, scaled
  laydown materials, gravel heap, cabin, fence, masts.
- `captures/nodes/s2/border-export-ui.png` — the export staged through the dispatcher
  (HUD visible: `EKSPORT PG ZACHÓD 500`, `PG ZACHÓD · -400`).
- `captures/nodes/s2/border-export-bare.png` / `-bare-detail.png` / `border-export-zoom3.png`
  — the same state bare: amber on the terminal strings, hall windows, floodlit yard
  (`exportDeliveredMw` 332, ratio 0,665).
- `captures/nodes/s2/junction-check1.png` (full-module detail frame — note the effects
  ring, Change request 5), `isolate-effects.png` (the same with `effects` isolated),
  `isolate1.png` (terrain,sky,nodes), `junction-day1.png` + `-zoom.png` (bay apparatus in
  daylight), `junction-closeup.png` (42 km), `game-evening.png` / `-bare.png`,
  `game-noon.png` / `-bare.png` (the whole game, hud on and off), `strat-day.png` /
  `strat-night.png` (the layer at the strategic view, day and night).
- `captures/nodes/s2/det-a.png` / `det-b.png` (motion none) and `det-m1.png` / `det-m2.png`
  (motion full) — the byte-identical determinism pairs.
- `captures/nodes/s2/gpu-off*.png` / `gpu-on*.png` — the headed layer-cost pairs
  (strategic and detail).

### Known gaps / next step (step 3 candidates)

1. The reserved-bay read cannot be staged from the registry (no unbuilt line ends at a
   junction in the midgame script); verified against a synthetic scene only — needs a
   scenario or action hook (Change request 2).
2. The border's own yard has no trench system or transformer bay depth; the junction got
   them this step. Same treatment would thicken a border-detail frame.
3. The layer ships no selection/ring/particle hooks (effects' job) — `nodes:base:*`,
   `borderPolyline`, `site:crane:*` are the interface and stay untouched.
4. The hall is still a plain box with window bands; a door canopy and a chimney/vent
   stack would help the closeup frame at 18 km.

## Step 1 (2026-09-21) — module core: junction stations, border interconnectors, construction sites

Found on arrival: `src/world/render/nodes/index.ts` was the registry's 15-line stub (no
PROGRESS.md) — the module booted and drew nothing. Sibling builders' work in progress in
`git status` (grid, plants, res, cities, sky, terrain, core); `render/storage` and
`render/effects` are still stubs. Port 5173 is held by another app; the harness captures
against our server (the logs show `http://localhost:5173` for some runs and 5174 for others
— both served our app; see Change requests).

The judging state was probed through `window.__en.scene()` (midgame, seed 20260902):
SR Centrum (9,6 offset) `slotsUsed 5 / slots 12` with line ends on four hex sides (side 30°
carries two circuits), SR Wschód (15,7) `3 / 12`, PG Zachód (0,7) import setpoint 100 MW
**used 0** at the judging turn (the import actually runs at day 0 turns 0–3, ratio 0,4 and
is idle from day 0 turn 4 on), one site `obj-1` coal plant at (14,12), progress 0,2 → 0,4.

### Checklist (step 1)

- [x] 0 PROGRESS.md, probes, references (scratch probes kept outside the repo)
- [x] 1 `lattice.ts` + `materials.ts`: procedural galvanised steel (spangle + normal map),
      porcelain, concrete, gravel, painted cladding, chain-link (alpha-mapped), cleared
      earth; additive hue-stable glow + ground-pool shaders
- [x] 2 `geometry.ts`: portal gantry (lattice columns + truss beam), dead-end insulator
      string, three-pole breaker, transformer with radiator banks, hall, floodlight mast,
      fence post + mesh panel, foreign-line tower, unit tube, gravel/earth pads; site
      pieces (containers, pipes, heap, cabin, foundations, stack/hall/dome/turbine/rack
      skeletons, cladding, clad cylinder, scaffold)
- [x] 3 `layout.ts`: junction yard (gravel pad + fence + service ring, 6 hex sides ×
      slots/6 bay positions, strung vs bare, busbar ring on insulator posts, one breaker
      per strung bay, transformer bay, hall, 4 floodlight masts, aviation light, slack
      jumpers to the grid's terminal portal at 4,5 km); border (terminal gantry, metering
      hall + lamps, transformer, two breakers, two masts, fence, 4 foreign towers with
      sagging conductors dimming into the fog, `borderPolyline` foreign end → portal);
      site (stage 0 earthworks/materials, 0,3–0,7 foundations + skeleton growing with
      progress, 0,7–1 cladding + scaffold, fence, 3 floodlight masts, crane hook)
- [x] 4 `index.ts`: one InstancedMesh per archetype (12 non-empty pools at the judging
      state), diff key by id/hex/slots/line-ends/outward/site progress bucket/quality,
      night floodlights (shimmer under ambient only, static twin), aviation blink 0,5 Hz
      (ambient only), border flow (cyan import / amber export ∝ ratio, idle = dim cold,
      eased 1,5 s), LOD (detail archetypes beyond 300 km × detail, shadows 220 km),
      hooks `nodes:base:<id>` (+ `userData.borderPolyline`) and `site:crane:<siteId>`,
      full dispose
- [x] 5 Captures: all four showcase frames, a day-0 border-import frame (cyan flow), site
      at stage 2 (day 3), junction at detail/night, game strategic — every PNG read, every
      JSON: consoleErrors [], pageErrors [], modules ready, budget ok
- [x] 6 Measured headed layer cost (terrain,sky,grid ± nodes), determinism pair
- [x] 7 Gates: prettier, lint, tsc, vitest unit — all green; this file rewritten

### What changed (files)

- `src/world/render/nodes/lattice.ts` — Truss (prism/box/tube/sag/slab/cylinder/cone,
  vertex colours, UVs for prisms and slabs), tint table, `panel`/`squareCorners` helpers.
- `src/world/render/nodes/materials.ts` — procedural textures + PBR material set
  (`NodeMaterials`), glow billboard shader, ground light-pool shader.
- `src/world/render/nodes/geometry.ts` — archetype geometries, `GANTRY`, `GANTRY_SCALE`,
  `PORTAL_BEAM_KM`, `INSULATOR`, `MAST_HEIGHT`, `FENCE`, `sitePeakKm`, `plantPeakKm`.
- `src/world/render/nodes/layout.ts` — `layoutJunction`, `layoutBorder`, `layoutSite`,
  `sideOf`, `junctionSignature`, `fenceBayLength`; `Builder` collects instances, lamps,
  aviation, pools, flow spots, hooks.
- `src/world/render/nodes/index.ts` — the module: pools, rebuild/diff, emission and night
  animation, LOD, hooks, dispose.

### Measured (step 1)

- Headless SwiftShader (captures/nodes/s1/*.json; every run: consoleErrors [] ,
  pageErrors [], all modules ready, budget ok, GPU estimate 5–6 MB):
  junction-noon closeup 68 calls / 363 686 tris; junction-detail 68 / 389 690;
  junction-night detail 56 / 323 760; border-golden 54 / 292 700; border-import 50 /
  287 906; site-progress 53 / 237 430; site-stage2 (day 3) 60 / 318 780; game-evening
  strategic (terrain,sky,nodes,grid) 39 / 179 866.
- Headed Apple M3 Pro, Chromium 1600×900, midgame day 1 turn 6 frostHigh strategic,
  `--modules terrain,sky,grid` vs `terrain,sky,grid,nodes` (captures gpu-off / gpu-on):
  27 calls / 133 868 tris / 61 fps / gpu 2,80 ms vs 39 / 179 866 / 120 fps / 2,90 ms →
  the layer adds **+12 draw calls, +46,0 k triangles, +0,10 ms GPU** (inside the noise
  floor of this GPU); budget ok both runs, well under ≤ 30 calls / ≤ 250 k tris.
- Determinism: with `--motion none` two identical runs are **byte-identical**
  (md5 `19f70986caab801756ea639af1ffc5a3`). With motion full, runs land on one of two
  stable variants that differ only around the additive glow bloom
  (md5 `e358adf97559452865804415a6ed554e` / `14da9cac495918ed582ed0567cd54bdc`);
  geometry, structure and non-emissive pixels are identical — see Change requests.

### Screenshots that back the claims

- `captures/nodes/s1/junction-detail3.png` — the bay ring at 18 km: 12 gantries, 5 strung
  (white insulator strings), bare steel elsewhere, busbar ring, breakers, transformer,
  hall, fence; the grid's portals and jumpers land on the yard.
- `captures/nodes/s1/junction-night.png` — the night read: warm floodlight pools, four
  lit masts, the red obstruction light on the gantry, silhouetted steel.
- `captures/nodes/s1/border-import.png` — day 0 turn 0 (ratio 0,4): cyan emission at the
  terminal insulators and hall, station lamps, the foreign line running off the board.
- `captures/nodes/s1/border-golden.png` — the registry frame (day 1 turn 6, idle in
  truth): stationary station lamps, dim cold standby, foreign line fading.
- `captures/nodes/s1/site-detail.png`, `site-isolated2.png` — stage 0: earth pad, stacked
  materials, gravel heap, cabin, fence, floodlights.
- `captures/nodes/s1/site-stage2.png` (day 3) — stage 1: foundations and the future coal
  stack + hall skeleton growing with progress.
- `captures/nodes/s1/junction-noon.png` + `-crop.png` — the registry closeup: the yard
  reads as a dark gravel disc with portal silhouettes against snow (weak frame, see
  Change requests).
- `captures/nodes/s1/game-evening.png` — the strategic judging frame with the nodes layer
  in the whole game.
- `captures/nodes/s1/gpu-on.png` / `gpu-off.png` — the headed layer-cost pair.
- `captures/nodes/s1/det-m1.png` / `det-m2.png` — the byte-identical determinism pair.

### Known gaps at the end of step 1 (all closed in step 2, see above)

1. The yard's electrical detail is thin up close: no disconnectors, no cable trenches, no
   strain clamps on the dead-end strings; the hall has no lit windows of its own (lamps
   and the flow glow carry the night).
2. The strategic read of a junction is a grey blotch; a stronger silhouette idea is a
   taller lattice "gantry spine" or a night yard-glow that scales with `slotsUsed`.
3. `slotsUsed > built line ends` (a reserved bay of an unbuilt line) is not distinguished
   from a plain bare bay.
4. The `site-progress` registry frame (closeup 42 km) does not show the site as well as
   the detail preset does; the site is small and snow-toned at that distance.
5. The border's *exporting* branch is untested in any capture (the judging state never
   exports); the encoding is symmetric and driven by `exportDeliveredMw`.

### References

- Polish 110/220 kV switchyards (PSE/operator photography): gravel yards, portal gantries
  ("bramy") with dead-end strings, three-pole live-tank breakers, transformer bays with
  radiator banks, busbar rings on insulator posts.
- PL–DE interconnection terminals (Vierraden/Krajnik style): terminal portal, metering
  hall, fenced yard, the foreign line leaving toward the horizon.
- Power-plant construction sites: earthworks and pipe/container laydown, pile caps, then
  the steel skeleton of the future stack/hall, then cladding and scaffolding.

## Change requests

1. **Registry frames (integrator).** Step-1 requests 1 (frames → detail) and the
   `border-import` addition were applied — thank you. Still open: `border-golden` is a
   `golden` (110 km) frame at turn 6 `summerLow`, which is 19:30 — night — so the border
   reads as a ~40 px warm blob and the frame shows nothing of the station or its
   architecture. Proposal: switch `border-golden` to `detail` (18 km) at the same turn, or
   move it to a daylight turn (turn 3–4) so the golden-hour mood survives while the
   station reads; the flow/architecture read then needs no second frame.
2. **Scenario / capture harness (integrator).** Two states my layer encodes cannot be
   staged from the registry: (a) the *reserved bay* — `line.built === false` at a
   junction; every junction end in `MIDGAME_SCRIPT` is built, so the read is verified only
   against a synthetic scene; (b) the border *export* — the script never sets an export
   setpoint (I staged it by driving the dispatcher slider in a scripted session). Proposal:
   add a `setExport` action (e.g. `beforeTurn: 8` → `border-zachod` 500 MW) and a
   `buildLine` order into a junction before day 1, then add a `border-export` registry
   frame (day 1 turn 5, detail, focus 0,7) so both reads are judged without a script.
3. **grid (module).** Unchanged from step 1: expose the terminal portal anchor of every
   line end (`ctx.root.userData.gridPortals`: nodeKey + lineId + position + yaw + beam
   height) so the junction's entry gantry and jumper meet the grid's portal exactly; today
   `nodes` duplicates three beam heights (`PORTAL_BEAM_KM` mirrors grid/pylons.ts) and
   ignores corridor lane offsets when aiming a jumper.
4. **core/sky (integrator).** The step-1 determinism split did not reproduce in step 2:
   both `--motion none` and default `motion full` pairs are byte-identical at the detail
   frame (md5 `7c4885009408ea0aa27cbc8a2c1317f6` / `f08363e4d889179d1f2b1c8b8cb5b1e0`).
   Proposal: re-run the original failing URL before closing the ticket; if it is gone,
   note it in docs/STATUS.json.
5. **effects (module, cross-module observation).** In the all-module detail frame
   (`captures/nodes/s2/junction-check1.png`, day 1 turn 6) the overloaded 9,6 corridor
   draws a bloom ring ~200 km in radius around the junction; isolated to `effects` with
   `--modules terrain,sky,grid,effects` (`isolate-effects.png`, errors 0, all modules
   ready). It is ~100× the marker scale of the line it marks and dominates any close
   frame of the junction. Proposal: clamp the ring radius to the corridor's own scale
   (a few km) or check the radius input units — presumably WIP; flagged, not mine.
6. **Sibling race during captures (process).** While a sibling builder saved
   `render/effects/index.ts` mid-edit, one capture rendered the Vite error overlay and two
   JSONs carried HMR 500 console errors (the module set itself was ready and its budget
   ok); both frames were recaptured clean. A harness-side guard (ignore Vite HMR noise,
   or retry once on `consoleErrors` mentioning `[vite]` / 500) would keep sibling saves
   from poisoning another module's evidence.
