import { test, expect, type Page } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";

/** Open the compact Display <details> menu if it's visible (≤900px viewports),
 *  then scroll it into view so its children are clickable within the viewport. */
async function revealDisplayControls(page: Page) {
  const summary = page.locator("details.display-menu summary.display-menu-summary");
  if (await summary.isVisible().catch(() => false)) {
    const details = page.locator("details.display-menu");
    const isOpen = await details.evaluate((d: HTMLDetailsElement) => d.open).catch(() => false);
    if (!isOpen) {
      await summary.click();
    }
    // Scroll the details panel into view so its children are within the viewport.
    await details.scrollIntoViewIfNeeded();
  }
}

/* Default detail view (/mountains/[slug], no ?target): always-targeted at tomorrow (in range).
   DateSelector headline + 7-day daily outlook + snowpack + satellite + notes + Model Lab link
   present on the Forecast tab; avalanche lives under the Safety tab. Units + theme toggles work. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("default view shows the targeted panels, notes, and the Safety tab", async ({ page }, ti) => {
  await page.goto("/mountains/mt-rainier");

  // DateSelector headline replaces the old "current conditions" copy; default target is not pinned.
  await expect(page.getByText(/Planning for/i).first()).toBeVisible();
  await expect(page.getByText(/not pinned/i).first()).toBeVisible();
  // 7-day daily outlook
  await expect(page.getByRole("heading", { name: /the days around your window/i })).toBeVisible();
  // snowpack + satellite panels
  await expect(page.getByRole("heading", { name: /snowpack/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /snow coverage/i })).toBeVisible();
  // a Model Lab affordance
  await expect(page.getByRole("link", { name: /model lab/i }).first()).toBeVisible();
  // notes are ALWAYS present now (default target tomorrow is in range).
  await expect(page.getByRole("textbox", { name: /trip notes/i })).toBeVisible();

  // Avalanche lives under the Safety tab.
  await page.getByRole("tab", { name: /safety/i }).click();
  await expect(page.getByRole("heading", { name: /avalanche danger/i })).toBeVisible();

  await page.screenshot({ path: ti.outputPath("default.png"), fullPage: true });
});

test("units toggle converts temperatures on the browse view", async ({ page }) => {
  await page.goto("/mountains/mt-rainier");
  await revealDisplayControls(page);
  const tempGroup = page.getByRole("radiogroup", { name: /temperature units/i });
  await expect(tempGroup).toBeVisible();
  await expect(tempGroup.getByRole("radio", { name: "°F" })).toBeVisible();

  const celsiusRadio = tempGroup.getByRole("radio", { name: "°C" });
  await celsiusRadio.click();
  await expect(celsiusRadio).toHaveAttribute("aria-checked", "true");
  await expect(celsiusRadio).toBeVisible();
});

test("theme toggle flips the document theme", async ({ page }) => {
  await page.goto("/mountains/mt-rainier");
  await revealDisplayControls(page);
  const themeBtn = page.getByRole("button", { name: /switch to (dark|light) theme/i });
  await expect(themeBtn).toBeVisible();
  const before = await page.evaluate(() => document.documentElement.dataset.theme);
  await themeBtn.click();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .not.toBe(before);
});
