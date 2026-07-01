/* a11y — vitest-axe smoke over the primary mountains-first surfaces (MountainDetail, ModelLab,
   Footer) rendered with seeded happy-path data. Asserts no serious/critical violations.
   color-contrast is disabled in jsdom (expectNoA11yViolations) since it cannot compute colors. */
import { render } from "@testing-library/react";
import { describe, it, beforeEach, vi, type Mock } from "vitest";
import { expectNoA11yViolations } from "./test-utils";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import { Footer } from "@/components/shared/Footer";
import { MountainDetail } from "@/components/mountain/MountainDetail";
import { ModelLab } from "@/components/modellab/ModelLab";
import {
  useMountainWeather,
  useMountainSnapshots,
  useMountainNwac,
  useMountainSnotel,
  useMountainSatellite,
  useMountainAirQuality,
  useMountainAlerts,
  useMountainVolcano,
  useMountainSeismic,
  useMountainParkAlerts,
} from "@/lib/hooks";
import type {
  Mountain,
  CombinedForecastBlob,
  ModelSeries,
  WeatherSnapshot,
  ModelDaySummary,
} from "@/lib/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  usePathname: () => "/mountains/mt-rainier",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks", () => ({
  useMountainWeather: vi.fn(),
  useMountainSnapshots: vi.fn(),
  useMountainNwac: vi.fn(),
  useMountainSnotel: vi.fn(),
  useMountainSatellite: vi.fn(),
  useMountainAirQuality: vi.fn(),
  useMountainAlerts: vi.fn(),
  useMountainVolcano: vi.fn(),
  useMountainSeismic: vi.fn(),
  useMountainParkAlerts: vi.fn(),
  // The 3D flip card reads these; no terrain in unit tests ⇒ render the hero plainly.
  useTerrainMeta: () => ({ meta: undefined, available: false, isLoading: false }),
  useRoutes: () => ({ routes: [] }),
}));

const rainier: Mountain = {
  slug: "mt-rainier",
  name: "Mount Rainier",
  lat: 46.8523,
  lng: -121.7603,
  elevations: { base: 5420, mid: 10188, summit: 14410 },
  nwacZone: "west-slopes-south",
  nwacZoneId: "1648",
  snotelStationId: "679",
  snotelStationTriplet: "679:WA:SNTL",
  snotelStationName: "Paradise",
  region: "cascades-south",
  timezone: "America/Los_Angeles",
  description: "The big one.",
};

function makeSeries(): ModelSeries {
  const time: string[] = [];
  for (let d = 12; d <= 18; d++) {
    for (let h = 0; h < 24; h++) {
      time.push(`2026-02-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00`);
    }
  }
  const fill = (v: number) => time.map(() => v);
  return {
    available: true,
    time,
    temperature_2m: fill(10),
    apparent_temperature: fill(10),
    wind_speed_10m: fill(12),
    wind_gusts_10m: fill(18),
    wind_direction_10m: fill(180),
    precipitation: fill(0),
    precipitation_probability: fill(20),
    snowfall: fill(0),
    freezing_level_height: fill(6000),
    cloud_cover: fill(0),
    visibility: fill(10000),
    weather_code: fill(0),
    temp_base_f: fill(30),
    temp_mid_f: fill(20),
    temp_summit_f: fill(10),
  };
}

const blob: CombinedForecastBlob = {
  mountainId: "mt-rainier",
  timezone: "America/Los_Angeles",
  fetchedAt: "2026-02-12T00:00:00.000Z",
  hrrr: makeSeries(),
  gfs: makeSeries(),
  ecmwf: makeSeries(),
};

const dm = (h: number): ModelDaySummary => ({
  available: true,
  summitHighF: h,
  summitLowF: h - 8,
  summitMaxWindMph: 30,
  summitMaxSustainedWindMph: 24,
  summitPrecipIn: 0.1,
  freezingLevelFtNoon: 5800,
  snowfallIn: 0.3,
});
const snap = (id: string, day: string, h: number): WeatherSnapshot => ({
  id,
  fetchedAt: `${day}T12:00:00Z`,
  models: {
    hrrr: { "2026-02-14": dm(h) },
    gfs: { "2026-02-14": dm(h + 1) },
    ecmwf: { "2026-02-14": dm(h + 2) },
  },
});
const snapshots = [
  snap("a", "2026-02-05", 24),
  snap("b", "2026-02-06", 20),
  snap("c", "2026-02-11", 16),
];

