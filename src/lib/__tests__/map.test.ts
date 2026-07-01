import { describe, it, expect } from "vitest";
import {
  gibsSnowDate,
  gibsSnowTiles,
  terrainMapStyle,
  peakCenter,
} from "@/lib/map";

describe("gibsSnowDate", () => {
  it("returns yesterday as YYYY-MM-DD (UTC)", () => {
    expect(gibsSnowDate(new Date(Date.UTC(2026, 5, 20)))).toBe("2026-06-19");
  });

  it("handles month boundary", () => {
    expect(gibsSnowDate(new Date(Date.UTC(2026, 6, 1)))).toBe("2026-06-30");
  });

  it("handles year boundary", () => {
    expect(gibsSnowDate(new Date(Date.UTC(2026, 0, 1)))).toBe("2025-12-31");
  });
});

describe("gibsSnowTiles", () => {
  it("returns an array with the correct GIBS URL", () => {
    const tiles = gibsSnowTiles("2026-06-19");
    expect(tiles).toHaveLength(1);
    expect(tiles[0]).toContain("MODIS_Terra_L3_NDSI_Snow_Cover_Daily/default/2026-06-19/");
    expect(tiles[0]).toContain("{z}/{y}/{x}.png");
  });

  it("URL starts with the GIBS base", () => {
    const tiles = gibsSnowTiles("2026-06-19");
    expect(tiles[0]).toMatch(/^https:\/\/gibs\.earthdata\.nasa\.gov/);
  });
});

describe("terrainMapStyle", () => {
  it("topo base, no snow → single layer, topo attribution", () => {
    const style = terrainMapStyle({ base: "topo", snow: false, snowDate: "2026-06-19" });
    expect(style.version).toBe(8);
    // sources: both topo + satellite always present
    const sources = style.sources as Record<string, { attribution?: string }>;
    expect(sources["topo"]).toBeTruthy();
    expect(sources["topo"].attribution).toMatch(/OpenTopoMap/);
    expect(sources["satellite"]).toBeTruthy();
    // layers: exactly one (the base layer)
    expect(style.layers).toHaveLength(1);
    expect((style.layers[0] as { id: string }).id).toBe("base");
  });

  it("satellite base, snow=true → satellite source (Esri attr), snow source, two layers with snow last", () => {
    const style = terrainMapStyle({ base: "satellite", snow: true, snowDate: "2026-06-19" });
    const sources = style.sources as Record<string, { attribution?: string }>;
    expect(sources["satellite"]).toBeTruthy();
    expect(sources["satellite"].attribution).toMatch(/Esri/);
    expect(sources["snow"]).toBeTruthy();
    const layers = style.layers as Array<{ id: string }>;
    expect(layers).toHaveLength(2);
    expect(layers[0].id).toBe("base");
    expect(layers[1].id).toBe("snow");
  });

  it("snow layer has raster-opacity 0.7", () => {
    const style = terrainMapStyle({ base: "topo", snow: true, snowDate: "2026-06-19" });
    const snowLayer = (style.layers as Array<{ id: string; paint?: Record<string, unknown> }>)
      .find((l) => l.id === "snow");
    expect(snowLayer?.paint?.["raster-opacity"]).toBe(0.7);
  });

  it("has no glyphs or sprite", () => {
    const style = terrainMapStyle({ base: "topo", snow: false, snowDate: "x" });
    expect((style as Record<string, unknown>).glyphs).toBeUndefined();
    expect((style as Record<string, unknown>).sprite).toBeUndefined();
  });

  it("topo source has all three tile subdomains", () => {
    const style = terrainMapStyle({ base: "topo", snow: false, snowDate: "x" });
    const topoSource = (style.sources as Record<string, { tiles?: string[] }>)["topo"];
    expect(topoSource.tiles).toHaveLength(3);
    expect(topoSource.tiles![0]).toContain("a.tile.opentopomap.org");
    expect(topoSource.tiles![1]).toContain("b.tile.opentopomap.org");
    expect(topoSource.tiles![2]).toContain("c.tile.opentopomap.org");
  });
});

describe("peakCenter", () => {
  it("uses bbox midpoint and zoom 11 when mapBbox is provided", () => {
    const result = peakCenter({
      lat: 46.85,
      lng: -121.76,
      mapBbox: { west: -121.84, south: 46.77, east: -121.68, north: 46.93 },
    });
    expect(result.lng).toBeCloseTo((-121.84 + -121.68) / 2, 5);
    expect(result.lat).toBeCloseTo((46.77 + 46.93) / 2, 5);
    expect(result.zoom).toBe(11);
  });

  it("uses lat/lng and zoom 12 when no mapBbox", () => {
    const result = peakCenter({ lat: 48.77, lng: -121.81 });
    expect(result.lat).toBe(48.77);
    expect(result.lng).toBe(-121.81);
    expect(result.zoom).toBe(12);
  });

  it("uses lat/lng and zoom 12 when mapBbox is undefined", () => {
    const result = peakCenter({ lat: 48.77, lng: -121.81, mapBbox: undefined });
    expect(result.lat).toBe(48.77);
    expect(result.lng).toBe(-121.81);
    expect(result.zoom).toBe(12);
  });
});
