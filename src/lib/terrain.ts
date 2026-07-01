export interface TerrainMeta {
  slug: string;
  bbox: { west: number; east: number; south: number; north: number };
  centerLat: number;
  centerLng: number;
  metersPerDegLat: number;
  metersPerDegLng: number;
  minElevM: number;
  maxElevM: number;
  exaggeration: number;
  summit: { lng: number; lat: number; elevM: number };
}

export interface RouteLine {
  name: string;
  grade?: string;
  trailhead?: string;
  source?: string;
  illustrative?: boolean;
  points: [number, number, number][];
}

export type MarkerKind = "camp" | "glacier" | "landmark";
export interface PlaceMarker {
  name: string;
  kind: MarkerKind;
  lng: number;
  lat: number;
}

export const ftToM = (ft: number) => ft * 0.3048;
export const elevToMeshY = (m: TerrainMeta, elevM: number) => (elevM - m.minElevM) * m.exaggeration;

/** Mesh Y for a freezing-level value given in feet. */
export const freezingPlaneY = (m: TerrainMeta, freezingFt: number) => elevToMeshY(m, ftToM(freezingFt));

export function llaToMesh(m: TerrainMeta, lng: number, lat: number, elevM: number): [number, number, number] {
  const x = (lng - m.centerLng) * m.metersPerDegLng;
  const z = -(lat - m.centerLat) * m.metersPerDegLat;
  const y = elevToMeshY(m, elevM);
  return [x, y, z];
}

/** GLB model URL for a mountain's baked terrain. */
export const terrainModelUrl = (slug: string) => `/api/mountains/${slug}/terrain/model`;

/** Camera position/target/distance that frames the whole terrain bbox. */
export function cameraFraming(m: TerrainMeta): {
  position: [number, number, number];
  target: [number, number, number];
  distance: number;
} {
  const meshHalfWidth = ((m.bbox.east - m.bbox.west) * m.metersPerDegLng) / 2;
  const summitY = (m.maxElevM - m.minElevM) * m.exaggeration;
  const target: [number, number, number] = [0, summitY / 2, 0];
  const distance = 1.6 * Math.max(meshHalfWidth * 2, summitY);
  const position: [number, number, number] = [
    target[0] + distance * 0.7,
    target[1] + distance * 0.6,
    target[2] + distance * 0.7,
  ];
  return { position, target, distance };
}

export function parseRoutes(fc: unknown): RouteLine[] {
  const features = (fc as { features?: unknown[] })?.features ?? [];
  const out: RouteLine[] = [];
  for (const f of features as {
    properties?: Record<string, unknown>;
    geometry?: { type?: string; coordinates?: unknown };
  }[]) {
    if (f?.geometry?.type !== "LineString") continue;
    const coords = f.geometry.coordinates as [number, number, number][];
    const p = f.properties ?? {};
    out.push({
      name: String(p.name ?? "Route"),
      grade: p.grade as string | undefined,
      trailhead: p.trailhead as string | undefined,
      source: p.source as string | undefined,
      illustrative: p.illustrative as boolean | undefined,
      points: coords.map((c) => [c[0], c[1], c[2] ?? 0]),
    });
  }
  return out;
}

const MARKER_KINDS: MarkerKind[] = ["camp", "glacier", "landmark"];

/** Parse a Point FeatureCollection of named places (camps, glaciers, landmarks). */
export function parseMarkers(fc: unknown): PlaceMarker[] {
  const features = (fc as { features?: unknown[] })?.features ?? [];
  const out: PlaceMarker[] = [];
  for (const f of features as {
    properties?: Record<string, unknown>;
    geometry?: { type?: string; coordinates?: unknown };
  }[]) {
    if (f?.geometry?.type !== "Point") continue;
    const c = f.geometry.coordinates as [number, number];
    const p = f.properties ?? {};
    const kind = MARKER_KINDS.includes(p.kind as MarkerKind) ? (p.kind as MarkerKind) : "landmark";
    out.push({ name: String(p.name ?? "Place"), kind, lng: c[0], lat: c[1] });
  }
  return out;
}
