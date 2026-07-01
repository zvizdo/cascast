/* tests/e2e/_fixtures.ts — deterministic API fixtures for the local (route-mocked) QA run.
   All dates are computed relative to `new Date()` so the weather panels render and a target
   ~3 days out lands IN range, while a target ~30 days out is deliberately ABSENT (calm state).

   These mirror the exact response shapes of the route handlers in
   src/app/api/mountains/[slug]/*: the browse detail nests {mountain,conditions,satellite,
   weather,nwac,snotel,stale}; /weather returns a bare CombinedForecastBlob; /snapshots an
   array of WeatherSnapshot; /snotel SnotelData; /nwac NwacForecast; /satellite SatelliteCache. */
import type {
  CombinedForecastBlob,
  ModelSeries,
  WeatherSnapshot,
  ModelDaySummary,
  SnotelData,
  NwacForecast,
  SatelliteCache,
  MountainConditions,
} from "@/lib/types";
import { MOUNTAINS } from "@/lib/mountains-data";

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const addDays = (base: Date, n: number): Date => {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

const NOW = new Date();
export const TODAY = iso(NOW);
/** ~3 days out — within the 7-day forecast window ⇒ focused IN-RANGE. */
export const TARGET_IN_RANGE = iso(addDays(NOW, 3));
/** ~30 days out — far beyond the forecast window ⇒ calm "tracking begins" state. */
export const TARGET_OUT_OF_RANGE = iso(addDays(NOW, 30));

/** Seven calendar days starting today (local-ish; we use the UTC date string as the day key). */
export const FORECAST_DAYS: string[] = Array.from({ length: 7 }, (_, i) => iso(addDays(NOW, i)));

/** Build a per-day, per-hour ModelSeries spanning FORECAST_DAYS at 3-hour resolution.
 *  `horizonDays` lets HRRR null-pad past ~2 days (mirrors the real ~48h value horizon). */
function buildSeries(opts: {
  available: boolean;
  horizonDays?: number; // hours with real values only for days [0, horizonDays)
  freezing?: number | null; // freezing-level value (ft) or null (ECMWF-style: no FL)
  baseTemp?: number;
}): ModelSeries {
  const { available, horizonDays = FORECAST_DAYS.length, freezing = 11000, baseTemp = 40 } = opts;
  const time: string[] = [];
  const dayIndex: number[] = [];
  FORECAST_DAYS.forEach((d, di) => {
    for (let h = 0; h < 24; h += 3) {
      time.push(`${d}T${String(h).padStart(2, "0")}:00`);
      dayIndex.push(di);
    }
  });
  const within = (i: number): boolean => dayIndex[i] < horizonDays;
  const fill = <T,>(fn: (i: number) => T, nullPast: boolean): (T | null)[] =>
    time.map((_, i) => (nullPast && !within(i) ? null : fn(i)));

  return {
    available,
    time,
    temperature_2m: fill((i) => baseTemp + (Number(time[i].slice(11, 13)) - 12) * 0.5, true),
    apparent_temperature: fill((i) => baseTemp - 4, true),
    wind_speed_10m: fill(() => 12, true),
    wind_gusts_10m: fill(() => 24, true),
    wind_direction_10m: fill(() => 230, true),
    precipitation: fill(() => 0.0, true),
    precipitation_probability: fill(() => 10, true),
    snowfall: fill(() => 0.0, true),
    freezing_level_height: fill(() => freezing as number, true),
    cloud_cover: fill(() => 30, true),
    visibility: fill(() => 50000, true),
    weather_code: fill(() => 1, true),
    temp_base_f: fill(() => baseTemp + 8, true),
    temp_mid_f: fill(() => baseTemp - 6, true),
    temp_summit_f: fill(() => baseTemp - 18, true),
  };
}

export function buildBlob(slug: string): CombinedForecastBlob {
  return {
    mountainId: slug,
    timezone: "America/Los_Angeles",
    fetchedAt: NOW.toISOString(),
    // HRRR carries real values only for the first ~2 days, then null-pads (realistic).
    hrrr: buildSeries({ available: true, horizonDays: 2, freezing: 10800, baseTemp: 41 }),
    gfs: buildSeries({ available: true, freezing: 11200, baseTemp: 40 }),
    // ECMWF: no freezing-level field (all null), distinct temps to surface model spread.
    ecmwf: buildSeries({ available: true, freezing: null, baseTemp: 37 }),
  };
}

function daySummary(over: Partial<ModelDaySummary> = {}): ModelDaySummary {
  return {
    available: true,
    summitHighF: 24,
    summitLowF: 12,
    summitMaxWindMph: 28,
    summitMaxSustainedWindMph: 18,
    summitPrecipIn: 0.0,
    freezingLevelFtNoon: 11000,
    snowfallIn: 0,
    ...over,
  };
}

/** Snapshots whose model day-maps cover FORECAST_DAYS (so the evolution chart for an
 *  in-range target plots points), but never the out-of-range (+30d) date. */
export function buildSnapshots(): WeatherSnapshot[] {
  const dayMap = (jitter: number) =>
    Object.fromEntries(
      FORECAST_DAYS.map((d, i) => [
        d,
        daySummary({ summitHighF: 24 + jitter + i, summitMaxWindMph: 28 - jitter }),
      ]),
    );
  // Newest first (route returns fetchedAt desc).
  return [0, 1, 2].map((k) => ({
    id: `snap-${k}`,
    fetchedAt: addDays(NOW, -k).toISOString(),
    models: {
      hrrr: k === 0 ? dayMap(2) : {},
      gfs: dayMap(k),
      ecmwf: dayMap(-k),
    },
  }));
}

export function buildSnotel(slug: string): SnotelData {
  const m = MOUNTAINS.find((x) => x.slug === slug)!;
  const trend = Array.from({ length: 30 }, (_, i) => ({
    date: iso(addDays(NOW, -(29 - i))),
    snowDepthIn: 60 + i,
    sweIn: 20 + i * 0.3,
    sweMedianIn: 25,
    percentOfMedian: 90 + i,
    tempMaxF: 38,
    tempMinF: 22,
    precipAccumIn: 30 + i * 0.2,
  }));
  return {
    stationId: m.snotelStationId,
    stationTriplet: m.snotelStationTriplet,
    stationName: m.snotelStationName,
    elevationFt: 5400,
    lat: m.lat,
    lng: m.lng,
    current: trend[trend.length - 1],
    trend,
  };
}

export function buildNwac(slug: string): NwacForecast {
  const m = MOUNTAINS.find((x) => x.slug === slug)!;
  return {
    zoneId: m.nwacZoneId,
    zoneName: m.nwacZone,
    season: "winter",
    forecastDate: TODAY,
    publishedTime: NOW.toISOString(),
    expiresTime: addDays(NOW, 1).toISOString(),
    danger: {
      current: { upper: 3, middle: 2, lower: 2 },
      tomorrow: { upper: 2, middle: 2, lower: 1 },
    },
    problems: [
      {
        problemId: 1,
        name: "Wind Slab",
        likelihood: "Likely",
        sizeMin: "1",
        sizeMax: "2",
        aspects: {
          upper: { N: true, NE: true },
          middle: { N: true },
          lower: {},
        },
        description: "Recent wind has built fresh slabs on lee aspects near and above treeline.",
      },
    ],
    bottomLine: "Considerable danger up high on wind-loaded slopes. Choose conservative terrain.",
    hazardDiscussion: "Wind slabs are the primary concern at upper elevations.",
    weatherDiscussion: "Strong SW flow with periods of snow above 6000 ft.",
  };
}

export function buildSatellite(slug: string): SatelliteCache {
  const m = MOUNTAINS.find((x) => x.slug === slug)!;
  return {
    mountainId: slug,
    latestImageDate: iso(addDays(NOW, -2)),
    cloudCoverPercent: 8,
    tileUrlTemplate: "",
    tileSource: "sentinel-hub-wmts",
    attribution: "Contains modified Copernicus Sentinel-2 data 2026, processed by Sentinel Hub (CDSE)",
    boundingBox: { north: m.lat + 0.1, south: m.lat - 0.1, east: m.lng + 0.1, west: m.lng - 0.1 },
  };
}

export function buildConditions(slug: string): MountainConditions {
  return {
    mountainId: slug,
    forecastBlobPath: `dev/weather/${slug}/combined.json`,
    currentSummary: {
      targetDateHigh: 24,
      targetDateLow: 12,
      targetDateWind: 28,
      targetDatePrecip: 0,
      freezingLevelFt: 11000,
      precipType: "none",
      summaryModel: "gfs",
      tone: "good",
      verdict: "A clear, cold window with light winds — a strong day for the summit.",
      updatedAt: NOW.toISOString(),
    },
    updatedAt: NOW.toISOString(),
  };
}

/** The nested browse-detail response shape (GET /api/mountains/[slug]). */
export function buildBrowseDetail(slug: string) {
  const m = MOUNTAINS.find((x) => x.slug === slug)!;
  return {
    mountain: { ...m, slug },
    conditions: buildConditions(slug),
    satellite: buildSatellite(slug),
    weather: buildBlob(slug),
    nwac: buildNwac(slug),
    snotel: buildSnotel(slug),
    stale: false,
  };
}

/** The list response (GET /api/mountains): every real mountain, with its slug. */
export function buildMountainList() {
  return [...MOUNTAINS].sort((a, b) => a.name.localeCompare(b.name));
}

/** Terrain metadata (GET /api/mountains/{slug}/terrain/meta) — bbox ±0.06° about the peak,
 *  matching what build_terrain.py bakes. Used by the route-mocked 3D specs. */
export function buildTerrainMeta(slug: string) {
  const m = MOUNTAINS.find((x) => x.slug === slug) ?? MOUNTAINS[0];
  const span = 0.06;
  const centerLat = m.lat;
  const centerLng = m.lng;
  const summitM = m.elevations.summit * 0.3048;
  return {
    slug,
    bbox: {
      west: centerLng - span,
      east: centerLng + span,
      south: centerLat - span,
      north: centerLat + span,
    },
    centerLat,
    centerLng,
    metersPerDegLat: 111320,
    metersPerDegLng: 111320 * Math.cos((centerLat * Math.PI) / 180),
    minElevM: summitM - 3000,
    maxElevM: summitM,
    exaggeration: 1.6,
    summit: { lng: centerLng, lat: centerLat, elevM: summitM },
  };
}

// --- Safety / hazard fixtures (the 6 Phase-2A routes the Safety tab fetches). ---------

/** Air quality: a Moderate AQI (~80) with a 7-day {date,aqi} trend + AirNow provenance. */
export function buildAirQuality(_slug: string) {
  return {
    aqi: 80,
    categoryNumber: 2,
    categoryName: "Moderate",
    parameter: "PM2.5",
    reportingArea: "Enumclaw",
    trend: Array.from({ length: 7 }, (_, i) => ({
      date: iso(addDays(NOW, -(6 - i))),
      aqi: 55 + i * 4,
    })),
    provenance: { source: "AirNow", observedAt: NOW.toISOString(), distanceMi: 22, note: "Enumclaw reporting area" },
  };
}

/** Storm: a quiet (no active warning) state — deterministic across all peers. */
export function buildStormAlerts(_slug: string) {
  return {
    nws: [],
    spc: null,
    stormActive: false,
    provenance: { source: "NWS + SPC", observedAt: NOW.toISOString() },
  };
}

/** Volcano: GREEN / NORMAL (only mocked for peaks carrying a hansVolcanoId). */
export function buildVolcano(slug: string) {
  const m = MOUNTAINS.find((x) => x.slug === slug);
  return {
    name: m?.name ?? slug,
    colorCode: "GREEN",
    alertLevel: "NORMAL",
    nvewsThreat: "Very High Threat",
    noticeUrl: null,
    provenance: { source: "USGS HANS", observedAt: NOW.toISOString() },
  };
}

/** Seismic: ~11 quakes in 30 days incl. one recent; no swarm.
 *  Each event carries lng/lat (from ComCat geometry.coordinates) for earthquake map markers. */
export function buildSeismic(slug: string) {
  const m = MOUNTAINS.find((x) => x.slug === slug) ?? MOUNTAINS[0];
  const events = Array.from({ length: 11 }, (_, i) => ({
    mag: 1.8 - i * 0.1,
    place: `${5 + i} km from ${slug}`,
    time: addDays(NOW, -i).toISOString(),
    depthKm: 4 + i,
    lng: m.lng + (i - 5) * 0.01,
    lat: m.lat + (i - 5) * 0.01,
    type: "earthquake",
    status: "reviewed",
  }));
  return {
    count30d: 11,
    count7d: 3,
    largestMag: 1.8,
    swarm: false,
    events,
    provenance: { source: "USGS ComCat", observedAt: NOW.toISOString(), note: "within ~30 km" },
  };
}

/** Park alerts: a Closure + a Caution (only mocked for peaks carrying an npsParkCode). */
export function buildParkAlerts(slug: string) {
  const m = MOUNTAINS.find((x) => x.slug === slug);
  const parkCode = m?.npsParkCode ?? "mora";
  return {
    alerts: [
      { category: "Closure", title: "Westside Road closed at Dry Creek", description: "Washout — no vehicle access.", url: "https://www.nps.gov/mora/a", parkCode, lastIndexedDate: iso(addDays(NOW, -1)) },
      { category: "Caution", title: "Black bear activity near Paradise", description: "Store food properly.", url: "https://www.nps.gov/mora/b", parkCode, lastIndexedDate: iso(addDays(NOW, -2)) },
    ],
    provenance: { source: "NPS", observedAt: NOW.toISOString() },
  };
}

/** Hazards summary: a Moderate AQI chip + an inactive storm (drives the header chips). */
export function buildHazardsSummary(_slug: string) {
  return {
    aqi: { value: 80, category: "Moderate" },
    storm: { active: false, label: "No active storm" },
    provenance: { source: "AirNow + NWS", observedAt: NOW.toISOString(), distanceMi: 22 },
  };
}

/** A 1×1 transparent PNG (smallest valid image) for /satellite/image in local mode. */
export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ---------------------------------------------------------------------------
// Geo-layer fixtures (Phase 3B) — GeoJSON FeatureCollections for the 4 cached
// geo routes: trails, roads, wilderness, rec-sites.
// ---------------------------------------------------------------------------

function fc(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: "FeatureCollection", features };
}

