// lib/forecast-select.ts — pure selectors adapting CombinedForecastBlob / WeatherSnapshot[]
// into the row/point shapes the P5 signature views consume. No fetch/DOM. (plan P5 Task 2)
import type { CombinedForecastBlob, ModelSeries, WeatherSnapshot } from "@/lib/types";
import type { Band } from "@/lib/band";

export type ModelKey = "hrrr" | "gfs" | "ecmwf";

/** A single hour adapted from ModelSeries parallel arrays at index i. fl is feet (§9). */
export interface HourRow {
  t: string; // ISO local stamp from ModelSeries.time[i]
  hour: number; // local hour 0-23 from t
  date: string; // t.slice(0,10)
  fl: number | null; // freezing_level_height[i] (feet)
  tempF: number; // temperature_2m[i] (°F, canonical) — num-coerced (0 for missing)
  tempFRaw: number | null; // temperature_2m[i] preserving null (for charts that break on gaps)
  windMph: number; // wind_speed_10m[i] (mph, canonical) — num-coerced
  windMphRaw: number | null; // wind_speed_10m[i] preserving null (for chart gaps)
  gustMph: number; // wind_gusts_10m[i]
  precipIn: number; // precipitation[i]
  pop: number; // precipitation_probability[i]
  snowIn: number; // snowfall[i]
  code: number | null; // weather_code[i]
  bandTempF: Record<Band, number | null>; // {base, mid, summit}
}

const num = (v: number | null | undefined): number => v ?? 0;

/** Adapt one model's ModelSeries into HourRow[] (rows only where time is present). */
export function rowsFor(series: ModelSeries | null): HourRow[] {
  if (!series || series.available === false) return [];
  return series.time.map((t, i) => ({
    t,
    hour: new Date(t).getHours(),
    date: t.slice(0, 10),
    fl: series.freezing_level_height[i] ?? null,
    tempF: num(series.temperature_2m[i]),
    tempFRaw: series.temperature_2m[i] ?? null,
    windMph: num(series.wind_speed_10m[i]),
    windMphRaw: series.wind_speed_10m[i] ?? null,
    gustMph: num(series.wind_gusts_10m[i]),
    precipIn: num(series.precipitation[i]),
    pop: num(series.precipitation_probability[i]),
    snowIn: num(series.snowfall[i]),
    code: series.weather_code[i] ?? null,
    bandTempF: {
      base: series.temp_base_f[i] ?? null,
      mid: series.temp_mid_f[i] ?? null,
      summit: series.temp_summit_f[i] ?? null,
    },
  }));
}

/** Rows for one model filtered to a target ISO date (YYYY-MM-DD). */
export function targetRows(series: ModelSeries | null, targetDate: string): HourRow[] {
  return rowsFor(series).filter((r) => r.date === targetDate);
}

/** Model precedence for the calm-layer hero/strip: HRRR if it has target rows, else GFS, else ECMWF. */
export function chooseTargetModel(blob: CombinedForecastBlob, targetDate: string): ModelKey {
  if (targetRows(blob.hrrr, targetDate).length) return "hrrr";
  if (targetRows(blob.gfs, targetDate).length) return "gfs";
  return "ecmwf";
}

/** Model for the freezing-level cross-section: first of HRRR→GFS→ECMWF whose target
 *  rows carry a non-null freezing level. HRRR null-pads >48h and ECMWF has no FL field,
 *  so this falls through to the model that actually has freezing data (else null). */
export function chooseFreezingModel(
  blob: CombinedForecastBlob,
  targetDate: string,
): ModelKey | null {
  const keys: ModelKey[] = ["hrrr", "gfs", "ecmwf"];
  for (const key of keys) {
    const rows = targetRows(blob[key], targetDate);
    if (rows.some((r) => r.fl != null)) return key;
  }
  return null;
}

/** Human label, e.g. "HRRR · 3 km", "GFS · 25 km", "ECMWF · 9 km". */
export function modelLabel(key: ModelKey): string {
  const labels: Record<ModelKey, string> = {
    hrrr: "HRRR · 3 km",
    gfs: "GFS · 25 km",
    ecmwf: "ECMWF · 9 km",
  };
  return labels[key];
}

/** Noon row for a target day (hour===12) else the middle row; null if no rows. */
export function noonRow(rows: HourRow[]): HourRow | null {
  if (!rows.length) return null;
  return rows.find((r) => r.hour === 12) ?? rows[Math.floor(rows.length / 2)];
}

/** Featured time-of-day for the freezing hero. */
export type TimeOfDay = "dawn" | "midday" | "pm";
const TOD_HOUR: Record<TimeOfDay, number> = { dawn: 6, midday: 12, pm: 17 };

/** The available hour nearest the requested time of day (dawn=6/midday=12/pm=17); null if no rows. */
export function representativeRow(rows: HourRow[], tod: TimeOfDay): HourRow | null {
  if (rows.length === 0) return null;
  const want = TOD_HOUR[tod];
  return rows.reduce(
    (best, r) => (Math.abs(r.hour - want) < Math.abs(best.hour - want) ? r : best),
    rows[0],
  );
}

