import { defineConfig, devices } from "@playwright/test";

// Two dev servers, two projects (ARCHITECTURE.md §16): the 3D world on 5273
// runs its own spec; the flat SVG screen on 5274 — the build forced to the
// SVG renderer — keeps running the original smoke spec untouched.
const WORLD_URL = "http://localhost:5273";
const SVG_URL = "http://localhost:5274";

/** Headless Chromium has no GPU: WebGL2 runs on SwiftShader with these flags. */
const WEBGL_ARGS = [
  "--ignore-gpu-blocklist",
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  use: {
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      testMatch: /world\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: WORLD_URL,
        launchOptions: { args: WEBGL_ARGS },
      },
    },
    {
      name: "chromium-svg",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: SVG_URL },
    },
  ],
  webServer: [
    {
      command: "npm run dev -- --port 5273 --strictPort",
      url: WORLD_URL,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev:svg -- --port 5274 --strictPort",
      url: SVG_URL,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
