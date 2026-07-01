import { describe, it, expect } from "vitest";
import {
  bandTemps,
  dayKeys,
  aggregate,
  dailyCells,
  periodCells,
  hourlyCells,
  precipFor,
  finerLevel,
  gridWidthMode,
  dayLevelDefaults,
  mixedCells,
  hourSource,
} from "@/lib/derive";
import type { ModelSeries } from "@/lib/types";

/** Build a synthetic ModelSeries spanning [startDay 00:00 .. ] for `days` days, hourly. */
function makeSeries(startDay: string, days: number): ModelSeries {
  const time: string[] = [];
  const temp_summit_f: number[] = [];
  const temp_mid_f: number[] = [];
  const temp_base_f: number[] = [];
  const wind_speed_10m: number[] = [];
  const wind_gusts_10m: number[] = [];
  const precipitation: number[] = [];
  const precipitation_probability: number[] = [];
  const snowfall: number[] = [];
  const freezing_level_height: number[] = [];
  const weather_code: number[] = [];
  let idx = 0;
  for (let d = 0; d < days; d++) {
    const base = new Date(`${startDay}T00:00:00`);
    base.setDate(base.getDate() + d);
    const dayStr = base.toISOString().slice(0, 10);
    for (let h = 0; h < 24; h++) {
      const hh = String(h).padStart(2, "0");
      time.push(`${dayStr}T${hh}:00`);
      // summit temps oscillate; make noon (12) the warmest so we can assert code-at-noon
      temp_summit_f.push(10 + h + d); // increasing through day
      temp_mid_f.push(20 + h + d);
      temp_base_f.push(30 + h + d);
      wind_speed_10m.push(5 + (h % 5));
      wind_gusts_10m.push(10 + (h % 5));
      precipitation.push(h === 12 ? 0.1 : 0);
      precipitation_probability.push(h === 12 ? 80 : 10);
      snowfall.push(h === 12 ? 0.5 : 0);
      freezing_level_height.push(6000);
      weather_code.push(h === 12 ? 71 : 0); // noon = snow code
      idx++;
    }
  }
  return {
    available: true,
    time,
    temperature_2m: temp_summit_f,
    apparent_temperature: temp_summit_f,
    wind_speed_10m,
    wind_gusts_10m,
    wind_direction_10m: time.map(() => 180),
    precipitation,
    precipitation_probability,
    snowfall,
    freezing_level_height,
    cloud_cover: time.map(() => 0),
    visibility: time.map(() => 10000),
    weather_code,
    temp_base_f,
    temp_mid_f,
    temp_summit_f,
  };
}

const series = makeSeries("2026-02-12", 2);

describe("bandTemps", () => {
  it("picks the band's temperature array", () => {
    expect(bandTemps(series, "summit")).toBe(series.temp_summit_f);
    expect(bandTemps(series, "mid")).toBe(series.temp_mid_f);
    expect(bandTemps(series, "base")).toBe(series.temp_base_f);
  });
});

describe("dayKeys", () => {
  it("returns unique ordered days", () => {
    expect(dayKeys(series)).toEqual(["2026-02-12", "2026-02-13"]);
  });
});

describe("aggregate", () => {
  it("computes hi/lo/wind/sum precip over indices", () => {
    const a = aggregate(series, "summit", [0, 1, 2]); // first three hours of day 0
    // summit temps for h=0,1,2 → 10,11,12
    expect(a.hi).toBe(12);
    expect(a.lo).toBe(10);
    expect(a.wind).toBe(7); // 5+(2%5)=7 max
    expect(a.precip).toBeCloseTo(0);
    expect(a.snow).toBeCloseTo(0);
  });
  it("uses the noon row's weather_code and sums precip across a full day", () => {
    const dayIdx = Array.from({ length: 24 }, (_, i) => i); // day 0
    const a = aggregate(series, "summit", dayIdx);
    expect(a.code).toBe(71); // noon row
    expect(a.precip).toBeCloseTo(0.1);
    expect(a.snow).toBeCloseTo(0.5);
    expect(a.pop).toBe(80);
  });
});

