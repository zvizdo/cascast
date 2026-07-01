import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseRoutes } from "@/lib/terrain";
import { MOUNTAINS } from "@/lib/mountains-data";

/** Route GeoJSON is served as a static asset from public/routes/<slug>.geojson
 *  (fetched client-side at runtime). The test reads the same files from disk so
 *  it stays bundler-agnostic. */
function loadRoutes(slug: string) {
  const path = resolve(process.cwd(), "public/routes", `${slug}.geojson`);
  return JSON.parse(readFileSync(path, "utf8"));
}

/** The bake span (deg) used by build_terrain.py; route coords must fall inside
 *  the resulting bbox so they drape onto the mesh. */
const SPAN = 0.06;

function within(slug: string) {
  const m = MOUNTAINS.find((x) => x.slug === slug);
  if (!m) throw new Error(`unknown slug ${slug}`);
  const routes = parseRoutes(loadRoutes(slug));
  expect(routes.length).toBeGreaterThanOrEqual(1);
  for (const r of routes) {
    expect(r.illustrative).toBe(true);
    expect(r.name.length).toBeGreaterThan(0);
    for (const [lng, lat] of r.points) {
      expect(lng).toBeGreaterThanOrEqual(m.lng - SPAN);
      expect(lng).toBeLessThanOrEqual(m.lng + SPAN);
      expect(lat).toBeGreaterThanOrEqual(m.lat - SPAN);
      expect(lat).toBeLessThanOrEqual(m.lat + SPAN);
    }
  }
  return routes;
}

/** Expected route count per peak (every slug that has a public/routes file). */
const EXPECTED_COUNTS: Record<string, number> = {
  "mt-rainier": 2,
  "mt-baker": 2,
  "mt-shuksan": 2,
  "mt-st-helens": 2,
  "colchuck-peak": 2,
  "mt-whitney": 2,
  "mt-adams": 1,
  "mt-hood": 1,
  "mt-olympus": 1,
  "liberty-bell": 1,
  "glacier-peak": 1,
  "eldorado-peak": 1,
  "forbidden-peak": 1,
  "sahale-peak": 1,
  "bonanza-peak": 1,
  "mt-goode": 1,
  "mt-buckner": 1,
  "mt-logan": 1,
  "jack-mountain": 1,
  "black-peak": 1,
  "dome-peak": 1,
  "sloan-peak": 1,
  "whitehorse-mountain": 1,
  "three-fingers": 1,
  "mt-stuart": 1,
  "dragontail-peak": 1,
  "cannon-mountain": 1,
  "cashmere-mountain": 1,
  "mt-fernow": 1,
  "mt-maude": 1,
  "seven-fingered-jack": 1,
  "mt-constance": 1,
  "mt-deception": 1,
  "gilbert-peak": 1,
  "mt-jefferson": 1,
  "south-sister": 1,
  "middle-sister": 1,
  "north-sister": 1,
  "mt-thielsen": 1,
};

describe("data/routes — illustrative summit routes", () => {
  for (const [slug, count] of Object.entries(EXPECTED_COUNTS)) {
    it(`${slug}: ${count} illustrative route(s) within the bbox, ending at the summit`, () => {
      const routes = within(slug);
      expect(routes).toHaveLength(count);
    });
  }

  it("Rainier keeps its named DC + Emmons routes", () => {
    const routes = within("mt-rainier");
    expect(routes.map((r) => r.name)).toEqual([
      "Disappointment Cleaver",
      "Emmons–Winthrop Glacier",
    ]);
  });
});
