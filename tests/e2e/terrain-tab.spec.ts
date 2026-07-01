import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";
import { TARGET_IN_RANGE } from "./_fixtures";
import * as path from "node:path";

/* Phase 3A — Terrain & Access tab: MapLibre shell + layer controls + webcam + access cards + 3D entry.
   Route-mocked locally (external tile hosts are stubbed to a 1×1 PNG in _mock.ts);
   reusable live via PLAYWRIGHT_BASE_URL. DOM-only assertions — GL pixels are not asserted
   because MapLibre may degrade gracefully in headless Chromium.

   MapLibre "InvalidStateError: The source image could not be decoded." errors are expected in
   route-mocked mode (the 1×1 PNG stubs can't satisfy MapLibre's internal sprite/image decoder)
   and are filtered from the assertion — they do not indicate application code failures. */

const OUT = path.resolve(process.cwd(), "qa-screenshots");
const shot = (name: string, project: string) => path.join(OUT, `${name}-${project}.png`);

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

/** Filter out known MapLibre-in-headless noise from an error list. */
function appErrors(errs: string[]): string[] {
  return errs.filter(
    (e) =>
      // MapLibre tries to decode stubbed 1×1 PNG tiles as sprite images — not an app error.
      !e.includes("The source image could not be decoded") &&
      // MapLibre WebGL context messages in headless Chromium — not an app error.
      !e.includes("WebGL") &&
      !e.includes("maplibre"),
  );
}

test("Terrain tab renders map controls, snow layer, attribution, access cards, and 3D entry for Rainier", async ({
  page,
}, ti) => {
  // Collect console errors; MapLibre WebGL warnings are acceptable but JS errors are not.
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") jsErrors.push(msg.text());
  });

  await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);
  await expect(page.getByText(/Planning for/i)).toBeVisible();

  // Open the Terrain & Access tab.
  await page.getByRole("tab", { name: /terrain & access/i }).click();

  // Base-style toggle: Segmented radiogroup with Topo + Satellite options.
  const radiogroup = page.getByRole("radiogroup", { name: /base map style/i });
  await expect(radiogroup).toBeVisible();
  await expect(radiogroup.getByRole("radio", { name: /topo/i })).toBeVisible();
  await expect(radiogroup.getByRole("radio", { name: /satellite/i })).toBeVisible();

  // Snow-cover layer checkbox + acquisition-date caveat (YYYY-MM-DD in the label area).
  const snowCheckbox = page.getByRole("checkbox", { name: /snow cover/i });
  await expect(snowCheckbox).toBeVisible();
  // The caveat text contains a date like "MODIS snow · 2026-06-19 (cloud gaps possible)".
  await expect(page.getByText(/MODIS snow · \d{4}-\d{2}-\d{2}/)).toBeVisible();

  // Map container (.terrain-map) must be in the DOM (the MapLibre host div or its loading placeholder).
  await expect(page.locator(".terrain-map").first()).toBeAttached();

  // Attribution line names OpenTopoMap (the explicit <p> element; MapLibre also injects
  // attribution into its control, so we scope to the first visible match).
  await expect(page.getByText(/OpenTopoMap/).first()).toBeVisible();

  // Rainier has one permit → Permits card renders.
  await expect(page.getByRole("heading", { name: /permits/i })).toBeVisible();

  // Roads + Trails cards always render (Phase 3B placeholder).
  await expect(page.getByRole("heading", { name: /roads/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /trails/i })).toBeVisible();

  // "Explore in 3D" link points to /mountains/mt-rainier/3d.
  const link3d = page.getByRole("link", { name: /explore in 3d/i });
  await expect(link3d).toBeVisible();
  const href = await link3d.getAttribute("href");
  expect(href).toMatch(/\/mountains\/mt-rainier\/3d/);

  await page.screenshot({ path: shot("terrain-tab-rainier", ti.project.name), fullPage: true });

  // No application-level JS/console errors from the tab interactions.
  expect(appErrors(jsErrors)).toHaveLength(0);
});

