// lib/types.ts — canonical TS interfaces (interface-contract §9). Mirrors Firestore camelCase (§3).
export interface Elevations { base: number; mid: number; summit: number }
export interface Mountain {
  slug: string; name: string; lat: number; lng: number; elevations: Elevations;
  nwacZone: string; nwacZoneId: string; snotelStationId: string;
  snotelStationTriplet: string; snotelStationName: string;
  region: string; timezone: string; description: string;
  /** Phase 2 hazard gating (optional; empty/absent ⇒ that Safety panel is unavailable for this peak). */
  hansVolcanoId?: string; // HANS volcano id, e.g. "wa6"; omitted for non-volcanoes
  npsParkCode?: string;   // NPS park code, e.g. "mora"; omitted if not inside a National Park
  airnowHint?: string;    // optional preferred AirNow reporting area; omitted to use nearest by lat/lng
  /** Phase 3 map / logistics fields (optional; empty/absent ⇒ UI degrades gracefully). */
  mapBbox?: { west: number; south: number; east: number; north: number }; // ±0.08° box around summit
  webcams?: { id: string; label: string; source: string; url: string; seasonal?: boolean }[]; // populated in Task 6
  permits?: { label: string; url: string; note?: string }[]; // required access permits/passes
  usfsForestName?: string; // USFS National Forest name (omitted for NP-only or out-of-region peaks)
}
export interface CurrentSummary {
  targetDateHigh: number; targetDateLow: number; targetDateWind: number;
  targetDatePrecip: number; freezingLevelFt: number;
  precipType: 'snow' | 'rain' | 'mixed' | 'none'; summaryModel: 'hrrr' | 'gfs' | 'ecmwf';
  tone: 'good' | 'caution' | 'alert'; verdict: string;
  updatedAt: string;
}
export interface AvalancheSummary {
  dangerUpper: number; dangerMiddle: number; dangerLower: number;
  bottomLine: string; forecastDate: string; season: 'winter' | 'summer'; updatedAt: string;
}
export interface SnowpackSummary {
  snowDepthIn: number; sweIn: number; percentOfMedian: number;
  stationName: string; updatedAt: string;
}
export interface MountainConditions {
  mountainId: string; forecastBlobPath: string;
  currentSummary: CurrentSummary; updatedAt: string;
}
export interface ModelSeries {
  available: boolean; time: string[];
  temperature_2m: (number | null)[]; apparent_temperature: (number | null)[];
  wind_speed_10m: (number | null)[]; wind_gusts_10m: (number | null)[];
  wind_direction_10m: (number | null)[]; precipitation: (number | null)[];
  precipitation_probability: (number | null)[]; snowfall: (number | null)[];
  freezing_level_height: (number | null)[]; cloud_cover: (number | null)[];
  visibility: (number | null)[]; weather_code: (number | null)[];
  temp_base_f: (number | null)[]; temp_mid_f: (number | null)[]; temp_summit_f: (number | null)[];
}
export interface CombinedForecastBlob {
  mountainId: string; timezone: string;
  fetchedAt: string; hrrr: ModelSeries | null; gfs: ModelSeries | null; ecmwf: ModelSeries | null;
}
export interface WeatherSnapshot {
  id: string; fetchedAt: string;
  // Per-model, per-day summaries for all forecast days (date "YYYY-MM-DD" → summary).
  // Lets the frontend reconstruct the predicted conditions for any chosen target date.
  models: { hrrr: ModelDayMap; gfs: ModelDayMap; ecmwf: ModelDayMap };
}
export type ModelDayMap = Record<string, ModelDaySummary>;
export interface ModelDaySummary {
  available: boolean; summitHighF: number | null;
  summitLowF: number | null; summitMaxWindMph: number | null;
  summitMaxSustainedWindMph: number | null; summitPrecipIn: number | null;
  freezingLevelFtNoon: number | null; snowfallIn: number | null;
}
export interface NwacForecast {
  zoneId: string; zoneName: string; season: 'winter' | 'summer';
  forecastDate: string; publishedTime: string; expiresTime: string;
  danger: { current: NwacDanger; tomorrow: NwacDanger }; problems: NwacProblem[];
  bottomLine: string; hazardDiscussion: string; weatherDiscussion: string;
}
export interface NwacDanger { upper: number; middle: number; lower: number }
export interface NwacProblem {
  problemId: number; name: string; likelihood: string;
  sizeMin: string; sizeMax: string;
  aspects: Record<'upper' | 'middle' | 'lower', Record<string, boolean>>; description: string;
}
export interface SnotelReading {
  date: string; snowDepthIn: number | null; sweIn: number | null;
  sweMedianIn: number | null; percentOfMedian: number | null; tempMaxF: number | null;
  tempMinF: number | null; precipAccumIn: number | null;
}
export interface SnotelData {
  stationId: string; stationTriplet: string; stationName: string;
  elevationFt: number; lat: number; lng: number; current: SnotelReading; trend: SnotelReading[];
}
export interface SatelliteCache {
  mountainId: string; latestImageDate: string | null;
  cloudCoverPercent: number | null; tileUrlTemplate: string;
  tileSource: 'eox-s2cloudless' | 'sentinel-hub-wmts'; attribution: string;
  boundingBox: { north: number; south: number; east: number; west: number };
}