beforeEach(() => {
  useUnits.setState(DEFAULT_UNITS);
  (useMountainWeather as Mock).mockReturnValue({
    blob,
    isLoading: false,
    isValidating: false,
    error: undefined,
    mutate: vi.fn(),
  });
  (useMountainSnapshots as Mock).mockReturnValue({ snapshots, isLoading: false, error: undefined });
  (useMountainNwac as Mock).mockReturnValue({
    nwac: {
      zoneId: "1648",
      zoneName: "West Slopes South",
      season: "winter",
      forecastDate: "2026-02-14",
      publishedTime: "2026-02-14T06:00:00Z",
      expiresTime: "2026-02-15T06:00:00Z",
      danger: {
        current: { upper: 3, middle: 2, lower: 1 },
        tomorrow: { upper: 2, middle: 2, lower: 1 },
      },
      problems: [],
      bottomLine: "Considerable danger on upper elevations near ridgetops.",
      hazardDiscussion: "Recent loading has built reactive slabs.",
      weatherDiscussion: "Snow tapering overnight.",
    },
    isLoading: false,
    error: undefined,
  });
  (useMountainSnotel as Mock).mockReturnValue({
    snotel: {
      stationName: "Paradise",
      elevationFt: 5430,
      current: { snowDepthIn: 112, sweIn: 38.2, percentOfMedian: 108 },
      trend: Array.from({ length: 30 }, (_, i) => ({ snowDepthIn: 100 + i })),
    },
    isLoading: false,
    error: undefined,
  });
  (useMountainSatellite as Mock).mockReturnValue({ sat: null, isLoading: false, error: undefined });
  (useMountainAirQuality as Mock).mockReturnValue({
    airQuality: {
      aqi: 80, categoryNumber: 2, categoryName: "Moderate", parameter: "PM2.5", reportingArea: "Enumclaw",
      trend: [{ date: "2026-02-13", aqi: 70 }, { date: "2026-02-14", aqi: 80 }],
      provenance: { source: "AirNow", observedAt: "2026-02-14T18:00:00Z", distanceMi: 22 },
    },
    isLoading: false, error: undefined, mutate: vi.fn(),
  });
  (useMountainAlerts as Mock).mockReturnValue({
    alerts: { nws: [], spc: null, stormActive: false, provenance: { source: "NWS + SPC" } },
    isLoading: false, error: undefined, mutate: vi.fn(),
  });
  (useMountainVolcano as Mock).mockReturnValue({
    volcano: { name: "Mount Rainier", colorCode: "GREEN", alertLevel: "NORMAL", nvewsThreat: "Very High Threat", noticeUrl: null, provenance: { source: "USGS HANS" } },
    isLoading: false, error: undefined, mutate: vi.fn(),
  });
  (useMountainSeismic as Mock).mockReturnValue({
    seismic: { count30d: 11, count7d: 3, largestMag: 1.8, swarm: false, events: [{ mag: 1.8, place: "near Rainier", time: "2026-02-14T12:00:00Z", depthKm: 5, lng: -121.76, lat: 46.85, type: "earthquake", status: "reviewed" }], provenance: { source: "USGS ComCat" } },
    isLoading: false, error: undefined, mutate: vi.fn(),
  });
  (useMountainParkAlerts as Mock).mockReturnValue({
    parkAlerts: { alerts: [{ category: "Closure", title: "Road closed", description: "", url: "https://nps.gov/a", parkCode: "mora", lastIndexedDate: "2026-02-14" }], provenance: { source: "NPS" } },
    isLoading: false, error: undefined, mutate: vi.fn(),
  });
});

describe("accessibility (vitest-axe)", () => {
  it("Footer has no serious/critical violations", async () => {
    const { container } = render(<Footer />);
    await expectNoA11yViolations(container);
  });

  it("MountainDetail (focused) has no serious/critical violations", async () => {
    const { container } = render(<MountainDetail mountain={rainier} target="2026-02-14" />);
    await expectNoA11yViolations(container);
  });

  it("ModelLab has no serious/critical violations", async () => {
    const { container } = render(
      <ModelLab
        mountain={{ slug: "mt-rainier", name: "Mount Rainier", lat: 46.8523, lng: -121.7603 }}
        blob={blob}
        snapshots={snapshots}
        target="2026-02-14"
      />,
    );
    await expectNoA11yViolations(container);
  });
});
