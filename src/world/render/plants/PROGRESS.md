# render/plants — progress

Hand-over between pipeline steps. Written at the start of a step, updated after every
finished sub-task, rewritten at the end.

## Step 3 (2026-09-21) — FIX ROUND (critic r1: art 7,0 / dispatcher 8,0): DONE

Eight ranked issues from the critic, fixed in order. Files touched: `materials.ts`,
`geometry.ts`, `layout.ts`, `index.ts` (this folder only). Captures in
`captures/plants/s3/`.

### 1. [HIGH] Site halo was sub-threshold at the strategic view

- **Root cause found while measuring**: `SITE_FRAGMENT` wrote the halo's strength into
  *both* RGB and alpha, and the material uses `AdditiveBlending` (SrcAlpha, One) — so the
  additive term was `colour × alpha²`, i.e. a peak of ~0,025 instead of ~0,13. That, plus
  the 16 px screen floor, is why the halos never read.
- `SITE_VERTEX`: screen floor `uPxKm × dist × 16` → `uPxKm × dist × clamp(42 + 4,2 ×
  haloSize, 60, 92)` — the floor scales with the site's own billboard (pad-derived), so EJ
  Bałtyk reads wider than TG Kamionka. The 60–150 km gate is unchanged.
- `SITE_FRAGMENT`: a `uPeak` uniform (0,12) sets the peak; RGB carries the strength, alpha
  is written as 1, so the added light is `vColor × m × vOn × uPeak` (single multiply).
- `haloTexture`: a broad soft dome (`exp(-2 r²)`, window closed 0,78–1,0) instead of the
  tight core, so the grown billboard shows a disc and not a dot.
- State colours (in `applyHalo`): running `[1,0,72,0,38]` warm × output (gain 0,35+0,75×out),
  starting `[1,0,14,0]` deep orange (gain 0,8+0,7×warm), dumping `[1,0,4,0]` amber
  (gain 1,1+0,35×dump). The dump's day gate is now 0,7–1,0 and the warm-up's 0,5–1,0.
- Verified: `t-states` (day 0 turn 5, Baltyk starting / Łęgi running / Modrzyca dumping)
  shows the three hues side by side without labels; `t-night` (day 1 turn 6 frostHigh)
  shows the amber domes at ~500 km.

### 2. [MEDIUM] Nuclear at night: a ring of lamps with no mass

- A load-scaled window band on the halls: pane energy 1,2 → 1,6 × `0,55 + 0,45 × load`,
  with the per-block occupancy already load-driven.
- Cool floodlight pools at the foot of every containment and cooling tower
  (`layout.ts` nuclear plan; `LightInstance.cool`), written as `enPhase = (phase, cool)`
  (flood attribute 1 → 2 floats) and tinted cool white in `FLOOD_FRAGMENT`.
- A faint two-part skyglow sheen on every structure at night (`STRUCTURE_EMISSIVE`):
  up-facing surfaces 0,10 and the upper third of walls 0,09, both × `uNight`. This is what
  gives the domes and towers their mass after dusk.
- Verified in `x-nuclear-night` (closeup, 22:30 atlanticLow): domes/towers read as grey
  masses, the hall band and the cool pools are visible.

### 3. [MEDIUM] Materials flat at close range

- Value range widened per surface: geometry tints (roofs 0,46 / dark roofs 0,22, steel
  0,30–0,52, concrete 0,76–0,9, brick 0,86–0,88), texture ranges (concrete 0,52 ± 0,13
  with 0,42-deep stains and rain streaks; steel 0,6 ± 0,12 with rust runs; brick 0,36 ±
  0,22; yard 0,4 ± 0,1 with oil patches; stack 0,5 ± 0,12), and material tints (steel
  `[0,44,0,48,0,52]`, steelPale `[0,72,0,75,0,78]`).
- Near-black glass: unlit panes `[0,045,0,06,0,085]`.
- Procedural grime and edge wear in `STRUCTURE_COLOR_FRAGMENT`: grime climbs the walls
  from the yard (keyed to `aWall`, 0,3 darkening + a brown shift), the top edge wears
  bright (+12 %).
- The pad edge broken: a kerb ring on the rim plus two haul tracks across the apron
  (`padGeometry`), so the site sits in the field instead of floating on a pale ellipse.

### 4. [MEDIUM] Coal stockpiles read pale like snow

- The `emit 6` sheen is now `smoothstep(0,45,0,95,vEnUp)²`-shaped, dimmer
  (`vec3(0,30,0,29,0,26) × 0,55`), so only the up-facing face of a lump catches the lamps;
  sides and base stay near-black.
- Coal albedo base 0,02 + lump³ × 0,13; lump lattice 24 → 9 (coarser), normal scale 3 → 2,4.
- Verified in `w-coal-detail-evening` / `x-coal-noon`: the piles are dark mounds with a
  lit top, not snow.

### 5. [MEDIUM] Coal smoke invisible by day at the strategic view

- Puffs carry a per-kind screen floor: `minPx` 8,0 for smoke (2,5 vapour, 2,0 heat,
  3,0 wisp) and the grown-puff opacity penalty for soot is `grown^0,3` instead of `^0,6`,
  so a 750 MW column survives at ~500 km.
- The column is wider (stack mouth radius × 1,6 → × 2,4; growth 0,9 + 3,4 t) and darker
  (albedo 0,05–0,12), so it reads as soot over green terrain after the strategic fog.

### 6. [LOW] Heat plume beads; ACC fan rings

- Heat: puffs 22 → 26, growth 1,5 + 4,6 t → 2,2 + 6,2 t, alpha 0,06–0,18 → 0,04–0,12; the
  per-puff `pow(1-t,3) × 2,2` mouth spike became an even `0,3 + 0,7 × (1-t)^1,5` gradient
  × 1,05 — a continuous low amber column with a hot mouth.
