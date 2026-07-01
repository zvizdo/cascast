import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";
import * as path from "node:path";

/* Phase 2B — the Safety tab: AirQuality, Storm, Volcano, Seismic, Park alerts (most-actionable-
   first) + the existing Avalanche panel, plus the header AQI chip. Route-mocked locally and
   reusable live via PLAYWRIGHT_BASE_URL. Volcano/Park gracefully omit for peers lacking the
   catalog field (the mock mirrors the real 404). Screenshots → gitignored qa-screenshots/. */

const OUT = path.resolve(process.cwd(), "qa-screenshots");
const shot = (name: string, project: string) => path.join(OUT, `${name}-${project}.png`);

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("Safety tab renders the five hazard panels + Avalanche, and the AQI header chip", async ({
  page,
}, ti) => {
  await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);

  // The AirQuality header chip rolls up from hazards-summary (AQI 80, Moderate).
  await expect(page.getByText(/AQI\b/).first()).toBeVisible();

  // Open the Safety tab.
  await page.getByRole("tab", { name: /safety/i }).click();

  // Most-actionable-first ordering: every panel heading is present (mt-rainier is a
  // monitored volcano inside a National Park, so Volcano + Park alerts both show).
  await expect(page.getByRole("heading", { name: /air quality/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /storm & lightning/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /volcano status/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /recent earthquakes/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /park alerts/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /avalanche danger/i })).toBeVisible();

  await page.screenshot({ path: shot("safety-tab", ti.project.name), fullPage: true });
});

test("Safety tab omits the Volcano + Park panels for a non-volcano, non-park peer", async ({
  page,
}) => {
  // colchuck-peak carries no hansVolcanoId / npsParkCode ⇒ those routes 404 ⇒ panels omitted.
  await page.goto(`/mountains/colchuck-peak?target=${TARGET_IN_RANGE}`);
  await page.getByRole("tab", { name: /safety/i }).click();

  // Air quality / Storm / Earthquakes still render (global feeds); Volcano + Park do not.
  await expect(page.getByRole("heading", { name: /air quality/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /recent earthquakes/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /volcano status/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /park alerts/i })).toHaveCount(0);
});
