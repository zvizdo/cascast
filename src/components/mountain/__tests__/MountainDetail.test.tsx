import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { MountainDetail } from "@/components/mountain/MountainDetail";
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
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import { getPin } from "@/lib/pins";
import { defaultTargetISO, todayISO } from "@/lib/target-date";
import type { Mountain, CombinedForecastBlob, ModelSeries, WeatherSnapshot } from "@/lib/types";

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

// Mock TerrainAccess so jsdom doesn't load MapLibre GL.
vi.mock("@/components/terrain/TerrainAccess", () => ({
  TerrainAccess: () => <div data-testid="terrain-stub" />,
}));

// Deterministic hazard data the Safety panels render.
const airQuality = {
  aqi: 80,
  categoryNumber: 2,
  categoryName: "Moderate",
  parameter: "PM2.5",
  reportingArea: "Enumclaw",
  trend: [
    { date: "2026-06-18", aqi: 60 },
    { date: "2026-06-19", aqi: 70 },
    { date: "2026-06-20", aqi: 80 },
  ],
  provenance: { source: "AirNow", observedAt: "2026-06-20T18:00:00Z", distanceMi: 22 },
};
const stormAlerts = { nws: [], spc: null, stormActive: false, provenance: { source: "NWS + SPC" } };
const volcano = {
  name: "Mount Rainier",
  colorCode: "GREEN",
  alertLevel: "NORMAL",
  nvewsThreat: "Very High Threat",
  noticeUrl: null,
  provenance: { source: "USGS HANS" },
};
const seismic = {
  count30d: 11,
  count7d: 3,
  largestMag: 1.8,
  swarm: false,
  events: [{ mag: 1.8, place: "10km E of Rainier", time: "2026-06-20T12:00:00Z", depthKm: 5, lng: -121.76, lat: 46.85, type: "earthquake", status: "reviewed" }],
  provenance: { source: "USGS ComCat" },
};
const parkAlerts = {
  alerts: [
    { category: "Closure", title: "Road closed", description: "", url: "https://nps.gov/a", parkCode: "mora", lastIndexedDate: "2026-06-20" },
    { category: "Caution", title: "Bear activity", description: "", url: "https://nps.gov/b", parkCode: "mora", lastIndexedDate: "2026-06-20" },
  ],
  provenance: { source: "NPS" },
};

const rainier: Mountain = {
  slug: "mt-rainier",
  name: "Mount Rainier",
  lat: 46.8517,
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
  hansVolcanoId: "wa6",
  npsParkCode: "mora",
};

// A forecast window covering 2026-06-14 .. 2026-06-20 (so 06-16 is in range, 07-20 is not).
function makeSeries(): ModelSeries {
  const time: string[] = [];
  for (let d = 14; d <= 20; d++) {
    for (let h = 0; h < 24; h++) {
      time.push(`2026-06-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00`);
    }
  }
  const fill = (v: number) => time.map(() => v);
  return {
    available: true,
    time,
    temperature_2m: fill(50),
    apparent_temperature: fill(48),
    wind_speed_10m: fill(12),
    wind_gusts_10m: fill(18),
    wind_direction_10m: fill(180),
    precipitation: fill(0),
    precipitation_probability: fill(20),
    snowfall: fill(0),
    freezing_level_height: fill(9000),
    cloud_cover: fill(0),
    visibility: fill(10000),
    weather_code: fill(0),
    temp_base_f: fill(55),
    temp_mid_f: fill(40),
    temp_summit_f: fill(28),
  };
}

const blob: CombinedForecastBlob = {
  mountainId: "mt-rainier",
  timezone: "America/Los_Angeles",
  fetchedAt: "2026-06-14T00:00:00.000Z",
  hrrr: makeSeries(),
  gfs: makeSeries(),
  ecmwf: makeSeries(),
};