/** Per-model target-day summit-high in °F (max temp_summit_f over the day); null if unavailable. */
export function targetDayHigh(
  blob: CombinedForecastBlob,
  targetDate: string,
  key: ModelKey,
): number | null {
  const rows = targetRows(blob[key], targetDate);
  const highs = rows.map((r) => r.bandTempF.summit).filter((v): v is number => v != null);
  return highs.length ? Math.max(...highs) : null;
}

/** Max−min across available models of a target-day metric; 0 with <2 models. */
export function modelSpread(
  blob: CombinedForecastBlob,
  targetDate: string,
  extractor: (b: CombinedForecastBlob, k: ModelKey, d: string) => number | null,
): number {
  const keys: ModelKey[] = ["hrrr", "gfs", "ecmwf"];
  const vals = keys
    .map((k) => extractor(blob, k, targetDate))
    .filter((v): v is number => v != null);
  return vals.length > 1 ? Math.max(...vals) - Math.min(...vals) : 0;
}

/** Evolution point for a model+variable at the target date from one snapshot. */
export interface EvoPoint {
  x: number;
  y: number;
}
export type EvoVar = "high" | "wind" | "freezing" | "precip";

const EVO_FIELD: Record<EvoVar, keyof import("@/lib/types").ModelDaySummary> = {
  high: "summitHighF",
  wind: "summitMaxWindMph",
  freezing: "freezingLevelFtNoon",
  precip: "summitPrecipIn",
};

/** Evolution points for a model+variable at a target date (oldest→newest).
 *  Each snapshot stores per-day summaries; we look up `targetDate` in the model's day
 *  map and emit one point per snapshot that predicted that date. Snapshots without the
 *  date (target outside that snapshot's window) are skipped. x indexes the kept points
 *  in time order; the boundary point of x-aligned dates is preserved by the chart. */
export function evoPoints(
  snaps: WeatherSnapshot[],
  key: ModelKey,
  variable: EvoVar,
  targetDate: string,
): EvoPoint[] {
  const field = EVO_FIELD[variable];
  // §7 returns fetchedAt desc; reverse to oldest→newest before plotting.
  const ordered = [...snaps].reverse();
  const pts: EvoPoint[] = [];
  ordered.forEach((s, i) => {
    const day = s.models[key]?.[targetDate];
    if (!day || !day.available) return;
    const y = day[field] as number | null; // EVO_FIELD maps only to numeric fields
    if (y == null) return;
    pts.push({ x: i, y });
  });
  return pts;
}

const ALL_MODELS: ModelKey[] = ["hrrr", "gfs", "ecmwf"];

/** Whole days from a snapshot's issue date (fetchedAt) to the target date (UTC, floored). */
function leadDays(fetchedAt: string, targetDate: string): number {
  const issued = new Date(fetchedAt);
  const issuedUtc = Date.UTC(issued.getUTCFullYear(), issued.getUTCMonth(), issued.getUTCDate());
  const target = new Date(`${targetDate}T00:00:00Z`).getTime();
  return Math.floor((target - issuedUtc) / 86_400_000);
}

/** One snapshot's cross-model envelope for the target date. `lead` = whole days from
 *  the snapshot's issue date to the target. A narrowing min..max band over lead time
 *  means the models are converging — the call is settling. */
export interface ConvergenceRun {
  lead: number;
  min: number;
  max: number;
  mid: number;
}

/** One cross-model min/max/mid run PER DISTINCT LEAD DAY, oldest→newest. Snapshots are
 *  pulled hourly, so ~20 share each integer lead; the chart plots X by lead, so we keep a
 *  single representative per lead — the NEWEST issuance at that lead (its latest forecast)
 *  — otherwise the points pile up at one x and the band renders as a blocky smear.
 *  Reuses EVO_FIELD; skips models with no/unavailable value; drops snapshots with no model data. */
export function convergenceRuns(
  snaps: WeatherSnapshot[],
  variable: EvoVar,
  targetDate: string,
): ConvergenceRun[] {
  const field = EVO_FIELD[variable];
  const ordered = [...snaps].reverse(); // §7 fetchedAt desc → oldest→newest
  const byLead = new Map<number, ConvergenceRun>();
  for (const s of ordered) {
    const vals: number[] = [];
    for (const key of ALL_MODELS) {
      const day = s.models[key]?.[targetDate];
      if (!day || !day.available) continue;
      const v = day[field] as number | null;
      if (v == null) continue;
      vals.push(v);
    }
    if (vals.length === 0) continue;
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const lead = leadDays(s.fetchedAt, targetDate);
    // iterating oldest→newest, so the last write per lead is the newest issuance
    byLead.set(lead, { lead, min, max, mid: (min + max) / 2 });
  }
  return [...byLead.values()].sort((a, b) => b.lead - a.lead); // largest lead (oldest) → 0 (now)
}

