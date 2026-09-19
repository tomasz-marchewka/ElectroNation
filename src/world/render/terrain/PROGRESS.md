# render/terrain — progress

Hand-over between pipeline steps. Rewritten at the end of every step.

## Step 2 (2026-09-03) — what changed

- Determinism proven for the terrain + sky showcase: two `--showcase terrain --all`
  runs are byte-identical on all four frames (captures/terrain/s2/det.md5). The
  whole-game drift of step 1 is therefore in another module or the HUD.
- heightfield.ts: mountains were smooth domes (the ridged noise sits at 0.55 ± 0.2, so
  the old factors drew ±0.3 km on a 6 km band). Now a crest noise at 30 km plus ridges
  at 13 km with factors 3.0 / 4.0 (mountains) and 0.8 / 0.9 (highlands): the range has
  crest lines and valleys, peaks 4–8.4 km, hex centres still on their pads
  (probe: hex 4,13 = 5.9 km, 3,14 = 7.1 km, 5,14 = 3.9 km).
- heightfield.ts: per-vertex sky-visibility term (`occlusion`, 0.55 in a hollow … 1 on a
  crest, 6 km ring) → material multiplies the indirect light (aomap_fragment) so the
  relief keeps its read under a flat overcast light.
- terrainMaterial.ts: snow edge dithered by a 520 km noise over ±0.5 km instead of the
  fine macro noise over ±0.35 km (patchy lowland snow was a 1–3 km blotch field that
  fought the labels); wind-stripped crests show rock lines through full snow so the
  range never reads as clouds from the strategic view; the country-wide albedo drift
  moved from the 140 km macro sample (fine internal octaves → km-scale blotches) to a
  640 km sample at ±14 %.
- terrainTextures.ts: snow albedo 0.80–0.90 (headroom before tone mapping), drift
  contrast 0.35 → 0.12, bump 2 → 1.2, roughness 0.55.

## Checklist (brief numbering)

- [x] 1 heightfield + provider — field + 60 km skirt + far rows; RELIEF_KM bands; crest +
  ridge noise for mountains/highlands; pads, shores, basins; provider synchronous in
  init(); snowline from snowCover + month; occlusion attribute.
- [~] 2 materials — one mesh, onBeforeCompile splat, slope → rock, soft snowline, crest
  rock, occlusion on indirect light, cloud shadow, wetness, anti-tiling grass; still to
  judge: rock/moor tiling at a sunny golden closeup; residual mottling of snow under
  moonlight (g-golden-night.png) — suspect the snow normal map + specular.
- [~] 3 water — plane to the horizon, depth tint, wind waves (still under BRAK), envMap
  via PBR, foam band, ice under frost; frozen lake verified at closeup
  (g-mtn-closeup-frost.png, pale ice plateau top left); sea ice rim not yet judged.
- [~] 4 ground cover — trees, field patterns, moor, marsh, pavement in place; tree
  density/LOD and pavement pads still not judged at a sunny closeup.
- [x] 5 legibility + determinism + budget — 8 biomes read hex for hex at strategic zoom
  (f-noon-clear.png, game-noon.png); determinism proven (det.md5); budget within share
  (see Measured).

## Measured (SwiftShader headless — captures/terrain/s2/*.json)

- showcase frames (medium): 19–21 draw calls, 104 k tris (strategic/overview) / 203 k
  (closeup/golden, trees in), GPU estimate 5.05 MB, readyMs 2.3–3.5 s; consoleErrors [],
  pageErrors [], budget ok, every module ready.
- whole game, high tier, strategic, day 1 turn 6 frostHigh (game-evening.json):
  24 draw calls, 210 519 tris, 9.5 MB estimate, readyMs 9.8 s, no errors, budget ok.
- determinism: det1-* vs det2-* (showcase terrain, all four frames) identical md5.

## Latest screenshots

- captures/terrain/s2/f-noon-clear.png, f-winter-frost.png, f-golden-mountains.png,
  f-coast-closeup.png (showcase after the relief + snow pass);
  g-mtn-closeup-frost.png (mountain crest under frostHigh sun, frozen lake);
  g-golden-night.png (golden view at night, transitional); game-evening.png (high tier,
  HUD), game-noon.png (strategic summerHigh, HUD); mtn-closeup-frost.png /
  b-/c-/d- variants = before → after the ridge amplitude steps.

## Known gaps

- Sky haze washes the far half of the board at strategic distance (game-noon.png) and
  a white speckle (precipitation/stars) lies over the ground and sky in every daytime
  strategic frame — both from the sky module.
- Under moonlight a snowed lowland still shows a soft mottle (g-golden-night.png);
  reduce the snow normal-map strength or the specular under low sun next.
- --hud 0 is ignored for scenario captures (HUD drawn in every mtn-* frame).
- Board outline draws hex edges over the sea (core BoardOutline).
- Sunny closeups on highlands/plains not yet taken this step (fog/haze regimes only).

## Change requests

- sky: cap the fog density at strategic distance so the far board keeps its colour.
- sky: identify the daytime white speckle drawn over the ground.
- capture/App: honour --hud 0 for scenario captures.

## Next step

- Sunny closeup (summerHigh, turn 4) on highlands (col 10,row 11) and plains/forest
  (col 9,row 4): rock/moor tiling, tree density, pavement pads; then the moonlit snow
  mottle; then the sea ice rim under coldWave at the coast closeup.

## Integrator notes (2026-09-05, before the finishing step)

- Applied from your change requests: `?hud=0` now renders the bare world in game mode
  (no panels; App.tsx), and the board outline over sea/lake hexes is drawn at a third
  of the land opacity (render/core/BoardOutline.ts). Your fog and daytime-speckle
  requests were routed to the sky module's notes.
- Performance gate (headed Chromium, Apple M3 Pro, 1600×900, high tier, strategic
  view, terrain + sky + board only): GPU 9,0 ms/frame against a 6,7 ms budget on this
  machine (≈ 60 fps on a mid-range laptop GPU). The terrain shader's texture sampling
  and the water are the first suspects — count samples per pixel, drop layers on
  medium/low, keep the strategic view under ~5 ms of GPU before adding detail.
  Run `node scripts/capture.mjs --headed --quality high --scenario midgame --day 1 --turn 6 --regime frostHigh --camera strategic --hud 0 --out captures/terrain/perf`
  and read `fps.gpuMs` in the JSON (headless SwiftShader never measures GPU).
