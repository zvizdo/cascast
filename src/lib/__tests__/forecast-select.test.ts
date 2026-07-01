import { describe, it, expect } from "vitest";
import {
  rowsFor, targetRows, chooseTargetModel, chooseFreezingModel, modelLabel, noonRow,
  representativeRow, targetDayHigh, modelSpread, evoPoints,
  convergenceRuns, convergenceVerdict, modelStability, STABILITY_MAX_RANGE, evoEnvelope, modelLeadSeries,
} from "@/lib/forecast-select";
import type { HourRow } from "@/lib/forecast-select";
import type { CombinedForecastBlob, ModelSeries, WeatherSnapshot } from "@/lib/types";

function series(over: Partial<ModelSeries> = {}): ModelSeries {
  // 3 hours on 2026-02-14 at 00/12/13 local
  return {
    available: true,
    time: ["2026-02-14T00:00", "2026-02-14T12:00", "2026-02-14T13:00"],
    temperature_2m: [10, 18, 17], apparent_temperature: [8, 16, 15],
    wind_speed_10m: [20, 24, 22], wind_gusts_10m: [30, 36, 34], wind_direction_10m: [270, 280, 275],
    precipitation: [0, 0.02, 0], precipitation_probability: [10, 40, 30], snowfall: [0, 0.2, 0],
    freezing_level_height: [5000, 5800, 5600], cloud_cover: [10, 20, 30],
    visibility: [10000, 9000, 9500], weather_code: [1, 71, 2],
    temp_base_f: [28, 33, 32], temp_mid_f: [18, 22, 21], temp_summit_f: [8, 12, 11],
    ...over,
  };
}
const blob: CombinedForecastBlob = {
  mountainId: "mt-rainier", timezone: "America/Los_Angeles", fetchedAt: "2026-02-12T14:00:00Z",
  hrrr: null,                                   // HRRR absent for target → precedence falls through
  gfs: series(),
  ecmwf: series({ temp_summit_f: [20, 28, 27] }), // warmer → drives spread
};

describe("rowsFor / targetRows / noonRow", () => {
  it("adapts ModelSeries arrays into HourRow[]", () => {
    const rows = rowsFor(blob.gfs);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ hour: 12, date: "2026-02-14", fl: 5800, tempF: 18 });
    expect(rows[1].bandTempF).toEqual({ base: 33, mid: 22, summit: 12 });
  });
  it("returns null rows for an absent model", () => expect(rowsFor(null)).toEqual([]));
  it("returns no rows for an unavailable model", () =>
    expect(rowsFor(series({ available: false }))).toEqual([]));
  it("filters to the target date and finds noon", () => {
    const rows = targetRows(blob.gfs, "2026-02-14");
    expect(rows).toHaveLength(3);
    expect(noonRow(rows)?.hour).toBe(12);
  });
  it("filters out non-target dates", () => {
    const mixed = series({
      time: ["2026-02-13T12:00", "2026-02-14T12:00"],
      temperature_2m: [5, 18], apparent_temperature: [3, 16],
      wind_speed_10m: [20, 24], wind_gusts_10m: [30, 36], wind_direction_10m: [270, 280],
      precipitation: [0, 0], precipitation_probability: [10, 40], snowfall: [0, 0],
      freezing_level_height: [4000, 5800], cloud_cover: [10, 20],
      visibility: [10000, 9000], weather_code: [1, 71],
      temp_base_f: [25, 33], temp_mid_f: [15, 22], temp_summit_f: [5, 12],
    });
    const rows = targetRows(mixed, "2026-02-14");
    expect(rows).toHaveLength(1);
    expect(rows[0].hour).toBe(12);
  });
  it("noonRow falls back to the middle row when no noon hour exists", () => {
    const rows = rowsFor(series({
      time: ["2026-02-14T08:00", "2026-02-14T09:00", "2026-02-14T10:00"],
    }));
    expect(noonRow(rows)?.hour).toBe(9);
  });
  it("noonRow returns null for empty rows", () => expect(noonRow([])).toBeNull());
  it("targetRows returns [] for an absent model", () =>
    expect(targetRows(null, "2026-02-14")).toEqual([]));
});