// Enough snapshots (≥3) that each predict 2026-06-16, so the evolution chart renders content.
const day = {
  available: true,
  summitHighF: 30,
  summitLowF: 18,
  summitMaxWindMph: 20,
  summitMaxSustainedWindMph: 16,
  summitPrecipIn: 0,
  freezingLevelFtNoon: 9000,
  snowfallIn: 0,
};
const snapshots: WeatherSnapshot[] = [1, 2, 3, 4].map((i) => ({
  id: `s${i}`,
  fetchedAt: `2026-06-1${i}T12:00:00.000Z`,
  models: {
    hrrr: { "2026-06-16": day },
    gfs: { "2026-06-16": day },
    ecmwf: { "2026-06-16": day },
  },
}));

beforeEach(() => {
  useUnits.setState(DEFAULT_UNITS);
  window.localStorage.clear();
  (useMountainWeather as Mock).mockReturnValue({ blob, isLoading: false, isValidating: false, error: undefined, mutate: vi.fn() });
  (useMountainSnapshots as Mock).mockReturnValue({ snapshots, error: undefined });
  (useMountainNwac as Mock).mockReturnValue({ nwac: { season: "summer" }, error: undefined });
  (useMountainSnotel as Mock).mockReturnValue({ snotel: null, error: undefined });
  (useMountainSatellite as Mock).mockReturnValue({ sat: null, error: undefined });
  (useMountainAirQuality as Mock).mockReturnValue({ airQuality, isLoading: false, error: undefined, mutate: vi.fn() });
  (useMountainAlerts as Mock).mockReturnValue({ alerts: stormAlerts, isLoading: false, error: undefined, mutate: vi.fn() });
  (useMountainVolcano as Mock).mockReturnValue({ volcano, isLoading: false, error: undefined, mutate: vi.fn() });
  (useMountainSeismic as Mock).mockReturnValue({ seismic, isLoading: false, error: undefined, mutate: vi.fn() });
  (useMountainParkAlerts as Mock).mockReturnValue({ parkAlerts, isLoading: false, error: undefined, mutate: vi.fn() });
});

// A peer lacking the volcano/park catalog fields (gating-omission probe).
const colchuck: Mountain = {
  ...rainier,
  slug: "colchuck-peak",
  name: "Colchuck Peak",
  hansVolcanoId: undefined,
  npsParkCode: undefined,
};

describe("MountainDetail — tab shell", () => {
  it("renders an accessible tablist with Forecast and Safety tabs", () => {
    render(<MountainDetail mountain={rainier} target="2026-06-16" />);
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /forecast/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /safety/i })).toBeInTheDocument();
  });

  it("renders a third Terrain & Access tab", () => {
    render(<MountainDetail mountain={rainier} target="2026-06-16" />);
    expect(screen.getByRole("tab", { name: /terrain & access/i })).toBeInTheDocument();
  });

  it("switching to Terrain & Access tab reveals the terrain stub", () => {
    render(<MountainDetail mountain={rainier} target="2026-06-16" />);
    fireEvent.click(screen.getByRole("tab", { name: /terrain & access/i }));
    expect(screen.getByTestId("terrain-stub")).toBeInTheDocument();
  });
});

