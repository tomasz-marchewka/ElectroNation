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

test("an empty hex opens the catalogue and orders a plant (01 §8 pt 6)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");

  // A free plains hex east of the starting endowment.
  await page.locator("path[data-hex='5,7']").click();
  await expect(page.getByText("KATALOG BUDOWY — CENY Z MNOŻNIKIEM TERENU")).toBeVisible();
  await expect(page.locator(".en-panel")).toContainText("MNOŻNIK — OBIEKTY");
  await expect(page.getByText("NASTAWY")).toBeHidden();

  await page.locator(".en-catalog__buy", { hasText: "OCGT — turbina szczytowa" }).click();

  // The hex is taken now: the catalogue gives way to the site being built.
  await expect(page.locator(".en-panel")).toContainText("BUDOWA W TOKU");
  await expect(page.locator("[data-region='map']").getByText("BUDOWA · 1 DOBA")).toBeVisible();
  expect(errors).toEqual([]);
});

test("a line routed to a city is built and the city connected (01 §3.3–3.4)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");

  // From the starting plant (01 §3.4) to Turów, which starts unconnected.
  await page.locator("path[data-hex='1,9']").click();
  await page.getByRole("button", { name: "POPROWADŹ LINIĘ STĄD" }).click();
  await expect(page.getByText("TRASOWANIE LINII")).toBeVisible();

  await page.locator("path[data-hex='2,5']").click();
  await expect(page.locator(".en-panel")).toContainText("TURÓW");
  await expect(page.locator(".en-map__route")).toBeVisible();
  await page.getByRole("button", { name: /^ZATWIERDŹ — / }).click();
  await expect(page.locator(".en-panel")).toContainText("w budowie");

  // Lines grow 3 h per resolved turn (01 §2.6); one day finishes this one.
  await page.keyboard.press("Escape");
  for (let turn = 0; turn < 8; turn++) {
    await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();
  }

  await page.locator("path[data-hex='2,5']").click();
  const connect = page.getByRole("button", { name: /^PRZYŁĄCZ MIASTO/ });
  await expect(connect).toBeEnabled();
  await connect.click();
  await expect(page.locator(".en-panel")).toContainText("zasilane");
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

test("a resolved turn survives closing the tab", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("EC MODRZYCA").press("End");
  await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();

  const budget = page.locator(".en-kpi", { hasText: "BUDŻET" }).locator("b");
  const shown = await budget.innerText();
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 2/8");

  await page.reload();

  // The autosave carries the whole state: calendar, budget and the standing
  // report of the last resolved turn (01 §2.3).
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 2/8");
  await expect(budget).toHaveText(shown);
  await expect(page.locator(".en-report__label")).toContainText("TURA 1 · NOC");
  await expect(page.locator(".en-turn").nth(1)).toHaveClass(/is-current/);
});

test("the session travels through a save file", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 2/8");

  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "ZAPISZ DO PLIKU" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/^electronation-save-\d{4}-\d{2}-\d{2}\.json$/);
  const savedPath = await download.path();

  // A fresh session on the same origin, then the file put back into it.
  await page.getByRole("button", { name: "NOWA GRA" }).click();
  await page.getByRole("button", { name: "POTWIERDŹ ✓" }).click();
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 1/8");

  await page.locator(".en-sessionbar__file").setInputFiles(savedPath);

  await expect(page.locator(".en-sessionbar__note")).toHaveText("✓ ZAPIS WCZYTANY");
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 2/8");
});

test("a file that is not a save is refused with a diagnosis", async ({ page }) => {
  await page.goto("/");

  await page.locator(".en-sessionbar__file").setInputFiles({
    name: "strona.html",
    mimeType: "text/html",
    buffer: Buffer.from("<html></html>"),
  });

  await expect(page.locator(".en-sessionbar__note")).toHaveText(
    "✕ PLIK NIE JEST ZAPISEM ELECTRONATION",
  );
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 1/8");
});

test("the theme switch repaints the page and survives a reload", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("button", { name: "JASNY" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});
