import { describe, it, expect } from "vitest";
import { weatherProvenance, toProvenanceData, sourceProvenance } from "@/lib/provenance";
import type { CombinedForecastBlob, ModelSeries } from "@/lib/types";

function series(over: Partial<ModelSeries> = {}): ModelSeries {
  return {
    available: true, time: ["2026-06-21T00:00"], temperature_2m: [10], apparent_temperature: [9],
    wind_speed_10m: [5], wind_gusts_10m: [8], wind_direction_10m: [180], precipitation: [0],
    precipitation_probability: [0], snowfall: [0], freezing_level_height: [9000], cloud_cover: [0],
    visibility: [9999], weather_code: [1], temp_base_f: [40], temp_mid_f: [35], temp_summit_f: [30], ...over,
  };
}
const blob = (over: Partial<CombinedForecastBlob>): CombinedForecastBlob => ({
  mountainId: "m", timezone: "America/Los_Angeles", fetchedAt: "2026-06-20T00:00:00Z",
  hrrr: null, gfs: null, ecmwf: null, ...over,
});

describe("weatherProvenance", () => {
  it("labels a plain model choice", () => {
    const p = weatherProvenance(blob({ gfs: series() }), "gfs");
    expect(p.kind).toBe("model");
    expect(p.label).toBe("GFS");
    expect(p.reason).toBeTruthy();
  });

  it("explains the freezing choice when ECMWF lacks the field and HRRR is short-range", () => {
    const p = weatherProvenance(blob({ gfs: series() }), "gfs", { variable: "freezing" });
    expect(p.reason.toLowerCase()).toContain("freezing");
  });

  it("reports a HRRR→GFS blend when both are present", () => {
    const p = weatherProvenance(blob({ hrrr: series(), gfs: series() }), "hrrr");
    expect(p.blend?.[0]).toEqual({ model: "hrrr", fromHour: 0 });
    expect(p.blend?.[1]).toEqual({ model: "gfs", fromHour: 48 });
  });
});

describe("sourceProvenance", () => {
  it("maps source + distance + freshness into the meta line", () => {
    const d = sourceProvenance({ source: "AirNow", observedAt: "2026-06-20T18:00:00Z", distanceMi: 22, note: "Enumclaw reporting area" });
    expect(d.label).toBe("AirNow");
    expect(d.reason).toContain("Enumclaw");
    expect(d.meta).toContain("22 mi");
    expect(d.href).toBe("/sources");
  });
  it("omits the distance when absent and falls back to a generic reason", () => {
    const d = sourceProvenance({ source: "USGS ComCat" });
    expect(d.meta ?? "").not.toContain("mi");
    expect(d.reason).toBeTruthy();
  });
});

describe("toProvenanceData", () => {
  it("labels a plain model and carries the reason", () => {
    const wp = weatherProvenance(blob({ gfs: series() }), "gfs", { variable: "freezing" });
    const d = toProvenanceData(wp);
    expect(d.label).toBe("GFS");
    expect(d.reason.toLowerCase()).toContain("freezing");
    expect(d.href).toBe("/sources");
  });
  it("labels a blend as HRRR→GFS", () => {
    const wp = weatherProvenance(blob({ hrrr: series(), gfs: series() }), "hrrr");
    expect(toProvenanceData(wp).label).toBe("HRRR→GFS");
  });
  it("passes meta through", () => {
    const wp = weatherProvenance(blob({ gfs: series() }), "gfs");
    expect(toProvenanceData(wp, { meta: "updated 12m ago" }).meta).toBe("updated 12m ago");
  });
});
