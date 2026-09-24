# render/terrain — progress

Hand-over between pipeline steps. Rewritten at the end of every step.

## Soft borders between hexes (2026-09-24)

- **What (`blend.ts`).** The ground of a point is the blend of the three hexes around it —
  the corners of its cell in the triangular lattice of hex centres (hex tiling on the
  board's own grid). Each hex weighs in with its barycentric coordinate, pushed by its
  channel of a slow noise (`BLEND_WANDER` 0.22: the border wanders ±2 km typically) and
  frayed by a fine one (`BLEND_FRAY` 0.1 × the hex's fray: 1 for forest, heath, rock and
  marsh — tongues, bays and islands; 0.3 for fields and towns, whose borders bend like the
  road along them). A narrow band (`BLEND_WIDTH` 0.024, ±0.3 km; the shader widens it to
  1.5 px) keeps the edge crisp. Water never takes part (the shore is the relief's). A
  hex's colour (q − r) mod 3 picks its noise channel: every cell has one of each colour, so
  a hex reads the same channel in all six cells around it and its weight is continuous.
- **Noise.** 512² RGBA8, three fractal value-noise channels (lattice 10, 3 octaves over a
  160 km tile: 16, 8, 4 km), each spread evenly over 0..1 by rank; the fine fray reads the
  same texture over a 23 km tile turned 0.6 rad (2.3, 1.2, 0.6 km). Fixed seed, painted
  once per page (~70 ms of CPU; the spread goes through a 4096-bin histogram).
- **Readability (board of seed 7).** A hex keeps 86 % of its cell on average (p5 70 %,
  worst 54 %); the flat pad (4 km) is always its own alone and no neighbour takes over
  within 6 km. The weights never jump (a 10 m step moves one by ≤ 0.12).
- **Shader.** `enHexCorners` (cell, barycentrics, colour) → the ground texel of the three
  corners (slice, rock slice, layer, fray) → `enHexWeights`; the noise taps are skipped
  where the lead of one hex is larger than the noise could close — deep inside a hex both,
  and the fine one wherever only fields meet but near the border itself (pixel-exact:
  measured 0/1 LSB difference). A hex that weighs in (`enGround`) fetches its tile map and
  tone and takes its ground tap (normal when near, rock on steep faces, all in its own
  frame); the tone is now per pixel. The layer shares for the relief, the steep faces and
  the snow come from the same weights. The vertices carry only `cover` (pavement, beach,
  seabed, sky visibility): 4 floats instead of 13. The farm track runs along the bent
  border between two grass-layer hexes (distance from the pushed-weight gap).
- **Tried and dropped.** A wide soft band (±2 km) read as a double exposure of two field
  patterns; an interlock of the band by each ground's brightness changed little once the
  band was narrow and cost ALU (captures `captures/looks/v3/try1..4`).
- **Trees (`forest.ts`).** A jittered grid over the forests' reach, only near forest hexes;
  the forest's share from the CPU mirror of the blend (`hexBlend`); the owner (character,
  density, tone) is the forest hex pushing hardest. Past the edge trees stray in copses,
  0.8 × e^(−d / 1 km). Every land hex's pad and every town (10.5 km) stay clear; the
  virtual ring's copies of a forest edge grow none. Default board: 6 576 → 9 128 trees —
  v2 left tree-less strips along every hex edge and the outer 7 % of each hex.
- **Measured** (as below, interleaved against the v2 working tree, M3 Pro, 1600×900, high):
  whole game strategic 6.12 → 6.40 ms (+4 %), closeup ~+1 %, forest closeup ~+1 %; terrain
  alone strategic +3 %, closeup +4 %. Before the tap skips the terrain alone was +20 % at
  strategic: the dependent noise taps were most of the cost.
- Tests: `tests/unit/world/terrain-blend.test.ts` (noise spread, cell, partition of the
  land, no noise = the hex grid, continuity, own share and pure middle, fields bend less
  than wild ground, tree count, trees on the forest's ground and past its outline, no tree
  on a pad or in a town); `terrain-looks.test.ts` updated (ground/rock/layer/fray, grid
  layout, vertex cover). Captures: `captures/looks/v3/` (`before-*`, `after-*`,
  `compare-*`).

## Hex looks and ground variants (2026-09-23)

- **Ground variants (`variants.ts`, `variantPainters.ts`).** Next to the eight classic
  slices the ground arrays hold 14 variants with a structure and a palette of their own:
  grass — strips (szachownica), large rectangular fields (łany, 16 km tile), meadows with
  tree lines and ponds, a hedged small-field mosaic; canopy — spruce in compartments with
  forest lines, broadleaf crowns, clear-cuts and plantations; rock — limestone, schist;
  moor — heather burnt in strips, walled pasture, scree; wet — reeds with channels,
  drained peat with ditches. 22 slices, each with its own tile size (`SLICE_TILE_KM`,
  6–16 km: large structures take large tiles so they repeat less inside a hex).
- **Painted on the GPU, read back.** One GLSL program holds every painter (tileable:
  periodic value noise and cells, jittered bands for rectangles, strip directions on the
  integer lattice); two passes per variant — sRGB albedo + roughness, then the height in
  16 bits — are read back into the same byte arrays the CPU painters fill, and the CPU
  derives the normals exactly as for the classic slices (`normalsFromHeight`). The program
  is handed to the driver before the CPU paints the classic layers, so with
  KHR_parallel_shader_compile it compiles meanwhile: texture build ~1.15 s in all
  (~0.16 s of it the variants) on an M3 Pro. Cold, right after the shader changes, the
  compile takes ~1.7 s, ~0.8 s of it not hidden — once, the driver caches it. A program
  per painter compiled no faster cold and linked slower warm, so it stays one. The bake
  is synchronous (a StrictMode remount must never see it half done: `compileAsync` polled
  a disposed renderer's material and threw); a painter that fails leaves every variant a
  copy of its classic slice and warns on the console.
- **Every hex has its own look (`looks.ts`).** A character of its biome (plains 6,
  forest 4, highlands 4, mountains 3, swamp 3) naming its variant, a tone jitter (value
  ±10 %, hue ±4 %), its own tile scale and offset, and a rotation that follows a slow
  regional direction (260 km) ±0.2 rad: field systems and forest lines of neighbours run
  roughly the same way. Characters cluster loosely (100 km fields, jitter 0.3): about a
  third of same-biome neighbours share one. Forest characters set the tree mix, density
  and size (young stands: 55 % density, ¾ size).
- **Look grid.** (cols + 8) × (rows + 8) hexes × 3 RGBA32F texels: the tile map folded on
  the CPU (a = cos/scale, b = sin/scale, offsets — no trigonometry per pixel); since
  09-24 then the ground slice, the rock slice for steep faces, the layer and the fray;
  then the tone (tint, saturation). A town's ground is a neighbouring plain's variant.
  The ring of virtual hexes continues the edge hexes' looks over the skirt.
- **Shader.** Per slice the tile size comes from `uSliceTile`, the trimmed-tier mean from
  `uLayerMean[slice]`. (Until 09-24 the variant switched at the hex edge with a farm
  track on it and the tone rode the vertices — see the section above.) A ±5 % tone swell
  over 4–5 km (world space) breaks repeats inside a hex.
- Tests: `tests/unit/world/terrain-looks.test.ts` (slice table, characters → variants,
  ground slices, grid layout, determinism, neighbours differ, loose clustering, tone
  bounds). Contact sheet of all slices and captures:
  `captures/looks/` (`atlas-*.png`, `v2/before-*`, `v2/after-*`, `v2/compare-*`).
- **Measured** (headless Chromium on the real GPU — `--use-angle=metal --enable-gpu`, no
  window — Apple M3 Pro, 1600×900, high; before = a clean HEAD export, the two
  interleaved in one browser, 4 rounds × 3 × 120 frames; compare the ratios, the GPU
  clock moves the absolute numbers between sessions): whole game strategic 5.72 →
  6.00 ms (+7 %), closeup 5.41 → 5.52 ms (+4 %); terrain alone strategic 6.09 → 6.24 ms,
  closeup 4.64 → 5.08 ms (the closeup share includes the round crowns). Ground arrays
  22 slices: ~61 MB of GPU memory with mips (8 slices: ~22 MB) — the capture log's
  estimate does not count texture arrays. Draw calls +2 near (broadleaf pair).
- Finding: the terrain pass is ALU/register bound — even a per-pixel integer hash that
  touches nothing but the colour cost ~0.4 ms; the look fetches themselves are cheap.
  Anything else added per pixel here should be measured the same way.

## Step 3 (2026-09-21) — finishing + fix step: what changed

- **GPU: fewer fetches, real tiers.** The `uNormalDetail` switch was never set from
  distance — every pixel paid the per-layer normal maps at every zoom. It now comes
  from `DETAIL_KM` (normal/alt/trim/aniso per tier) in `index.ts`: per-layer normals
  and the anti-tiling second copies are gated below 65 km (high) / 32 km (medium),
  0 on low; anisotropy is 4/2/1 near and 1 at distance; the camera-distance band is
  cached so a texture re-upload happens only when the band changes.
- **Splat samples (terrainMaterial.ts).** Country-scale tone drift (R) and the snow
  edge wander (G) now share one 580 km macro tap — one fetch less per pixel. Layers
  above `uTrim` (high 7.5 = all, medium 3.5, low 2.5) are not sampled at all: the
  new `uLayerMean[8]` uniform carries the linear mean albedo + roughness of every
  layer, so a dropped layer keeps the biome's hue at its weight without its tile.
  The sand/seabed and snow effects fold the same way. Strategic frame: ~6–8 taps
  instead of ~14–20.
- **Water at distance (water.ts).** `uFar` (1 near, 0 at 200 km) gates the shore-foam
  tap and the second wave tap: at distance a single 7 km swell reads as ripple
  without the shimmer. Ice/crest/roughness math stays.
- **Storm whitecaps (#4, docs/08 §4).** `uStorm` scales with `weather.windMs.open`
  (0 at 12 m/s, 1 at 20): wave amplitude grows ×1.9, roughness climbs to 0.62, and a
  third macro tap raises white crests proportional to the wind, gated to open water
  and cleared by ice.
- **Low-sun specular (#3, sky change request).** `uLowSun` (1 below 2° sun altitude,
  0 above 8°) raises the terrain roughness toward 1 at grazing view angles and caps
  the direct specular to 0.12 (snow 0.3). A sunset reads as warm relief, not a wet
  sheet; noon keeps snow sparkle.
- **Trees per tier.** The forest LOD reach shrinks with `profile.detail`, so the low
  tiers keep trees visible over a shorter distance instead of paying for full reach.

## Checklist (brief numbering)

- [x] 1 heightfield + provider — unchanged this step.
- [x] 2 materials — the splat is now tier/distance budgeted (above); low-sun specular
  capped; sunny closeups judged at plains/forest/urban (field patterns, pavement pad,
  tree density) and highlands (rock/moor tiling, snow).
- [x] 3 water — distance LOD, storm whitecaps, ice/foam; frozen sea rim judged at the
  coldWave coast closeup (pale rim, glassy shallows).
- [x] 4 ground cover — tree density/LOD judged at `urban-fields-noon` (near trees,
  clumped, thinning into fields) and `showcase-coast-closeup`; pavement pads under
  the plant site; field patterns read as a patchwork of green/straw/plum.
- [x] 5 legibility + determinism + budget — 8 biomes still read hex for hex at
  strategic (showcase-noon-clear, game-noon); the terrain share dropped 32 % with
  nothing dropped from the high-tier near view.

## Measured (headed Chromium, Apple M3 Pro, 1600×900, high tier, `perf*` captures)

- terrain + board, no sky (no lights/shadow pass — the sampling share): **5.13–6.37 ms**
  across runs (7.56 ms before this step, measured in the same session); the run-to-run
  spread of the GPU timer is ~±1 ms. Board alone: 3.33 ms. Threshold 6.7 ms.
- Like-for-like frame pair, final run: sky + board **8.08 ms**, terrain + sky + board
  **7.56 ms** — the terrain's marginal cost in the frame is ≈ 0, it occludes more dome
  pixels than it costs. Whole game (`perf.png`) **6.83 ms**, 0.13 ms over the 6.7 ms
  threshold. (Mid-step, while the sky module was being edited, the same frames weighed
  28–32 ms with or without terrain — the frame budget is sky-dominated; the terrain
  share is the first number above.)
- showcase frames (software): 20–21 draw calls, 104–125 k tris, GPU estimate 5 MB,
  ready 4.5–10.8 s; whole-game golden/closeup frames 85–112 calls, 337–588 k tris;
  every JSON: consoleErrors [], pageErrors [], budget ok.

## Latest screenshots

- captures/terrain/s3/showcase-{noon-clear,golden-mountains,winter-frost,coast-closeup}.png
  (`--showcase terrain --all`, bare)
- captures/terrain/s3/game-{evening,noon}.png (whole game, frostHigh night / summerHigh
  noon, `--hud 0`)
- captures/terrain/s3/{golden-mountains,golden-june-mountains}.png (golden mountains,
  January night / June light), coast-coldwave.png (frozen sea rim),
  highlands-noon.png / urban-fields-noon.png (sunny closeups: moor/rock, fields,
  trees, pavement), june-evening-lowsun.png (5.6° sun, after the specular cap)
- captures/terrain/s3/perf*.png + .json, perf0-*/perfnone-* (previous step, for
  comparison)
- Isolation evidence for the change request below: captures/terrain/probe-no-terrain.png,
  captures/terrain/probe-sky-board.png, captures/terrain/s3/probe-highlands-nosky.png

## Known gaps

- **The white wavy "marble" sheen over the whole board is NOT terrain.** With the
  terrain module unloaded (`--modules sky,board,res`) the sheen is still drawn over
  the res geometry (`captures/terrain/probe-no-terrain.png`), over the sky alone
  (`captures/terrain/probe-sky-board.png`), and it disappears in the same highlands
  closeup without the sky (`captures/terrain/s3/probe-highlands-nosky.png`). It is
  the sky's cloud veil: at closeup/golden the camera sits above the 8/11.5 km layers,
  `viewCap` only steps in beyond 60 km, so the veil runs at `cap` 0.75–0.95 over
  every opaque object (PV tables included). The detail camera (~6 km) sits under the
  layer, hence no sheen there. Routed as change request 1.
- The sky's daytime white speckle (known sky gap) is visible over ground and sky in
  the sunny closeups and the June low-sun frame.
- Strategic land still shows the one-per-hex pad dimple grid (pre-existing heightfield
  pad shading, untouched this step).
- Whole-frame GPU budget still fails while the sky module is mid-edit (see Measured).

## Change requests

1. `src/world/render/sky` (blocks res/plants review, critic r1): the cloud veil
   composites over every object standing on the ground at closeup/golden distances
   (the "marble sheen" of `captures/critic/res/r1art/s-pv-*.png`). Evidence above:
   terrain off → sheen stays. Proposal: make the veil's opacity cap follow the same
   rule at all zooms (docs/08 §3 — clouds never cost the read of the map under them):
   start `viewCap` well below 60 km (e.g. full cap only under ~15 km), or gate
   `uCap` when the camera is above the layer (`cameraPosition.y > altitude + 1.5`),
   with the shadow texture carrying the weather read at the strategic distance.
2. `src/world/render/sky`: the fine white speckle over ground and sky in daylight
   (`captures/terrain/s3/urban-fields-noon.png`, `june-evening-lowsun.png`) is still
   the largest visual noise in the closeups.

## Next step

- Re-measure the perf pair after the sky step lands (the frame budget is theirs now).
- If the veil is capped, re-judge the res/plants closeups (PV tables must read).
- Then the moonlit snow mottle under a high sun (snow albedo mips vs the 6 km tile).

## Integrator notes (2026-09-21, after the finishing step)

- Terrain share at the strategic frame: 5.13 ms without the sky's lighting (board
  floor 3.33 ms), marginal cost in-frame ≈ 0; the 31 ms frames measured today are the
  sky module mid-edit (28–32 ms on its own at the same camera). The fix list for
  terrain was applied in full: normal/alt gating, trim + `uLayerMean`, macro merge,
  water LOD, storm crests, low-sun specular cap, tree LOD per tier.
- Issue 1 from the critic round is confirmed to originate in `render/sky` — the
  isolation probes are in `captures/terrain/` and `captures/terrain/s3/`; routed there.

## Perf pass (wave 3, 2026-09-21) — perf builder

- The per-tier ground detail numbers moved out of `index.ts` into the one knobs table
  in `render/core/Quality.ts` and are read back through `QUALITY_PROFILES`
  (`terrainNormalKm`, `terrainAltKm`, `terrainSamples`, `anisotropy`, `terrainCellKm`).
  **High and medium values are unchanged** (65/65/7.5/4 and 32/32/3.5/2, cell 2/3 km);
  low's field spacing is now 4 km (was 3) for headroom on weak GPUs. No shader or
  material change: the high-tier frames are pixel-identical outside PostFx (see
  `captures/perf/s1/before-terrain-sky-high.png` vs `after1-terrain-sky-high.png`).
- Judging frame (headed, high): terrain + sky 6.93 → ~6.1 ms median; the terrain's
  marginal cost in the frame stays inside the ±1 ms timer noise.
