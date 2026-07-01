/* derive.ts — pure, unit-agnostic numeric helpers that turn a ModelSeries
   (parallel arrays aligned to series.time, local "YYYY-MM-DDTHH:00") into the
   Daily / AM·Mid·PM / Hourly cells the DailyOutlook renders.
   Ported from the prototype app/detail.jsx DailyOutlook + app/data.js aggregation. */
import type { ModelSeries } from "@/lib/types";

export type Band = "base" | "mid" | "summit";

export interface Cell {
  key: string;
  label: string;
  sub?: string;
  isTarget: boolean;
  single?: boolean;
  src?: "HRRR" | "GFS";
  hi: number | null;
  lo: number | null;
  hasTemp: boolean;
  windDir: number | null;
  feelsLike: number | null;
  wind: number;
  gust: number;
  precip: number;
  snow: number;
  pop: number;
  code: number;
}

export type Level = "day" | "period" | "hour";

export interface Group {
  label: string;
  span: number;
  isTarget: boolean;
  dateKey: string;
  level: Level;
  canPeriod: boolean;
  canHour: boolean;
}

const LEVEL_RANK: Record<Level, number> = { day: 0, period: 1, hour: 2 };

/** Whether the day strip fits its container (stretch with fr columns) or must
   scroll (fixed px columns). Used to keep the trend SVG width == grid width. */
export const gridWidthMode = (totalW: number, containerW: number): "stretch" | "scroll" =>
  totalW <= containerW ? "stretch" : "scroll";

/** The finer of two granularity levels (order day < period < hour). */
export function finerLevel(a: Level, b: Level): Level {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}

const num = (v: number | null | undefined): number => (v == null ? 0 : v);

/** Picks temp_<band>_f off a ModelSeries. */
export function bandTemps(s: ModelSeries, band: Band): (number | null)[] {
  if (band === "base") return s.temp_base_f;
  if (band === "mid") return s.temp_mid_f;
  return s.temp_summit_f;
}

/** The series to use for the hour at row `i`, by VALUE availability: HRRR when it
   has a real band temp there, else GFS, else null when neither has data. HRRR's
   time array is padded past its value horizon (~48h), so we must key on the value,
   not the timestamp — otherwise far hours pick HRRR and render empty "—" cells. */
export function hourSource(
  hrrr: ModelSeries | null,
  gfs: ModelSeries,
  band: Band,
  i: number,
): ModelSeries | null {
  if (hrrr && hrrr.available && hrrr.time[i] != null && bandTemps(hrrr, band)[i] != null) return hrrr;
  if (bandTemps(gfs, band)[i] != null) return gfs;
  return null;
}

