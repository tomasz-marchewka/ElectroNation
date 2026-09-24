# ElectroNation — 3D world architecture

This document is the contract for the Three.js front end that replaces the SVG map. The
simulation engine (`src/engine/`) is frozen canon and is not described here beyond the seam
the world reads it through. Design canon for the interface itself lives in
[docs/08-interfejs-3d.md](docs/08-interfejs-3d.md) (Polish); this file is the engineering
side of the same decisions.

## 1. Non-negotiables

1. **The engine does not move.** `src/engine/**` stays byte-identical to `main`. Nothing in
   `src/world/` imports the engine except `src/world/bridge/`. Goldens are never re-recorded
   by this work; a red golden is a bug in the port.
2. **One bridge.** Everything the world shows is derived from `GameState` + `TurnReport` by
   `src/world/bridge/` into a plain-JSON `WorldScene`. Render modules consume a documented
   slice of that scene and nothing else. If the bridge cannot derive something, it is a
   blocked item in `docs/STATUS.json`, never a reason to widen `GameState`.
3. **Determinism.** Same seed + same day + same turn → the same frame on any machine. Renderer
   randomness comes from `render/core/prng.ts` streams keyed by `scene.seed`; animation reads
   the frame clock, never `performance.now()` or `Date`; the clock can be pinned for capture.
4. **Legibility beats beauty.** State is encoded in light, emission, motion and silhouette
   (§9). Any change that costs a read is a bug even if it scores higher on art.
5. **Failure isolation.** A module that throws is disabled and its layer hidden; the game keeps
   running with a diagnosis in the HUD. The SVG map stays available as a fallback renderer.
6. **Budget** (§13): 60 fps at 1440p on a mid-range laptop GPU, ≤ 800 draw calls, ≤ 3 M
   triangles in the strategic view, ≤ 400 MB GPU memory, ≤ 40 MB transferred, first
   interactive under 4 s cold.

## 2. Layout and ownership

```
src/
  engine/            frozen
  app/               application layer (store, view models, panels, save, SVG fallback map)
  world/
    bridge/          GameState + TurnReport → WorldScene; the ONLY engine consumer in src/world
    render/
      core/          renderer, camera rig, frame loop, post-processing, quality tiers,
                     module registry, units, exaggeration table, renderer PRNG, textures
      terrain/       relief, biomes, water, forest and urban ground cover
      sky/           sun, atmosphere, clouds, precipitation, fog, night sky
      grid/          pylons, conductors, corridors, construction and upgrade states
      plants/        nuclear / coal / CCGT / OCGT blocks with internal state
      res/           wind farms (onshore, offshore), PV arrays
      storage/       BESS yards, pumped storage with reservoir level
      nodes/         junction stations, border interconnectors
      cities/        settlements scaled by households, lit by delivered power
      effects/       flow, overload, construction, blackout, selection, route preview
    interaction/     hex picking, camera control, route drawing
    hud/             React overlay: shell, world-anchored labels, weather strip, settings store
    perf/            budget checks, fps meter, instancing helpers
    capture/         capture mode (URL params, pinned clock, ready signal, window.__en)
    showcase/        per-module showcase scenes (?showcase=<module>)
    audio/           optional, muted by default, last
    WorldView.tsx    mounts the renderer; falls back to the SVG map without WebGL2
scripts/capture.mjs  headless capture tool (PNG + JSON log)
docs/STATUS.json     scores, rounds, open issues, blocked requests, last screenshots
```

Ownership: a builder owns exactly one folder. `bridge/`, `render/core/`, `WorldView.tsx`,
`eslint.config.js`, `package.json`, `playwright.config.ts` and `docs/STATUS.json` belong to
the integrator; builders file change requests instead of editing them. Engine requests go to
the integrator, who routes them through `docs/STATUS.json` (`blockedEngineRequests`).

