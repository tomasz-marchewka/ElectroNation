import { expect, test } from "@playwright/test";

test("dispatcher screen boots without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");

  await expect(page.getByText("⬡ ELECTRONATION")).toBeVisible();
  await expect(page.locator(".en-turnbar .en-turn")).toHaveCount(8);
  await expect(page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" })).toBeVisible();
  // The whole 24×16 board of 02 §8.6 is on screen, scale and legends with it.
  await expect(page.locator("[data-region='map'] svg")).toBeVisible();
  await expect(page.locator("path[data-hex]")).toHaveCount(24 * 16);
  await expect(page.getByText("1 HEKS = 25 KM")).toBeVisible();
  expect(errors).toEqual([]);
});

test("clicking a hex selects it on the map", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator(".en-map__selection")).toHaveCount(0);
  await page.locator("path[data-hex='4,7']").click();

  await expect(page.locator("path[data-hex='4,7']")).toHaveAttribute("data-selected", "true");
  await expect(page.locator(".en-map__selection")).toHaveCount(1);
});

test("committing a turn reveals the report strip", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("[data-region='report']")).toHaveCount(0);
  await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();
  await expect(page.locator("[data-region='report']")).toBeVisible();
});

test("the theme switch repaints the page and survives a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "JASNY" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