describe("aggregate — null-aware temps (C2)", () => {
  it("computes hi/lo from non-null band temps only (no 0-coercion)", () => {
    const s = makeSeries("2026-02-12", 1);
    // null out a few summit temps; remaining min should NOT collapse to 0
    s.temp_summit_f[0] = null;
    s.temp_summit_f[1] = null;
    const a = aggregate(s, "summit", [0, 1, 2]); // only idx 2 = 12 is non-null
    expect(a.hasTemp).toBe(true);
    expect(a.hi).toBe(12);
    expect(a.lo).toBe(12); // not 0
  });
  it("returns hasTemp:false with null hi/lo when all band temps are null", () => {
    const s = makeSeries("2026-02-12", 1);
    for (let i = 0; i < 24; i++) s.temp_summit_f[i] = null;
    const a = aggregate(s, "summit", [0, 1, 2, 3]);
    expect(a.hasTemp).toBe(false);
    expect(a.hi).toBeNull();
    expect(a.lo).toBeNull();
  });
});

describe("aggregate — windDir (A1) + feelsLike (B2)", () => {
  it("carries the noon wind_direction_10m as windDir", () => {
    const s = makeSeries("2026-02-12", 1);
    s.wind_direction_10m = s.time.map((_, i) => (i === 12 ? 220 : 10));
    const a = aggregate(s, "summit", Array.from({ length: 24 }, (_, i) => i));
    expect(a.windDir).toBe(220);
  });
  it("carries the noon apparent_temperature as feelsLike", () => {
    const s = makeSeries("2026-02-12", 1);
    s.apparent_temperature = s.time.map((_, i) => (i === 12 ? 5 : 40));
    const a = aggregate(s, "summit", Array.from({ length: 24 }, (_, i) => i));
    expect(a.feelsLike).toBe(5);
  });
});

describe("dailyCells", () => {
  it("flags target days", () => {
    const cells = dailyCells(series, "summit", "2026-02-13", "2026-02-13");
    expect(cells).toHaveLength(2);
    const fri = cells.find((c) => c.key === "2026-02-13");
    expect(fri?.isTarget).toBe(true);
    expect(cells.find((c) => c.key === "2026-02-12")?.isTarget).toBe(false);
    expect(cells[0].label).toMatch(/Thu|Wed|Fri|Mon|Tue|Sat|Sun/);
    expect(cells[0].sub).toBeTruthy();
  });

  it("yields a cell per day start→target 5 days out; an all-null day → null hi/lo", () => {
    const s = makeSeries("2026-06-10", 6); // 2026-06-10 .. 2026-06-15
    // day index 5 (2026-06-15, target) has all-null summit temps
    for (let i = 5 * 24; i < 6 * 24; i++) s.temp_summit_f[i] = null;
    const cells = dailyCells(s, "summit", "2026-06-15", "2026-06-15");
    expect(cells).toHaveLength(6);
    // every day start→target is present
    expect(cells.map((c) => c.key)).toEqual([
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
      "2026-06-15",
    ]);
    const target = cells[5];
    expect(target.isTarget).toBe(true);
    expect(target.hasTemp).toBe(false);
    expect(target.hi).toBeNull();
    expect(target.lo).toBeNull();
    // earlier days keep real temps (not 0)
    expect(cells[0].hasTemp).toBe(true);
    expect(cells[0].hi).toBeGreaterThan(0);
  });
});

describe("periodCells", () => {
  it("splits each day into up-to-three periods with day groups", () => {
    const { cells, groups } = periodCells(series, "summit", "2026-02-13", "2026-02-13");
    // each day has Morning (6-12), Midday (12-18), Night (18-24) → 3 each, 6 total
    expect(cells.length).toBe(6);
    expect(groups.length).toBe(2);
    expect(groups[0].span).toBe(3);
    expect(cells.some((c) => c.isTarget)).toBe(true);
    expect(cells[0].label).toBe("Morning");
  });
});

