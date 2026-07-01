// lib/__tests__/geo.test.ts
import { describe, it, expect } from "vitest";
import {
  cacheFresh,
  overpassTrailsQuery,
  osmToGeoJson,
  edwQueryUrl,
  npsTrailsUrl,
  EMPTY_FC,
} from "@/lib/geo";

const bbox = { west: -121.84, south: 46.77, east: -121.68, north: 46.93 };

describe("cacheFresh", () => {
  it("returns true when cachedAt is within ttl", () => {
    const recentIso = new Date(Date.now() - 3600e3).toISOString();
    expect(cacheFresh(recentIso, 7 * 864e5)).toBe(true);
  });

  it("returns false when cachedAt is older than ttl", () => {
    const oldIso = new Date(Date.now() - 8 * 864e5).toISOString();
    expect(cacheFresh(oldIso, 7 * 864e5)).toBe(false);
  });

  it("returns false for unparseable cachedAt", () => {
    expect(cacheFresh("garbage", 1000)).toBe(false);
  });
});

describe("overpassTrailsQuery", () => {
  it("contains hiking route relation", () => {
    const q = overpassTrailsQuery(bbox);
    expect(q).toContain('route"="hiking"');
  });

  it("uses S,W,N,E bbox order", () => {
    const q = overpassTrailsQuery(bbox);
    expect(q).toContain("46.77,-121.84,46.93,-121.68");
  });

  it("includes out geom", () => {
    const q = overpassTrailsQuery(bbox);
    expect(q).toContain("out geom");
  });
});

describe("osmToGeoJson", () => {
  it("converts elements with geometry to LineString features", () => {
    const result = osmToGeoJson({
      elements: [
        {
          type: "way",
          tags: { name: "Trail", sac_scale: "hiking", highway: "path" },
          geometry: [
            { lat: 46.8, lon: -121.7 },
            { lat: 46.81, lon: -121.71 },
          ],
        },
        {
          type: "way",
          tags: {},
          // no geometry — should be skipped
        },
      ],
    });

    expect(result.type).toBe("FeatureCollection");
    expect(result.features).toHaveLength(1);

    const feat = result.features[0];
    expect(feat.geometry.type).toBe("LineString");
    expect((feat.geometry as GeoJSON.LineString).coordinates).toEqual([
      [-121.7, 46.8],
      [-121.71, 46.81],
    ]);
    expect(feat.properties?.sac_scale).toBe("hiking");
    expect(feat.properties?.name).toBe("Trail");
    expect(feat.properties?.highway).toBe("path");
  });

  it("returns empty FeatureCollection when elements missing", () => {
    const result = osmToGeoJson({});
    expect(result).toEqual(EMPTY_FC);
  });
});

describe("edwQueryUrl", () => {
  it("contains service and layer in path", () => {
    const url = edwQueryUrl("EDW_RoadBasic_01", 0, bbox);
    expect(url).toContain("EDW_RoadBasic_01/MapServer/0/query");
  });

  it("contains f=geojson", () => {
    const url = edwQueryUrl("EDW_RoadBasic_01", 0, bbox);
    expect(url).toContain("f=geojson");
  });

  it("contains esriGeometryEnvelope", () => {
    const url = edwQueryUrl("EDW_RoadBasic_01", 0, bbox);
    expect(url).toContain("esriGeometryEnvelope");
  });
});

describe("npsTrailsUrl", () => {
  it("contains UNITCODE", () => {
    const url = npsTrailsUrl("mora");
    expect(url).toContain("UNITCODE");
  });

  it("contains the park code", () => {
    const url = npsTrailsUrl("mora");
    expect(url).toContain("mora");
  });
});