The ESLint wall (`eslint.config.js`) enforces the seams: `src/world/render/**`,
`src/world/interaction/**`, `src/world/perf/**` and `src/world/showcase/**` may not import
`src/engine/**`, `src/app/**` or the bridge builders (only `bridge/worldScene.ts`, the type
file); `src/world/hud/**` may not import `src/engine/**` (it reads view models through
`bridge/hud.ts`).

## 3. Data flow

```
Zustand store (src/app/store)             pure engine calls, unchanged
   │ game, lastTurnReport, selectedHex, routing, bottleneck, hover
   ▼
bridge/buildWorldScene(game, report, overlay, options)   → WorldScene (plain JSON)
   │ memoised per (game, report, overlay); snapshot-tested like the SVG scene model
   ▼
render/core WorldRenderer.setScene(scene) → registry.update(scene, previous)
   │ each module diffs its slice and rebuilds only what changed (instancing)
   ▼
frame loop: registry.frame(dt, clock) → post-processing → canvas
   │
   ├─ interaction: pointer → picking → store (selectHex / routing / hover)
   └─ hud: React overlay reads the store + bridge/hud view models; the label layer
          asks the renderer to project hexes each frame (direct DOM writes, no React)
```

The HUD keeps today's panel view models (`src/app/panel/*`, `timeline`, `report`) — they are
the tested contract of every panel that exists today — and re-exports them through
`bridge/hud.ts`. What is new is the overlay shell, the world-anchored label layer, the weather
strip, the options (OPCJE GRY — `app/components/OptionsPanel.tsx`: quality, clouds, motion,
renderer, theme, sound, session; it takes the right column like the hex panel) and the
diagnostics line.

## 4. The scene contract

`src/world/bridge/worldScene.ts` is the source of truth; the file is written as
documentation. Summary of the slices and who consumes them:

| Slice | Content | Consumers |
|---|---|---|
| `time` | day/turn shown, phase, hour of day (block midpoint), month, day type, `resolved` | sky, cities, hud |
| `board` | cols/rows, pitch, every hex with terrain, wind class, insolation, coast/shore flags | terrain, res, interaction |
| `sun` | altitude, azimuth, direction vector, sunrise/sunset, daylight 0..1 | sky, terrain, res (PV glare), cities |
| `weather` | regime, cloud cover, GHI, temperature, wind per class + direction, precipitation, fog, snow cover, storm flag | sky, terrain, res, effects, hud |
| `lines` | path, type, built/progress, upgrade, lanes per corridor step, segments with load and heuristic flow direction | grid, effects |
| `plants` | tech, capacity, blocks (status, output, setpoint, warm-up), used/offered/dump | plants, effects |
| `farms` | tech, capacity, enabled, offshore, wind at the farm, rotor state, produced/used/curtailed | res |
| `storages` | tech, power, capacity, SOC, mode, signed flow | storage |
| `junctions`, `borders` | slots, throughput usage, outward direction (borders) | nodes |
| `cities` | households/firms, size class, connected, demand/delivered/ENS, `lit` 0..1 | cities, effects |
| `sites` | construction sites and expansions with progress | effects (sites), the object module they become |
| `overlay` | selection, hover, route preview, bottleneck, showcase, weather override | effects, interaction, hud |
| `labels` | world-anchored texts with tone, kind, priority | hud |
| `notes` | bridge diagnostics (what could not be derived) | hud |

Rules: every value traces to the engine or to a documented derivation in the bridge; the
scene is JSON-serialisable; keys are stable across turns so modules can diff.

## 5. Units and coordinates

- 1 world unit = 1 km, +Y up, north = −Z, east = +X.
- Flat-top hexes in the engine's odd-q offset layout (`axialToOffset`), **pitch 25 km**
  between neighbouring centres (circumradius 25/√3 km). Column step 21.65 km (1.5 × R), row step
  25 km, odd columns half a step south. Map v1 (24×16) is 527 × 412 km.
- Terrain heights carry a vertical exaggeration of ×3 (mountains ≈ 6 km): a relief model,
  documented in `render/core/exaggeration.ts` with the rest of the table.
