// The Web Audio graph (MODULE audio, step 1): six noise voices, two tone
// voices, one ping and one master chain — all synthesised in code, no files.
//
// Node budget (the brief): 40 alive at most. This graph builds 33:
//   master + analyser + limiter          3
//   6 noise voices × (source+filter+gain) 18
//   2 plant voices × (3 osc + filter+gain) 10
//   ping oscillator + gain                2
// The noise buffer is shared; each voice starts at its own offset and plays at
// its own rate, so the layers are decorrelated without six buffers. Pink noise
// uses Paul Kellet's filter coefficients (the classic public-domain recipe).
//
// Everything here is created only inside setEnabled(true) (browser autoplay
// policy) and destroyed on setEnabled(false): a muted world owns no context.

import type { Rng } from "../render/core/prng";
import { worldRng } from "../render/core/prng";
import { PING_DECAY_S, PING_PEAK } from "./mapping";

/** Hard ceiling from the brief; asserted by the headless evidence probe. */
export const MAX_NODES = 40;

/** The diagnostic tone — one soft sine, never a loop. */
export const PING_HZ = 660;

const NOISE_SECONDS = 3;

export interface NoiseVoice {
  gain: GainNode;
  filter: BiquadFilterNode;
}

export interface ToneVoice {
  gain: GainNode;
  filter: BiquadFilterNode;
  oscs: OscillatorNode[];
  /** Frequency multipliers per oscillator, applied to the voice's base Hz. */
  ratios: number[];
}

export interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  analyser: AnalyserNode;
  wind: NoiseVoice;
  rain: NoiseVoice;
  snow: NoiseVoice;
  storm: NoiseVoice;
  turbine: NoiseVoice;
  city: NoiseVoice;
  plantLow: ToneVoice;
  plantGas: ToneVoice;
  ping: { gain: GainNode; osc: OscillatorNode };
  /** Every node, for the budget count and for disposal. */
  nodes: AudioNode[];
  sources: AudioScheduledSourceNode[];
  /** Reused scratch for rms(), so the probe allocates nothing. */
  analyserData: Float32Array<ArrayBuffer>;
  dispose(): void;
}

/** Paul Kellet's pink-noise filter, deterministic from the given stream. */
function fillPink(data: Float32Array, rng: Rng): void {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  let b3 = 0;
  let b4 = 0;
  let b5 = 0;
  let b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = rng.next() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
}

interface NoiseOptions {
  offset: number;
  rate: number;
  type: BiquadFilterType;
  freqHz: number;
  q: number;
}

function createNoiseVoice(
  ctx: AudioContext,
  buffer: AudioBuffer,
  master: GainNode,
  nodes: AudioNode[],
  sources: AudioScheduledSourceNode[],
  options: NoiseOptions,
): NoiseVoice {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.playbackRate.value = options.rate;
  const filter = ctx.createBiquadFilter();
  filter.type = options.type;
  filter.frequency.value = options.freqHz;
  filter.Q.value = options.q;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(0, options.offset * buffer.duration);
  nodes.push(source, filter, gain);
  sources.push(source);
  return { gain, filter };
}

function createToneVoice(
  ctx: AudioContext,
  master: GainNode,
  nodes: AudioNode[],
  type: OscillatorType,
  ratios: number[],
  filterType: BiquadFilterType,
  filterHz: number,
  baseHz: number,
): ToneVoice {
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.value = filterHz;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  filter.connect(gain);
  gain.connect(master);
  nodes.push(filter, gain);
  const oscs: OscillatorNode[] = [];
  for (const ratio of ratios) {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = baseHz * ratio;
    osc.connect(filter);
    osc.start();
    nodes.push(osc);
    oscs.push(osc);
  }
  return { gain, filter, oscs, ratios };
}

