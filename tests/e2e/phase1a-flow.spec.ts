import { test, expect } from "@playwright/test";
import { maybeInstallMocks } from "./_mock";

/* Phase-1A flow: covers the NEW surfaces not already exercised by the migrated specs —
   the /sources explainer page, the footer link to it, and a light always-targeted smoke on
   the detail view (DateSelector headline + the Forecast/Safety tabs).

   NOTE: the Task-9 3D unit fix (summit/freezing labels in the user's unit) is NOT asserted
   here. The route-mock serves a placeholder GLB that WebGL cannot parse, so the drei <Html>
   overlays (SummitMarker / FreezingPlane) never mount under the route-mocked suite — only the
   3D page shell renders. That fix is verified by the unit/import smoke test + code review. */

test.beforeEach(async ({ page }) => {
  await maybeInstallMocks(page);
});

test("the /sources page explains the models and lists data sources", async ({ page }, ti) => {
  await page.goto("/sources");

  await expect(page.getByRole("heading", { name: /weather models/i })).toBeVisible();
  await expect(page.getByRole("heading", { name: /data sources/i })).toBeVisible();
  for (const model of [/HRRR/, /GFS/, /ECMWF/]) {
    await expect(page.getByText(model).first()).toBeVisible();
  }

  await page.screenshot({ path: ti.outputPath("sources.png"), fullPage: true });
});

test('the footer "Models & sources" link navigates to /sources', async ({ page }) => {
  await page.goto("/mountains/mt-rainier");

  await page.getByRole("link", { name: /models & sources/i }).click();
  await expect(page).toHaveURL(/\/sources$/);
  await expect(page.getByRole("heading", { name: /weather models/i })).toBeVisible();
});

test("the detail view is always targeted and exposes the Forecast + Safety tabs", async ({
  page,
}) => {
  await page.goto("/mountains/mt-rainier");

  // The always-targeted DateSelector headline shows on both desktop and mobile.
  await expect(page.getByText(/Planning for/i).first()).toBeVisible();

  // Both tabs are present (the day-strip itself is desktop-only, so we assert the tabs).
  await expect(page.getByRole("tab", { name: /forecast/i })).toBeVisible();
  await expect(page.getByRole("tab", { name: /safety/i })).toBeVisible();
});

test("the /3d page shell renders (no WebGL/overlay assertions)", async ({ page }) => {
  await page.goto("/mountains/mt-rainier/3d");

  await expect(page.locator(".dh-title")).toContainText(/3D/i);
  await expect(page.getByText(/Illustrative — not for navigation/i).first()).toBeVisible();
});