- `render/core/units.ts` owns `hexToWorld`, `worldToHex`, corridor lane offsets and the hex
  outline; nobody else converts coordinates.

## 6. Exaggeration table

At true scale a power plant is a speck at 25 km per hex, so installations are rendered at
map-marker scale with one factor per object class, declared in `render/core/exaggeration.ts`
and nowhere else. Vertical structures share one factor so silhouettes keep their real ratios.

| Class | Real | Factor | World |
|---|---|---|---|
| Terrain relief | 0–2.5 km | ×3 | 0–7.5 km |
| Pylon (LV / MV / HV) | 30 / 45 / 60 m | ×20 | 0.6 / 0.9 / 1.2 km |
| Wind turbine (tip) | 150 m | ×20 | 3 km |
| Cooling tower / stack | 150 / 250 m | ×20 | 3 / 5 km |
| Containment dome | 60 m | ×20 | 1.2 km |
| Industrial hall, BESS container, switchyard portal | 15–30 m | ×20 | 0.3–0.6 km |
| City block | 20–40 m | ×20 | 0.4–0.8 km |
| Plant footprint | ~1 km | ×8 | ~8 km (one third of a hex) |
| Farm footprint | — | fills 40–70 % of the hex by size rung | — |
| City footprint | — | 25–80 % of the hex by households | — |

Pylons stand every 6 km along a line (four per hex step); catenary sag is 8 % of span at
world scale so the sag reads at strategic zoom.

## 7. Time and light

- The world shows the **last resolved turn** (`GameState.lastTurnReport`); before the first
  resolution it shows the pending turn with no flows and `time.resolved = false`. Scrubbing
  the ribbon never rewinds it (01 §8 pt 1).
- Hour of day = block midpoint of the turn shown (NOC → 01:30 … PÓŹNY WIECZÓR → 22:30).
- Sun altitude, declination and hour angle come from `src/engine/astronomy.ts`; azimuth
  (06 §3.5) is computed in `bridge/sun.ts` from those exported primitives — no engine change.
- Night is the drama: cities are lit by `lit = delivered / demand`; an unserved share darkens
  the city immediately; unconnected cities are dark settlements.
- A turn resolution is the one cinematic moment: the sun moves from the previous hour to
  the new one over 1.5 s, flows, plumes and city lights settle over the same window. With
  motion reduced this is instant.

## 8. Weather

One truth for the whole country (02 §7); the bridge regenerates the shown day's truth with
the engine's pure `generateDayTruth` when the report belongs to a day the state no longer
holds. Mapping (bridge/weather.ts):

| Input | Output |
|---|---|
| cloud cover | sky turbidity, cloud layer coverage, cloud shadows on terrain, PV collapse (already in GHI); how much of the layer reaches the board is the player's `CHMURY` setting (below) |
| regime + cloud + temperature | precipitation kind (rain / sleet / snow) and intensity, fog, haze |
| daily mean temperature (+ regime) | snow cover 0..1 (lowland); terrain derives the snowline |
| wind per class | turbine rotor state: off (farm disabled), still (< cut-in 3 m/s), spinning (speed ∝ power curve), feathered (≥ cut-out 25 m/s); cloud drift; precipitation slant |
| regime | wind direction (base direction per regime + per-day deterministic jitter) |

Dunkelflaute must look like Dunkelflaute: fog/frost high → still rotors, flat grey or hard
frosty light, dark PV. Storm → feathered rotors, driving rain, low scud.

`CHMURY: PEŁNE / PRZEJRZYSTE / BRAK` (docs/08 §6) is a view setting, `CloudMode` =
`full | clear | none` in `ModuleContext.clouds`. `full` draws the layer over the whole country;
`clear` (the default) parts it over the board — the fragment shader measures where the view
ray through a cloud meets the ground and drops the cloud when that point lies on the board,
so from no angle does a cloud pixel cover a hex, and the layer closes again over a 45 km band
outside it; `none` hides both layers and sets the cloud shadow strength to 0. The weather
itself — light under the cover, fog, precipitation, PV — is the same in every mode. The
coverage field fades octaves finer than ~2 px to their mean and hands the lumps' curl over to
a slow warp from ~40 m a pixel, so a far view reads soft heaps instead of white speckle.

