import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";

/* Model Lab (/mountains/[slug]/models): multi-model charts + hourly grid; without ?target
   shows the "pin a date" evolution prompt; with ?target the evolution chart renders. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("model lab renders charts, model chips, and the hourly grid", async ({ page }, ti) => {
  await page.goto("/mountains/mt-rainier/models");

  await expect(page.getByText(/model lab — mount rainier/i)).toBeVisible();
  await expect(page.getByText(/raw multi-model comparison/i)).toBeVisible();

  // Three model chips toggle.
  const gfsChip = page.getByRole("button", { name: /GFS/ }).first();
  await expect(gfsChip).toHaveAttribute("aria-pressed", "true");
  await gfsChip.click();
  await expect(gfsChip).toHaveAttribute("aria-pressed", "false");
  await gfsChip.click();

  // Multi-model SVG charts present.
  expect(await page.locator("svg").count()).toBeGreaterThan(3);

  // Hourly grid table.
  await expect(page.getByText(/hourly grid/i)).toBeVisible();
  await expect(page.getByRole("table")).toBeVisible();

  await page.screenshot({ path: ti.outputPath("model-lab.png"), fullPage: true });
});

test("without a target, the evolution prompt is shown", async ({ page }) => {
  await page.goto("/mountains/mt-rainier/models");
  await expect(page.getByTestId("evolution-prompt")).toBeVisible();
  await expect(page.getByText(/no target pinned/i)).toBeVisible();
});

test("with a target, the evolution chart renders", async ({ page }, ti) => {
  await page.goto(`/mountains/mt-rainier/models?target=${TARGET_IN_RANGE}`);
  await expect(page.getByTestId("evolution-prompt")).toHaveCount(0);
  await expect(page.getByText(new RegExp(`target ${TARGET_IN_RANGE} highlighted`, "i"))).toBeVisible();
  // The evolution section is present (chart or its data-tolerant empty state).
  await expect(page.getByText(/forecast evolution/i).first()).toBeVisible();
  await page.screenshot({ path: ti.outputPath("model-lab-evolution.png"), fullPage: true });
});
