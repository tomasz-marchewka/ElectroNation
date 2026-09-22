# showcase — PROGRESS

Step: s1 of 2 — curation + audit. Status: **done** (checks pending below).

## Checklist

- [x] Read the brief, ARCHITECTURE.md, docs/08 §2–§9, bridge/worldScene.ts, core, registry, bridge/showcase.ts
- [x] PROGRESS.md at start
- [x] Audit captures: judging state (d1 t6 frostHigh) + turn 4 summerHigh, t7 atlanticLow, t0 fogHigh, t5 storm — every demanded state has a PNG read (verdict table in captures/showcase/README.md)
- [x] Compose SHOWCASES.game frames (4) proving the legibility contract
- [x] captures/showcase/README.md (EN): frame, what it proves, command, audit table, measured numbers, change requests
- [x] SVG A/B Playwright script under captures/showcase/ (svg-ab.mjs) + output
- [ ] Checks: prettier, lint, tsc, vitest unit

## What changed this step

- `src/world/showcase/registry.ts` — `game` entry recomposed: `evening-peak-frost`
  (t6 frostHigh strategic), `noon-summer` (t4 summerHigh strategic),
  `night-atlantic` retargeted to t7 atlanticLow strategic, `storm-golden`
  renamed `storm-offshore` (t5 storm, detail, focus 10,2). Registry shape kept.
- `captures/showcase/probe.mjs` — read-only scene probe (loads, block states,
  rotor states, storage modes, bays, border flow, city lit/ENS, sites).
- `captures/showcase/svg-ab.mjs` — SVG-side blind A/B screenshot; waits for the
  map DOM because `window.__en` does not exist on that renderer.
- `captures/showcase/s1/**` — 12 audit/game PNG+JSON, SVG pair, probe dumps.
- `captures/showcase/README.md` — the deliverable: frames, commands, audit
  table, measured numbers, honesty notes, change requests.

## Measured (software GL, all `budget.ok: true`, 0 console/page errors)

- game evening 122 dc / 436 027 tri; noon 133 / 669 383; night 122 / 432 669;
  storm detail 138 / 670 797.
- audit: fog 114 / 430 773; storm-d75 164 / 1 209 759; bess-charge 186 /
  1 203 025; coal-states 178 / 1 185 609; lanes2 142 / 670 137.
- Only budget warning: SwiftShader first-interactive, not a gate.

## Screenshots backing the claims

`s1/game-{evening-peak-frost,noon-summer,night-atlantic,storm-offshore}.png`,
`s1/game-evening-hud-{dark,light}.png`,
`s1/audit-{fog-strategic,storm-detail,storm-detail-d75,pv-night,bess-discharge,bess-charge,coal-states,lanes2}.png`,
`s1/svg-evening-peak-frost.png`; module frames cited per row in the README.

## Change requests (details in README)

1. `bridge/showcase.ts` — add a live border **export** order for day 1 (no bare
   export frame today; `nodes/s2/border-export-bare.png` proves the gap).
2. `bridge/showcase.ts` — add a **≥ 3-lane corridor** (probe `lanes3 = 0`
   everywhere in the scenario).
3. `registry.ts` + `scripts/capture.mjs` — optional `yaw`/`pitch` on
   `ShowcaseFrame` (BESS charge read needs the SOC-bar side).
4. `render/effects/**` — ring radius clamp/fade with camera distance (dominates
   closeups in the overloaded corridor).
5. `App.tsx` + capture params — honour `--hud 1` with `?showcase=`.

## Remaining for s2

- Apply accepted change requests and re-stage affected states.
- Re-capture the four game frames after any staging change; refresh md5s.
- Optional: per-biome closeup walk re-read; night pumped level read.
