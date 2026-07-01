import { describe, it, expect } from "vitest";
import {
  llaToMesh,
  elevToMeshY,
  freezingPlaneY,
  ftToM,
  parseRoutes,
  parseMarkers,
  terrainModelUrl,
  cameraFraming,
  type TerrainMeta,
} from "@/lib/terrain";

const META: TerrainMeta = {
  slug: "mt-rainier",
  bbox: { west: -121.82, east: -121.70, south: 46.79, north: 46.91 },
  centerLat: 46.85,
  centerLng: -121.76,
  metersPerDegLat: 111320,
  metersPerDegLng: 76000,
  minElevM: 1500,
  maxElevM: 4392,
  exaggeration: 1.6,
  summit: { lng: -121.76, lat: 46.85, elevM: 4392 },
};

describe("lib/terrain", () => {
  it("maps the center summit to ~x0/z0 and the exaggerated height", () => {
    const [x, y, z] = llaToMesh(META, -121.76, 46.85, 4392);
    expect(Math.abs(x)).toBeLessThan(1);
    expect(Math.abs(z)).toBeLessThan(1);
    expect(y).toBeCloseTo((4392 - 1500) * 1.6, 3);
  });

  it("east is +x, north is -z", () => {
    const [xe] = llaToMesh(META, -121.70, 46.85, 1500);
    const [, , zn] = llaToMesh(META, -121.76, 46.91, 1500);
    expect(xe).toBeGreaterThan(0);
    expect(zn).toBeLessThan(0);
  });

  it("elevToMeshY floors at minElev", () => {
    expect(elevToMeshY(META, 1500)).toBe(0);
  });

  it("freezingPlaneY converts feet then maps to mesh Y", () => {
    expect(freezingPlaneY(META, 5000)).toBeCloseTo((ftToM(5000) - 1500) * 1.6, 3);
  });

  it("ftToM converts feet to metres", () => {
    expect(ftToM(1000)).toBeCloseTo(304.8, 1);
  });

  it("parseRoutes keeps LineStrings and their props", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "DC", grade: "Glaciated", illustrative: true },
          geometry: { type: "LineString", coordinates: [[-121.76, 46.80, 1600], [-121.76, 46.85, 4392]] },
        },
        { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [0, 0] } },
      ],
    };
    const routes = parseRoutes(fc);
    expect(routes).toHaveLength(1);
    expect(routes[0].name).toBe("DC");
    expect(routes[0].illustrative).toBe(true);
    expect(routes[0].points[1]).toEqual([-121.76, 46.85, 4392]);
  });

  it("parseMarkers keeps Points, validates kind, defaults unknown to landmark", () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "Camp Muir", kind: "camp" }, geometry: { type: "Point", coordinates: [-121.73, 46.83] } },
        { type: "Feature", properties: { name: "Mystery", kind: "bogus" }, geometry: { type: "Point", coordinates: [-121.7, 46.8] } },
        { type: "Feature", properties: { name: "Line" }, geometry: { type: "LineString", coordinates: [[0, 0]] } },
      ],
    };
    const m = parseMarkers(fc);
    expect(m).toHaveLength(2);
    expect(m[0]).toEqual({ name: "Camp Muir", kind: "camp", lng: -121.73, lat: 46.83 });
    expect(m[1].kind).toBe("landmark"); // unknown kind falls back
  });

  it("terrainModelUrl builds the GLB route", () => {
    expect(terrainModelUrl("mt-rainier")).toBe("/api/mountains/mt-rainier/terrain/model");
  });

  it("cameraFraming targets mid-height with a positive distance and NE-up offset", () => {
    const { position, target, distance } = cameraFraming(META);
    const midHeight = ((META.maxElevM - META.minElevM) * META.exaggeration) / 2;
    expect(target).toEqual([0, midHeight, 0]);
    expect(distance).toBeGreaterThan(0);
    // NE-up: +x (east), +y (up), +z (toward camera, since three looks down -z)
    expect(position[0]).toBeGreaterThan(0);
    expect(position[1]).toBeGreaterThan(target[1]);
    expect(position[2]).toBeGreaterThan(0);
    expect(position[1]).toBeCloseTo(target[1] + distance * 0.6, 3);
  });
});
