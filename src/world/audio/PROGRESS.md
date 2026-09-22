# audio — progress

Hand-over between pipeline steps. Rewritten at the end of step 1.

## Step 1 of 2 — module core (2026-09-21) — DONE, judged in the headless probe

Found on arrival: the folder existed and was empty; no `captures/audio/`. Nothing to resume.
`docs/STATUS.json` said `audio: { owner: builder, state: "not started" }`.

### Checklist (from the brief, MODULE: audio)

- [x] WIND bed from `scene.weather.windMs.open` — band-passed pink noise, level and band
      frequency from the open wind, gusts from the seeded stream
      `worldRng(seed, "audio:gust")` (9 bumps / 41,7 s, lulls 0,00 → gusts 1,00).
- [x] rain / snow / storm layers from `weather.precipitation` (+ `weather.storm`), separate
      voices, storm forces a minimum rain floor and adds a low rumble.
- [x] TURBINE whoosh near spinning farms, level ∝ `rotorSpeed^1,15 × distanceGain(6–60 km) ×
      gust`, band 170–470 Hz, checked against `enabled`/`rotor` (06 §6.3 states).
- [x] PLANT hum by output near the camera: nuclear/coal low drone (42–64 Hz, triangle +
      harmonics), gas whine (165–310 Hz, sawtooth), level saturates at ⅓ load, silent at 0.
