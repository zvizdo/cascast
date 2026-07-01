import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseMarkers } from "@/lib/terrain";
import { MOUNTAINS } from "@/lib/mountains-data";

/* Place markers are served from public/markers/<slug>.geojson (fetched client-side). This
   guards every coordinate is within the peak's baked bbox and lng/lat aren't swapped. */
const SPAN = 0.06;
const VALID_KINDS = new Set(["camp", "glacier", "landmark"]);

describe("data/markers — named place markers", () => {
  for (const m of MOUNTAINS) {
    const path = resolve(process.cwd(), "public/markers", `${m.slug}.geojson`);
    if (!existsSync(path)) continue; // markers are optional per peak
    it(`${m.slug}: markers are valid and within the bbox`, () => {
      const markers = parseMarkers(JSON.parse(readFileSync(path, "utf8")));
      expect(markers.length).toBeGreaterThanOrEqual(1);
      for (const mk of markers) {
        expect(mk.name.length).toBeGreaterThan(0);
        expect(VALID_KINDS.has(mk.kind)).toBe(true);
        expect(mk.lng).toBeGreaterThanOrEqual(m.lng - SPAN);
        expect(mk.lng).toBeLessThanOrEqual(m.lng + SPAN);
        expect(mk.lat).toBeGreaterThanOrEqual(m.lat - SPAN);
        expect(mk.lat).toBeLessThanOrEqual(m.lat + SPAN);
      }
    });
  }
});
