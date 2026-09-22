# hud — progress

Hand-over for the HUD module (docs/08 §7, ARCHITECTURE §3, §9, §16). Written at the end
of the second fix round (final-gate items A–E + the round-1 list).

## Checklist

- [x] 1 World-anchored labels — DOM writes only from a rAF loop (reads before writes,
  writes only on change), priority layout in `labelLayout.ts` (pure), alerts never
  culled and led, shell surfaces as hard occluders and world strips as soft ones, four
  depth tiers, city weight, muted cities, halo + scrim. **Round 2:** an alert whose
  anchor the projection rejects (behind the camera, e.g. `SN 500/500 ⚠` at closeup
  19,6) now gets a synthetic anchor on the camera basis: the chip is clamped to that
  viewport edge with the direction glyph and a leader, so no alert is ever dropped.
  A `led` object under the shell (the TG KAMIONKA plant under the ribbon) is led out
  instead of hidden — the leader carries the name back. 29/29 at strategic, 5/5 at
  closeup, `culled` empty in both.
- [x] 2 Strips — weather strip, world legend, settings strip, diagnostics, showcase
  caption. Legend starts folded; diagnostics render only when there is a diagnosis.
  **Round 2:** the folded legend chip is caption size and `--en-text-3`.
- [x] 3 Contrast and themes — verified by capture: dark and light, evening and noon
  strategic, close-ups 19,6 and 11,7. **Round 2:** chips carry a soft drop shadow and
  the hairline edge; leaders 1,5 px with the anchor dot; tier opacity (0,88 → 1) and
  tier font size fall with depth; alerts are square red pills with a 2 px left bar.
- [x] 4 Copy rules — label text is the bridge's; strips use the allowed glyphs only
  (the Dunkelflaute note is re-worded by `plainGlyphs`), U+2212, comma decimals,
  space thousands. The bridge's own wording is a change request below.
- [x] 5 Composition — **Round 2:** at the strategic preset on laptop heights the
  ribbon's coverage chart folds away (`.en-app--world:has(.en-wlabels.is-compact)
  .en-region--chart`) and the world gets the height back. WorldView's safe frame at
  1600×900: 1199×645 → **world share 0,537** (was 0,420); at 2560×1440: **0,570**
  (the chart stays on tall screens). Draw calls 110 (1600 strategic) / 124 (2560).
- [x] 6 Dispatcher panel — **Round 2:** on short viewports the panel is ONE scroll
  column: the NASTAWY section takes its full content height (707 of 707 px, no
  292 px window) and the balance + commit stay pinned at the foot. TG KAMIONKA,
  the plant feeding the blacked-out city, is visible without scrolling.
- [x] 7 Weather override — the top bar's value names itself `PROGNOZA REŻIMU` (chip)
  while the strip keeps `PODGLĄD POGODY: <reżim>`; the PODGLĄD tag no longer sits on
  the contradicting value.

## Measured (captures/hud/s3/*.json, headless SwiftShader)

- strategic frostHigh dark: drawCalls 110 · triangles 275 794 · gpuBytes 13,2 MB ·
  errors 0 · budget ok · every module ready · labels 29/29, culled [].
- strategic frostHigh light: same counts; 103–110 calls across the summer frames.
- closeup 19,6: 128 calls · 348 611 tris · 5 labels placed (was 4 with 1 culled).
- closeup 11,7: 137 calls · 398 267 tris.
- 2560×1440 strategic: 124 calls · 314 568 tris · share 0,570.
- bare world (`--hud 0`): 112 calls · 4 261 ms ready.
- Label layer (`window.__enLabels`): frameMs 0,8 · layoutMs 0,6 · 29 labels.

## Latest screenshots

- captures/hud/s3/b-strategic-frost.png — turn 6 frostHigh, strategic, dark: chart
  folded, micro labels with names (`FW WYDMY · ~0`, `ROZBUDOWA DO WN · 1 DOBA`),
  top bar `PROGNOZA REŻIMU`, panel shows TG KAMIONKA.
- captures/hud/s3/c-strategic-frost-light.png — same frame, light theme.
- captures/hud/s3/c-strategic-summer.png / c-strategic-summer-light.png — turn 4
  summerHigh, both themes.
- captures/hud/s3/b-closeup-19-6.png — Kamionka selected, `SN 500/500 ⚠` clamped to
  the left edge with the cue, TG KAMIONKA led out above the ribbon.
- captures/hud/s3/c-closeup-11-7.png — Jasienica close-up, chart back (no compact).
- captures/hud/s3/c-strategic-2560.png — 2560×1440, chart stays, share 0,570.
- captures/hud/s3/d-strategic-bare.png — `--hud 0`, world untouched.

## Known gaps

- The strategic chart fold is a CSS reaction to the label layer's `is-compact` class
  (camera > 320 km). A player on a tall screen keeps the chart; on a laptop it is
  gone with no way back. A fold toggle in the ribbon or a docked chart in the report
  dock would be better — see change requests.
- `LIFT_KM` anchors still unverified against object meshes.
- The panel's sticky foot overlays the last rows of the setpoint list while scrolling
  (standard sticky footer; the list scrolls under it).
- Hover emphasis stays border-only by design.

## Change requests

- `src/app/components/TopBar.tsx` + `src/app/store/selectors.ts`: docs/08 §3 wants the
  hour in the top bar. Proposal: extend `topBarContext(game)` to
  `ROK 1 · STYCZEŃ · DOBA ROBOCZA B · 19:30` (the shown turn's block middle), and add
  an optional `regimeNote`/`regimeOverridden` prop so the bar can print the capture
  override regime in accent and the day's forecast as a muted `PROGNOZA REŻIMU` chip —
  the HUD can only relabel the bar in CSS today.
- `src/world/bridge/buildWorldScene.ts` (line ~320): only the single hottest overload
  is emitted (`key: "overload"`). With two conductors at 100 % (SN 500/500 and the LV
  line to Kamionka) only one carries a label. Proposal: push one label per overloaded
  segment (cap ~3 by ratio), keys `${line.id}:${segment.segmentId}:overload`, same
  `overloadLabel` text and priority 10 — the layout already stacks alerts.
- `src/world/bridge/hud.ts` (line 90): the Dunkelflaute note uses `→` and `≈`, not in
  the allowed glyph set. Proposal: `⚠ Dunkelflaute: wiatr 1,7 m/s poniżej 3 m/s i GHI
  0 W/m² · OZE bliskie zera` — the HUD keeps rendering the note as given.
- `src/app/timeline/TimelineView.tsx` / `app-shell.css`: the chart's viewBox is fixed
  at 1060×130, so its height can only follow the column width (140 px at 1600, 258 px
  at 2560). Proposal: derive the region height from a token
  (`.en-region--chart { height: var(--en-chart-h) }`) and let the model's height scale
  with it, so the chart can shrink instead of folding; or dock the chart into the
  report dock at strategic.

## Integrator notes acknowledged (2026-09-21)

- `hudVisible` → `params.hud` and the `?select` effect after the scenario effect are
  untouched (App.tsx only read, never edited this round).
- Captures under `captures/hud/s3/`; the round-1 `captures/hud/fix2/` set stays as
  the before-pictures.
