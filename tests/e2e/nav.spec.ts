import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";

/* Nav: brand → /; Search + Your Mountains links; NO Projects/Peaks; old /projects routes 404. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("header nav: brand home + Search + Your Mountains, no legacy links", async ({ page }, ti) => {
  await page.goto("/your-mountains");

  const nav = page.getByRole("navigation");
  await expect(nav.getByRole("link", { name: /^search$/i })).toBeVisible();
  await expect(nav.getByRole("link", { name: /your mountains/i })).toBeVisible();

  // No legacy Projects / Peaks nav links.
  await expect(nav.getByRole("link", { name: /^projects$/i })).toHaveCount(0);
  await expect(nav.getByRole("link", { name: /^peaks$/i })).toHaveCount(0);

  // Brand returns home.
  await page.getByRole("link", { name: /cascast home/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1, name: /pacific northwest/i })).toBeVisible();

  await page.screenshot({ path: ti.outputPath("nav-home.png"), fullPage: true });
});

test("the Your Mountains nav link navigates", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation").getByRole("link", { name: /your mountains/i }).click();
  await expect(page).toHaveURL(/\/your-mountains$/);
  await expect(page.getByRole("heading", { name: /your mountains/i })).toBeVisible();
});

test("a legacy /projects route does not exist (404)", async ({ page }) => {
  const resp = await page.goto("/projects/sample-rainier");
  // Local: the route is gone ⇒ Next 404. Live: same (mountains-first deploy).
  expect(resp?.status()).toBe(404);
});
