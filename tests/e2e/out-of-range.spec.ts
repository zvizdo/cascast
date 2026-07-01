import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_OUT_OF_RANGE } from "./_fixtures";

/* Out-of-range target (~30 days out, beyond the forecast window): the daily outlook still
   renders, but the in-range-only panels (freezing cross-section, evolution chart) are absent. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("an out-of-range target renders the outlook but no in-range-only panels", async ({
  page,
}, ti) => {
  await page.goto(`/mountains/mt-rainier?target=${TARGET_OUT_OF_RANGE}`);

  // The DateSelector headline flags the target as outside the forecast window.
  await expect(page.getByText(/beyond forecast/i).first()).toBeVisible();

  // The convergence "call" chart must NOT render for an out-of-range target.
  await expect(page.getByText(/is your day'?s forecast settling/i)).toHaveCount(0);
  // The freezing cross-section (in-range only) is also absent.
  await expect(page.getByRole("heading", { name: /freezing level cross-section/i })).toHaveCount(0);

  await page.screenshot({ path: ti.outputPath("out-of-range.png"), fullPage: true });
});