describe("hourlyCells", () => {
  const hrrr = makeSeries("2026-02-12", 2);
  it("caps at 48 and prefers HRRR", () => {
    const { cells } = hourlyCells(
      hrrr,
      series,
      "summit",
      "2026-02-12T00:00",
      "2026-02-13",
      "2026-02-13",
    );
    expect(cells.length).toBeLessThanOrEqual(48);
    expect(cells.length).toBe(48);
    expect(cells[0].src).toBe("HRRR");
    expect(cells[0].single).toBe(true);
  });
  it("falls back to GFS when HRRR is null", () => {
    const { cells } = hourlyCells(
      null,
      series,
      "summit",
      "2026-02-12T00:00",
      "2026-02-13",
      "2026-02-13",
    );
    expect(cells[0].src).toBe("GFS");
  });
  it("starts at the first row >= now", () => {
    const { cells } = hourlyCells(
      hrrr,
      series,
      "summit",
      "2026-02-12T05:00",
      "2026-02-13",
      "2026-02-13",
    );
    expect(cells[0].label).toMatch(/5a/);
  });
});

describe("finerLevel", () => {
  it("returns the finer of two levels (day < period < hour)", () => {
    expect(finerLevel("day", "period")).toBe("period");
    expect(finerLevel("period", "day")).toBe("period");
    expect(finerLevel("day", "hour")).toBe("hour");
    expect(finerLevel("period", "hour")).toBe("hour");
    expect(finerLevel("hour", "hour")).toBe("hour");
    expect(finerLevel("day", "day")).toBe("day");
  });
});

describe("gridWidthMode", () => {
  it("stretches when the strip fits the container", () => {
    expect(gridWidthMode(812, 1100)).toBe("stretch");
  });
  it("scrolls when the strip is wider than the container", () => {
    expect(gridWidthMode(812, 318)).toBe("scroll");
  });
  it("stretches at exact fit", () => {
    expect(gridWidthMode(300, 300)).toBe("stretch");
  });
});

describe("dayLevelDefaults", () => {
  it("seeds target + 2 prior days to period when target start is ≤48h out", () => {
    const s = makeSeries("2026-06-10", 6); // 2026-06-10 .. 2026-06-15
    // now 2026-06-13T12:00, target 2026-06-15 → ~35h out (≤48h)
    const d = dayLevelDefaults(s, "2026-06-13T12:00", "2026-06-15", "2026-06-15");
    expect(d).toEqual({
      "2026-06-15": "period",
      "2026-06-14": "period",
      "2026-06-13": "period",
    });
  });

  it("only includes days present in the series", () => {
    const s = makeSeries("2026-06-14", 2); // only 2026-06-14, 2026-06-15
    const d = dayLevelDefaults(s, "2026-06-14T00:00", "2026-06-15", "2026-06-15");
    // target−2d = 2026-06-13 not in series → excluded
    expect(d).toEqual({
      "2026-06-15": "period",
      "2026-06-14": "period",
    });
  });

  it("returns {} when target start is more than 48h out", () => {
    const s = makeSeries("2026-06-10", 8);
    const d = dayLevelDefaults(s, "2026-06-10T00:00", "2026-06-15", "2026-06-15");
    expect(d).toEqual({});
  });
});