/** Two LineString trail segments (sac_scale + name). */
export function buildTrails(slug: string): GeoJSON.FeatureCollection {
  const m = MOUNTAINS.find((x) => x.slug === slug) ?? MOUNTAINS[0];
  const { lat, lng } = m;
  return fc([
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[lng - 0.01, lat - 0.01], [lng, lat]] },
      properties: { name: "Summit Trail", sac_scale: "hiking" },
    },
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[lng, lat], [lng + 0.01, lat + 0.01]] },
      properties: { name: "Ridge Route", sac_scale: "mountain_hiking" },
    },
  ]);
}

/** Three LineString road segments — ONE with closed:true, TWO with closed:false. */
export function buildRoads(slug: string): GeoJSON.FeatureCollection {
  const m = MOUNTAINS.find((x) => x.slug === slug) ?? MOUNTAINS[0];
  const { lat, lng } = m;
  return fc([
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[lng - 0.02, lat - 0.02], [lng - 0.01, lat - 0.01]] },
      properties: { name: "Forest Road 123", closed: false, status: "open" },
    },
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[lng - 0.01, lat - 0.01], [lng, lat - 0.005]] },
      properties: { name: "Forest Road 456", closed: true, status: "closed" },
    },
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[lng, lat - 0.005], [lng + 0.01, lat]] },
      properties: { name: "Forest Road 789", closed: false, status: "open" },
    },
  ]);
}

/** One Polygon wilderness area. */
export function buildWilderness(slug: string): GeoJSON.FeatureCollection {
  const m = MOUNTAINS.find((x) => x.slug === slug) ?? MOUNTAINS[0];
  const { lat, lng } = m;
  const d = 0.05;
  return fc([
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]]],
      },
      properties: { name: `${m.name} Wilderness` },
    },
  ]);
}

/** Two Point rec-site/trailhead features. */
export function buildRecSites(slug: string): GeoJSON.FeatureCollection {
  const m = MOUNTAINS.find((x) => x.slug === slug) ?? MOUNTAINS[0];
  const { lat, lng } = m;
  return fc([
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng - 0.015, lat - 0.015] },
      properties: { name: "Paradise Trailhead", closed: false },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [lng + 0.015, lat - 0.015] },
      properties: { name: "Camp Muir Staging Area", closed: false },
    },
  ]);
}
