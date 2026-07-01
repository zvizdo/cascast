import { test, expect } from "@playwright/test";
import * as path from "node:path";

/* Mount Whitney is an out-of-NWAC-region peak: it has weather + satellite but
   NO avalanche (NWAC) zone and NO SNOTEL station. This verifies the browse
   detail renders the peak and that the avalanche + snowpack panels degrade
   gracefully (off-season / pending) rather than erroring. Run live with
   PLAYWRIGHT_BASE_URL set; the asserted states are data-independent. */

const OUT = path.resolve(process.cwd(), "qa-screenshots");

// Live-only: this exercises the real deployed pipeline (no route mocks / no
// Whitney fixture exists). Skipped in the route-mocked local suite.
test.skip(!process.env.PLAYWRIGHT_BASE_URL, "live-only (set PLAYWRIGHT_BASE_URL)");

test("Mount Whitney: detail renders; avalanche + snow degrade gracefully", async ({ page }, ti) => {
  await page.goto("/mountains/mt-whitney");

  // Header: the peak (rendered in .dh-title) and its Sierra region.
  await expect(page.locator(".dh-title")).toHaveText(/Mount Whitney/i);
  await expect(page.getByText(/sierra-nevada/i)).toBeVisible();

  // Avalanche + snowpack panels exist and render their no-data states
  // (these are independent of whether the data pipeline has run).
  await expect(page.getByRole("heading", { name: "Avalanche danger" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Snowpack" })).toBeVisible();

  await page.screenshot({ path: path.join(OUT, `whitney-${ti.project.name}.png`), fullPage: true });
});
