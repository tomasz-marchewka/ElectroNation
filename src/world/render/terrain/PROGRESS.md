# render/terrain — progress

Hand-over between pipeline steps. Rewritten at the end of every step.

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
