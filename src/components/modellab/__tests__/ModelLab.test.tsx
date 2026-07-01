import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelLab } from "@/components/modellab/ModelLab";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { CombinedForecastBlob, ModelSeries, WeatherSnapshot, ModelDaySummary } from "@/lib/types";

function series(summit: number): ModelSeries {
  const days = ["2026-02-13", "2026-02-14", "2026-02-15"];
  const time: string[] = [];
  for (const d of days) for (let h = 0; h < 24; h++) time.push(`${d}T${String(h).padStart(2, "0")}:00`);
  const fill = (v: number) => time.map(() => v);
  return {
    available: true,
    time,
    temperature_2m: fill(summit),
    apparent_temperature: fill(summit),
    wind_speed_10m: fill(20),
    wind_gusts_10m: fill(32),
    wind_direction_10m: fill(180),
    precipitation: fill(0.05),
    precipitation_probability: fill(40),
    snowfall: fill(0.2),
    freezing_level_height: fill(6000),
    cloud_cover: fill(50),
    visibility: fill(10000),
    weather_code: fill(2),
    temp_base_f: fill(summit + 18),
    temp_mid_f: fill(summit + 9),
    temp_summit_f: fill(summit),
  };
}

const blob: CombinedForecastBlob = {
  mountainId: "mt-rainier",
  timezone: "America/Los_Angeles",
  fetchedAt: "2026-02-12T14:00:00Z",
  hrrr: series(12),
  gfs: series(16),
  ecmwf: series(20),
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

const mountain = { slug: "mt-rainier", name: "Mount Rainier", lat: 46.8523, lng: -121.7603 };

describe("ModelLab", () => {
  beforeEach(() => useUnits.setState(DEFAULT_UNITS));

  it("renders the sub-header title, three model chips, intro, and sub-sections", () => {
    render(<ModelLab mountain={mountain} blob={blob} snapshots={snapshots} target="2026-02-14" />);
    expect(screen.getByText(/Model Lab — Mount Rainier/i)).toBeInTheDocument();
    ["HRRR", "GFS", "ECMWF"].forEach((m) =>
      expect(screen.getByRole("button", { name: new RegExp(m) })).toBeInTheDocument(),
    );
    expect(screen.getByText(/RAW MULTI-MODEL COMPARISON/i)).toBeInTheDocument();
    expect(screen.getByText(/TARGET 2026-02-14 HIGHLIGHTED/i)).toBeInTheDocument();
    expect(screen.getByText(/Forecast evolution/i)).toBeInTheDocument();
    expect(screen.getByText(/Hourly grid/i)).toBeInTheDocument();
  });

  it("has a back link to the focused mountain detail when a target is set", () => {
    render(<ModelLab mountain={mountain} blob={blob} snapshots={snapshots} target="2026-02-14" />);
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute(
      "href",
      "/mountains/mt-rainier?target=2026-02-14",
    );
  });

  it("without a target: back link is the browse view and the evolution prompt shows", () => {
    render(<ModelLab mountain={mountain} blob={blob} snapshots={snapshots} />);
    expect(screen.getByRole("link", { name: /back/i })).toHaveAttribute("href", "/mountains/mt-rainier");
    expect(screen.getByText(/NO TARGET PINNED/i)).toBeInTheDocument();
    expect(screen.getByTestId("evolution-prompt")).toBeInTheDocument();
  });

  it("toggling a model chip fades that model's series", () => {
    const { container } = render(
      <ModelLab mountain={mountain} blob={blob} snapshots={snapshots} target="2026-02-14" />,
    );
    const before = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("opacity") === "0.45",
    ).length;
    fireEvent.click(screen.getByRole("button", { name: /GFS/ }));
    const after = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("opacity") === "0.45",
    ).length;
    expect(after).toBeGreaterThan(before);
  });

  it("renders the wider lab containers", () => {
    const { container } = render(
      <ModelLab mountain={mountain} blob={blob} snapshots={snapshots} target="2026-02-14" />,
    );
    expect(container.querySelector(".lab")).toBeInTheDocument();
    expect(container.querySelector(".lab-body")).toBeInTheDocument();
    expect(container.querySelector(".lab-grid")).toBeInTheDocument();
  });
});
