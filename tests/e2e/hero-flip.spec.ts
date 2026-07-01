import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";

/* The freezing cross-section tile gains a "View in 3D" flip (focused, in range, terrain exists).
   We seed a pin (like focused.spec) so the hero renders, then assert the flip toggles. The
   terrain mocks make useTerrainMeta.available=true so the button appears. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

async function seedPin(page: import("@playwright/test").Page, target: string) {
  await page.addInitScript(
    ([t]) => {
      if (localStorage.getItem("cascast.pins")) return;
      localStorage.setItem(
        "cascast.pins",
        JSON.stringify([
          { mountainId: "mt-rainier", name: "Mount Rainier", targetDate: t, notes: "", createdAt: new Date().toISOString() },
        ]),
      );
    },
    [target],
  );
}

test("the cross-section tile flips to the 3D model and back", async ({ page }, ti) => {
  test.skip(!!process.env.PLAYWRIGHT_BASE_URL, "WebGL feature-detect varies on remote; local route-mocked only");
  await seedPin(page, TARGET_IN_RANGE);
  await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);

  // Stable testid: the button's accessible name changes on flip, so locate by testid.
  const flip = page.getByTestId("flip3d-toggle");
  await expect(flip).toBeVisible();
  await expect(flip).toHaveAccessibleName(/view in 3D/i);
  await expect(flip).toHaveAttribute("aria-pressed", "false");

  await flip.click();
  await expect(flip).toHaveAttribute("aria-pressed", "true");
  await expect(flip).toHaveAccessibleName(/cross-section/i);
  await expect(page.getByRole("link", { name: /explore in 3D/i })).toBeVisible();

  await page.screenshot({ path: ti.outputPath("hero-flip.png"), fullPage: true });

  // Flip back.
  await flip.click();
  await expect(flip).toHaveAttribute("aria-pressed", "false");
});