describe("mixedCells", () => {
  // 3-day series: 2026-02-12, -13, -14
  const gfs = makeSeries("2026-02-12", 3);
  const hrrr = makeSeries("2026-02-12", 3);

  it("emits day→1, period→3, hour→24 cells with per-day groups carrying dateKey/level/isTarget", () => {
    const levelFor = (d: string): "day" | "period" | "hour" =>
      d === "2026-02-12" ? "day" : d === "2026-02-13" ? "period" : "hour";
    const { cells, groups } = mixedCells(
      hrrr,
      gfs,
      "summit",
      "2026-02-12T00:00",
      "2026-02-14",
      "2026-02-14",
      levelFor,
    );
    expect(groups).toHaveLength(3);
    const [gA, gB, gC] = groups;
    expect(gA.dateKey).toBe("2026-02-12");
    expect(gA.level).toBe("day");
    expect(gA.span).toBe(1);
    expect(gA.isTarget).toBe(false);

    expect(gB.dateKey).toBe("2026-02-13");
    expect(gB.level).toBe("period");
    expect(gB.span).toBe(3);

    expect(gC.dateKey).toBe("2026-02-14");
    expect(gC.level).toBe("hour");
    expect(gC.span).toBe(24);
    expect(gC.isTarget).toBe(true);

    // 1 + 3 + 24
    expect(cells.length).toBe(28);
    // hour cells prefer HRRR + are single
    const hourCells = cells.slice(4);
    expect(hourCells[0].src).toBe("HRRR");
    expect(hourCells[0].single).toBe(true);
  });

  it("falls back to GFS for hour cells when HRRR is null", () => {
    const levelFor = (): "hour" => "hour";
    const { cells } = mixedCells(
      null,
      makeSeries("2026-02-12", 1),
      "summit",
      "2026-02-12T00:00",
      "2026-02-12",
      "2026-02-12",
      levelFor,
    );
    expect(cells[0].src).toBe("GFS");
  });

  it("emits fewer than 3 period cells when a period window has no hours", () => {
    // build a series with only the morning hours (6..11) of a single day
    const full = makeSeries("2026-02-12", 1);
    const morning = {
      ...full,
      time: full.time.filter((t) => {
        const h = Number(t.slice(11, 13));
        return h >= 6 && h < 12;
      }),
    };
    // re-slice the parallel arrays to match the filtered times
    const keep = full.time
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => {
        const h = Number(t.slice(11, 13));
        return h >= 6 && h < 12;
      })
      .map(({ i }) => i);
    const pick = (arr: (number | null)[]) => keep.map((i) => arr[i]);
    morning.temp_summit_f = pick(full.temp_summit_f);
    morning.wind_speed_10m = pick(full.wind_speed_10m) as number[];
    morning.wind_gusts_10m = pick(full.wind_gusts_10m) as number[];
    morning.wind_direction_10m = pick(full.wind_direction_10m) as number[];
    morning.apparent_temperature = pick(full.apparent_temperature);
    morning.precipitation = pick(full.precipitation) as number[];
    morning.precipitation_probability = pick(full.precipitation_probability) as number[];
    morning.snowfall = pick(full.snowfall) as number[];
    morning.weather_code = pick(full.weather_code) as number[];
    const levelFor = (): "period" => "period";
    const { cells, groups } = mixedCells(
      null,
      morning,
      "summit",
      "2026-02-12T00:00",
      "2026-02-12",
      "2026-02-12",
      levelFor,
    );
    // only the Morning window has hours → 1 period cell, span 1
    expect(cells).toHaveLength(1);
    expect(cells[0].label).toBe("Morning");
    expect(groups[0].span).toBe(1);
  });

  it("preserves null-aware hasTemp so the ribbon breaks on gaps", () => {
    const g = makeSeries("2026-02-12", 2);
    for (let i = 24; i < 48; i++) g.temp_summit_f[i] = null; // day 2 all null
    const levelFor = (): "day" => "day";
    const { cells } = mixedCells(
      g,
      g,
      "summit",
      "2026-02-12T00:00",
      "2026-02-12",
      "2026-02-12",
      levelFor,
    );
    expect(cells[0].hasTemp).toBe(true);
    expect(cells[1].hasTemp).toBe(false);
    expect(cells[1].hi).toBeNull();
  });
});