- [x] CITY murmur at night by `lit × scale × (1 − daylight)^1,1`, low-passed 230–380 Hz.
- [x] ONE diagnostic ping (660 Hz sine, 8 ms attack, 0,7 s decay, peak 0,04 < the bed) on a
      NEW overload (ratio ≥ 0,995 — the SVG map's own threshold) or blackout; 6 s cooldown; a
      persistent red state never re-pings.
- [x] API `createWorldAudio(getScene, getView)` → `{ setEnabled, setVolume, update, dispose }`;
      muted by default; AudioContext only inside `setEnabled(true)`; a `?capture=1` page refuses
      to enable (probe-verified); zero console calls anywhere, so nothing to warn when muted.
      `debug()` is an evidence-only extra (see "Known departures").
- [x] ≤ 40 nodes: **33** alive (master + analyser + limiter, 6 noise voices × (source+filter+
      gain), 2 plant voices × (3 osc + filter + gain), ping osc+gain). 0 nodes while muted.
- [x] `update()` ≤ 1 % main thread, cadence 250 ms, no allocations in the steady state (every
      mapping writes into a per-instance scratch object; the only allocations are the gust
      tables and the ping baseline on the first pass after enabling).
- [x] Unit tests of the pure mappings without an AudioContext: 22 assertions in
      `tests/unit/world/audio.test.ts`.
- [x] Headless Playwright evidence under `captures/audio/s1/` (`audio-probe.mjs`).
- [x] Change requests for the settings store, the HUD toggle and the WorldView wiring (below).

### Files

| File | Role |
|---|---|
| `mapping.ts` | pure mappings — scene numbers → Web Audio parameters (unit-tested) |
| `graph.ts` | graph construction, pink-noise synthesis, ping envelope, RMS |
| `index.ts` | `createWorldAudio` — lifecycle, scene/view reading, throttled `update()`, `debug()` |
| `PROGRESS.md` | this file |

### What the module does, signal by signal

| Signal | Voice | Source of the number |
|---|---|---|
| wind bed | band-pass 240–880 Hz, Q 0,6–1,1, level 0,06–0,56 | `weather.windMs.open`, `gustiness` |
| gusts | ±45 % level swing around the neutral gust level | `worldRng(seed, "audio:gust")` schedule |
| rain | high-pass 900 Hz hiss, 0–0,30 | `precipitation.kind=rain`, `intensity` |
| snow | low-pass 1,2 kHz hush, 0–0,12 | `precipitation.kind=snow` |
| storm | low-pass 140 Hz rumble, 0,18 | `weather.storm` |
| turbines | band-pass 170–470 Hz, Q 3,5, 0–0,24 | `farms[].enabled/rotor/rotorSpeed`, distance to `view.target` |
| plant low | triangle 42–64 Hz + harmonics, 0–0,20 | `plants[].tech` (nuclear/coal), `outputMw/capacityMw` |
| plant gas | sawtooth 165–310 Hz through 700 Hz LP, 0–0,20 | `plants[].tech` (ccgt/ocgt), load |
| city | low-pass 230–380 Hz, 0–0,16 | `cities[].lit × scale`, `sun.daylight`, distance |
| ping | sine 660 Hz, one envelope per event | `lines[].segments[].ratio ≥ 0,995`, `cities[].blackout` |

Levels are relative; the one audible judgement that matters (the ping never masking the bed)
is encoded in constants: `PING_PEAK` 0,04 vs wind floor 0,06.

### Measured (headless Chromium, `captures/audio/s1/`)

- **Probe** (`probe-enabled.json`, URL `?scenario=midgame&day=1&turn=6&hud=0`, day 1 turn 6
  fogHigh, seed 20260902, focus on `plant-start-ccgt` 100 MW):
  context `running`, **33 nodes**, master RMS **0,046–0,089** over the bed (5 samples), gust
  0,03 at read time, pingCount 0 (nothing new went red), consoleErrors 0, pageErrors 0.
  `update()` cost measured in-page: **median 0,10 ms, max 0,30 ms per pass** (8 passes, 260 ms
  apart) → 0,04 % of the 250 ms cadence; ≤ 0,6 % of one 16,7 ms frame even if called every frame.
- **Capture guard** (`probe-capture-guard.json`, same URL + `&capture=1`): `setEnabled(true)`
  leaves `enabled false`, `nodes 0`, `contextState null`, `rms 0`; zero console/page errors.
- **Harness frames** (SwiftShader, pinned `--quality high`, all JSONs `consoleErrors []`,
  `pageErrors []`, `budget.ok true`, all 10 modules `ready`):
  `game-evening-bare` 122 calls / 439 887 tris · `game-evening-nohud` 124 / 439 879 ·
  `game-offshore-noon` (`--camera detail --focus 10,2`) 178 / 1 193 713.
  Audio is not part of these frames (the module is not wired into `WorldView` yet), so it can
  add neither draw calls nor triangles; the cost numbers that matter are the probe's.
- **Determinism caveat, stated honestly:** `game-evening-bare` (16:16:51) and
  `game-evening-twin` (16:23:34) differ by +2 draw calls / +24 triangles. The effects builder
  saved `render/effects/bands.ts` at 16:23:15 and `render/effects/index.ts` at 16:23:42 —
  between the two captures — so this is a concurrent code change, not frame noise. The twin
  must be re-run on a quiet tree before it can be used as a determinism proof; audio is not
  loaded by the harness at all.
- Gates: `npm run lint` clean; `npx tsc -p tsconfig.json --noEmit` clean; `npx vitest run
  --project unit` **41 files / 538 tests** green (22 of them mine).

### Judgement (as harsh as a sound can be judged from numbers)

I could not listen to it — the brief forbids headed audio here, so the evidence is the
analyser RMS plus the mappings. What the numbers do say: the bed is present and non-zero at
1,4 m/s open wind (`rms` 0,05–0,09), the graph is exactly 33 nodes and costs 0,1 ms per
250 ms, the ping cannot exceed 0,04 while the bed floor is 0,06, and a capture page is
provably silent. What they cannot say is whether it sounds like a country rather than a
noise generator; that is step 2's listening pass with the volume control in the HUD.

### Known departures / limits → step 2

1. **`debug()` is an extra method** on the returned object, outside the four-method contract
   from the brief. It exists because the headless probe needs the node count, context state
   and RMS, and the brief forbids headed audio. Callers should ignore it; it is safe to keep
   or trim in step 2.
2. One voice per family: the loudest spinning farm, the loudest low plant, the loudest gas
   plant, the loudest lit city. More than one of each within its window is not layered (node
   budget). Step 2 can spend the 7 free nodes on a second turbine voice if it matters.
3. No convolver/reverb (the brief allows synthesised impulses); everything is dry.
4. `getView().distanceKm` is accepted but unused — the target position already carries the
   "near the camera" rule. Step 2 could damp the whole mix at strategic zoom.
5. The ping was unit-tested and never observed live (a new overload must appear while audio
   is on). Step 2's listening pass should trigger one deliberately (e.g. resolve a turn).
6. The gust period is an audio-clock constant (41,7 s); in headless Chromium the audio clock
   runs faster than wall time, so the probe's numbers are cadence-independent.

### Change requests (integrator-owned files)

**(1) `src/world/hud/settingsStore.ts` — persisted audio field.** Exact additions:

```ts
export interface AudioSettings {
  enabled: boolean;
  volume: number;
}

export interface WorldSettings {
  motion: MotionMode;
  quality: QualityChoice;
  renderer: RendererChoice;
  legend: LegendChoice;
  /** Muted until the player asks for sound (browser autoplay policy). */
  audio: AudioSettings;
}

interface Stored {
  // …existing fields…
  audio?: unknown;
}

const DEFAULT_AUDIO: AudioSettings = { enabled: false, volume: 0.6 };

function parseAudio(value: unknown): AudioSettings {
  if (typeof value !== "object" || value === null) return { ...DEFAULT_AUDIO };
  const raw = value as { enabled?: unknown; volume?: unknown };
  const volume =
    typeof raw.volume === "number" && Number.isFinite(raw.volume)
      ? Math.min(1, Math.max(0, raw.volume))
      : DEFAULT_AUDIO.volume;
  return { enabled: raw.enabled === true, volume };
}

export function defaultSettings(): WorldSettings {
  return { /* …existing… */, audio: { ...DEFAULT_AUDIO } };
}

function readStored(): WorldSettings {
  // …existing…
  audio: parseAudio(stored.audio),
}

function settingsOf(store: WorldSettings): WorldSettings {
  return { /* …existing… */, audio: { enabled: store.audio.enabled, volume: store.audio.volume } };
}

export interface WorldSettingsStore extends WorldSettings {
  // …existing setters…
  setAudioEnabled: (enabled: boolean) => void;
  setAudioVolume: (volume: number) => void;
}

export const useWorldSettings = create<WorldSettingsStore>()((set, get) => ({
  ...readStored(),
  // …existing setters…
  setAudioEnabled: (enabled) => {
    set((store) => ({ audio: { ...store.audio, enabled } }));
    persist(settingsOf(get()));
  },
  setAudioVolume: (volume) => {
    const clamped = Math.min(1, Math.max(0, volume));
    set((store) => ({ audio: { ...store.audio, volume: clamped } }));
    persist(settingsOf(get()));
  },
}));
```

**(2) `src/world/hud/SettingsStrip.tsx` — the `DŹWIĘK` toggle.** Next to the other segments:

```tsx
const AUDIO_LABELS: Record<"off" | "on", string> = { off: "WYŁ.", on: "WŁ." };
const AUDIO_ORDER: readonly ("off" | "on")[] = ["off", "on"];

// inside SettingsStrip():
const audio = useWorldSettings((store) => store.audio);
const setAudioEnabled = useWorldSettings((store) => store.setAudioEnabled);

<Segmented
  label="DŹWIĘK"
  order={AUDIO_ORDER}
  labels={AUDIO_LABELS}
  value={audio.enabled ? "on" : "off"}
  onChange={(choice) => setAudioEnabled(choice === "on")}
/>
```

The existing `Segmented` already gives the group an `aria-label` and `aria-pressed` per
button, so the toggle is keyboard-reachable as the other strips are. The click is the user
gesture the AudioContext needs, which is why `enabled` must start `false` in the store.

**(3) `src/world/WorldView.tsx` — the wiring call.** Imports and additions:

```tsx
import { createWorldAudio, type WorldAudio } from "./audio";
// in the component:
const audioSettings = useWorldSettings((store) => store.audio);
const sceneRef = useRef(scene);
sceneRef.current = scene;
const audioRef = useRef<WorldAudio | null>(null);

// inside the mount effect, after `world` was created and before `world.start()`:
const worldAudio = createWorldAudio(
  () => sceneRef.current,
  () => ({
    target: { x: world.rig.target.x, z: world.rig.target.z },
    distanceKm: world.rig.distanceKm,
  }),
);
worldAudio.setVolume(useWorldSettings.getState().audio.volume);
worldAudio.setEnabled(useWorldSettings.getState().audio.enabled);
audioRef.current = worldAudio;
// 250 ms is the brief's cadence; update() throttles itself and allocates nothing.
const audioTimer = window.setInterval(() => worldAudio.update(), 250);

// in the mount effect's cleanup, before `world.dispose()`:
window.clearInterval(audioTimer);
worldAudio.dispose();
audioRef.current = null;

// a separate effect, after the mount effect, for later setting changes:
useEffect(() => {
  audioRef.current?.setEnabled(audioSettings.enabled);
  audioRef.current?.setVolume(audioSettings.volume);
}, [audioSettings.enabled, audioSettings.volume]);
```

Two details the integrator should keep:
- `setEnabled` inside a React effect is not itself a user gesture, but it runs right after the
  toggle click (transient activation) and the module retries `resume()` on later passes, so a
  persisted `enabled: true` starts sounding at the next click either way.
- With `?capture=1` the module refuses to enable, so the harness never records audio and
  captures stay silent without any further condition in WorldView.

**(4) Optional, `docs/STATUS.json` + `src/world/showcase/registry.ts`** (both integrator-owned):
audio has no scene to stage, so a `showcase: audio` frame would show nothing; the probe under
`captures/audio/s1/` is the audio evidence instead. If `STATUS.json` wants the module recorded,
`state` is "core built, pending listening" with the probe paths as last screenshots.

### Integrator notes

_(The integrator appends here when change requests are applied.)_
