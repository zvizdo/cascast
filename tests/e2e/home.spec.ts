import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("home shows the pitch, feature strip, and browse-by-region", async ({ page }, ti) => {
  await page.goto("/");

  // hero pitch
  await expect(page.getByText(/free alpine weather/i)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: /pacific northwest/i })).toBeVisible();
  // feature strip → sources
  await expect(page.getByRole("link", { name: /free, public sources/i })).toHaveAttribute("href", "/sources");
  // region groupings
  await expect(page.getByRole("heading", { name: "Washington" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Oregon" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Beyond the Northwest" })).toBeVisible();

  await page.screenshot({ path: `qa-screenshots/home-${ti.project.name}.png`, fullPage: true });
});

test("clicking a browse card opens the peak's focused view", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /Mount Rainier/i }).first().click();
  await expect(page).toHaveURL(/\/mountains\/mt-rainier/);
});

test("search still routes to a peak", async ({ page }) => {
  await page.goto("/");
  const input = page.getByRole("combobox", { name: /search mountains/i });
  await input.fill("shuk");
  await page.getByRole("option", { name: /Mount Shuksan/i }).click();
  await expect(page).toHaveURL(/\/mountains\/mt-shuksan/);
});
