# hud — progress

Hand-over for the HUD module (docs/08 §7, ARCHITECTURE §3, §9, §16). Written at the end
of step 2 of the finishing pipeline.

## Checklist

- [x] 1 World-anchored labels — DOM writes only from a rAF loop (reads before writes,
  writes only on change), priority layout in `labelLayout.ts` (pure), alerts never
  culled and led, shell surfaces as hard occluders and world strips as soft ones, four
  depth tiers, city weight, muted cities, halo + scrim. Step 1 fixed the ref-reset
  regression that hid every label. Step 2 verified selection emphasis and hover by
  capture: the selected hex's labels (`KAMIONKA · 237 MW`, `−88 MW ⚠`) glow in the
  action colour at strategic and close-up range while the line's `NN 150/150 ⚠` stays
  red; hover lifts `JASIENICA` one step (border only — subtle by design). With the
  report dock open the labels under it are hidden or led out (`JASIENICA`, `BUDOWA`
  led to the dock's edge), 26/29 placed. Frame 0.2–0.3 ms / layout 0.1 ms, 29 labels.
  Not yet re-checked: LIFT_KM anchors against real object silhouettes (the tree still
  draws no city/plant meshes in the close-up: 21 draw calls).
- [x] 2 Strips — weather strip, world legend, settings strip, diagnostics, showcase
  caption verified on screen in every s2 capture. Step 2 decisions: the legend now
  starts folded (`settingsStore` default `closed`) because unfolded it was a 500 px
  strip across the north coast in the strategic frame (SOLNICA and the far coast were
  under it); its title + `ROZWIŃ ▸` stay top-right. With the report dock open, the
  world strips step right of the dock (they were fully hidden under it before) and the
  legend no longer moves — in the world layout the dock takes the LEFT edge of the
  workspace (the map region is out of flow), so the old `right: panel + report` rule
  pushed the folded legend under the dock.
- [x] 3 Contrast and themes — verified by capture: dark evening strategic, light evening
  strategic, dark noon strategic, light noon strategic (s1), close-ups Kamionka dark
  (selected) and Jasienica light (s1), report dock open. Step 2 found and fixed a shell
  regression: the fixed map region lives in `.en-body`'s stacking context and painted
  OVER the top bar (a Playwright click on RAPORTY hit the canvas; the bar was missing
  from every s1/early-s2 capture). `hud.css` now lifts `.en-topbar` and `.en-report`
  to z-index 2. One primary action (ZATWIERDŹ TURĘ ▸) on screen in the dispatcher
  state; the hex panel replaces it with `◂ WRÓĆ DO PANELU DYSPOZYTORA` (app panel).
- [x] 4 Copy rules — all label text is the bridge's; strips use the allowed glyphs only,
  U+2212, comma decimals, space thousands. Tests green: components 92/92, Playwright
  chromium 5/5, unit 516/516, lint, tsc, prettier. No new dependency.

## Measured (captures/hud/s2/*.json, headless SwiftShader)

- game-evening: drawCalls 20 · triangles 103 874 · gpuBytesEstimate 4 845 374 · readyMs
  11 039 (software GL warning only) · consoleErrors [] · pageErrors [] · budget ok ·
  every module ready.
- game-noon-dark: drawCalls 19 · triangles 103 874 · readyMs 7 987 · errors 0.
- Label layer (`window.__enLabels`): frameMs 0.2–0.3, layoutMs 0.1, 29 labels; with
  the report dock open 0.3 ms.

## Latest screenshots

- captures/hud/s2/game-evening.png — turn 6 frostHigh, strategic, dark, top bar back,
  legend folded, SOLNICA visible.
- captures/hud/s2/game-evening-light.png — same frame, light theme (top bar still
  missing there: captured before the z-index fix).
- captures/hud/s2/game-noon-dark.png — turn 4 summerHigh, strategic, dark (before fix).
- captures/hud/s2/select-kamionka-evening.png — Kamionka selected, Jasienica hovered.
- captures/hud/s2/closeup-kamionka-selected.png — closeup 19,6, selected labels.
- captures/hud/s2/report-open-evening.png — report dock open, strips stepped right.

## Known gaps

- With the report dock open the weather strip now covers the north-west of the visible
  board (380 px of a 680 px world); labels are led out, but a compact one-line form of
  the strips while the report is open would be better. Judgement call, not canon.
- Hover emphasis is border-only (design: "no colour of its own"); barely visible on
  the night board. Consider a one-step scrim lift.
- LIFT_KM anchors unverified against object meshes (none drawn in this tree yet).
- `scripts/capture.mjs` does not forward `--theme`; light captures used
  `--url "http://localhost:5173/?theme=light&capture=1&x="`. Selection, hover and the
  report dock were captured with a scratchpad Playwright script (same boot as the
  harness, then `window.__en.select(q, r)`, a mouse move, or a click on RAPORTY).

## Change requests

- scripts/capture.mjs: forward `--theme light|dark` as the `theme` query parameter;
  add `--select q,r` and `--report 1` so HUD states are reproducible by the harness.
- src/app/styles/css/app-shell.css: below 1500 px `.en-workspace.has-report >
  .en-reportdock { flex: 1; width: auto }` — in the world layout (map out of flow) the
  dock would fill the whole workspace; give the world layout a fixed dock width.

## Next step

Decide the compact strip form while the report is open; re-check LIFT_KM once object
meshes land; capture a light-theme frame after the top bar fix; rewrite this file.

## Integrator notes (2026-09-05, before the fix round)

- Round-1 critics (art 6,5 / legibility 6,5) — the ranked issues are in the fix brief.
  Two of them are applied by the integrator: the bridge derivation note no longer
  appears in DIAGNOSTYKA (it lives in the capture log and docs/STATUS.json), and
  `?hud=0` renders the bare world.
- Composition (flagged as "core", but it is the world layout's CSS, i.e. yours): at
  1600×900 the world keeps ~28 % of the viewport under the ribbon, the legend strip and
  the report strip. In the world layout cap the ribbon chart's height on short
  viewports (`.en-app--world .en-region--chart { aspect-ratio: auto; height: clamp(...) }`)
  and let the weather strip fold to one line; measure the uncovered area with
  WorldView's safe frame (it is what the camera presets fit the board into).