describe("representativeRow", () => {
  const row = (hour: number, fl: number): HourRow => ({
    t: `2026-06-21T${String(hour).padStart(2, "0")}:00`, hour, date: "2026-06-21", fl,
    tempF: 30, tempFRaw: 30, windMph: 10, windMphRaw: 10, gustMph: 15, precipIn: 0, pop: 0,
    snowIn: 0, code: 1, bandTempF: { base: 50, mid: 35, summit: 28 },
  });
  const rows = [row(0, 9000), row(6, 9500), row(12, 11000), row(17, 10200)];
  it("picks the hour nearest dawn/midday/pm", () => {
    expect(representativeRow(rows, "dawn")?.hour).toBe(6);
    expect(representativeRow(rows, "midday")?.hour).toBe(12);
    expect(representativeRow(rows, "pm")?.hour).toBe(17);
  });
  it("returns null on empty", () => { expect(representativeRow([], "dawn")).toBeNull(); });
});

describe("model selection + spread", () => {
  it("falls back from missing HRRR to GFS", () =>
    expect(chooseTargetModel(blob, "2026-02-14")).toBe("gfs"));
  it("picks HRRR when it has target rows", () =>
    expect(chooseTargetModel({ ...blob, hrrr: series() }, "2026-02-14")).toBe("hrrr"));
  it("falls back to ECMWF when neither HRRR nor GFS has target rows", () =>
    expect(chooseTargetModel({ ...blob, gfs: null }, "2026-02-14")).toBe("ecmwf"));
  it("chooseFreezingModel skips a model lacking freezing data, picks one that has it", () => {
    // HRRR present but null-padded freezing (>48h); GFS has real FL → GFS wins.
    const hrrrNoFl = series({ freezing_level_height: [null, null, null] });
    expect(chooseFreezingModel({ ...blob, hrrr: hrrrNoFl }, "2026-02-14")).toBe("gfs");
  });
  it("chooseFreezingModel returns null when no model has freezing data", () => {
    const noFl = series({ freezing_level_height: [null, null, null] });
    expect(
      chooseFreezingModel({ ...blob, hrrr: noFl, gfs: noFl, ecmwf: noFl }, "2026-02-14"),
    ).toBeNull();
  });
  it("labels models with resolution", () => {
    expect(modelLabel("hrrr")).toMatch(/HRRR/); expect(modelLabel("gfs")).toMatch(/25 km/);
    expect(modelLabel("ecmwf")).toMatch(/ECMWF/);
  });
  it("computes target-day summit high per model", () => {
    expect(targetDayHigh(blob, "2026-02-14", "gfs")).toBe(12);
    expect(targetDayHigh(blob, "2026-02-14", "ecmwf")).toBe(28);
    expect(targetDayHigh(blob, "2026-02-14", "hrrr")).toBeNull();
  });
  it("returns null target-day high when all summit temps are null", () => {
    const b = { ...blob, gfs: series({ temp_summit_f: [null, null, null] }) };
    expect(targetDayHigh(b, "2026-02-14", "gfs")).toBeNull();
  });
  it("computes spread across available models (ecmwf 28 − gfs 12 = 16)", () => {
    // NB: targetDayHigh is (blob, targetDate, key); extractor receives (blob, key, date).
    const s = modelSpread(blob, "2026-02-14", (b, k, d) => targetDayHigh(b, d, k));
    expect(Math.round(s)).toBe(16);
  });
  it("returns 0 spread with fewer than 2 available models", () => {
    const oneModel = { ...blob, ecmwf: null };
    const s = modelSpread(oneModel, "2026-02-14", (b, k, d) => targetDayHigh(b, d, k));
    expect(s).toBe(0);
  });
});

