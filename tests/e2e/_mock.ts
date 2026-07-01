/* tests/e2e/_mock.ts — Playwright route-mocking for the mountains-first UI.

   The pages render client-side via SWR, so intercepting the browser's calls to the
   /api/mountains tree with deterministic fixtures fully drives them — no Firestore/GCS
   emulator needed.

   LIVE REUSE: installMocks() is a no-op when PLAYWRIGHT_BASE_URL is set, so the SAME specs
   run against the real deployed app with real data. Each spec calls maybeInstallMocks() in
   beforeEach; specs assert structure/presence/flows (data-tolerant), not exact numbers. */
import type { Page, Route } from "@playwright/test";
import {
  buildMountainList,
  buildBrowseDetail,
  buildBlob,
  buildSnapshots,
  buildSnotel,
  buildNwac,
  buildSatellite,
  buildTerrainMeta,
  buildAirQuality,
  buildStormAlerts,
  buildVolcano,
  buildSeismic,
  buildParkAlerts,
  buildHazardsSummary,
  buildTrails,
  buildRoads,
  buildWilderness,
  buildRecSites,
  TINY_PNG_BASE64,
} from "./_fixtures";
import { MOUNTAINS } from "@/lib/mountains-data";

/** True only in local mode (no remote base URL ⇒ webServer serves the built app). */
export const isLocal = (): boolean => !process.env.PLAYWRIGHT_BASE_URL;

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({
    status,
    contentType: "application/json",
    headers: { "Cache-Control": "no-store" },
    body: JSON.stringify(body),
  });

/** Register the API interceptor. Idempotent per page; only the /api/mountains tree is touched. */
export async function installMocks(page: Page): Promise<void> {
  // Mock external map-tile hosts so the MapLibre map never hits real tile servers in local mode.
  const tinyPng = Buffer.from(TINY_PNG_BASE64, "base64");
  const tileFulfill = (route: Route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: tinyPng });

  await page.route("**/tile.opentopomap.org/**", tileFulfill);
  await page.route("**/server.arcgisonline.com/**", tileFulfill);
  await page.route("**/gibs.earthdata.nasa.gov/**", tileFulfill);

  await page.route("**/api/mountains/**", async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;

    // /satellite/image — binary PNG (see fixture); 200 with image/png.
    if (/\/api\/mountains\/[^/]+\/satellite\/image$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "Cache-Control": "no-store" },
        body: Buffer.from(TINY_PNG_BASE64, "base64"),
      });
    }

    // /terrain/model — a tiny placeholder GLB body. WebGL won't parse it, so the viewer's
    // error boundary shows its calm fallback; the page SHELL (controls/legend/disclaimer)
    // still renders, which is all the 3D specs assert.
    if (/\/api\/mountains\/[^/]+\/terrain\/model$/.test(path)) {
      return route.fulfill({
        status: 200,
        contentType: "model/gltf-binary",
        headers: { "Cache-Control": "no-store" },
        body: Buffer.from("glTF-placeholder"),
      });
    }

    const m = path.match(/\/api\/mountains\/([^/]+)(\/[^?]*)?$/);
    const slug = m?.[1] ?? "mt-rainier";
    const sub = m?.[2] ?? "";

    if (sub === "/terrain/meta") return json(route, buildTerrainMeta(slug));
    if (sub === "/weather") return json(route, buildBlob(slug));
    if (sub === "/snapshots") return json(route, buildSnapshots());
    if (sub === "/snotel") return json(route, buildSnotel(slug));
    if (sub === "/nwac") return json(route, buildNwac(slug));
    if (sub === "/satellite") return json(route, buildSatellite(slug));
    // Safety-tab feeds (Phase 2B). Gated routes mirror the real 404 for peers
    // lacking the catalog field so MountainDetail omits those panels.
    if (sub === "/air-quality") return json(route, buildAirQuality(slug));
    if (sub === "/alerts") return json(route, buildStormAlerts(slug));
    if (sub === "/seismic") return json(route, buildSeismic(slug));
    if (sub === "/hazards-summary") return json(route, buildHazardsSummary(slug));
    // Geo-layer routes (Phase 3B) — return deterministic FeatureCollections so
    // the terrain e2e never hits Overpass or EDW in local mode.
    if (sub === "/trails") return json(route, buildTrails(slug));
    if (sub === "/roads") return json(route, buildRoads(slug));
    if (sub === "/wilderness") return json(route, buildWilderness(slug));
    if (sub === "/rec-sites") return json(route, buildRecSites(slug));
    if (sub === "/volcano") {
      const mtn = MOUNTAINS.find((x) => x.slug === slug);
      return mtn?.hansVolcanoId ? json(route, buildVolcano(slug)) : json(route, { error: "Not a monitored volcano" }, 404);
    }
    if (sub === "/park-alerts") {
      const mtn = MOUNTAINS.find((x) => x.slug === slug);
      return mtn?.npsParkCode ? json(route, buildParkAlerts(slug)) : json(route, { error: "No park alerts" }, 404);
    }
    // /api/mountains/[slug] (detail)
    if (sub === "") return json(route, buildBrowseDetail(slug));
    return route.continue();
  });

  // /api/mountains (list) — no trailing path segment, so the **/ glob above also catches it
  // via Playwright's recursive match; register an explicit handler for safety/ordering.
  await page.route("**/api/mountains", async (route) => {
    return json(route, buildMountainList());
  });
}

/** beforeEach helper: install mocks ONLY in local mode (live mode hits the real backend). */
export async function maybeInstallMocks(page: Page): Promise<void> {
  if (isLocal()) await installMocks(page);
}
