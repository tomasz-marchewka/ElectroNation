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
// --turn, --regime, --camera, --focus col,row, --clock ms, --quality,
// --motion, --showcase <module>, --all (every frame of the showcase),
// --modules a,b,c (load only these modules — a layer's cost is the difference
// between a capture with and without it), --hud 0|1,
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
    clock: "0",
    quality: null,
    motion: null,
    showcase: null,
    modules: null,
    all: false,
    hud: null,
    width: 1600,
    height: 900,
    dpr: 1,
    fpsFrames: 120,
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
  return options;
}

function frameUrl(options, frame) {
  const query = new URLSearchParams();
  query.set("capture", "1");
  if (options.seed !== null) query.set("seed", String(options.seed));
  if (options.scenario !== null) query.set("scenario", options.scenario);
  if (options.showcase !== null) query.set("showcase", options.showcase);
  if (options.modules !== null) query.set("modules", options.modules);
  if (options.day !== null) query.set("day", String(options.day));
  const turn = frame ? frame.turn : options.turn;
  if (turn !== null && turn !== undefined) query.set("turn", String(turn));
  const regime = frame ? frame.regime : options.regime;
  if (regime) query.set("regime", regime);
  const camera = frame ? frame.camera : options.camera;
  if (camera) query.set("camera", camera);
  const focus = frame?.focus ? `${frame.focus.col},${frame.focus.row}` : options.focus;
  if (focus) query.set("focus", focus);
  if (options.clock !== null) query.set("clock", String(options.clock));
  if (options.quality) query.set("quality", options.quality);
  if (options.motion) query.set("motion", options.motion);
  if (options.hud !== null) query.set("hud", String(options.hud));
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
  await page.waitForFunction(() => window.__en?.ready === true, null, { timeout: 90_000 });
  const readyMs = Date.now() - startedAt;

  // Let the frame settle (pinned clock: identical frames; free clock: warm-up).
  await page.waitForTimeout(250);
  const fps = await page.evaluate((frames) => window.__en.fps(frames), options.fpsFrames);
  const info = await page.evaluate(() => window.__en.info());
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
      gpuMs: info.gpuMs,
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
        const log = await captureOne(browser, options, url, `${options.out}-${frame.name}`);
        logs.push(log);
        report(log, `${options.out}-${frame.name}`);
      }
    } else {
      const url = frameUrl(options, null);
      const log = await captureOne(browser, options, url, options.out);
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