describe("evoPoints", () => {
  const TARGET = "2026-02-14";
  // Each model is a date→summary map; we look up TARGET (and sometimes a 2nd day).
  const snaps: WeatherSnapshot[] = [
    // §7 returns fetchedAt DESC; evoPoints must reverse to oldest→newest
    { id: "s4", fetchedAt: "2026-02-12T12:00:00Z",
      models: { hrrr: { [TARGET]: m(12) }, gfs: { [TARGET]: m(13) }, ecmwf: { [TARGET]: m(14) } } },
    { id: "s3", fetchedAt: "2026-02-11T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: m(16) }, ecmwf: { [TARGET]: m(17) } } },
    { id: "s2", fetchedAt: "2026-02-06T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: m(20) }, ecmwf: { [TARGET]: m(22) } } },
    { id: "s1", fetchedAt: "2026-02-05T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(26) } } },
  ];
  function m(high: number) {
    return { available: true, summitHighF: high, summitLowF: high - 8, summitMaxWindMph: 30,
      summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 };
  }
  it("returns oldest→newest points for the target date", () => {
    const pts = evoPoints(snaps, "gfs", "high", TARGET);
    expect(pts.map((p) => p.y)).toEqual([24, 20, 16, 13]);
  });
  it("indexes x oldest→newest", () => {
    const pts = evoPoints(snaps, "gfs", "high", TARGET);
    expect(pts.map((p) => p.x)).toEqual([0, 1, 2, 3]);
  });
  it("emits one point per snapshot that has the target date (HRRR only in newest)", () => {
    const pts = evoPoints(snaps, "hrrr", "high", TARGET);
    expect(pts).toHaveLength(1);
    expect(pts[0].y).toBe(12);
  });
  it("skips snapshots whose model lacks the target date entirely", () => {
    // a different target date present in only the two newest snapshots
    const other = "2026-02-15";
    const withOther: WeatherSnapshot[] = [
      { id: "n2", fetchedAt: "2026-02-12T12:00:00Z", models: { hrrr: {}, gfs: { [other]: m(40) }, ecmwf: {} } },
      { id: "n1", fetchedAt: "2026-02-11T12:00:00Z", models: { hrrr: {}, gfs: { [other]: m(42) }, ecmwf: {} } },
      ...snaps, // these only have TARGET, not `other`
    ];
    const pts = evoPoints(withOther, "gfs", "high", other);
    expect(pts.map((p) => p.y)).toEqual([42, 40]); // only the 2 snapshots carrying `other`
  });
  it("maps each EvoVar to its ModelDaySummary field", () => {
    expect(evoPoints(snaps, "gfs", "wind", TARGET).map((p) => p.y)).toEqual([30, 30, 30, 30]);
    expect(evoPoints(snaps, "gfs", "freezing", TARGET).map((p) => p.y)).toEqual([5800, 5800, 5800, 5800]);
    expect(evoPoints(snaps, "gfs", "precip", TARGET).map((p) => p.y)).toEqual([0.1, 0.1, 0.1, 0.1]);
  });
  it("returns [] when no snapshot has the target date for the model", () => {
    expect(evoPoints(snaps, "gfs", "high", "2026-03-01")).toEqual([]);
  });
  it("drops points whose mapped value is null even if available", () => {
    const weird: WeatherSnapshot[] = [{
      id: "w1", fetchedAt: "2026-02-05T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: { ...m(10), summitHighF: null } }, ecmwf: {} },
    }];
    expect(evoPoints(weird, "gfs", "high", TARGET)).toEqual([]);
  });
});

describe("convergenceRuns / convergenceVerdict", () => {
  const TARGET = "2026-02-20";
  function m(high: number) {
    return { available: true, summitHighF: high, summitLowF: high - 8, summitMaxWindMph: 30,
      summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 };
  }
  // newest-first (fetchedAt desc, §7). Models NARROW toward the newest snapshot.
  // s4 (newest, lead 2): 24/25/26 spread 2; s3 (lead 5): 20/24/28 spread 8;
  // s2 (lead 10): 14/24/34 spread 20; s1 (oldest, lead 11): 10/24/38 spread 28.
  const narrowing: WeatherSnapshot[] = [
    { id: "s4", fetchedAt: "2026-02-18T12:00:00Z",
      models: { hrrr: { [TARGET]: m(24) }, gfs: { [TARGET]: m(25) }, ecmwf: { [TARGET]: m(26) } } },
    { id: "s3", fetchedAt: "2026-02-15T12:00:00Z",
      models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
    { id: "s2", fetchedAt: "2026-02-10T12:00:00Z",
      models: { hrrr: { [TARGET]: m(14) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(34) } } },
    { id: "s1", fetchedAt: "2026-02-09T12:00:00Z",
      models: { hrrr: { [TARGET]: m(10) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(38) } } },
  ];

  it("returns [] for an empty input", () => {
    expect(convergenceRuns([], "high", TARGET)).toEqual([]);
  });

  it("builds one run per distinct lead oldest→newest with min/max/mid + lead", () => {
    const runs = convergenceRuns(narrowing, "high", TARGET);
    expect(runs).toHaveLength(4);
    // oldest first
    expect(runs[0]).toMatchObject({ min: 10, max: 38, mid: 24, lead: 11 });
    expect(runs[3]).toMatchObject({ min: 24, max: 26, mid: 25, lead: 2 });
  });

  it("collapses multiple hourly snapshots at the same lead day to one run (newest wins)", () => {
    // snapshots are pulled hourly, so ~20 share each integer lead. The chart plots
    // X by lead, so without collapsing, ~20 points pile up at one x → a blocky smear.
    const sameLead: WeatherSnapshot[] = [
      // newest-first (fetchedAt desc). Two on 02-18 → both lead 2; one on 02-15 → lead 5.
      { id: "late", fetchedAt: "2026-02-18T18:00:00Z",
        models: { hrrr: { [TARGET]: m(24) }, gfs: { [TARGET]: m(25) }, ecmwf: { [TARGET]: m(26) } } },
      { id: "early", fetchedAt: "2026-02-18T06:00:00Z",
        models: { hrrr: { [TARGET]: m(10) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(38) } } },
      { id: "old", fetchedAt: "2026-02-15T12:00:00Z",
        models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
    ];
    const runs = convergenceRuns(sameLead, "high", TARGET);
    // 3 snapshots → 2 distinct leads (5 and 2) → exactly 2 runs
    expect(runs.map((r) => r.lead)).toEqual([5, 2]); // oldest(lead 5) → newest(lead 2)
    // the lead-2 run carries the NEWEST (18:00) issuance, not the 06:00 one
    expect(runs.find((r) => r.lead === 2)).toMatchObject({ min: 24, max: 26 });
  });

  it("drops snapshots with no model data for the target date", () => {
    const withGap: WeatherSnapshot[] = [
      ...narrowing,
      { id: "s0", fetchedAt: "2026-02-08T12:00:00Z", models: { hrrr: {}, gfs: {}, ecmwf: {} } },
    ];
    expect(convergenceRuns(withGap, "high", TARGET)).toHaveLength(4);
  });

  it("verdict: firming === true when the latest run's spread is smallest", () => {
    const v = convergenceVerdict(convergenceRuns(narrowing, "high", TARGET));
    expect(v.firming).toBe(true);
    expect(v.recentSpread).toBe(2); // 26 − 24
    // earlier spreads: 28, 20, 8 → mean ~18.67
    expect(v.earlierSpread).toBeCloseTo((28 + 20 + 8) / 3, 5);
  });

  it("verdict: firming === false when the latest run widens", () => {
    // reverse the model values so the band WIDENS toward the newest snapshot.
    const widening: WeatherSnapshot[] = [
      { id: "w4", fetchedAt: "2026-02-18T12:00:00Z",
        models: { hrrr: { [TARGET]: m(10) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(38) } } },
      { id: "w3", fetchedAt: "2026-02-15T12:00:00Z",
        models: { hrrr: { [TARGET]: m(14) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(34) } } },
      { id: "w2", fetchedAt: "2026-02-10T12:00:00Z",
        models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
      { id: "w1", fetchedAt: "2026-02-09T12:00:00Z",
        models: { hrrr: { [TARGET]: m(24) }, gfs: { [TARGET]: m(25) }, ecmwf: { [TARGET]: m(26) } } },
    ];
    const v = convergenceVerdict(convergenceRuns(widening, "high", TARGET));
    expect(v.firming).toBe(false);
    expect(v.recentSpread).toBe(28);
  });

  it("verdict: earlierSpread === 0 with a single run", () => {
    const one: WeatherSnapshot[] = [
      { id: "o1", fetchedAt: "2026-02-18T12:00:00Z",
        models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
    ];
    const v = convergenceVerdict(convergenceRuns(one, "high", TARGET));
    expect(v.earlierSpread).toBe(0);
    expect(v.recentSpread).toBe(8);
    expect(v.firming).toBe(false); // recent 8 > earlier 0 → not firming
  });
});

describe("modelStability", () => {
  const TARGET = "2026-02-20";
  function m(high: number) {
    return { available: true, summitHighF: high, summitLowF: high - 8, summitMaxWindMph: 30,
      summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 };
  }
  // newest-first (fetchedAt desc). Newest 3 GFS highs: 25, 24, 22 → range 3 (≤4 ⇒ settled).
  const snaps: WeatherSnapshot[] = [
    { id: "s4", fetchedAt: "2026-02-18T12:00:00Z",
      models: { hrrr: { [TARGET]: m(24) }, gfs: { [TARGET]: m(25) }, ecmwf: { [TARGET]: m(26) } } },
    { id: "s3", fetchedAt: "2026-02-15T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
    { id: "s2", fetchedAt: "2026-02-10T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: m(22) }, ecmwf: { [TARGET]: m(34) } } },
    { id: "s1", fetchedAt: "2026-02-09T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: m(10) }, ecmwf: { [TARGET]: m(38) } } },
  ];

  it("ranges over the newest 3 snapshots only (ignores the 4th)", () => {
    const s = modelStability(snaps, "gfs", "high", TARGET);
    expect(s).toMatchObject({ min: 22, max: 25, range: 3, count: 3, settled: true });
  });

  it("marks a model unsettled when its range exceeds the threshold", () => {
    const s = modelStability(snaps, "ecmwf", "high", TARGET); // 26,28,34 → range 8 > 4
    expect(s.range).toBe(8);
    expect(s.settled).toBe(false);
  });

  it("returns null range / not-settled with fewer than 2 values in the window", () => {
    const s = modelStability(snaps, "hrrr", "high", TARGET); // only newest has HRRR
    expect(s).toMatchObject({ min: null, max: null, range: null, settled: false, count: 1 });
  });

  it("uses the per-variable field and threshold (freezing range 600 ≤ 1000 ⇒ settled)", () => {
    const fl = (ft: number) => ({ available: true, summitHighF: 20, summitLowF: 12,
      summitMaxWindMph: 30, summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1,
      freezingLevelFtNoon: ft, snowfallIn: 0.3 });
    const flSnaps: WeatherSnapshot[] = [
      { id: "a", fetchedAt: "2026-02-18T12:00:00Z", models: { hrrr: {}, gfs: { [TARGET]: fl(5800) }, ecmwf: {} } },
      { id: "b", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: {}, gfs: { [TARGET]: fl(5400) }, ecmwf: {} } },
      { id: "c", fetchedAt: "2026-02-10T12:00:00Z", models: { hrrr: {}, gfs: { [TARGET]: fl(5200) }, ecmwf: {} } },
    ];
    const s = modelStability(flSnaps, "gfs", "freezing", TARGET);
    expect(s.range).toBe(600);
    expect(s.settled).toBe(true);
  });

  it("exposes tunable per-variable thresholds", () => {
    expect(STABILITY_MAX_RANGE).toEqual({ high: 4, wind: 10, freezing: 1000, precip: 0.2 });
  });
});

describe("evoEnvelope", () => {
  const TARGET = "2026-02-20";
  function m(high: number) {
    return { available: true, summitHighF: high, summitLowF: high - 8, summitMaxWindMph: 30,
      summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 };
  }
  // newest-first; oldest→newest after reverse: s1(10..38), s2(14..34), s3(20..28)
  const snaps: WeatherSnapshot[] = [
    { id: "s3", fetchedAt: "2026-02-15T12:00:00Z",
      models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
    { id: "s2", fetchedAt: "2026-02-10T12:00:00Z",
      models: { hrrr: { [TARGET]: m(14) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(34) } } },
    { id: "s1", fetchedAt: "2026-02-09T12:00:00Z",
      models: { hrrr: { [TARGET]: m(10) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(38) } } },
  ];

  it("builds a cross-model min..max band per snapshot, oldest→newest, x-aligned with evoPoints", () => {
    const env = evoEnvelope(snaps, "high", TARGET);
    expect(env).toEqual([
      { x: 0, min: 10, max: 38 },
      { x: 1, min: 14, max: 34 },
      { x: 2, min: 20, max: 28 },
    ]);
  });

  it("skips snapshots with no available model value (preserving the absolute index)", () => {
    const withGap: WeatherSnapshot[] = [
      { id: "g", fetchedAt: "2026-02-16T12:00:00Z", models: { hrrr: {}, gfs: {}, ecmwf: {} } },
      ...snaps,
    ];
    // reversed order: s1(x0), s2(x1), s3(x2), gap(x3 skipped)
    const env = evoEnvelope(withGap, "high", TARGET);
    expect(env.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it("returns a degenerate (min==max) point when only one model has a value", () => {
    const one: WeatherSnapshot[] = [
      { id: "o", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: {}, gfs: { [TARGET]: m(24) }, ecmwf: {} } },
    ];
    expect(evoEnvelope(one, "high", TARGET)).toEqual([{ x: 0, min: 24, max: 24 }]);
  });

  it("returns [] when no snapshot carries the target date", () => {
    expect(evoEnvelope(snaps, "high", "2026-03-01")).toEqual([]);
  });
});

describe("modelLeadSeries", () => {
  const TARGET = "2026-02-20";
  function m(high: number) {
    return { available: true, summitHighF: high, summitLowF: high - 8, summitMaxWindMph: 30,
      summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 };
  }
  const snaps: WeatherSnapshot[] = [
    { id: "s3", fetchedAt: "2026-02-18T12:00:00Z", models: { hrrr: { [TARGET]: m(25) }, gfs: { [TARGET]: m(24) }, ecmwf: {} } },
    { id: "s2", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(22) }, ecmwf: {} } },
    { id: "s1", fetchedAt: "2026-02-10T12:00:00Z", models: { hrrr: { [TARGET]: m(14) }, gfs: { [TARGET]: m(21) }, ecmwf: {} } },
  ];

  it("returns one point per lead day, largest lead → 0 (now on the right)", () => {
    const pts = modelLeadSeries(snaps, "hrrr", "high", TARGET);
    expect(pts).toEqual([
      { lead: 10, value: 14 }, // 02-10 → target 02-20
      { lead: 5, value: 20 },  // 02-15
      { lead: 2, value: 25 },  // 02-18
    ]);
  });

  it("collapses same-lead hourly snapshots, keeping the newest issuance", () => {
    const sameLead: WeatherSnapshot[] = [
      { id: "late", fetchedAt: "2026-02-18T18:00:00Z", models: { hrrr: { [TARGET]: m(25) }, gfs: {}, ecmwf: {} } },
      { id: "early", fetchedAt: "2026-02-18T06:00:00Z", models: { hrrr: { [TARGET]: m(11) }, gfs: {}, ecmwf: {} } },
      { id: "old", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: { [TARGET]: m(20) }, gfs: {}, ecmwf: {} } },
    ];
    const pts = modelLeadSeries(sameLead, "hrrr", "high", TARGET);
    expect(pts.map((p) => p.lead)).toEqual([5, 2]);
    expect(pts.find((p) => p.lead === 2)?.value).toBe(25); // 18:00 wins over 06:00
  });

  it("omits unavailable / null-valued / missing snapshots for the model", () => {
    expect(modelLeadSeries(snaps, "ecmwf", "high", TARGET)).toEqual([]);
    const nulled: WeatherSnapshot[] = [
      { id: "n", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: { [TARGET]: { ...m(20), summitHighF: null } }, gfs: {}, ecmwf: {} } },
    ];
    expect(modelLeadSeries(nulled, "hrrr", "high", TARGET)).toEqual([]);
  });

  it("maps the chosen variable to its field", () => {
    const pts = modelLeadSeries(snaps, "gfs", "wind", TARGET);
    expect(pts.length).toBe(3);
    expect(pts.every((p) => p.value === 30)).toBe(true);
  });
});
