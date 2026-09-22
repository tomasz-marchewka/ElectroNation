# interaction — progress

Hand-over between pipeline steps. Written at the start of a step, updated after every
finished sub-task, rewritten at the end.

## Step 2 (2026-09-21) — done

Closed the step-1 remainder and polished the feel. The core fix the integrator applied
(`CameraRig.groundAt` now calls `camera.updateMatrixWorld()` before its raycast) let the
two-pass `applyPreset` workaround go; the wheel anchor is now solved on the real
perspective projection instead of the ground-plane linearisation, the pan fling fades out
when the hand paused before lifting, touch survives extra fingers and re-seeds its pinch
pair when one finger lifts, and F/Home/presets were re-verified against the fixed core.
The module still draws nothing: **0 draw calls, 0 triangles, 0 GPU bytes**, no textures,
no geometry, only pointer work (0,007 ms per pointer move headed).

### Files changed in step 2

- `attach.ts` — `applyPreset` is one `renderer.camera(preset, hex, true)` call (workaround
  collapsed); touch bookkeeping rewritten (`beginPinch` re-seeds from the two oldest
  pointers; extra fingers never steal a pinch or hover; `pointercancel` drops the
  gesture); the fling is damped by the idle time since the last movement sample
  (`flingPan(vx, vz, idleSeconds)`); handled keys `preventDefault`; a second pointerdown
  never steals a drag in progress.
- `cameraControls.ts` — `solveAnchor`: mirrors `CameraRig.apply`'s pose on a scratch
  `PerspectiveCamera` and Newton-solves (3 passes, finite differences) the target that
  keeps the picked ground point at its screen position at the goal's distance/pitch, so
  the cursor's point stays under the cursor exactly; `FLING_IDLE_TAU` 90 ms release
  freshness; everything still instant when `clock.pinned` or motion is off.
- `captures/interaction/s2/verify.mjs` — 30 scripted checks plus before/after PNGs; a
  `waitForStableCamera` guard that also re-reads the canvas bounding box (a headed
  window can still be placed by the OS in the first frames after `ready`, which moved
  the first synthetic hover off target once).

### Checklist (step 2)

- [x] 0 Core fix confirmed (`CameraRig.groundAt` matrix update is in the tree).
- [x] 1 `attach.ts`: single-call `applyPreset`; keys only on canvas/body + `preventDefault`.
- [x] 2 `cameraControls.ts`: projection-solved anchor; release-freshness fling damping.
- [x] 3 `attach.ts`: touch bookkeeping (extra fingers, re-pinch, cancel, no hover steal).
- [x] 4 `captures/interaction/s2/verify.mjs` — 30/30 checks, headless SwiftShader **and**
      headed real GPU, 0 console/page errors in the final runs.
- [x] 5 Captures: game evening/noon ±HUD, closeups 4,13 and 4,2, determinism twins,
      headed frame pair — every JSON errors 0 / budget ok / all modules ready.
- [x] 6 Gates: prettier (unchanged), lint, `tsc --noEmit`, `vitest --project unit`
      (40 files / 516 tests) — all green 2026-09-21.
- [x] 7 PROGRESS.md rewritten.

### Verification (captures/interaction/s2/verify.mjs, 30/30 headed and headless)

- **Picking**: hover and click on the 4,13-offset mountain report `HEKS q4 r11 · GÓRY`
  (`b-mountain-before/after`); the e2e plains hex still selects `q5 r7`.
