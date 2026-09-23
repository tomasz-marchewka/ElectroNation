#!/usr/bin/env node
// Headless capture harness (ARCHITECTURE.md §15): loads the app with a pinned
// seed, day, turn, regime, camera preset and animation clock, waits for the
// scene-ready signal and writes a PNG plus a JSON log — console and page
// errors, fps over a fixed frame window, renderer.info and the budget verdict.
// Same inputs → byte-comparable PNG on the same machine.
//
//   node scripts/capture.mjs --scenario midgame --day 1 --turn 6 --regime frostHigh \
//        --camera strategic --clock 0 --out captures/evening-frost
//   node scripts/capture.mjs --showcase terrain --all --out captures/terrain
//   node scripts/capture.mjs --headed ...      # real GPU: the perf gate
//
// Options: --url (default http://localhost:5173), --seed, --scenario, --day,
// --turn, --regime, --camera, --focus col,row, --yaw deg, --pitch deg,
// --clock ms, --quality, --theme light|dark, --select col,row, --report 0|1,
// --motion, --clouds full|clear|none, --showcase <module>, --all (every frame
// of the showcase), --modules a,b,c (load only these modules — a layer's cost
// is the difference between a capture with and without it), --hud 0|1,
// --repeat N (median of N GPU samples — the dev machine's timer swings ~1 ms),
// --width, --height, --dpr, --fps-frames, --headed, --strict (exit 1 on errors
// or a failed budget), --out <path without extension>.

import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium } from "@playwright/test";

