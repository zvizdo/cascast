// lib/__tests__/types.test.ts
import { describe, it, expect, expectTypeOf } from "vitest";
import type {
  Elevations, Mountain, CurrentSummary, AvalancheSummary, SnowpackSummary,
  MountainConditions, ModelSeries, CombinedForecastBlob, WeatherSnapshot,
  ModelDaySummary, NwacForecast, NwacDanger, NwacProblem, SnotelReading, SnotelData,
  SatelliteCache,
} from "@/lib/types";

describe("lib/types", () => {
  it("CurrentSummary carries the model + tone unions", () => {
    const summary: CurrentSummary = {
      targetDateHigh: 40, targetDateLow: 22, targetDateWind: 30, targetDatePrecip: 0.1,
      freezingLevelFt: 9000, precipType: "snow", summaryModel: "hrrr",
      tone: "good", verdict: "Cold window holds before a front", updatedAt: "2026-06-14T00:00:00Z",
    };
    expect(summary.tone).toBe("good");
    expectTypeOf<CurrentSummary["summaryModel"]>().toEqualTypeOf<"hrrr" | "gfs" | "ecmwf">();
  });

  it("Mountain has elevations and IANA timezone", () => {
    const e: Elevations = { base: 5420, mid: 10188, summit: 14410 };
    const m: Mountain = {
      slug: "mt-rainier", name: "Mount Rainier", lat: 46.85, lng: -121.76, elevations: e,
      nwacZone: "west-slopes-south", nwacZoneId: "1648", snotelStationId: "679",
      snotelStationTriplet: "679:WA:SNTL", snotelStationName: "Paradise",
      region: "cascades-south", timezone: "America/Los_Angeles", description: "",
    };
    expect(m.timezone).toBe("America/Los_Angeles");
  });

  it("data containers carry their nested shapes", () => {
    const danger: NwacDanger = { upper: 2, middle: 1, lower: 1 };
    const problem: NwacProblem = {
      problemId: 1, name: "Wind Slab", likelihood: "possible", sizeMin: "1", sizeMax: "2",
      aspects: { upper: { N: true }, middle: {}, lower: {} }, description: "",
    };
    const nwac: NwacForecast = {
      zoneId: "1648", zoneName: "West Slopes South", season: "winter",
      forecastDate: "2026-01-10", publishedTime: "2026-01-10T15:00:00Z",
      expiresTime: "2026-01-11T03:00:00Z",
      danger: { current: danger, tomorrow: danger }, problems: [problem],
      bottomLine: "", hazardDiscussion: "", weatherDiscussion: "",
    };
    const reading: SnotelReading = {
      date: "2026-01-10", snowDepthIn: 80, sweIn: 20, sweMedianIn: 18,
      percentOfMedian: 111, tempMaxF: 30, tempMinF: 18, precipAccumIn: 40,
    };
    const snotel: SnotelData = {
      stationId: "679", stationTriplet: "679:WA:SNTL", stationName: "Paradise",
      elevationFt: 5400, lat: 46.78, lng: -121.74, current: reading, trend: [reading],
    };
    const series: ModelSeries = {
      available: true, time: ["2026-08-02T00:00"], temperature_2m: [30],
      apparent_temperature: [25], wind_speed_10m: [10], wind_gusts_10m: [18],
      wind_direction_10m: [270], precipitation: [0],
      precipitation_probability: [10], snowfall: [0], freezing_level_height: [9000],
      cloud_cover: [20], visibility: [40000], weather_code: [1], temp_base_f: [44], temp_mid_f: [34], temp_summit_f: [22],
    };
    const blob: CombinedForecastBlob = {
      mountainId: "mt-rainier", timezone: "America/Los_Angeles",
      fetchedAt: "2026-08-01T00:00:00Z", hrrr: series, gfs: null, ecmwf: null,
    };
    const dayS: ModelDaySummary = {
      available: true, summitHighF: 30, summitLowF: 20, summitMaxWindMph: 18,
      summitMaxSustainedWindMph: 14, summitPrecipIn: 0, freezingLevelFtNoon: 9000, snowfallIn: 0,
    };
    const snap: WeatherSnapshot = {
      id: "s1", fetchedAt: "2026-08-01T00:00:00Z",
      models: { hrrr: { "2026-08-02": dayS }, gfs: { "2026-08-02": dayS }, ecmwf: { "2026-08-02": dayS } },
    };
    const conditions: MountainConditions = {
      mountainId: "mt-rainier", forecastBlobPath: "forecasts/mt-rainier/2026-08-01/0000-combined.json",
      currentSummary: {
        targetDateHigh: 30, targetDateLow: 20, targetDateWind: 18, targetDatePrecip: 0,
        freezingLevelFt: 9000, precipType: "none", summaryModel: "gfs",
        tone: "caution", verdict: "Wind builds aloft", updatedAt: "2026-08-01T00:00:00Z",
      },
      updatedAt: "2026-08-01T00:00:00Z",
    };
    const aval: AvalancheSummary = {
      dangerUpper: 2, dangerMiddle: 1, dangerLower: 1, bottomLine: "",
      forecastDate: "2026-01-10", season: "winter", updatedAt: "2026-01-10T15:00:00Z",
    };
    const snow: SnowpackSummary = {
      snowDepthIn: 80, sweIn: 20, percentOfMedian: 111, stationName: "Paradise",
      updatedAt: "2026-01-10T15:00:00Z",
    };
    const sat: SatelliteCache = {
      mountainId: "mt-rainier", latestImageDate: "2026-06-10", cloudCoverPercent: 12,
      tileUrlTemplate: "https://tiles.maps.eox.at/.../{z}/{y}/{x}.jpg",
      tileSource: "eox-s2cloudless", attribution: "EOX",
      boundingBox: { north: 47, south: 46.7, east: -121.6, west: -121.9 },
    };
    expect([nwac, snotel, blob, snap, conditions, aval, snow, sat]).toHaveLength(8);
    expectTypeOf<SatelliteCache["tileSource"]>().toEqualTypeOf<"eox-s2cloudless" | "sentinel-hub-wmts">();
  });
});
