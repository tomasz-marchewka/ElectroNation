import { expect, test } from "@playwright/test";

test("game shell boots without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(String(error)));

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "ElectroNation" })).toBeVisible();
  expect(errors).toEqual([]);
});