/** Compare the most-recent run's spread (max−min) to the mean spread of the earlier runs.
 *  `firming` = the band has stopped widening (recentSpread <= earlierSpread). */
export function convergenceVerdict(runs: ConvergenceRun[]): {
  firming: boolean;
  recentSpread: number;
  earlierSpread: number;
} {
  if (runs.length === 0) return { firming: false, recentSpread: 0, earlierSpread: 0 };
  const last = runs[runs.length - 1];
  const recentSpread = last.max - last.min;
  const earlier = runs.slice(0, -1);
  const earlierSpread =
    earlier.length === 0
      ? 0
      : earlier.reduce((acc, r) => acc + (r.max - r.min), 0) / earlier.length;
  return { firming: recentSpread <= earlierSpread, recentSpread, earlierSpread };
}

/** Max range (canonical units) within which a model counts as "settled" per variable.
 *  Tunable in one place. Temp ±2°F, Wind ±5mph, Freezing ±500ft, Precip ±0.1in. */
export const STABILITY_MAX_RANGE: Record<EvoVar, number> = {
  high: 4,
  wind: 10,
  freezing: 1000,
  precip: 0.2,
};

export interface ModelStability {
  min: number | null;
  max: number | null;
  range: number | null; // max−min in canonical units; null with <2 values in the window
  settled: boolean;
  count: number;
}

/** How much one model's target-day prediction has moved over the last 3 snapshots.
 *  snaps are fetchedAt desc (§7), so the window is the newest 3 (`slice(0, 3)`). Among those,
 *  the available, non-null target-day values are collected; range = max−min. With <2 values the
 *  result is "insufficient history" (range null, not settled). Callers convert min/max for
 *  display so the shown delta is unit-correct without affine-offset bugs. */
export function modelStability(
  snaps: WeatherSnapshot[],
  key: ModelKey,
  variable: EvoVar,
  targetDate: string,
): ModelStability {
  const field = EVO_FIELD[variable];
  const vals: number[] = [];
  for (const s of snaps.slice(0, 3)) {
    const day = s.models[key]?.[targetDate];
    if (!day || !day.available) continue;
    const v = day[field] as number | null;
    if (v == null) continue;
    vals.push(v);
  }
  if (vals.length < 2) {
    return { min: null, max: null, range: null, settled: false, count: vals.length };
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  return { min, max, range, settled: range <= STABILITY_MAX_RANGE[variable], count: vals.length };
}

export interface EvoEnvelopePoint {
  x: number; // reversed (oldest→newest) snapshot index — aligns with evoPoints' x
  min: number;
  max: number;
}

/** Cross-model min..max envelope for the target date at each snapshot, oldest→newest.
 *  x is the absolute index in the reversed snapshot order (the same index evoPoints emits),
 *  so the band aligns with the per-model lines. Snapshots with no available model value are
 *  skipped. A band narrowing left→right means the models are converging. */
export function evoEnvelope(
  snaps: WeatherSnapshot[],
  variable: EvoVar,
  targetDate: string,
): EvoEnvelopePoint[] {
  const field = EVO_FIELD[variable];
  const ordered = [...snaps].reverse(); // §7 fetchedAt desc → oldest→newest
  const pts: EvoEnvelopePoint[] = [];
  ordered.forEach((s, i) => {
    const vals: number[] = [];
    for (const key of ALL_MODELS) {
      const day = s.models[key]?.[targetDate];
      if (!day || !day.available) continue;
      const v = day[field] as number | null;
      if (v == null) continue;
      vals.push(v);
    }
    if (vals.length === 0) return;
    pts.push({ x: i, min: Math.min(...vals), max: Math.max(...vals) });
  });
  return pts;
}

export interface ModelLeadPoint {
  lead: number;
  value: number;
}

/** One model's target-day prediction per distinct lead day, oldest→newest (largest lead → 0).
 *  Mirrors convergenceRuns' collapsing: snapshots are hourly, so we keep the NEWEST issuance per
 *  integer lead. Used to draw the per-model lines under the consumer convergence band. */
export function modelLeadSeries(
  snaps: WeatherSnapshot[],
  key: ModelKey,
  variable: EvoVar,
  targetDate: string,
): ModelLeadPoint[] {
  const field = EVO_FIELD[variable];
  const ordered = [...snaps].reverse(); // oldest→newest so the last write per lead is the newest
  const byLead = new Map<number, ModelLeadPoint>();
  for (const s of ordered) {
    const day = s.models[key]?.[targetDate];
    if (!day || !day.available) continue;
    const v = day[field] as number | null;
    if (v == null) continue;
    const lead = leadDays(s.fetchedAt, targetDate);
    byLead.set(lead, { lead, value: v });
  }
  return [...byLead.values()].sort((a, b) => b.lead - a.lead);
}