## 9. Legibility contract (state → encoding)

| Question | Encoding | Module |
|---|---|---|
| Which line is overloaded? | conductor emissive: idle = none, ok = faint white, warn ≥ 75 % = amber, over ≥ 99.5 % = red with a slow 0.5 Hz breath; the one worst bottleneck gets a red ground ring; label `WN 1 500/1 500 ⚠` | grid, effects, hud |
| Which city is short? | lit windows fade to the served share; ENS > 0 → red ring on the ground and `−ENS` label; unconnected = dark, no ring | cities, effects, hud |
| What time is it? | sun position and colour, sky, shadows, city lights; HUD hour in the top bar | sky, hud |
| Which blocks run / start? | online = warm windows + plume scaled by output; starting = orange warm-up glow ramping, thin plume; offline = dark | plants |
| What is the weather doing? | sky, clouds, precipitation, fog, rotors; HUD weather strip with numbers | sky, res, hud |
| Which farm is off / curtailed? | off = rotors still and nacelle lights out; curtailed = amber ring at the base | res, effects |
| What is under construction? | scaffold + crane, ghost silhouette growing with progress, `BUDOWA · 2 DOBY` label | effects |
| Where would the line go? | route ribbon on the terrain in the action colour (red when invalid), cost callout at the cursor end | effects, hud |

The HUD label layer prints the same texts the SVG map printed (`bridge/labels.ts`), so a
number is never invented by the renderer.

## 10. Motion policy

The handoff's "static interface" rule is repealed for the world layer only (docs/08 §4).

| Animates | Rate | Still |
|---|---|---|
| rotors (by wind), plumes and vapour (by output), clouds (by wind), precipitation, water | continuous, slow | terrain, pylons, buildings |
| flow particles along loaded conductors | ~1 hex/s | idle lines |
| overload breath | 0.5 Hz, amplitude 30 % | ok / warn lines |
| turn resolution transition (sun, lights, flows) | 1.5 s once | the HUD |
| camera moves (fly-to, presets) | 0.6 s ease | — |

OPCJE GRY: `RUCH: PEŁNY / OGRANICZONY / BRAK`. `OGRANICZONY` (also the default when the OS
asks for reduced motion) stops breathing, particles and cloud drift; rotors and plumes still
move because they carry state. `BRAK` freezes everything; state is then read from emission
and silhouette alone, which is why every animated signal has a static twin.

## 11. Module contract

```ts
interface WorldModule {
  id: string;                                  // folder name
  init(ctx: ModuleContext): void | Promise<void>;
  update(scene: WorldScene, previous: WorldScene | null, ctx: ModuleContext): void;
  frame(dt: number, ctx: ModuleContext): void;  // animation only; never rebuilds geometry
  dispose(): void;
}
```

`ModuleContext` gives a module its own root `Group`, the renderer, camera, quality tier,
frame clock, PRNG factory, units, motion settings, the cloud setting, and two providers
registered by other modules: `terrain` (`heightAt`, `normalAt`, snowline) and `environment`
(sun direction, sky colour, fog). Init order: terrain → sky → the rest in registration
order. Every call is wrapped by the registry: a throwing module is disabled, its root hidden
and its id reported through `ctx.diagnostics` to the HUD line `⚠ moduł <id> wyłączony —
<error>`.

Events (renderer → app): `hex:hover`, `hex:click`, `hex:context`, `camera:change`,
`scene:ready`, `module:failed`, `perf:tier`. All through `WorldRenderer.events`.

## 12. Determinism