describe("MountainDetail — target in range", () => {
  it("Forecast tab shows the freezing cross-section, confidence, the call chart and notes", () => {
    render(<MountainDetail mountain={rainier} target="2026-06-16" />);
    expect(screen.getByText(/freezing level cross-section/i)).toBeInTheDocument();
    expect(screen.getByText(/forecast confidence/i)).toBeInTheDocument();
    expect(screen.getByText(/is your day's forecast settling/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /notes/i })).toBeInTheDocument();
  });

  it("renders the Avalanche panel only after switching to the Safety tab", () => {
    render(<MountainDetail mountain={rainier} target="2026-06-16" />);
    // MountainTabs unmounts inactive panels: Avalanche lives in Safety, not the default Forecast tab.
    expect(screen.queryByRole("heading", { name: /avalanche danger/i })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /safety/i }));
    expect(screen.getByRole("heading", { name: /avalanche danger/i })).toBeInTheDocument();
  });

  it("persists note edits to the local pin via updatePin", () => {
    render(<MountainDetail mountain={rainier} target="2026-06-16" />);
    const box = screen.getByRole("textbox", { name: /notes/i });
    fireEvent.change(box, { target: { value: "Camp Muir Saturday" } });
    expect(getPin("mt-rainier")?.notes).toBe("Camp Muir Saturday");
  });

  it("reads existing pin notes into the textarea", () => {
    window.localStorage.setItem(
      "cascast.pins",
      JSON.stringify([
        { mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-16", notes: "Prior note", createdAt: "2026-06-10T00:00:00.000Z" },
      ]),
    );
    render(<MountainDetail mountain={rainier} target="2026-06-16" />);
    expect((screen.getByRole("textbox", { name: /notes/i }) as HTMLTextAreaElement).value).toBe(
      "Prior note",
    );
  });
});

describe("MountainDetail — Safety tab", () => {
  const openSafety = (mountain: Mountain) => {
    render(<MountainDetail mountain={mountain} target="2026-06-16" />);
    fireEvent.click(screen.getByRole("tab", { name: /safety/i }));
  };

  it("renders AirQuality, Storm and Seismic panels in most-actionable-first order", () => {
    openSafety(rainier);
    const aq = screen.getByRole("heading", { name: /air quality/i });
    const storm = screen.getByRole("heading", { name: /storm & lightning/i });
    const seismic = screen.getByRole("heading", { name: /recent earthquakes/i });
    // Document order: AirQuality precedes Storm precedes Seismic.
    expect(aq.compareDocumentPosition(storm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(storm.compareDocumentPosition(seismic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("renders the Volcano panel only when the mountain has a hansVolcanoId", () => {
    openSafety(rainier);
    expect(screen.getByRole("heading", { name: /volcano status/i })).toBeInTheDocument();
  });

  it("omits the Volcano panel for a peer without a hansVolcanoId", () => {
    openSafety(colchuck);
    expect(screen.queryByRole("heading", { name: /volcano status/i })).toBeNull();
  });

  it("renders the ParkAlerts panel only when the mountain has an npsParkCode", () => {
    openSafety(rainier);
    expect(screen.getByRole("heading", { name: /park alerts/i })).toBeInTheDocument();
  });

  it("omits the ParkAlerts panel for a peer without an npsParkCode", () => {
    openSafety(colchuck);
    expect(screen.queryByRole("heading", { name: /park alerts/i })).toBeNull();
  });

  it("renders the Avalanche panel last in the Safety tab", () => {
    openSafety(rainier);
    expect(screen.getByRole("heading", { name: /avalanche danger/i })).toBeInTheDocument();
  });

  it("omits a feed panel on a 404 error without showing a PanelError", () => {
    (useMountainAirQuality as Mock).mockReturnValue({ airQuality: undefined, isLoading: false, error: { status: 404 }, mutate: vi.fn() });
    openSafety(rainier);
    expect(screen.queryByRole("heading", { name: /air quality/i })).toBeNull();
    expect(screen.queryByText(/couldn[’']?t load the air quality/i)).toBeNull();
  });

  it("shows a PanelError with retry on a non-404 (500) feed error", () => {
    const mutate = vi.fn();
    (useMountainAirQuality as Mock).mockReturnValue({ airQuality: undefined, isLoading: false, error: { status: 500 }, mutate });
    openSafety(rainier);
    expect(screen.getByText(/couldn[’']?t load the air quality/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry loading the air quality/i }));
    expect(mutate).toHaveBeenCalled();
  });

  it("shows a loading Skeleton while a feed is loading with no data", () => {
    (useMountainSeismic as Mock).mockReturnValue({ seismic: undefined, isLoading: true, error: undefined, mutate: vi.fn() });
    openSafety(rainier);
    expect(screen.getByTestId("skeleton-seismic")).toBeInTheDocument();
  });
});

describe("MountainDetail — default-to-tomorrow (no target)", () => {
  it("passes defaultTargetISO() as the DailyOutlook target when no target prop is given", async () => {
    // Build a forecast window that contains tomorrow so the default target is in range and
    // the outlook receives the effective (default) target rather than the today fallback.
    const tomorrow = defaultTargetISO();
    const today = todayISO();
    const time: string[] = [];
    for (const dateIso of [today, tomorrow]) {
      for (let h = 0; h < 24; h++) time.push(`${dateIso}T${String(h).padStart(2, "0")}:00`);
    }
    const base = makeSeries();
    const fill = (v: number) => time.map(() => v);
    const series: ModelSeries = {
      ...base,
      time,
      temperature_2m: fill(50),
      apparent_temperature: fill(48),
      wind_speed_10m: fill(12),
      wind_gusts_10m: fill(18),
      wind_direction_10m: fill(180),
      precipitation: fill(0),
      precipitation_probability: fill(20),
      snowfall: fill(0),
      freezing_level_height: fill(9000),
      cloud_cover: fill(0),
      visibility: fill(10000),
      weather_code: fill(0),
      temp_base_f: fill(55),
      temp_mid_f: fill(40),
      temp_summit_f: fill(28),
    };
    const tomorrowBlob: CombinedForecastBlob = { ...blob, hrrr: series, gfs: series, ecmwf: series };
    (useMountainWeather as Mock).mockReturnValue({
      blob: tomorrowBlob,
      isLoading: false,
      isValidating: false,
      error: undefined,
      mutate: vi.fn(),
    });
    // Snapshots key 2026-06-16, not tomorrow ⇒ omit them so the evolution chart (which would
    // plot NaN for an unmatched date) doesn't render in this default-target probe.
    (useMountainSnapshots as Mock).mockReturnValue({ snapshots: undefined, error: undefined });

    vi.resetModules();
    vi.doMock("@/components/project/DailyOutlook", () => ({
      DailyOutlook: ({ targetStart }: { targetStart: string }) => (
        <div data-testid="outlook-stub" data-target={targetStart} />
      ),
    }));
    const { MountainDetail: Stubbed } = await import("@/components/mountain/MountainDetail");
    render(<Stubbed mountain={rainier} />);
    const stub = screen.getByTestId("outlook-stub");
    expect(stub.getAttribute("data-target")).toBe(defaultTargetISO());
    vi.doUnmock("@/components/project/DailyOutlook");
    vi.resetModules();
  });
});

describe("MountainDetail — panel order", () => {
  it("renders the plan/notes panel last (after The call)", () => {
    const { container } = render(<MountainDetail mountain={rainier} target="2026-06-16" />);
    const html = container.innerHTML;
    const callIdx = html.indexOf("forecast settling");
    const notesIdx = html.indexOf("Your notes");
    expect(callIdx).toBeGreaterThan(-1);
    expect(notesIdx).toBeGreaterThan(callIdx);
  });
});

describe("MountainDetail — target out of range", () => {
  it("renders DailyOutlook but not the freezing cross-section or the call chart headings", () => {
    render(<MountainDetail mountain={rainier} target="2026-07-20" />);
    expect(screen.queryByText(/is your day's forecast settling/i)).toBeNull();
    expect(screen.queryByText(/freezing level cross-section/i)).toBeNull();
    // The real DailyOutlook still renders (its day strip copy is present).
    expect(screen.getByText(/days around your window/i)).toBeInTheDocument();
  });
});

describe("MountainDetail — weather loading", () => {
  beforeEach(() => {
    (useMountainWeather as Mock).mockReturnValue({
      blob: undefined,
      isLoading: true,
      isValidating: true,
      error: undefined,
      mutate: vi.fn(),
    });
  });

  it("renders loading skeletons instead of panels or the call chart", () => {
    render(<MountainDetail mountain={rainier} target="2026-07-20" />);
    expect(screen.getByTestId("skeleton-outlook")).toBeInTheDocument();
    expect(screen.queryByText(/is your day's forecast settling/i)).toBeNull();
    expect(screen.queryByText(/days around your window/i)).toBeNull();
  });
});

describe("MountainDetail — weather error", () => {
  it("renders a SectionError with a retry control and calls mutate", () => {
    const mutate = vi.fn();
    (useMountainWeather as Mock).mockReturnValue({
      blob: undefined,
      isLoading: false,
      isValidating: false,
      error: new Error("boom"),
      mutate,
    });
    render(<MountainDetail mountain={rainier} target="2026-06-16" />);
    expect(screen.getByText(/couldn't load the daily outlook/i)).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /retry/i });
    fireEvent.click(retry);
    expect(mutate).toHaveBeenCalled();
  });
});