describe("mixedCells — per-day availability (canPeriod/canHour) is VALUE-based + clamp", () => {
  // 6-day GFS series 2026-06-10 .. 2026-06-15; HRRR only covers the first 2 days.
  const gfs = makeSeries("2026-06-10", 6);
  const hrrr = makeSeries("2026-06-10", 2);
  const now = "2026-06-10T00:00";

  /** Null out one day's summit band temps (24 rows) to simulate "no hourly data yet". */
  function withDayTempsNull(start: string, days: number, nullDay: string): ModelSeries {
    const s = makeSeries(start, days);
    const t = s.temp_summit_f as (number | null)[];
    s.time.forEach((iso, i) => {
      if (iso.slice(0, 10) === nullDay) t[i] = null;
    });
    return s;
  }

  it("a day with GFS band-temp values is expandable (canHour true) even far out — GFS hourly exists for every present day", () => {
    const levelFor = (): "day" => "day";
    const { groups } = mixedCells(hrrr, gfs, "summit", now, "2026-06-15", "2026-06-15", levelFor);
    const near = groups.find((g) => g.dateKey === "2026-06-10")!;
    const far = groups.find((g) => g.dateKey === "2026-06-15")!;
    expect(near.canPeriod).toBe(true);
    expect(near.canHour).toBe(true);
    expect(far.canPeriod).toBe(true);
    expect(far.canHour).toBe(true); // GFS has hourly values for the far day
  });

  it("a day with NO band-temp values is not expandable (canHour & canPeriod false) and clamps a global 'hour' zoom down to 'day'", () => {
    const g2 = withDayTempsNull("2026-06-10", 6, "2026-06-15"); // last day has null summit temps
    const levelFor = (): "hour" => "hour"; // user raised global zoom to Hourly
    const { groups } = mixedCells(null, g2, "summit", now, "2026-06-15", "2026-06-15", levelFor);
    const near = groups.find((g) => g.dateKey === "2026-06-10")!;
    const far = groups.find((g) => g.dateKey === "2026-06-15")!;
    expect(near.level).toBe("hour"); // has values → stays hour (24 single cells)
    expect(near.span).toBe(24);
    expect(far.canHour).toBe(false);
    expect(far.canPeriod).toBe(false);
    expect(far.level).toBe("day"); // clamped all the way down — no empty hour/period cells
    expect(far.span).toBe(1);
  });

  it("far-day hourly FALLS BACK to GFS and renders real cells (not empty '—') when HRRR values run out", () => {
    // HRRR covers only the first 2 days; the far day must render GFS hourly with real temps.
    const levelFor = (d: string): "hour" | "day" => (d === "2026-06-15" ? "hour" : "day");
    const { cells } = mixedCells(hrrr, gfs, "summit", now, "2026-06-15", "2026-06-15", levelFor);
    const farHours = cells.filter((c) => c.key.startsWith("2026-06-15:"));
    expect(farHours.length).toBe(24);
    expect(farHours.every((c) => c.hasTemp)).toBe(true); // real GFS data, not null/"—"
    expect(farHours.every((c) => c.src === "GFS")).toBe(true);
  });

  it("HRRR value coverage makes a day's canHour true", () => {
    const farNow = "2026-06-14T00:00";
    const levelFor = (): "day" => "day";
    const { groups } = mixedCells(hrrr, gfs, "summit", farNow, "2026-06-15", "2026-06-15", levelFor);
    const hrrrDay = groups.find((g) => g.dateKey === "2026-06-10")!; // HRRR present
    expect(hrrrDay.canHour).toBe(true);
  });
});

describe("hourSource — value-aware series selection", () => {
  it("prefers HRRR when it has a real value, falls back to GFS, else null", () => {
    const h = makeSeries("2026-06-10", 1);
    const g = makeSeries("2026-06-10", 1);
    expect(hourSource(h, g, "summit", 5)).toBe(h); // HRRR has a value
    (h.temp_summit_f as (number | null)[])[5] = null;
    expect(hourSource(h, g, "summit", 5)).toBe(g); // HRRR null → GFS
    (g.temp_summit_f as (number | null)[])[5] = null;
    expect(hourSource(h, g, "summit", 5)).toBeNull(); // neither has data
  });
  it("ignores HRRR when unavailable", () => {
    const h = makeSeries("2026-06-10", 1);
    h.available = false;
    const g = makeSeries("2026-06-10", 1);
    expect(hourSource(h, g, "summit", 6)).toBe(g);
  });
  it("ignores HRRR rows whose timestamp is padded null past the value horizon", () => {
    const h = makeSeries("2026-06-10", 1);
    const g = makeSeries("2026-06-10", 1);
    (h.time as (string | null)[])[7] = null; // padded timestamp, no real row
    expect(hourSource(h, g, "summit", 7)).toBe(g);
  });
});

describe("precipFor", () => {
  it("classifies snow", () => {
    expect(precipFor({ snow: 1, precip: 0.1, pop: 80 }).icon).toBe("flake");
  });
  it("classifies rain", () => {
    expect(precipFor({ snow: 0, precip: 0.1, pop: 80 }).icon).toBe("drop");
  });
  it("classifies chance", () => {
    expect(precipFor({ snow: 0, precip: 0, pop: 60 }).icon).toBe("cloud");
    expect(precipFor({ snow: 0, precip: 0, pop: 60 }).text).toBe("chance");
  });
  it("classifies dry", () => {
    expect(precipFor({ snow: 0, precip: 0, pop: 10 }).text).toBe("dry");
    expect(precipFor({ snow: 0, precip: 0, pop: 10 }).icon).toBe("sun");
  });
});