- Renderer randomness: `ctx.rng("<module>:<purpose>")` → sfc32 stream seeded from
  `scene.seed` and the stream name. `Math.random` and `Date` are forbidden in `src/world`
  (lint). Foliage scatter, cloud detail, city block layout and the per-hex ground looks
  (`render/terrain/looks.ts`: a biome character with its ground variant, a tone and a tile
  transform per hex) regenerate identically. The soft borders between hexes
  (`render/terrain/blend.ts`) read a fixed-seed noise texture; the shader and the CPU (tree
  placement) run the same arithmetic on it.
- Frame clock: `ctx.clock.time` (seconds) drives every animation. `?clock=<ms>` pins it.
- Procedural textures use a fixed seed; they are the same in every session.
- Scene snapshots (`tests/unit/world/`) pin the bridge; capture PNGs pin the renderer.

## 13. Performance budget and quality tiers

| Tier | Shadows | Post | Clouds | Particles | Instances |
|---|---|---|---|---|---|
| high | 2048 CSM-lite | bloom + SMAA | layered | full | full |
| medium | 1024 | bloom | one layer | half | full |
| low | none | none | flat | none | reduced |

Auto: start at medium, measure 120 frames, move a tier up or down; `?quality=` and
`JAKOŚĆ` in OPCJE GRY override. Instance everything that repeats (hex tiles, pylons,
conductors, turbines, PV rows, city blocks). Strategic view budget: ≤ 800 draw calls, ≤ 3 M
triangles.
`perf/budget.ts` asserts the budget in capture logs; a module over budget is cut, not shipped
at 25 fps. Measured numbers are reported as measured, with the GPU named.

## 14. Asset policy

CC0 only: Poly Haven, ambientCG, or procedural. In this port everything is procedural
(`render/core/textures.ts`, geometry built in code; the ground variants of
`render/terrain/variants.ts` are painted once per page on the GPU and read back into the
ground arrays, `render/terrain/variantPainters.ts`): the registry is unreachable from the
build environment and downloads need explicit approval, so no external asset is bundled.
Adding a CC0 texture is a change request to the integrator with source, licence and size.
Fonts: IBM Plex from `@fontsource` (already bundled).

## 15. Capture harness and showcase routes

