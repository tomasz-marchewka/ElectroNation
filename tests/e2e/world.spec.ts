import { expect, test, type Page } from "@playwright/test";
// The `window.__en` surface is declared by src/world/capture/api.ts (ARCHITECTURE.md §15).
import type {} from "../../src/world/capture/api";

// The 3D world (docs/08): boots without errors, every module reports ready,
// the game loop runs on top of it and the SVG fallback stays reachable.
// Driven through window.__en (ARCHITECTURE.md §15), never through DOM guesses.

async function waitForWorld(page: Page): Promise<void> {
  await expect(page.locator(".en-world[data-scene-ready='true']")).toBeVisible({ timeout: 45_000 });
  await page.waitForFunction(() => window.__en?.ready === true);
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  return errors;
}

test("the world boots with every module ready and no console errors", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?capture=1&seed=1&clock=0");
  await waitForWorld(page);

  await expect(page.getByText("⬡ ELECTRONATION")).toBeVisible();
  await expect(page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" })).toBeVisible();
  await expect(page.locator("[data-region='weather']")).toBeVisible();
  const info = await page.evaluate(() => window.__en!.info());
  expect(info.diagnostics).toEqual([]);
  expect(info.modules.every((module) => module.state === "ready")).toBe(true);
  expect(errors).toEqual([]);
});

test("a click on the world selects the hex under the cursor (01 §8 pt 6)", async ({ page }) => {
  await page.goto("/?capture=1&seed=1&clock=0");
  await waitForWorld(page);

  // A free plains hex east of the starting endowment, as in the SVG smoke.
  const canvas = page.locator(".en-world__canvas");
  const box = await canvas.boundingBox();
  const point = await page.evaluate(() => window.__en!.project(5, 7));
  expect(point.visible).toBe(true);
  await page.mouse.click(box!.x + point.x, box!.y + point.y);

  await expect(page.getByText("KATALOG BUDOWY — CENY Z MNOŻNIKIEM TERENU")).toBeVisible();
  await expect(page.locator(".en-panel__meta")).toContainText("HEKS q5 r7");
});

test("committing a turn resolves it in the world too", async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto("/?capture=1&seed=1&clock=0");
  await waitForWorld(page);

  expect((await page.evaluate(() => window.__en!.scene()))?.time.resolved).toBe(false);
  await page.getByLabel("EC MODRZYCA · BLOK 1").press("End");
  await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();

  await expect(page.locator("[data-region='report']")).toBeVisible();
  const scene = await page.evaluate(() => window.__en!.scene());
  expect(scene?.time.resolved).toBe(true);
  expect(scene?.time.turnIndex).toBe(0);
  expect(errors).toEqual([]);
});

test("the curated mid-game state loads with a dark city and a loaded line", async ({ page }) => {
  await page.goto("/?capture=1&scenario=midgame&day=1&turn=6&clock=0&camera=strategic");
  await waitForWorld(page);
  const scene = await page.evaluate(() => window.__en!.scene());
  expect(scene?.time.resolved).toBe(true);
  expect(scene?.cities.some((city) => city.lit === 0)).toBe(true);
  // Every overloaded line is named, not just the worst one (bridge hotspot
  // list), so the label count equals the number of lines at their limit.
  const overloaded =
    scene?.lines.filter((line) => line.segments.some((segment) => segment.load === "over"))
      .length ?? 0;
  expect(overloaded).toBeGreaterThan(0);
  await expect(page.locator(".en-wlabel.is-overload")).toHaveCount(overloaded);
});

test("the SVG renderer stays reachable by URL", async ({ page }) => {
  await page.goto("/?renderer=svg");
  await expect(page.locator("path[data-hex]")).toHaveCount(24 * 16);
  await expect(page.locator(".en-world")).toHaveCount(0);
});
