import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";

/* Pin flow (mountains-first): the /pin form is gone — Pin is a header button that bookmarks the
   mountain at the current (default = tomorrow) target. Asserts localStorage['mw.pins'] carries it. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

/** Tomorrow in the client's local timezone, the way target-date.ts computes the default. */
function tomorrowLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

test("pin a mountain from the header bookmarks it at the default target", async ({ page }, ti) => {
  await page.goto("/mountains/mt-rainier");

  // Pin CTA in the sticky sub-header (a button now, not a /pin link).
  await page.getByRole("button", { name: /pin/i }).first().click();

  // The pin persisted to localStorage at the default (tomorrow) target.
  const pins = await page.evaluate(() => JSON.parse(localStorage.getItem("cascast.pins") ?? "[]"));
  expect(pins).toHaveLength(1);
  expect(pins[0].mountainId).toBe("mt-rainier");
  expect(pins[0].targetDate).toBe(tomorrowLocal());

  // The header reflects the pinned state.
  await expect(page.getByText(/pinned/i).first()).toBeVisible();

  await page.screenshot({ path: ti.outputPath("pinned.png"), fullPage: true });
});
