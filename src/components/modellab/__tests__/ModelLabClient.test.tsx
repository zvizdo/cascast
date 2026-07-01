import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelLabClient } from "@/components/modellab/ModelLabClient";
import { useMountainWeather, useMountainSnapshots } from "@/lib/hooks";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { CombinedForecastBlob, ModelSeries } from "@/lib/types";

vi.mock("@/lib/hooks", () => ({
  useMountainWeather: vi.fn(),
  useMountainSnapshots: vi.fn(),
}));

const mutate = vi.fn();

function series(): ModelSeries {
  const days = ["2026-02-13", "2026-02-14", "2026-02-15"];
  const time: string[] = [];
  for (const d of days) for (let h = 0; h < 24; h++) time.push(`${d}T${String(h).padStart(2, "0")}:00`);
  const fill = (v: number) => time.map(() => v);
  return {
    available: true,
    time,
    temperature_2m: fill(12),
    apparent_temperature: fill(12),
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
    temp_base_f: fill(30),
    temp_mid_f: fill(21),
    temp_summit_f: fill(12),
  };
}

const blob: CombinedForecastBlob = {
  mountainId: "mt-rainier",
  timezone: "America/Los_Angeles",
  fetchedAt: "2026-02-12T14:00:00Z",
  hrrr: series(),
  gfs: series(),
  ecmwf: series(),
};

const mountain = { slug: "mt-rainier", name: "Mount Rainier", lat: 46.8523, lng: -121.7603 };

describe("ModelLabClient", () => {
  beforeEach(() => {
    useUnits.setState(DEFAULT_UNITS);
    (useMountainWeather as unknown as Mock).mockReturnValue({
      blob,
      isLoading: false,
      isValidating: false,
      error: null,
      mutate,
    });
    (useMountainSnapshots as unknown as Mock).mockReturnValue({ snapshots: [], error: null });
  });

  it("renders the Model Lab when data resolves", () => {
    render(<ModelLabClient mountain={mountain} target="2026-02-14" />);
    expect(screen.getByText(/Model Lab — Mount Rainier/i)).toBeInTheDocument();
  });

  it("shows skeleton placeholders while the weather blob is pending", () => {
    (useMountainWeather as unknown as Mock).mockReturnValue({
      blob: undefined,
      isLoading: true,
      isValidating: false,
      error: null,
      mutate,
    });
    render(<ModelLabClient mountain={mountain} />);
    expect(screen.getByTestId("modellab-loading")).toBeInTheDocument();
  });

  it("shows an error fallback when the weather blob fails to load", () => {
    (useMountainWeather as unknown as Mock).mockReturnValue({
      blob: undefined,
      isLoading: false,
      isValidating: false,
      error: new Error("boom"),
      mutate,
    });
    render(<ModelLabClient mountain={mountain} />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("waits for the weather blob before rendering the lab", () => {
    (useMountainWeather as unknown as Mock).mockReturnValue({
      blob: undefined,
      isLoading: false,
      isValidating: false,
      error: null,
      mutate,
    });
    render(<ModelLabClient mountain={mountain} />);
    expect(screen.getByTestId("modellab-loading")).toBeInTheDocument();
  });
});