const WEBGL_ARGS = [
  "--ignore-gpu-blocklist",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

function parseArgs(argv) {
  const options = {
    url: "http://localhost:5173",
    seed: null,
    scenario: null,
    day: null,
    turn: null,
    regime: null,
    camera: null,
    focus: null,
    yaw: null,
    pitch: null,
    clock: "0",
    quality: null,
    theme: null,
    select: null,
    report: null,
    motion: null,
    clouds: null,
    showcase: null,
    modules: null,
    all: false,
    hud: null,
    width: 1600,
    height: 900,
    dpr: 1,
    fpsFrames: 120,
    repeat: 1,
    headed: false,
    strict: false,
    out: "captures/capture",
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (key === "all" || key === "headed" || key === "strict") {
      options[key] = true;
      continue;
    }
    const value = argv[i + 1];
    i += 1;
    if (key in options) options[key] = value;
    else console.warn(`capture: unknown option --${arg.slice(2)}`);
  }
  options.width = Number(options.width);
  options.height = Number(options.height);
  options.dpr = Number(options.dpr);
  options.fpsFrames = Number(options.fpsFrames);
  options.repeat = Math.max(1, Number(options.repeat) || 1);
  return options;
}

function frameUrl(options, frame) {
  const query = new URLSearchParams();
  query.set("capture", "1");
  if (options.seed !== null) query.set("seed", String(options.seed));
  if (options.scenario !== null) query.set("scenario", options.scenario);
  if (options.showcase !== null) query.set("showcase", options.showcase);
  if (options.modules !== null) query.set("modules", options.modules);
  const day = frame?.day ?? options.day;
  if (day !== null && day !== undefined) query.set("day", String(day));
  const turn = frame ? frame.turn : options.turn;
  if (turn !== null && turn !== undefined) query.set("turn", String(turn));
  const regime = frame ? frame.regime : options.regime;
  if (regime) query.set("regime", regime);
  const camera = frame ? frame.camera : options.camera;
  if (camera) query.set("camera", camera);
  const focus = frame?.focus ? `${frame.focus.col},${frame.focus.row}` : options.focus;
  if (focus) query.set("focus", focus);
  if (options.yaw !== null) query.set("yaw", String(options.yaw));
  if (options.pitch !== null) query.set("pitch", String(options.pitch));
  if (options.clock !== null) query.set("clock", String(options.clock));
  if (options.quality) query.set("quality", options.quality);
  if (options.theme) query.set("theme", options.theme);
  if (options.select) query.set("select", options.select);
  if (options.report !== null && options.report !== undefined)
    query.set("report", String(options.report));
  if (options.motion) query.set("motion", options.motion);
  if (options.clouds) query.set("clouds", options.clouds);
  // A module showcase is judged on its own pixels: bare world unless the
  // caller asks for the HUD (`--hud 1`, e.g. the whole-game showcase frames).
  const hud = options.hud ?? (options.showcase ? "0" : null);
  if (hud !== null) query.set("hud", String(hud));
  return `${options.url}/?${query.toString()}`;
}

async function captureOne(browser, options, url, outBase) {
  const context = await browser.newContext({
    viewport: { width: options.width, height: options.height },
    deviceScaleFactor: options.dpr,
    reducedMotion: "no-preference",
  });
  const page = await context.newPage();
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  const startedAt = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  const loadMs = Date.now() - startedAt;
  // `window.__en` appears only once the renderer boots (seconds after DOM),
  // so wait for it first; if it never shows up, a foreign server is answering
  // (seen 2026-09-19 with another app) and the run is aborted instead of
  // logging whatever that app happens to render.
  try {
    await page.waitForFunction(() => typeof window.__en !== "undefined", null, {
      timeout: 30_000,
    });
  } catch {
    throw new Error(
      `capture: ${url} does not expose window.__en — a foreign server is answering; check --url`,
    );
  }
  await page.waitForFunction(() => window.__en?.ready === true, null, { timeout: 90_000 });
  const readyMs = Date.now() - startedAt;

  // Let the frame settle (pinned clock: identical frames; free clock: warm-up).
  await page.waitForTimeout(250);
  const fps = await page.evaluate((frames) => window.__en.fps(frames), options.fpsFrames);
  const info = await page.evaluate(() => window.__en.info());
  // GPU timer samples swing by ~1 ms on a loaded machine; the median of a few
  // samples is the comparable number (`--repeat`, default 1).
  const gpuSamples = [info.gpuMs];
  for (let i = 1; i < options.repeat; i++) {
    await page.waitForTimeout(200);
    const again = await page.evaluate(() => window.__en.info());
    gpuSamples.push(again.gpuMs);
  }
  const measured = gpuSamples.filter((value) => value !== null);
  const gpuMedian =
    measured.length > 0
      ? [...measured].sort((a, b) => a - b)[Math.floor(measured.length / 2)]
      : null;
  const scene = await page.evaluate(() => {
    const s = window.__en.scene();
    return s
      ? {
          time: s.time,
          regime: s.weather.regime,
          sun: { altitudeDeg: s.sun.altitudeDeg, azimuthDeg: s.sun.azimuthDeg },
          overlay: { showcase: s.overlay.showcase, weatherOverride: s.overlay.weatherOverride },
          counts: {
            lines: s.lines.length,
            plants: s.plants.length,
            farms: s.farms.length,
            cities: s.cities.length,
            labels: s.labels.length,
          },
        }
      : null;
  });

  await mkdir(dirname(outBase), { recursive: true });
  await page.screenshot({ path: `${outBase}.png`, animations: "disabled" });
  // First interactive is a budget line too (ARCHITECTURE §13: under 4 s cold);
  // on software GL it is only a warning — shader compilation alone takes seconds there.
  const FIRST_INTERACTIVE_MS = 4000;
  const budget = { ...info.budget, failures: [...info.budget.failures], warnings: [] };
  // The GPU line is re-judged on the median when --repeat collected samples.
  const GPU_BUDGET_MS = 16.7 / 2.5;
  if (options.repeat > 1 && gpuMedian !== null && !info.software) {
    budget.failures = budget.failures.filter((failure) => !failure.startsWith("gpu "));
    if (gpuMedian > GPU_BUDGET_MS) {
      budget.failures.push(
        `gpu ${gpuMedian.toFixed(2)} ms/frame > ${GPU_BUDGET_MS.toFixed(1)} ms (median of ${options.repeat})`,
      );
    }
    budget.ok = budget.failures.length === 0;
  }
  if (readyMs > FIRST_INTERACTIVE_MS) {
    const note = `first interactive ${readyMs} ms > ${FIRST_INTERACTIVE_MS} ms`;
    if (info.software) budget.warnings.push(`${note} (software GL)`);
    else {
      budget.failures.push(note);
      budget.ok = false;
    }
  }
  const log = {
    url,
    capturedAt: new Date().toISOString(),
    viewport: { width: options.width, height: options.height, dpr: options.dpr },
    headed: options.headed,
    timing: { loadMs, readyMs, firstInteractiveBudgetMs: FIRST_INTERACTIVE_MS },
    consoleErrors,
    pageErrors,
    fps: {
      average: fps,
      frames: options.fpsFrames,
      worstFrameMs: info.worstFrameMs,
      software: info.software,
      cpuMs: info.cpuMs,
      gpuMs: gpuMedian ?? info.gpuMs,
      gpuMsSamples: gpuSamples,
      gpuWorstMs: info.gpuWorstMs,
      projectedMidRangeFps: info.projectedMidRangeFps,
    },
    glRenderer: info.glRenderer,
    tier: info.tier,
    stats: info.stats,
    budget,
    modules: info.modules,
    diagnostics: info.diagnostics,
    scene,
  };
  await writeFile(`${outBase}.json`, JSON.stringify(log, null, 2) + "\n");
  await context.close();
  return log;
}

/** The page title index.html declares — how our server is told from a stranger's. */
const APP_MARKER = "<title>ElectroNation</title>";

/** Ports tried, in order, when the requested one is held by another app. */
const FALLBACK_PORTS = ["5174", "5183", "5193"];

/**
 * What answers at the URL: "ours" (the ElectroNation dev server), "foreign"
 * (another project's server on the same port — its page never signals
 * scene-ready, so a capture would hang for the whole timeout) or "none".
 */
async function serverAt(url) {
  try {
    const response = await fetch(url);
    const html = await response.text();
    return html.includes(APP_MARKER) ? "ours" : "foreign";
  } catch {
    return "none";
  }
}

function withPort(url, port) {
  const parsed = new URL(url);
  parsed.port = port;
  return parsed.toString().replace(/\/$/, "");
}

async function startServer(url) {
  const port = new URL(url).port || "5173";
  console.log(`capture: no server at ${url} — starting vite on port ${port}`);
  const child = spawn("npm", ["run", "dev", "--", "--port", port, "--strictPort"], {
    cwd: process.cwd(),
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    if ((await serverAt(url)) === "ours") return true;
  }
  return false;
}

/**
 * The world must stay loadable at all times (builders and critics screenshot
 * it): when nothing answers at the URL, start a Vite dev server of our own on
 * that port, detached, and wait for it. A second capture racing for the same
 * port loses the bind (--strictPort) and simply finds the winner's server.
 * When ANOTHER project holds the port, never touch it: find or start ours on
 * a fallback port and capture there. Returns the URL to capture from.
 */
async function ensureServer(url) {
  const found = await serverAt(url);
  if (found === "ours") return url;
  if (found === "none") {
    if (await startServer(url)) return url;
    throw new Error(`capture: the dev server did not come up at ${url}`);
  }
  console.log(`capture: ${url} is held by another application — trying fallback ports`);
  for (const port of FALLBACK_PORTS) {
    const candidate = withPort(url, port);
    const state = await serverAt(candidate);
    if (state === "ours") {
      console.log(`capture: using the ElectroNation server at ${candidate}`);
      return candidate;
    }
    if (state === "none" && (await startServer(candidate))) return candidate;
  }
  throw new Error(
    `capture: ${url} belongs to another application and no fallback port (${FALLBACK_PORTS.join(", ")}) is free — pass --url`,
  );
}

/** A frame can crash a fresh page under load (SwiftShader); one retry. */
async function captureWithRetry(browser, options, url, outBase) {
  let lastError = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      return await captureOne(browser, options, url, outBase);
    } catch (error) {
      lastError = error;
      console.warn(`capture: ${outBase} attempt ${attempt} failed: ${String(error).slice(0, 160)}`);
    }
  }
  throw lastError;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  options.url = await ensureServer(options.url);
  const browser = await chromium.launch({
    headless: !options.headed,
    args: options.headed ? ["--ignore-gpu-blocklist"] : WEBGL_ARGS,
  });
  const logs = [];
  try {
    if (options.showcase && options.all) {
      // Ask the app for the showcase's frames, then walk them.
      const probe = await browser.newPage();
      await probe.goto(frameUrl(options, null), { waitUntil: "domcontentloaded" });
      await probe.waitForFunction(() => window.__en?.ready === true, null, { timeout: 90_000 });
      const frames = await probe.evaluate(() => window.__en.showcaseFrames?.() ?? []);
      await probe.close();
      if (frames.length === 0) throw new Error(`showcase ${options.showcase} has no frames`);
      for (const frame of frames) {
        const url = frameUrl(options, frame);
        const log = await captureWithRetry(browser, options, url, `${options.out}-${frame.name}`);
        logs.push(log);
        report(log, `${options.out}-${frame.name}`);
      }
    } else {
      const url = frameUrl(options, null);
      const log = await captureWithRetry(browser, options, url, options.out);
      logs.push(log);
      report(log, options.out);
    }
  } finally {
    await browser.close();
  }
  const failed = logs.some(
    (log) => log.consoleErrors.length > 0 || log.pageErrors.length > 0 || !log.budget.ok,
  );
  if (options.strict && failed) process.exit(1);
}

function report(log, outBase) {
  const fps = log.fps.average.toFixed(1);
  const gpu =
    log.fps.gpuMs === null
      ? "gpu n/a"
      : `gpu ${log.fps.gpuMs.toFixed(2)} ms (≈${Math.round(log.fps.projectedMidRangeFps)} fps mid-range)`;
  const software = log.fps.software ? " (software GL — fps not a gate)" : ` · ${gpu}`;
  const errors = log.consoleErrors.length + log.pageErrors.length;
  console.log(
    `${outBase}.png  ready ${log.timing.readyMs} ms · ${fps} fps${software} · ${log.stats.drawCalls} calls · ${log.stats.triangles} tris · ${(log.stats.gpuBytesEstimate / 1048576).toFixed(0)} MB est · errors ${errors} · budget ${log.budget.ok ? "ok" : "FAIL: " + log.budget.failures.join("; ")}`,
  );
  if (log.budget.warnings.length > 0) console.log(`  warnings: ${log.budget.warnings.join("; ")}`);
  if (log.diagnostics.length > 0) console.log(`  diagnostics: ${log.diagnostics.join(" | ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