URL parameters (capture mode, `?capture=1`): `seed`, `day`, `turn` (the turn 0..7 shown
RESOLVED — absent means the day's first turn is pending and nothing is resolved), `regime`
(weather override shown with a banner), `camera` (preset name: strategic, overview, north,
closeup, golden, detail), `focus=col,row` (offset hex the close presets look at), `clock` (pinned
ms), `quality`, `motion`, `clouds` (`full` | `clear` | `none`), `scenario` (`start` |
`midgame`, built in `bridge/showcase.ts`),
`showcase=<module>` (stages that module alone, HUD off, on the showcase's own day — 1, the
judging day of `midgame`, unless `day` overrides it), `modules=a,b,c` (loads only these
modules — a layer's cost is the difference between a capture with and without it),
`hud=0|1`, `renderer=svg|3d`, `theme=light|dark`.

Presets frame the board inside the **safe frame** — the part of the viewport the HUD
leaves uncovered (`CameraRig.setSafeFrame`, measured by `WorldView` from the top bar, the
panel, the ribbon and the report strip).

`window.__en` (capture/dev only): `ready`, `scene`, `info()` (draw calls, triangles,
programs, geometries, textures, estimated GPU bytes), `fps(frames)`, `project(q, r)`,
`select(q, r)`, `hover(q, r)`, `camera(preset)`, `resolve()`, `diagnostics`.

`scripts/capture.mjs --seed --day --turn --regime --camera --clock --out` loads the app,
waits for `scene:ready`, writes `<out>.png` and `<out>.json` (console + page errors, fps over
a fixed window, `renderer.info`, GPU estimate, budget verdict). Same inputs → byte-comparable
PNG on the same machine. Headless Chromium runs on SwiftShader, so fps from headless runs is
labelled `software`; the perf gate uses `--headed`. `--showcase <module> --all` walks every
frame of the showcase; `--modules a,b,c` narrows the loaded modules for a like-for-like cost
measurement.

The harness keeps the world loadable on its own: when nothing answers at `--url` (default
`http://localhost:5173`) it starts a detached Vite dev server on that port; when the port is
held by ANOTHER application (the page lacks `<title>ElectroNation</title>`) it never touches
it and finds or starts our server on the fallback ports 5174, 5183, 5193 — the log line
`capture: using the ElectroNation server at …` names the one used.

## 16. Testing and gates

- `tests/unit/world/`: bridge snapshots and derivations (sun azimuth vs 06 §3.7, weather
  mapping, labels, lanes, flow direction heuristic).
- `tests/components/`: the App renders in jsdom through the SVG fallback (no WebGL2), so every
  existing component test keeps passing unchanged.
- `tests/e2e/`: two Playwright projects — `chromium` runs `world.spec.ts` against the 3D
  build; `chromium-svg` runs the untouched `smoke.spec.ts` against a second dev server forced
  to the SVG renderer (`VITE_EN_RENDERER=svg`).
- Goldens: untouched. `npm run check` at every wave boundary.
- Critic rounds, scores and screenshots are persisted in `docs/STATUS.json`.

## 17. Renderer selection and fallback

`WorldView` picks the renderer: `?renderer=` wins, then `VITE_EN_RENDERER`, then WebGL2
detection (`WebGL2RenderingContext` present and a context obtainable). Without WebGL2 the
SVG `HexMapView` renders inside the same HUD shell with the note `⚠ brak WebGL2 — mapa w
trybie SVG`. A module failure never triggers the fallback; only a renderer failure does.

## 18. Module reference

| Module | Public API | Events | Units | Scene slice |
|---|---|---|---|---|
| render/core | `WorldRenderer`, `ModuleRegistry`, `CameraRig`, `FrameClock`, `QualityController`, `units`, `EXAGGERATION`, `worldRng`, `textures` | scene:ready, camera:change, module:failed, perf:tier | km, s | all (dispatch) |
| render/terrain | `TerrainModule`, registers `TerrainProvider` | — | km | board, weather.snowCover, sun |
| render/sky | `SkyModule`, registers `EnvironmentProvider` | — | km, deg | sun, weather, time |
| render/grid | `GridModule` | — | km, MW | lines, overlay.bottleneck |
| render/plants | `PlantsModule` | — | km, MW | plants |
| render/res | `ResModule` | — | km, m/s, MW | farms, weather.windMs, sun |
| render/storage | `StorageModule` | — | km, MWh | storages |
| render/nodes | `NodesModule` | — | km, MW | junctions, borders |
| render/cities | `CitiesModule` | — | km | cities, time, sun |
| render/effects | `EffectsModule` | — | km | overlay, lines.segments, sites, cities.blackout |
| interaction | `attachInteraction(renderer, store)` | hex:hover/click, camera:change | px → km | board, overlay |
| hud | `<Hud>`, `<WorldLabels>`, `<WeatherStrip>`, `<Diagnostics>`, `useWorldSettings` (read by `OptionsPanel`) | — | — | labels, weather, time, notes |
| perf | `budget`, `FpsMeter`, `instancing` | perf:tier | fps, calls | — |
| capture | `captureParams`, `installCaptureApi` | — | — | all (read) |
| bridge | `buildWorldScene`, `solarAzimuthDeg`, `sceneWeather`, `showcaseState`, `hud` re-exports | — | — | — |

## 19. Blocked engine requests

Recorded in `docs/STATUS.json` under `blockedEngineRequests`:

1. **Segment flow direction.** `TurnSegmentReport.usedMw` is unsigned; the flow may run
   either way along a segment. The bridge infers direction by hop distance from producing
   nodes over loaded segments (`bridge/flowDirection.ts`) and marks it as a heuristic.
   A signed `usedMw` or a `fromNodeId → toNodeId` direction bit would make it exact.

## 20. Dependencies

`three@0.184.0` with `@types/three@0.184.1` — the newest release reachable from this build
environment (the npm registry is unreachable; both came from the offline cache). Post-
processing and the sky model come from `three/addons`; no other rendering dependency.
