import "server-only";
import { fetchJson, haversineMiles } from "./fetch";
import type { AirQuality, StormAlerts, StormAlert } from "./types";

// ---------------------------------------------------------------------------
// AirNow helpers
// ---------------------------------------------------------------------------

interface AirNowRecord {
  DateObserved: string;
  HourObserved: number;
  ReportingArea: string;
  Latitude: number;
  Longitude: number;
  ParameterName: string;
  AQI: number;
  Category: { Number: number; Name: string };
}

function pickHighest(records: AirNowRecord[]): AirNowRecord | undefined {
  if (!records.length) return undefined;
  return records.reduce((best, r) => (r.AQI > best.AQI ? r : best));
}

/**
 * Fetch the AirNow current observation nearest to (lat, lng) and return the
 * highest-AQI record with provenance.  Returns `null` when no monitor data.
 */
export async function airNowCurrent(
  lat: number,
  lng: number,
  key: string,
): Promise<AirQuality | null> {
  const currentUrl =
    `https://www.airnowapi.org/aq/observation/latLong/current/` +
    `?format=application/json&latitude=${lat}&longitude=${lng}&distance=50&API_KEY=${key}`;

  const current = await fetchJson<AirNowRecord[]>(currentUrl);
  if (!current.length) return null;

  const best = pickHighest(current)!;
  const distanceMi = haversineMiles(lat, lng, best.Latitude, best.Longitude);
  const observedAt = `${best.DateObserved.trim()}T${String(best.HourObserved).padStart(2, "0")}:00:00`;

  return {
    aqi: best.AQI,
    categoryNumber: best.Category.Number,
    categoryName: best.Category.Name,
    parameter: best.ParameterName,
    reportingArea: best.ReportingArea,
    trend: [], // populated by the full air-quality route
    provenance: {
      source: "AirNow",
      observedAt,
      distanceMi,
      note: `${best.ReportingArea} reporting area`,
    },
  };
}

// ---------------------------------------------------------------------------
// NWS + SPC helpers
// ---------------------------------------------------------------------------

// SPC label severity rank — ascending order (TSTM is lowest, HIGH is highest)
const SPC_RANK: Record<string, number> = {
  TSTM: 1,
  MRGL: 2,
  SLGT: 3,
  ENH: 4,
  MDT: 5,
  HIGH: 6,
};

// NWS events that trigger stormActive regardless of SPC
const STORM_ACTIVE_EVENTS = new Set([
  "Severe Thunderstorm Warning",
  "Severe Thunderstorm Watch",
  "Tornado Warning",
]);

interface NwsFeature {
  properties: {
    event: string;
    severity: string;
    urgency: string;
    headline: string;
    onset: string | null;
    expires: string | null;
    areaDesc: string;
  };
}

interface SpcFeature {
  properties: { label: string; label2: string; fill: string };
}

/**
 * Fetch NWS active alerts + SPC Day-1 categorical for (lat, lng).
 * SPC failure degrades gracefully to `spc: null`.
 */
export async function stormAlerts(lat: number, lng: number): Promise<StormAlerts> {
  const contact =
    process.env.NWS_CONTACT ?? "MountainWeatherman/1.0 (+https://github.com/mountain-weatherman)";

  const nwsUrl = `https://api.weather.gov/alerts/active?point=${lat},${lng}`;
  const nwsData = await fetchJson<{ features: NwsFeature[] }>(nwsUrl, {
    headers: { "User-Agent": contact },
  });

  const nws: StormAlert[] = nwsData.features.map((f) => ({
    event: f.properties.event,
    severity: f.properties.severity,
    urgency: f.properties.urgency,
    headline: f.properties.headline,
    onset: f.properties.onset,
    expires: f.properties.expires,
    areaDesc: f.properties.areaDesc,
  }));

  let spc: { label: string; label2: string } | null = null;
  try {
    const spcUrl =
      `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query` +
      `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects` +
      `&inSR=4326&outFields=*&f=geojson`;
    const spcData = await fetchJson<{ features: SpcFeature[] }>(spcUrl);

    if (spcData.features.length > 0) {
      const best = spcData.features.reduce((top, f) => {
        const topRank = SPC_RANK[top.properties.label] ?? 0;
        const fRank = SPC_RANK[f.properties.label] ?? 0;
        return fRank > topRank ? f : top;
      });
      spc = { label: best.properties.label, label2: best.properties.label2 };
    }
  } catch {
    spc = null;
  }

  const nwsStormActive = nws.some((a) => STORM_ACTIVE_EVENTS.has(a.event));
  const spcStormActive = spc !== null && (SPC_RANK[spc.label] ?? 0) >= SPC_RANK["ENH"];
  const stormActive = nwsStormActive || spcStormActive;

  return {
    nws,
    spc,
    stormActive,
    provenance: {
      source: "NWS + SPC",
      observedAt: new Date().toISOString(),
    },
  };
}