/** Unique YYYY-MM-DD in time order. */
export function dayKeys(s: ModelSeries): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of s.time) {
    const d = t.slice(0, 10);
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

const hourOf = (iso: string): number => Number(iso.slice(11, 13));
const dayLabel = (d: string, opts: Intl.DateTimeFormatOptions): string =>
  new Date(`${d}T12:00:00`).toLocaleDateString("en-US", opts);
const hrLabel = (h: number): string =>
  h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`;

/** Aggregate a set of row indices into the numeric portion of a Cell. */
export function aggregate(
  s: ModelSeries,
  band: Band,
  indices: number[],
): Omit<Cell, "key" | "label" | "isTarget"> {
  const temps = bandTemps(s, band);
  // hi/lo from non-null band temps only — never coerce null→0
  const t = indices.map((i) => temps[i]).filter((v): v is number => v != null);
  const hasTemp = t.length > 0;
  // representative hour: noon (12:00) if present, else the middle row
  let repIdx = indices.find((i) => hourOf(s.time[i]) === 12);
  if (repIdx === undefined) repIdx = indices[Math.floor(indices.length / 2)];
  return {
    hi: hasTemp ? Math.max(...t) : null,
    lo: hasTemp ? Math.min(...t) : null,
    hasTemp,
    windDir: repIdx === undefined ? null : (s.wind_direction_10m[repIdx] ?? null),
    feelsLike: repIdx === undefined ? null : (s.apparent_temperature[repIdx] ?? null),
    wind: Math.max(0, ...indices.map((i) => num(s.wind_speed_10m[i]))),
    gust: Math.max(0, ...indices.map((i) => num(s.wind_gusts_10m[i]))),
    precip: indices.reduce((a, i) => a + num(s.precipitation[i]), 0),
    snow: indices.reduce((a, i) => a + num(s.snowfall[i]), 0),
    pop: Math.max(0, ...indices.map((i) => num(s.precipitation_probability[i]))),
    code: repIdx === undefined ? 0 : num(s.weather_code[repIdx]),
  };
}

const inTarget = (d: string, start: string, end: string): boolean => d >= start && d <= end;

/** One cell per day. */
export function dailyCells(
  s: ModelSeries,
  band: Band,
  targetStart: string,
  targetEnd: string,
): Cell[] {
  return dayKeys(s).map((d) => {
    const idx: number[] = [];
    s.time.forEach((t, i) => {
      if (t.slice(0, 10) === d) idx.push(i);
    });
    return {
      key: d,
      label: dayLabel(d, { weekday: "short" }),
      sub: dayLabel(d, { month: "short", day: "numeric" }),
      isTarget: inTarget(d, targetStart, targetEnd),
      ...aggregate(s, band, idx),
    };
  });
}

const PERIODS: [string, number, number][] = [
  ["Morning", 6, 12],
  ["Midday", 12, 18],
  ["Night", 18, 24],
];

/** Up to three period cells per day, plus per-day group headers. */
export function periodCells(
  s: ModelSeries,
  band: Band,
  targetStart: string,
  targetEnd: string,
): { cells: Cell[]; groups: Group[] } {
  const cells: Cell[] = [];
  const groups: Group[] = [];
  for (const d of dayKeys(s)) {
    const target = inTarget(d, targetStart, targetEnd);
    let span = 0;
    for (const [lbl, a0, b0] of PERIODS) {
      const idx: number[] = [];
      s.time.forEach((t, i) => {
        if (t.slice(0, 10) === d) {
          const h = hourOf(t);
          if (h >= a0 && h < b0) idx.push(i);
        }
      });
      if (!idx.length) continue;
      cells.push({
        key: d + lbl,
        label: lbl,
        isTarget: target,
        ...aggregate(s, band, idx),
      });
      span++;
    }
    if (span) {
      groups.push({
        label: dayLabel(d, { weekday: "short", month: "short", day: "numeric" }),
        span,
        isTarget: target,
        dateKey: d,
        level: "period",
        canPeriod: true,
        canHour: true,
      });
    }
  }
  return { cells, groups };
}

/** The hourly window [startIdx, endIdx) over gfs.time: starts at the first row
   >= nowIso (−1 if none), capped 48 rows. The SINGLE source of truth shared by
   hourlyCells and the canHour availability check in mixedCells. */
export function hourlyWindow(gfs: ModelSeries, nowIso: string): { startIdx: number; endIdx: number } {
  const startIdx = gfs.time.findIndex((t) => t >= nowIso);
  if (startIdx < 0) return { startIdx: -1, endIdx: -1 };
  return { startIdx, endIdx: Math.min(startIdx + 48, gfs.time.length) };
}

/** Next 48 hours from the first row >= now; HRRR row preferred, else GFS. */
export function hourlyCells(
  hrrr: ModelSeries | null,
  gfs: ModelSeries,
  band: Band,
  nowIso: string,
  targetStart: string,
  targetEnd: string,
): { cells: Cell[]; groups: Group[] } {
  const cells: Cell[] = [];
  const groups: Group[] = [];
  const { startIdx, endIdx } = hourlyWindow(gfs, nowIso);
  if (startIdx < 0) return { cells, groups };
  let curDay: string | null = null;
  for (let i = startIdx; i < endIdx; i++) {
    const series = hourSource(hrrr, gfs, band, i);
    if (!series) continue;
    const useHrrr = series === hrrr;
    const t = series.time[i];
    if (!t) continue;
    const d = t.slice(0, 10);
    const h = hourOf(t);
    cells.push({
      key: String(i),
      label: hrLabel(h),
      isTarget: inTarget(d, targetStart, targetEnd),
      single: true,
      src: useHrrr ? "HRRR" : "GFS",
      ...aggregate(series, band, [i]),
    });
    if (d !== curDay) {
      groups.push({
        label: dayLabel(d, { weekday: "short", month: "short", day: "numeric" }),
        span: 1,
        isTarget: inTarget(d, targetStart, targetEnd),
        dateKey: d,
        level: "hour",
        canPeriod: true,
        canHour: true,
      });
      curDay = d;
    } else {
      groups[groups.length - 1].span++;
    }
  }
  return { cells, groups };
}

/** Initial per-day overrides: when targetStart is ≤48h after nowIso, seed the
   target day + the two prior days to "period" (only days present in the series);
   otherwise {}. */
export function dayLevelDefaults(
  gfs: ModelSeries,
  nowIso: string,
  targetStart: string,
  _targetEnd: string,
): Record<string, Level> {
  const now = new Date(`${nowIso}:00`.slice(0, 19));
  const start = new Date(`${targetStart}T00:00:00`);
  const hoursOut = (start.getTime() - now.getTime()) / 3_600_000;
  if (hoursOut > 48) return {};
  const present = new Set(dayKeys(gfs));
  const out: Record<string, Level> = {};
  for (let back = 0; back <= 2; back++) {
    const d = new Date(start);
    d.setDate(d.getDate() - back);
    const key = d.toISOString().slice(0, 10);
    if (present.has(key)) out[key] = "period";
  }
  return out;
}

/** Per-day mixed-granularity strip: each day in dayKeys(gfs) is rendered at the
   level returned by levelFor(dateKey) — one daily cell, its ≤3 AM·Mid·PM period
   cells, or its hourly cells (HRRR row preferred when available, else GFS). The
   null-aware hasTemp behavior is preserved so the ribbon breaks on gaps. */
export function mixedCells(
  hrrr: ModelSeries | null,
  gfs: ModelSeries,
  band: Band,
  _nowIso: string,
  targetStart: string,
  targetEnd: string,
  levelFor: (dateKey: string) => Level,
): { cells: Cell[]; groups: Group[] } {
  const cells: Cell[] = [];
  const groups: Group[] = [];
  for (const d of dayKeys(gfs)) {
    const target = inTarget(d, targetStart, targetEnd);
    const dayIdx: number[] = [];
    gfs.time.forEach((t, i) => {
      if (t.slice(0, 10) === d) dayIdx.push(i);
    });

    // per-day availability — gate on real VALUES, not padded timestamps -------
    // canPeriod: at least one of the 3 PERIODS windows has a GFS band temp value.
    const gfsTemps = bandTemps(gfs, band);
    const canPeriod = PERIODS.some(([, a0, b0]) =>
      dayIdx.some((i) => {
        const h = hourOf(gfs.time[i]);
        return h >= a0 && h < b0 && gfsTemps[i] != null;
      }),
    );
    // canHour: at least one hour this day has a usable band temp (HRRR or GFS).
    const canHour = dayIdx.some((i) => hourSource(hrrr, gfs, band, i) !== null);

    // clamp the requested level down to what the day can actually show --------
    let level = levelFor(d);
    if (level === "hour" && !canHour) level = "period";
    if (level === "period" && !canPeriod) level = "day";

    let span = 0;
    if (level === "day") {
      cells.push({
        key: d,
        label: dayLabel(d, { weekday: "short" }),
        sub: dayLabel(d, { month: "short", day: "numeric" }),
        isTarget: target,
        ...aggregate(gfs, band, dayIdx),
      });
      span = 1;
    } else if (level === "period") {
      for (const [lbl, a0, b0] of PERIODS) {
        const idx = dayIdx.filter((i) => {
          const h = hourOf(gfs.time[i]);
          return h >= a0 && h < b0;
        });
        if (!idx.length) continue;
        cells.push({
          key: d + lbl,
          label: lbl,
          isTarget: target,
          ...aggregate(gfs, band, idx),
        });
        span++;
      }
    } else {
      for (const i of dayIdx) {
        const series = hourSource(hrrr, gfs, band, i);
        if (!series) continue;
        const useHrrr = series === hrrr;
        const h = hourOf(series.time[i]);
        cells.push({
          key: d + ":" + String(i),
          label: hrLabel(h),
          isTarget: target,
          single: true,
          src: useHrrr ? "HRRR" : "GFS",
          ...aggregate(series, band, [i]),
        });
        span++;
      }
    }
    if (span) {
      groups.push({
        label: dayLabel(d, { weekday: "short", month: "short", day: "numeric" }),
        span,
        isTarget: target,
        dateKey: d,
        level,
        canPeriod,
        canHour,
      });
    }
  }
  return { cells, groups };
}

/** Precip classification → label + CSS var + icon name. */
export function precipFor(
  c: Pick<Cell, "snow" | "precip" | "pop">,
): { text: string; varName: string; icon: "flake" | "drop" | "cloud" | "sun" } {
  if (c.snow > 0.2) {
    return { text: `${c.snow.toFixed(c.snow >= 10 ? 0 : 1)}"`, varName: "--accent", icon: "flake" };
  }
  if (c.precip > 0.02) {
    return { text: `${c.precip.toFixed(2)}"`, varName: "--precip-rain", icon: "drop" };
  }
  if (c.pop > 40) return { text: "chance", varName: "--muted", icon: "cloud" };
  return { text: "dry", varName: "--precip-dry", icon: "sun" };
}