/** Builds the whole graph; null when Web Audio is unavailable or refused. */
export function buildAudioGraph(): AudioGraph | null {
  if (typeof AudioContext === "undefined") return null;
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    // No audio output, no audio module — the world stays silent, not broken.
    return null;
  }

  const nodes: AudioNode[] = [];
  const sources: AudioScheduledSourceNode[] = [];

  const master = ctx.createGain();
  master.gain.value = 0;
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  // A gentle limiter so a gust + ping + city never clips; diagnosis stays clean.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 6;
  limiter.ratio.value = 4;
  limiter.attack.value = 0.004;
  limiter.release.value = 0.25;
  master.connect(analyser);
  analyser.connect(limiter);
  limiter.connect(ctx.destination);
  nodes.push(master, analyser, limiter);

  const buffer = ctx.createBuffer(1, Math.round(ctx.sampleRate * NOISE_SECONDS), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  fillPink(data, worldRng(0x51ce, "audio:noise"));

  const wind = createNoiseVoice(ctx, buffer, master, nodes, sources, {
    offset: 0,
    rate: 1,
    type: "bandpass",
    freqHz: 400,
    q: 0.8,
  });
  const rain = createNoiseVoice(ctx, buffer, master, nodes, sources, {
    offset: 0.27,
    rate: 1.03,
    type: "highpass",
    freqHz: 900,
    q: 0.7,
  });
  const snow = createNoiseVoice(ctx, buffer, master, nodes, sources, {
    offset: 0.52,
    rate: 0.97,
    type: "lowpass",
    freqHz: 1200,
    q: 0.5,
  });
  const storm = createNoiseVoice(ctx, buffer, master, nodes, sources, {
    offset: 0.76,
    rate: 0.94,
    type: "lowpass",
    freqHz: 140,
    q: 0.8,
  });
  const turbine = createNoiseVoice(ctx, buffer, master, nodes, sources, {
    offset: 0.13,
    rate: 1.21,
    type: "bandpass",
    freqHz: 320,
    q: 3.5,
  });
  const city = createNoiseVoice(ctx, buffer, master, nodes, sources, {
    offset: 0.63,
    rate: 1.07,
    type: "lowpass",
    freqHz: 420,
    q: 0.6,
  });

  const plantLow = createToneVoice(
    ctx,
    master,
    nodes,
    "triangle",
    [1, 1.01, 2],
    "lowpass",
    160,
    42,
  );
  const plantGas = createToneVoice(
    ctx,
    master,
    nodes,
    "sawtooth",
    [1, 1.02, 2.01],
    "lowpass",
    700,
    190,
  );

  const pingOsc = ctx.createOscillator();
  pingOsc.type = "sine";
  pingOsc.frequency.value = PING_HZ;
  const pingGain = ctx.createGain();
  pingGain.gain.value = 0;
  pingOsc.connect(pingGain);
  pingGain.connect(master);
  pingOsc.start();
  nodes.push(pingOsc, pingGain);
  sources.push(pingOsc);

  const graph: AudioGraph = {
    ctx,
    master,
    analyser,
    wind,
    rain,
    snow,
    storm,
    turbine,
    city,
    plantLow,
    plantGas,
    ping: { gain: pingGain, osc: pingOsc },
    nodes,
    sources,
    analyserData: new Float32Array(analyser.fftSize),
    dispose() {
      for (const source of sources) {
        try {
          source.stop();
        } catch {
          // Already stopped; stop() is idempotent enough to ignore.
        }
      }
      for (const node of nodes) node.disconnect();
      void ctx.close().catch(() => {
        // Closing an already-closed context is not an error in this module.
      });
    },
  };
  return graph;
}

/** RMS of the master chain (post-limiter graph is what the player hears). */
export function analyserRms(graph: AudioGraph): number {
  graph.analyser.getFloatTimeDomainData(graph.analyserData);
  let sum = 0;
  for (let i = 0; i < graph.analyserData.length; i++) {
    const sample = graph.analyserData[i] ?? 0;
    sum += sample * sample;
  }
  return Math.sqrt(sum / graph.analyserData.length);
}

/** One short ping: a fast attack and a 0,7 s decay, then silence again. */
export function triggerPing(graph: AudioGraph, now: number): void {
  const gain = graph.ping.gain.gain;
  gain.cancelScheduledValues(now);
  gain.setValueAtTime(0.0001, now);
  gain.linearRampToValueAtTime(PING_PEAK, now + 0.008);
  gain.exponentialRampToValueAtTime(0.0001, now + PING_DECAY_S);
}