- ACC: the glowing disc is now a near-black blade disc (`[0,06,0,07,0,08]`) with a cool
  `RingGeometry` rim light (`emit 8`), so the deck reads as a machine. Verified in
  `x-ccgt-detail`.

### 7. [LOW] Dump signal at noon

- The dump's `enSite` gate is 0,7–1,0 (was 0,2–0,5) and its gain 1,1–1,45 × `uPeak`
  (peak ~0,17). Verified: `t-noon` (day 1 turn 4 summerHigh, all blocks dumping) shows
  amber domes on green terrain; measured +63 red / +28 green at the Łęgi core against the
  same frame without the plants module.

### 8. Cross-module (change requests, not fixed here)

- Plant label overlap and the missing tech suffix at strategic distance → HUD
  (`src/world/hud/**`).
- Rain streaks → sky (`src/world/render/sky/**`).
- Terrain sheen over geometry → terrain (`src/world/render/terrain/**`).

### Verification (captures/plants/s3/, headed Chromium, high tier, 1600×900, clock pinned)

- `w-*` — the plants showcase walk, bare (`?showcase=plants`): `w-nuclear-noon`,
  `w-coal-evening`, `w-ccgt-evening`, `w-coal-detail-evening` (hero), `w-ocgt-night`.
- `x-coal-noon` — noon coal closeup; `x-nuclear-night` — nuclear at 22:30; `x-ccgt-detail`
  — CCGT fan deck + heat column.
- `t-night` (day 1 turn 6 frostHigh strategic), `t-noon` (day 1 turn 4 summerHigh
  strategic), `t-states` (day 0 turn 5 frostHigh — the three halo colours), plus the
  matching `t-noon-noplants` / `t-states-noplants` module-off frames used for the
  pixel measurements.
- `det-a` / `det-b` + `det.md5` — determinism twins, detail 6,9 turn 6 frostHigh:
  `da0f8765758d53766d01fa88229df61b` both (a first pair differed because an HMR reload
  from a concurrent fix round landed mid-run; the clean pair matches byte for byte).
- `perf-with-*` / `perf-without-*` — the module's cost on the showcase strategic frame
  (`--modules terrain,sky,plants` vs `--modules terrain,sky`): usable pair **43 calls /
  221 833 tris** with vs **25 calls / 210 519 tris** without → **+18 calls, +11,3 k tris**
  (the ACC rims and kerb rings added geometry since step 2). One `perf-with-1` run caught
  a transient (25 calls / 115 k tris — terrain LOD while another round was compiling) and
  is not used.
- Every JSON: `consoleErrors` / `pageErrors` **[]** on all frames.
- `budget.ok` is **false on every frame**, always on the gpu-ms line only (7,1–32,4 ms
  against the 6,7 ms ceiling) while the same page reports 78–120 fps and `gpuMs` swings
  by 4× between identical runs — the harness's GPU timer query is unreliable while the
  machine is shared with the other fix rounds' captures (the critic's r1 log documents the
  same contradiction). Calls, triangles and GPU bytes pass everywhere; two frames also
  tripped the 4 s first-interactive line under load.

### Gates

- `npx prettier --write src/world/render/plants` — clean.
- `npm run lint` — clean.
- `npx tsc -p tsconfig.json --noEmit` — clean at the end of the round (mid-round it
  reported `src/world/render/grid/index.ts` errors from a concurrent fix round; that file
  is outside this module and was fixed by its owner before the final run).
- `npx vitest run --project unit` — **515 / 516 pass**. The single failure is
  `tests/unit/perf-year.test.ts` ("288 turns on map v1"): a wall-clock assertion,
  335 ms > 300 ms, with no engine diff anywhere in the working tree — machine load from
  the concurrent rounds, not this module.

### Known gaps (step 4 candidates)

- The halo's `depthTest: false` means a dome draws over hills and other modules at map
  distance; a depth-aware soft occluder would be nicer.
- The dump and the warm-up are one billboard each; a distinct dump marker (arrow, tick)
  belongs in `render/effects` — the hook already carries `dumpMw`.
- The 3–6 block layouts and the 1,5 s transition are still judged by code only.
- Smoke still lightens with the strategic fog; a per-kind fog factor would keep soot
  darker at 500 km.

### Change requests (outside this folder)

- `src/world/hud/**` — plant labels overlap and drop the tech suffix at strategic
  distance (critic item 8).
- `src/world/render/sky/**` — rain streaks (critic item 8).
- `src/world/render/terrain/**` — terrain sheen over geometry (critic item 8).
- `scripts/capture.mjs` — the gpu-ms budget line fails on every frame of this machine
  while `fps` contradicts it; a `--repeat N` median (step-2 request, still open) or a
  timer-health check would make `budget.ok` usable.

### Step 2 (2026-09-20) — strategic read, closeup read, plumes, coal yard: DONE

Kept as history: the site halo gained its dump gate (60–150 km), the coal yard moved to
the west flank, windows became bays with dark piers, the coal smoke became one dense
column, CCGT ≠ OCGT at night. Judged in `captures/plants/s2/`.

### Step 1 (2026-09-07) — module core: DONE, judged in captures

21 archetype builders, four deterministic site plans, seven PBR surfaces, the plume /
glow / flood ShaderMaterials, one InstancedMesh per archetype. Judged in step-1 captures.

### References (used)

- Nuclear: Temelín / Dukovany, Sizewell B. Coal: Bełchatów / Kozienice, Battersea.
  CCGT: Płock / Stalowa Wola. OCGT: LM6000 / TM2500 peaker yards.
- Night aerial photography of power plants (floodlit yards, red obstruction lights);
  Anno 1800 / Transport Fever 2 for readable industry at map distance.
