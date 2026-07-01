import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";

/* Search home (/): <3 chars → no suggestions; ≥3 chars → suggestion(s); click → browse. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("search gates at 3 chars and navigates to a mountain on select", async ({ page }, ti) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: /pacific northwest/i })).toBeVisible();

  const box = page.getByRole("combobox", { name: /search mountains/i });
  await expect(box).toBeVisible();

  // <3 chars → no listbox.
  await box.fill("ra");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.screenshot({ path: ti.outputPath("search-gated.png"), fullPage: true });

  // ≥3 chars → suggestions appear.
  await box.fill("rai");
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  const option = list.getByRole("option", { name: /rainier/i }).first();
  await expect(option).toBeVisible();
  await page.screenshot({ path: ti.outputPath("search-suggestions.png"), fullPage: true });

  // Click → lands on the browse page for that mountain.
  await option.click();
  await expect(page).toHaveURL(/\/mountains\/mt-rainier$/);
  // Always-targeted browse view: the DateSelector headline replaces the old "current conditions".
  await expect(page.getByText(/Planning for/i).first()).toBeVisible();
});
