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
  // The time ribbon is a standing part of the view (01 §8 pt 2), with its key.
  await expect(page.locator("[data-region='chart'] svg")).toBeVisible();
  await expect(page.getByText("OŚ CZASU · POPYT vs POKRYCIE [MW]")).toBeVisible();
  await expect(page.locator(".en-chartlegend .en-swatch")).toHaveCount(7);
  await expect(page.locator(".en-timeline__day")).toHaveText(["ROK 1 · STYCZEŃ · DOBA ROBOCZA A"]);
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

test("scrubbing to the evening peak plays every turn on the way", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");

  await page.getByLabel("EC MODRZYCA").press("End");
  // A click only READS the turn (01 §2.5): its forecast card comes up, the
  // calendar stays put, and moving time takes the explicit action next to it.
  await page.locator(".en-turn", { hasText: "SZCZYT WIECZ." }).click();
  await expect(page.locator(".en-report__label")).toContainText("PROGNOZA TURY");
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 1/8");
  // The ribbon aims the panel's own scrub button at the turn it named.
  await page.getByRole("button", { name: "PRZEWIŃ DO T7 ⏭" }).click();

  // Six turns resolved on the way; the seventh is the one now pending.
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 7/8");
  await expect(page.locator(".en-turn").nth(6)).toHaveClass(/is-current/);
  await expect(page.locator(".en-report__label")).toContainText("TURA 6 · POPOŁ.");
  // The chart draws what was played: coverage layers plus the forecast band.
  await expect(page.locator("[data-region='chart'] .en-chart__area").first()).toBeVisible();
  await expect(page.locator("[data-region='chart'] polygon").first()).toBeVisible();
  await expect(page.locator(".en-topbar")).toContainText("WYNIK DOBY");
  expect(errors).toEqual([]);
});

test("reading a turn back on the ribbon leaves the world where it is (01 §2.5)", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");
  await page.getByRole("button", { name: "NOWA GRA" }).click();
  await page.getByRole("button", { name: "POTWIERDŹ ✓" }).click();

  // A full day plus two turns, so the archive spans a day boundary.
  await page.getByLabel("EC MODRZYCA").press("End");
  for (let turn = 0; turn < 10; turn++) {
    await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();
  }
  await expect(page.locator(".en-topbar__ctx")).toContainText("DOBA ROBOCZA B");
  await expect(page.locator(".en-report__label")).toContainText("TURA 2 · PRZEDŚWIT");

  // Back over the day boundary: two days are captioned at once.
  await page.getByTitle("Wcześniejsze tury").click();
  await page.getByTitle("Wcześniejsze tury").click();
  await page.getByTitle("Wcześniejsze tury").click();
  await expect(page.locator(".en-timeline__day")).toHaveCount(2);

  // A turn of the first day, read back: the strip follows, the calendar does
  // not, and the map keeps painting the turn that actually stands.
  await page.locator(".en-turn", { hasText: "SZCZYT WIECZ." }).click();
  await expect(page.locator(".en-report__label")).toContainText("RAPORT TURY");
  await expect(page.locator(".en-report__label")).toContainText("TURA 7 · SZCZYT WIECZ.");
  await expect(page.locator(".en-report__label")).toContainText("DOBA ROBOCZA A");
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 3/8");

  await page.getByTitle("Wróć do tury bieżącej").click();
  await expect(page.locator(".en-report__label")).toContainText("TURA 2 · PRZEDŚWIT");
  expect(errors).toEqual([]);
});

test("skipping stops on the first event and says what it was", async ({ page }) => {
  await page.goto("/");

  // Nothing is dispatched, so the very first turn leaves the city dark and the
  // scrub stops there instead of running the day out (01 §2.5).
  await page.getByRole("button", { name: "PRZEWIŃ ⏭" }).click();

  await expect(page.locator(".en-panel__stop")).toContainText("⏭ zatrzymano: TURA 1 — niedobór");
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 2/8");
  await expect(page.locator(".en-report__label")).toContainText("TURA 1 · NOC");
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

/**
 * The whole loop in one session, in the order a player lives it (plan M10 §3):
 * new game → setpoints → resolve → build → route a line → scrub the day out →
 * reload on the autosave → keep playing. The tests above check each step on its
 * own; this one checks that they still hold when the state carries between them.
 */
test("pełna pętla: nowa gra, budowa, linia, koniec doby, wznowienie po przeładowaniu", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");

  // A known starting point: whatever the autosave slot held is overwritten.
  await page.getByRole("button", { name: "NOWA GRA" }).click();
  await page.getByRole("button", { name: "POTWIERDŹ ✓" }).click();
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 1/8");
  await expect(page.locator(".en-topbar__ctx")).toContainText("DOBA ROBOCZA A");

  // Setpoints, then the turn (01 §2.3).
  await page.getByLabel("EC MODRZYCA").press("End");
  await expect(page.locator(".en-setpoint__head")).toContainText("400 / 400 MW");
  await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();
  await expect(page.locator(".en-report__label")).toContainText("TURA 1 · NOC");
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 2/8");

  // A PV farm ordered from the hex panel, on the plains east of Modrzyca.
  await page.locator("path[data-hex='5,7']").click();
  await page.locator(".en-catalog__buy", { hasText: "Farma PV" }).click();
  await expect(page.locator(".en-panel")).toContainText("BUDOWA W TOKU");

  // A line routed from the starting plant to Turów (01 §3.3).
  await page.locator("path[data-hex='1,9']").click();
  await page.getByRole("button", { name: "POPROWADŹ LINIĘ STĄD" }).click();
  await page.locator("path[data-hex='2,5']").click();
  await expect(page.locator(".en-map__route")).toBeVisible();
  await page.getByRole("button", { name: /^ZATWIERDŹ — / }).click();
  await expect(page.locator(".en-panel")).toContainText("w budowie");
  await page.keyboard.press("Escape");

  // Scrub to the last turn of the day, then commit it — the day rolls over
  // and the PV farm ordered above joins the map (01 §2.5, §2.6).
  await page.locator(".en-turn", { hasText: "PÓŹNY WIECZ." }).click();
  await page.getByRole("button", { name: "PRZEWIŃ DO T8 ⏭" }).click();
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 8/8");
  await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 1/8");
  await expect(page.locator(".en-topbar__ctx")).toContainText("DOBA ROBOCZA B");

  const budget = page.locator(".en-kpi", { hasText: "BUDŻET" }).locator("b");
  const carried = await budget.innerText();

  // The autosave written on that turn carries the whole session across a reload.
  await page.reload();
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 1/8");
  await expect(page.locator(".en-topbar__ctx")).toContainText("DOBA ROBOCZA B");
  await expect(budget).toHaveText(carried);
  await expect(page.locator(".en-report__label")).toContainText("TURA 8 · PÓŹNY WIECZ.");
  await page.locator("path[data-hex='5,7']").click();
  await expect(page.locator(".en-panel")).toContainText("Farma PV");
  await expect(page.locator(".en-panel")).toContainText("praca normalna");

  // And the session simply goes on from there.
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "ZATWIERDŹ TURĘ ▸" }).click();
  await expect(page.locator(".en-report__label")).toContainText("TURA 1 · NOC");
  await expect(page.locator(".en-panel__meta")).toContainText("TURA 2/8");
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
