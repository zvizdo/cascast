import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";

/* The /mountains/[slug]/3d exploration page. Asserts STRUCTURE only (the canvas container,
   the overlay toggles, the legend, the mandatory disclaimer, and attribution) — never WebGL
   pixels. In headless Chromium the GLB placeholder fails to parse and the viewer shows its
   calm fallback inside the canvas; the page shell still renders, which is what we check. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("3D page renders the viewer, toggles, legend, disclaimer, and attribution", async ({ page }, ti) => {
  await page.goto(`/mountains/mt-rainier/3d?target=${TARGET_IN_RANGE}`);

  // Title + canvas container.
  await expect(page.locator(".dh-title")).toContainText(/3D/i);
  await expect(page.getByTestId("mountain3d-canvas")).toBeVisible();

  // All four overlay toggles present.
  for (const name of [/freezing level/i, /^routes$/i, /slope 30/i, /^labels$/i]) {
    await expect(page.getByRole("button", { name })).toBeVisible();
  }

  // Toggling "Routes" flips its aria-pressed.
  const routesBtn = page.getByRole("button", { name: /^routes$/i });
  const before = await routesBtn.getAttribute("aria-pressed");
  await routesBtn.click();
  await expect(routesBtn).not.toHaveAttribute("aria-pressed", before ?? "true");

  // Legend, disclaimer, attribution.
  await expect(page.getByText(/Illustrative summit routes/i)).toBeVisible();
  await expect(page.getByText(/Illustrative — not for navigation/i).first()).toBeVisible();
  // The page's own attribution line (the footer also lists USGS 3DEP, hence .first()).
  await expect(page.getByText(/USGS 3DEP/i).first()).toBeVisible();

  await page.screenshot({ path: ti.outputPath("explore-3d.png"), fullPage: true });
});