- **Zoom anchor** (the step-2 polish): a 5-notch burst into the mountain drifts
  **0,46–0,47 px** (step 1's ground-plane maths: 1,91–4,15 px), the same burst straight
  to the 12,5 km floor **0,49–0,54 px**, and 12 notches back out **0,03–0,25 px**; the
  hex under the cursor is still `q4 r11` at the floor.
- **Presets on the fixed core**: `Home` right after `detail` frames the board with
  **0 px** miss (the case the stale matrices broke), `2` right after `3` 0 px, fresh
  `overview`/`north` through `__en.camera` 0 px; `F` dollies 957 → 55 km both from a
  fresh selection and after `3` (961 → 55 km headed); `Home` returns to 957 km.
- **Bounds/collision**: 5600 px of dragging rests the west column at x 868; a long upward
  drag rests the south column at y 375; flat pitch + full zoom over the mountain keeps
  the camera above the relief (depth 31 km, centre `q5 r11`, `b-mountain-camera-bounds`).
- **Touch**: a third finger never steals the pinch (depth unchanged while finger 3 moves);
  the pair re-seeds after one finger lifts and keeps pinching (218 → 194 km); one
  remaining finger pans (122 px) and its lift is not a click; a deliberate tap selects.
- **Inertia**: a fresh flick coasts 55,9 px headed (22,8 px headless); a pan paused 600 ms
  before lifting coasts **0,0 px** (the step-2 feel fix).
- **Hygiene**: `Tab` still moves focus, HUD-focused `2` does nothing, canvas-focused `2`
  works; picking costs **0,007 ms** per pointer move headed (0,006 headless, worst
  0,100 ms) — 28× under the 0,2 ms budget.
- Determinism: full-module twin URLs byte-identical, md5
  `41651dfc946f30139be72b727dd91ccd` (`c-twin-a/-c/-d`). One earlier twin (`c-twin-b`)
  differed while a sibling module was saved between the two runs (the Vite bundle changed
  mid-pair); re-run on a quiet tree, the pair is byte-identical again.

### Measured (captures/interaction/s2, JSON logs)

- Headless game frames (midgame day 1, strategic, SwiftShader): evening 117 calls /
  311 824 tris / 14 MB est, noon 124 / 334 112 / 14; the ±HUD twins match except for 54
  triangles (hiding the HUD changes the reported safe frame, hence the strategic preset
  distance; the HUD itself is DOM); closeups (midgame frostHigh evening) 4,13: 139 /
  394 446, 4,2: 135 / 422 838. Every JSON: `consoleErrors` / `pageErrors` empty,
  `budget.ok` true, all ten modules `ready`, no diagnostics.
- Headed (Apple M3 Pro, 1600×900): `h-game-evening` **gpu 2,26 ms** (≈177 fps mid-range
  projection), 105 calls / 312 884 tris / 14 MB; `h-mountain-closeup` **gpu 3,79 ms**
  (≈106 fps), 143 calls / 657 833 tris / 19 MB. The only budget failures are
  environment: `fps 30.2` (the headed window's rAF ran at 30 Hz that run) and a 4–6 s
  first-interactive during Vite's cold compile. Interaction contributes **0 draw calls,
  0 triangles, 0 GPU bytes** by construction (it creates no geometry, texture or light);
  the whole game's frame is what these numbers measure.

### Latest screenshots (captures/interaction/s2/)

- `b-mountain-after.png` — mountain click: panel `HEKS q4 r11 · GÓRY ×2,5`.
- `b-zoom-anchor-in.png` — the 5-notch anchor burst; the cursor's ground point held.
- `b-home-after-detail.png` / `b-preset-overview.png` / `b-preset-north.png` — the
  fixed-core preset framing.
- `b-fly-f.png`, `b-touch-pinch.png`, `b-bounds-after-drag.png`,
  `b-mountain-camera-bounds.png`, `b-inertia-flick.png`, `b-inertia-paused.png`.
- `c-game-evening.png`, `c-game-noon.png` (+ `-clean` twins) — the strategic judging
  frames; `c-mountain-closeup.png`, `c-coast-closeup.png` — 4,13 and 4,2.
- `h-game-evening.png`, `h-mountain-closeup.png` — real-GPU frames whose JSONs carry the
  gpuMs numbers above; `verify.json` (`verify-headless.json`) — the 30 check records.

### Change requests

1. **core/WorldRenderer (important, still open from step 1).** `hexAt`/`groundAt` are a
   4-step fixed point against `heightAt` and can disagree with the drawn surface on steep
   relief, while interaction's marcher bisects the first crossing (14 passes). Move
   `picking.ts` into `render/core` and have both call it: one relief-accurate
   implementation, and the renderer's own picking gains the accuracy the module has.
2. **core/CameraRig (still open from step 1).** `CAMERA_LIMITS.flightSeconds` is a fixed
   0,6 s; interaction's zoom ease uses its own 70 ms τ. Proposal: `flyTo(state, seconds?)`
   so flight feel has one home.
3. **effects (wave 3, informational).** Interaction leaves all overlay data
   (`overlay.hover/selection/route`) in the scene model and draws nothing; a
   `onHexDoubleClick` was not added because the host has not needed it.

### References

- Integrator note 2026-09-21: core change request 1 applied (matrix update); the
  picking-in-core and per-flight-duration requests (items 1–2 above) were noted, not yet
  applied.
- docs/08 §8 (camera never under the terrain or off the board, wheel zooms to the cursor,
  click selects), §3 (picking must agree with what is drawn).
- Cities: Skylines II / Anno 1800: the wheel anchor holds the ground point exactly; a
  fling is the pointer's momentum, not a velocity stored from a paused hand.

## Step 1 (2026-09-21) — done

Module core for `src/world/interaction`: picking against the relief, camera bounds and
collision, zoom-to-cursor ease, pan inertia, touch gestures. The exported
`attachInteraction(renderer, canvas, handlers)` signature and the `InteractionHandlers`
contract are unchanged (WorldView wires them). The module draws nothing — zero draw calls,
zero triangles, zero GPU bytes; its cost is pointer work only.

Found on arrival: the integrator's 161-line `attach.ts` (plane-anchored instant zoom, pan
via `renderer.groundAt`, right-drag orbit, keys 1/2/3 + F, no touch/inertia/ease/pitch
limits) and no `captures/interaction/`. The whole tree now typechecks (a mid-run storage
and nodes breakage by concurrent builders came and went; both were gone by the gates).

### Files

- `picking.ts` — `ReliefPicker`: a ray from the camera marches `renderer.heightAt` in two
  resolutions (16 km coarse bracket, 4 km fine, 14 bisections) and returns the first
  crossing; `hexAt` validates against the scene board's hex set (cached per board object).
  Recovers the drawn surface on steep relief where the renderer's own 4-step fixed point
  drifts. Cost measured at **0,010 ms mean per pointer move** (worst 0,20 ms) including the
  whole interaction path with the hover deduped.
- `cameraControls.ts` — `CameraControls`: wheel zoom toward the cursor with a clock-driven
  exponential ease (`ZOOM_TAU` 70 ms, instant when `clock.pinned` or `clock.scale === 0`),
  pan fling (`FLING_TAU` 300 ms, stops at `FLING_MIN_KM_S`, discarded at the board clamp),
  `pitchLimits(distance)` (18–85° next to the ground, tightening to 40–72° at 900 km so the
  far view is never a horizon sliver or a flat card), target clamping that mirrors
  `CameraRig.apply`. The ticker reads only `renderer.clock.time`; a zero-dt frame is waited
  out, never treated as an error (a bug the inertia test caught).
- `attach.ts` — kept the public contract; pointer map for two-finger pan/pinch (pan keeps
  the grabbed ground under the moving centroid, pinch zooms about it, one finger left
  continues as a pan), keys only when the canvas or the body has focus, `F` = fly to the
  host's selection, `Home` = strategic, `1/2/3` = presets. `applyPreset()` works around a
  core bug (see change requests): apply instant, sync the camera matrices, apply again,
  then fly from the original state — exact with public API only, idempotent once core fixes
  `CameraRig.groundAt`.

### Checklist (step 1)

- [x] 0 Canon read (CLAUDE.md, ARCHITECTURE §11–§15, docs/08 §3/§4/§8, core surface,
      terrain `heightAt`, units, grid/terrain PROGRESS); baseline captures.
- [x] 1 `picking.ts` — relief marcher, board check, cost measured (< 0,2 ms).
- [x] 2 `cameraControls.ts` — eased zoom-to-cursor, inertia, pitch band, clamping.
- [x] 3 `attach.ts` — contract kept; touch; keyboard hygiene.
- [x] 4 `captures/interaction/s1/verify.mjs` — 21/21 checks, 0 console/page errors.
- [x] 5 Captures: game pair ±HUD, closeups 4,13 and 4,2, scripted before/after frames;
      every JSON errors 0, budget ok, all modules ready.
- [x] 6 Gates: prettier, `npm run lint`, `npx tsc -p tsconfig.json --noEmit`,
      `npx vitest run --project unit` (40 files / 516 tests), `npx playwright test
      --project chromium` (5/5) — all green 2026-09-21.

### Verification (captures/interaction/s1/verify.mjs, 21/21)

Drives the real app in headless Chromium with the SwiftShader flags of
`scripts/capture.mjs` and `window.__en`; every camera change is followed by a rendered
frame (`__en.step`) so projections are taken on a settled camera, as in real play.

- **Picking**: hover at the projected 4,13 (axial 4,11) reports `q4 r11`;
  the click selects `HEKS q4 r11 · 25 × 25 KM` (PNG `b-mountain-after`); the plains hex of
  the e2e spec still selects `q5 r7`. `__en.hexAt` agrees on the mountain.
- **Wheel anchor**: 3-notch in and out at the mountain and at the plains hex; the projected
  point moves 1,91–4,15 px (limit 6) while the depth changes e.g. 957 → 681 km.
- **Presets/F/Home**: F dollies 957 → 55 km to the selected hex; Home returns to 957 km and
  the four board corners land inside the HUD safe frame with 0 px miss; `2`/`3` change the
  view (1109 / 1040 km) and keep the board on screen.
- **Bounds**: after 5600 px of dragging the west column comes to rest at x 868 (the board
  edge, not past it); after a long upward drag the south column sits at y 374; a flat pitch
  + full zoom at the mountain leaves the camera above the relief (depth 9,4 km, centre hex
  q4 r10, PNG `b-mountain-camera-bounds`).
- **Touch**: a synthetic two-finger pinch zooms 964 → 220 km and keeps `q12 r2` under the
  centroid (`b-touch-pinch`).
- **Inertia** (live clock): a 210 px fling coasts 56,8 px after release; a drag into the
  board clamp correctly has no inertia left.
- **Keyboard**: `2` does nothing while a HUD button has focus, works again when the canvas
  has focus.

### Measured (headless SwiftShader; interaction adds none of it)

- Game frames (midgame day 1, strategic): `c-game-evening` 87 calls / 306 024 tris /
  13,8 MB est; `c-game-noon` 80 / 299 264 / 13,8 MB; HUD-off twins identical in 3D stats
  (the HUD is DOM). Showcase-less closeups: `c-mountain-closeup` (4,13) 106 / 360 428;
  `c-coast-closeup` (4,2) 97 / 377 630. Every JSON: `consoleErrors` / `pageErrors` empty,
  `budget.ok` true, all ten modules `ready`.
- Interaction layer: **0 draw calls, 0 triangles, 0 GPU bytes** (it creates no geometry or
  texture). Input cost: **0,010 ms mean per pointer move** (240 dispatches, worst 0,20 ms)
  on the dev machine, i.e. 20× under the 0,2 ms budget. No headed run: with no GPU work the
  A/B delta would be measurement noise.
- Determinism: `c-twin-a` and `c-twin-b` (same closeup URL) are byte-identical, md5
  `7a1f5bd7935e8ad2b463de9d34857a33`.

### Latest screenshots

- `b-mountain-after.png` — click on the 4,13 mountain: the panel reads `HEKS q4 r11 · GÓRY`.
- `b-mountain-camera-bounds.png` — flat pitch + full zoom on the relief; the camera stays
  above the ground, the horizon and labels read.
- `b-bounds-after-drag.png` — after 5600 px of drag the board's west edge rests mid-view.
- `b-touch-pinch.png` / `b-zoom-anchor.png` — pinch and wheel end states.
- `b-fly-f.png` — F dolly at the mountain (dark winter evening).
- `c-mountain-closeup.png` / `c-coast-closeup.png` — the 4,13 and 4,2 closeups (the required
  mountains/coast evidence).
- `c-game-evening.png`, `c-game-noon.png` (±`-clean`) — the strategic judging frames.

### Change requests

1. **core/CameraRig (integrator, important).** `groundAt` raycasts with the camera matrices
   of the last RENDERED frame, so `centredInSafeFrame` computes a wrong target shift when a
   preset is applied while the camera sits elsewhere — measured: `Home` right after
   `detail` gives depth 1062 km and `__en.hexAt` null across the board, while a second
   `__en.camera("strategic")` lands the correct 964 km; on a fresh page the `overview` and
   `north` presets frame the board far below the safe frame (corners y 548..971 vs safe
   y1 558) through `__en.camera` too, i.e. without any interaction code. Fix: call
   `this.camera.updateMatrixWorld()` at the top of `CameraRig.groundAt` (interaction's
   picker already does exactly that). `attach.ts` carries a documented two-pass workaround
   that becomes idempotent with the fix.
2. **core/WorldRenderer.** `hexAt`/`groundAt` are a 4-step fixed point against `heightAt`
   and can disagree with the drawn surface on steep relief. Proposal: reuse the interaction
   marcher in core (move `picking.ts` to `render/core` and have both call it), so picking
   has one implementation.
3. **core/CameraRig.** `CAMERA_LIMITS.flightSeconds` is a hard-coded 0.6 s; the wheel ease
   uses its own 70 ms constant in interaction. Proposal: allow `flyTo(state, seconds)` so
   the camera feel lives in one place.
4. **effects (wave 3).** Interaction draws nothing and leaves no hooks: the hover ring,
   selection ring and route ribbon are produced from `overlay.hover/selection/route`, which
   the renderer and the host already fill (`setHover`, `onHexClick` semantics unchanged).
   No `onHexDoubleClick` was added — the host has not needed it.

### References

- Cities: Skylines II / Anno 1800 camera feel: grab-the-ground pan, wheel zoom to the
  cursor with a short ease, fling inertia, camera never under terrain or off the board.
- docs/08 §8 (kamera nigdy pod terenem ani poza planszą; kółko = zbliżenie do kursora;
  klik = wybór heksa; podczas trasowania klik działa jak dziś), §3 (picking must agree with
  what is drawn).

## Integrator notes

- 2026-09-21 (integrator): core change request 1 applied — `CameraRig.groundAt` now calls
  `camera.updateMatrixWorld()` before raycasting. Step 2 collapsed the two-pass
  `applyPreset` workaround and re-verified F/Home/presets (0 px safe-frame miss) on the
  fixed core. Change requests 2 (picking in `render/core`) and 3 (per-flight duration)
  were noted but are not applied yet; they are restated at the top of this file.
