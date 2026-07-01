// lib/geo.ts — pure (no-fetch) query builders + OSM→GeoJSON normalizer + cache-freshness

export type BBox = { west: number; south: number; east: number; north: number };

export const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/** Returns true if cachedAt ISO string is within ttlMs of now. False if unparseable. */
export function cacheFresh(cachedAt: string, ttlMs: number, now: number = Date.now()): boolean {
  const parsed = Date.parse(cachedAt);
  if (isNaN(parsed)) return false;
  return now - parsed < ttlMs;
}

/** Overpass QL query for hiking routes + sac_scale paths in bbox (S,W,N,E order). */
export function overpassTrailsQuery(b: BBox): string {
  const S = b.south, W = b.west, N = b.north, E = b.east;
  return `[out:json][timeout:25];( relation["route"="hiking"](${S},${W},${N},${E}); way["highway"~"path|footway|track"]["sac_scale"](${S},${W},${N},${E}); );out geom;`;
}

/** Convert Overpass JSON response to a GeoJSON FeatureCollection of LineStrings. */
export function osmToGeoJson(overpass: {
  elements?: Array<{
    type: string;
    tags?: Record<string, string>;
    geometry?: Array<{ lat: number; lon: number }>;
  }>;
}): GeoJSON.FeatureCollection {
  if (!overpass.elements) return EMPTY_FC;

  const features: GeoJSON.Feature[] = [];
  for (const el of overpass.elements) {
    if (!el.geometry || el.geometry.length === 0) continue;
    const tags = el.tags ?? {};
    features.push({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: el.geometry.map((g) => [g.lon, g.lat]),
      },
      properties: {
        name: tags.name ?? "",
        sac_scale: tags.sac_scale ?? "",
        highway: tags.highway ?? "",
      },
    });
  }
  return { type: "FeatureCollection", features };
}

/** Build an EDW ArcGIS bbox query URL. */
export function edwQueryUrl(service: string, layer: number, b: BBox): string {
  const geometry = encodeURIComponent(
    JSON.stringify({ xmin: b.west, ymin: b.south, xmax: b.east, ymax: b.north })
  );
  return (
    `https://apps.fs.usda.gov/arcx/rest/services/EDW/${service}/MapServer/${layer}/query` +
    `?f=geojson&where=1%3D1&geometry=${geometry}` +
    `&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects` +
    `&inSR=4326&outSR=4326&outFields=*&returnGeometry=true`
  );
}

/** Build an NPS ArcGIS trails query URL filtered by park unit code. */
export function npsTrailsUrl(parkCode: string): string {
  return (
    `https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails/FeatureServer/0/query` +
    `?where=${encodeURIComponent(`UNITCODE='${parkCode}'`)}&outFields=*&f=geojson`
  );
}