test("Toggle Satellite and Snow cover triggers no console error", async ({ page }) => {
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") jsErrors.push(msg.text());
  });

  await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);
  await expect(page.getByText(/Planning for/i)).toBeVisible();
  await page.getByRole("tab", { name: /terrain & access/i }).click();

  // Switch to Satellite base style.
  await page.getByRole("radio", { name: /satellite/i }).click();
  // Toggle Snow cover on.
  const snowCheckbox = page.getByRole("checkbox", { name: /snow cover/i });
  await snowCheckbox.check();
  // Toggle Snow cover off again.
  await snowCheckbox.uncheck();
  // Switch back to Topo.
  await page.getByRole("radio", { name: /topo/i }).click();

  // No application-level errors; MapLibre headless noise is filtered by appErrors().
  expect(appErrors(jsErrors)).toHaveLength(0);
});

test("Layer checkboxes are enabled and toggling Trails+Roads shows access-card counts and ODbL attribution", async ({
  page,
}, ti) => {
  // Collect page errors; filter MapLibre/WebGL/tile-decode noise.
  const jsErrors: string[] = [];
  page.on("pageerror", (err) => jsErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") jsErrors.push(msg.text());
  });

  await page.goto(`/mountains/mt-rainier?target=${TARGET_IN_RANGE}`);
  await expect(page.getByText(/Planning for/i)).toBeVisible();
  await page.getByRole("tab", { name: /terrain & access/i }).click();

  // All 5 geo-layer checkboxes must be ENABLED (not disabled).
  for (const label of ["Trails", "Roads", "Wilderness", "Trailheads", "Earthquakes"]) {
    const cb = page.getByRole("checkbox", { name: label });
    await expect(cb).toBeVisible();
    await expect(cb).not.toBeDisabled();
  }

  // OSM ODbL attribution is NOT shown before Trails is checked.
  await expect(page.getByText(/ODbL/)).toHaveCount(0);

  // Enable Trails → ODbL attribution should appear.
  await page.getByRole("checkbox", { name: "Trails" }).check();
  await expect(page.getByText(/ODbL/)).toBeVisible();

  // Enable Roads.
  await page.getByRole("checkbox", { name: "Roads" }).check();

  // Wait for SWR to resolve the mocked /roads and /trails routes.
  // The access cards show the counts from the fixture (3 roads · 1 closed; 2 trails).
  await expect(
    page.getByText(/3 forest road segments · 1 closed near the peak/),
  ).toBeVisible({ timeout: 5000 });
  await expect(
    page.getByText(/2 mapped trail segments near the peak/),
  ).toBeVisible({ timeout: 5000 });

  await page.screenshot({ path: shot("terrain-tab-layers", ti.project.name), fullPage: true });

  // No application-level JS errors from the toggle interactions.
  expect(appErrors(jsErrors)).toHaveLength(0);
});

test("Terrain tab shows 'No webcam available' and omits Permits card for Baker (no webcams, no permits)", async ({
  page,
}, ti) => {
  await page.goto(`/mountains/mt-baker?target=${TARGET_IN_RANGE}`);
  await expect(page.getByText(/Planning for/i)).toBeVisible();

  await page.getByRole("tab", { name: /terrain & access/i }).click();

  // Baker has no webcams → explicit "No webcam available" state.
  await expect(page.getByText(/no webcam available for this peak/i)).toBeVisible();

  // Baker has empty permits → Permits card is absent.
  await expect(page.getByRole("heading", { name: /permits/i })).toHaveCount(0);

  // Roads + Trails placeholder cards still render.
  await expect(page.getByRole("heading", { name: /roads/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /trails/i })).toBeVisible();

  await page.screenshot({ path: shot("terrain-tab-baker", ti.project.name), fullPage: true });
});
