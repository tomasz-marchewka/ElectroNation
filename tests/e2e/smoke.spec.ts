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

test("setting a setpoint and committing runs one turn of the loop", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");

  await expect(page.locator("[data-region='report']")).toHaveCount(0);

  // The starting endowment is one 400 MW CCGT (01 §3.4); End runs it to full.
  const setpoint = page.getByLabel("EC MODRZYCA");
  await setpoint.press("End");
  await expect(page.locator(".en-setpoint__head")).toContainText("400 / 400 MW");

  await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();

  await expect(page.locator("[data-region='report']")).toBeVisible();
  await expect(page.locator(".en-report__label")).toContainText("TURA 1 · NOC");
  await expect(page.locator(".en-tile")).toHaveCount(7);
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 2/8");
  await expect(page.locator(".en-turn").nth(1)).toHaveClass(/is-current/);
  // The turn's result IS the change of the budget (engine: netPln = money
  // delta). The KPI itself is printed to 0,01 mld, which one turn of a
  // one-city grid need not reach — the component test checks that side.
  const result = page
    .locator(".en-tile", { has: page.locator(".en-tile__label", { hasText: "WYNIK TURY" }) })
    .locator(".en-tile__value");
  await expect(result).not.toHaveText("0 zł");
  await expect(result).toContainText("zł");

  // The skip button waits for turn scrubbing (01 §2.5, M8).
  await expect(page.getByRole("button", { name: "PRZEWIŃ ⏭" })).toBeDisabled();
  expect(errors).toEqual([]);
});

test("both themes render the whole screen without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");
  await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();

  for (const theme of ["JASNY", "CIEMNY"]) {
    await page.getByRole("button", { name: theme }).click();
    await expect(page.locator("[data-region='report']")).toBeVisible();
    await expect(page.locator(".en-panel .en-section")).toHaveCount(3);
    await expect(page.getByText("BILANS PRZY OBECNYCH NASTAWACH")).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test("the theme switch repaints the page and survives a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "JASNY" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
