# render/storage — progress

Hand-over between pipeline steps. Step 1 (module core) landed 2026-09-21; this
file was rewritten at the start of step 2 and rewritten again at its end.

## Step 2 of 2 — close the remaining items, measure, polish (2026-09-21)

Arrived from step 1 (all green): BESS yards (instanced containers, skids,
portals, fence, masts, SOC lamp bar, charge cyan / discharge warm / idle
neutral, flow as intensity) and pumped storage (terrain-hugging embankment,
crest ring, drawdown-band basin with the water level = SOC, penstocks,
powerhouse windows, tailrace foam/swirl), 1,5 s eases, hooks `storage:base:<id>`,
determinism byte-exact, layer cost +20 draws / +6,4k tris at the strategic view.

Integrator note on arrival: BESS Jasienica raised to 250 MW / 2 000 MWh (the
day-1 discharge leaves ~21 % at the judging turn), showcase frames switched to
closeup (pumped-golden) / detail (bess-noon), CameraRig stale-matrix bug fixed.
`render/effects` is still a stub (and currently logs a shader compile error of
its own — not this module's).

### Checklist (this step)

- [x] 1 Pumped charge: visuals reworked (intake swirl now a ripple+plume decal),
      **staged and judged** via a scratch probe (the showcase cannot stage it);
      change request filed for a canonical frame
- [x] 2 24-container xlarge BESS **captured and judged** via a scratch probe;
      a second pumped site in the scenario still needs the bridge (change request)
- [x] 3 Eases: capture mode pins the clock, so a URL frame can never show one —
      documented, and the ease state machine is covered by the module's own
      write-guards; a mid-ease capture needs a free-clock frame (change request)
- [x] 4 Tailrace: **concrete outfall channel + headwall**; dam: **gated spillway
      with chute walls, gate bay and apron + crest road** (road broken at the
      spillway bay)
- [x] 5 BESS daylight bar contrast: near-black bar housing, lenses on the bar's
      face, bigger solid core, brighter glow (detail + 42 km closeup judged)
- [ ] 6 Terrain sheen over the tailrace — cross-module, filed in s1, still open;
      this step moved the site to dry ground and pinned the pond surface, which
      removes the worst of it (the site no longer sits in the terrain lake)
- [x] 7 Headed GPU cost measured (Apple M3 Pro, 1600×900, 120 frames)
- [x] 8 Polish: dam profile fixed (was a mushroom, now toe→crest with berms),
      lake-aware site placement, spillway + road + outfall silhouettes,
      container end doors, SOC bar housing
- [x] 9 Module core (step 1)
- [x] 10 Captures under `captures/storage/s2/` judged; PROGRESS rewritten

### What changed this step (code)

- `geometry.ts`: the face profile is now toe→crest (`FACE_PROFILE`, `faceAt`,
  `facePoint`); `crestRoadGeometry` (crowned asphalt band, broken at the
  spillway bay, kerb skirts); `spillwayGeometry` (U-section chute swept down
  the face, two piers + deck + hoist on the crest, toe apron);
  `outfallGeometry` (U-section channel swept along a terrain-following
  centreline + headwall); `pondGeometry` is now a **level** ellipse fan;
  `pondRimGeometry` banks the pond in even where it cuts into a slope;
  `ventGeometry` carries louvres **and** the dark end door from one texture.
- `layout.ts`: dam radii 4,0/3,05/2,72 (base wider than the crest, as a dam
  must be); the pumped site's direction scores basin + foot + tailrace height,
  so a lakeside hex cannot half-drown the works; spillway angle; the tailrace
  sits 10,5 km out at the **median** ground level; the outfall centreline and
  the SOC bar/lamps (lamps now sit on the bar's face).
- `materials.ts`: `bar` (near-black housing) and `road` (asphalt) materials;
  concrete two-sided (swept shells); lens core solid to 55 % of 2,9 px, warm
  glow 3,9 px; rock-fill and concrete tones lifted out of the mud.
- `textures.ts`: vent atlas (louvre + door), stronger container seams, lighter
  rock fill.
- `index.ts`: bar as its own mesh, road mesh, spillway + outfall merged into the
  crest mesh, crest shadows under quality.

### State encoding as it stands (docs/08 §3)

| State | Encoding | Judged in |
|---|---|---|
| SOC (BESS) | unit-status bar: a lit run of lenses on a near-black housing, one lamp per container; lit share = SOC (≥ 4,5 px lit run at the strategic view) | `a1` (soc 1,0, full warm run in daylight), `a2` (42 km), `x2` (soc 0,65 of 24, night) |
| mode (BESS) | lit-unit emission: charge cool cyan-blue, discharge warm white, idle dim neutral | `h4` (s1, charge cyan), `a1`/`a3` (discharge warm) |
| flow (BESS) | intensity = `LAMP_FLOOR + (1−floor)·|flowMw|/powerMw` | `a3` (flow 250, bright), `h4` (flow 250) |
| SOC (pumped) | reservoir water level between the empty mark and the crest; the level disc shrinks with the frustum | `b1`/`b2` (soc 0,41), `t6` (soc 0,62) |
| drawdown band | pale wet-rock ring between the water line and the full mark, uniform-driven | `t6`, `f3` (s1) |
| charge / discharge (pumped) | **charge**: intake swirl + dark plume (judged in `x1`) and rising water; **discharge**: white foam at the outfall + mist; idle: calm. `motion.stateful`, static twins | `x1` (charge), `t6` (discharge, foam in the channel) |
| night | yard flood pools + mast lamps, powerhouse window band, 10 crest lights, far-average floor | `x2` (night yard), `b2` (crest ring), `c2` (strategic) |
| hooks | `storage:base:<id>` Object3D, userData `{storageId, tech, mode, soc, flowMw, powerMw, radiusKm}` — rings/arrows are effects' | code |

## Measured

Apple M3 Pro, Chromium 1600×900, `--quality high`, `--headed`, 120-frame window,
`--modules` subsets. Storage's share = with − without. **Budget `ok` is false on
every headed frame including the baseline** (terrain+sky alone = 8,00 ms > 6,7
ms), the same baseline render/res/grid reported in their steps.

| Frame (headed) | draws | tris | est | gpuMs |
|---|---|---|---|---|
| strategic day 1 t6 frostHigh, terrain+sky+storage (`p1`) | 47 | 217 473 | 12,6 MB | 8,24 |
| same without storage (`p2`) | 25 | 210 519 | 9,5 MB | 8,00 |
| **storage share, strategic** | **+22** | **+6 954** | **+3,1 MB** | **+0,24** |
| detail 12,6 noon, with (`p3`) | 47 | 760 481 | 12,6 MB | 6,72 |
| detail 12,6 noon, without (`p4`) | 26 | 754 007 | 9,5 MB | 6,91 |
| **storage share, detail** | **+21** | **+6 474** | **+3,1 MB** | **−0,19 (noise)** |
| closeup 2,12 golden, with (`p5`) | 46 | 382 573 | 12,6 MB | 8,03 |
| closeup 2,12 golden, without (`p6`) | 26 | 377 775 | 9,5 MB | 8,38 |
| **storage share, closeup** | **+20** | **+4 798** | **+3,1 MB** | **−0,35 (noise)** |

The layer is inside its budget share (≤ 25 calls, ≤ 200 k tris for 2–6 storages)
for the two sites the scenario has, and its GPU cost is inside the timer noise
at every camera.

Headless frames (software GL, fps not a gate), all `errors 0`, all modules
`ready`, `budget.ok true`:

| Frame | draws | tris | est |
|---|---|---|---|
| BESS detail noon (`a1`) | 47 | 760 481 | 12,6 MB |
| BESS closeup noon (`a2`) | 47 | 760 481 | 12,6 MB |
| strategic frost, layer only (`a3`) | 47 | 217 473 | 12,6 MB |
| pumped closeup golden (`b1`) | 46 | 382 573 | 12,6 MB |
| pumped closeup night (`b2`) | 46 | 382 573 | 12,6 MB |
| whole game, strategic, bare (`c2`) | 122 | 434 819 | 19,4 MB |
| whole game, strategic, HUD (`c1`) | 105 | 314 068 | 14,0 MB |

Determinism: `d1-twin-a` / `d2-twin-b` (same URL twice) — byte-identical, md5 `c37e7fa53ea01546f6909947e9a45d27`.

Gates (2026-09-21): `prettier --write` applied, `npm run lint` exit 0,
`tsc -p tsconfig.json --noEmit` clean, `vitest run --project unit` 516/516 in
40 files.

## Screenshots (all under `captures/storage/s2/`)

- `a1-bess-detail-noon` — the showcase `bess-noon` framing (detail, 18 km):
  container rows with dark end doors, the **black SOC bar with a full lit run**
  (soc 1,0 at day 1 t4), fence, portals. The daylight read now holds.
- `a2-bess-closeup-noon` — the same yard at the 42 km closeup: the bar reads as
  a dark band with a bright run (the weakest frame for this read; still legible).
- `a3-bess-strategic-frost` — day 1 t6, layer only: the warm lit run of the BESS
  at (12,6) and the ESP's crest-light ring + dark basin at (2,12).
- `b1-pumped-closeup-golden`, `b2-pumped-night-closeup` — the showcase frames:
  crest ring, level basin, floodlit powerhouse, spillway bay.
- `c2-game-frost-bare` — the whole game, strategic, day 1 t6: both storages read
  among the grid, plants and cities.
- `t4`/`t6-pumped-detail-day` (headless, 18 km) — the dam after this step: toe→
  crest profile with two berms, crest road, spillway with gate bay, outfall
  channel into the level tailrace pond.
- `x1-scratch-pumped-charge` — **scratch probe** (dev-only store dispatch, not
  URL-reproducible): ESP Kotlina charging 400 MW — the intake swirl + plume on
  the reservoir.
- `x2-scratch-bess-xlarge` — **scratch probe**: a 24-container / 500 MW yard
  (footprint 1,0, patched into the state): three rows, doors, the bar with a
  partial lit run, night floodlights.
- `p1`–`p6` — the headed perf pairs above.

## Change requests (not workarounds)

1. **`src/world/bridge/showcase.ts` (integrator)** — the mid-game script never
   charges the pumped plant, so the module's charge state has no canonical
   frame. Proposal: add
   `{ beforeTurn: 2, action: { type: "setStorage", storageId: "storage-esp-kotlina", mode: "charge", mw: 300 } }`
   and a `{ beforeTurn: 4, action: … mode: "idle" … }` release, so day 0
   afternoon shows a rising reservoir (the swirl + plume), and keep the day-1
   discharge as it is.
2. **`src/world/showcase/registry.ts` (integrator)** — no frame stages a large
   BESS or a second pumped site; the layout handles 4→24 containers and any SOC,
   but only the 14-container build is canonical. Proposal: either raise
   `storage-bess-jasienica` to 500 MW in `bridge/showcase.ts` (24 containers,
   footprint 1,0) or add a third storage to the scenario and one frame
   (`bess-xlarge-noon`, detail). A second pumped site would also exercise the
   budget's "2–6 storages" clause.
3. **Motion/eases cannot be captured from a URL** — capture mode pins the clock,
   so `motion.transitions` eases are always instant in a capture, and the
   harness has no frame-sequence option. Proposal: a `--steps t0,t1,t2` (or
   `--free-clock`) harness mode that screenshots a pinned-but-advancing clock;
   until then the ease is verified by code and by the module's write-guards.
4. **render/effects (wave 3)** — hooks `storage:base:<id>` are in place and
   unconsumed: selection ring, flow arrows, `−ENS`-style callouts. Note the
   effects module currently fails to compile one of its shaders
   (`effects-dash`: `LinearTransferOETF` already has a body) — unrelated to
   this layer but visible in every whole-game capture's console.
5. **render/terrain** — the terrain has a lake at the ESP Kotlina hex (2,12);
   the plant is placed on the high ground above it, but the terrain's water
   still crosses the dam foot in low camera angles. Same ask as render/res.
6. **Note, not a request** — the pumped showcase frames put a ~7 km site at a
   42 km camera; at that range a dispatcher reads the crest-light ring and the
   basin level, not the spillway or the road. The detail camera (18 km) carries
   the module's art.

## Integrator notes

(none applied this step)
