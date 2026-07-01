import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HourlyGrid } from "@/components/modellab/HourlyGrid";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { CombinedForecastBlob, ModelSeries } from "@/lib/types";

/** Two target-day hours: a very cold summit (8°F) and a hot wind (50 mph) hour. */
function gfsSeries(): ModelSeries {
  const time = ["2026-02-14T00:00", "2026-02-14T12:00"];
  return {
    available: true,
    time,
    temperature_2m: [8, 30],
    apparent_temperature: [2, 24],
    wind_speed_10m: [10, 50],
    wind_gusts_10m: [20, 65],
    wind_direction_10m: [180, 200],
    precipitation: [0, 0.2],
    precipitation_probability: [10, 70],
    snowfall: [0, 1.5],
    freezing_level_height: [4000, 6000],
    cloud_cover: [20, 80],
    visibility: [12000, 8000],
    weather_code: [1, 71],
    temp_base_f: [26, 48],
    temp_mid_f: [17, 39],
    temp_summit_f: [8, 30],
  };
}

const blob: CombinedForecastBlob = {
  mountainId: "mt-rainier",
  timezone: "America/Los_Angeles",
  fetchedAt: "2026-02-12T14:00:00Z",
  hrrr: null, // HRRR does not reach the target date
  gfs: gfsSeries(),
  ecmwf: gfsSeries(),
};

describe("HourlyGrid", () => {
  beforeEach(() => useUnits.setState(DEFAULT_UNITS));

  it("renders a monospace table with an Hour header and variable rows", () => {
    render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    expect(screen.getByText("Hour")).toBeInTheDocument();
    expect(screen.getByText(/Wind mph/i)).toBeInTheDocument();
    expect(screen.getByText(/Freezing/i)).toBeInTheDocument();
    expect(document.querySelector(".grid-table")).toBeInTheDocument();
    expect(document.querySelector(".grid-scroll")).toBeInTheDocument();
  });

  it("marks cold summit cells and hot wind cells", () => {
    const { container } = render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    expect(container.querySelector("td.cell-cold")).toBeInTheDocument(); // 8°F summit
    expect(container.querySelector("td.cell-hot")).toBeInTheDocument(); // 50 mph / 65 gust
  });

  it("conveys cold/hot/high-wind state by a non-color signal (glyph + aria-label), not color alone", () => {
    const { container } = render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    // glyph badges are present (not color-only)
    expect(container.querySelectorAll("td.cell-cold .cell-flag").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("td.cell-hot .cell-flag").length).toBeGreaterThan(0);
    // aria-labels spell out the state for assistive tech
    expect(container.querySelector('td[aria-label*="below freezing"]')).toBeInTheDocument();
    expect(container.querySelector('td[aria-label*="high wind"]')).toBeInTheDocument();
  });

  it("uses row header cells with scope=row for the row labels", () => {
    const { container } = render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    const rowHeaders = container.querySelectorAll('th[scope="row"].rowlbl');
    expect(rowHeaders.length).toBeGreaterThan(0);
  });

  it("E8: hour header cells in thead carry scope=col", () => {
    const { container } = render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    const colHeaders = container.querySelectorAll('thead th[scope="col"]');
    expect(colHeaders.length).toBeGreaterThan(0);
  });

  it("shows the HRRR fallback when the model has no target rows", () => {
    render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    fireEvent.click(screen.getByRole("radio", { name: "HRRR" }));
    expect(screen.getByText(/does not extend to the target date/i)).toBeInTheDocument();
    expect(document.querySelector(".grid-table")).toBeNull();
  });

  it("converts temps when switching to °C", () => {
    render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    // 8°F summit shown initially.
    expect(screen.getByText("8")).toBeInTheDocument();
    useUnits.setState({ ...DEFAULT_UNITS, temp: "C" });
    render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    // 8°F → -13°C.
    expect(screen.getAllByText("-13").length).toBeGreaterThanOrEqual(1);
  });

  it("adds a sev-* class to wind cells matching the shared severity scale", () => {
    // 50 mph wind → windSeverity(50) = 4; gust 65 mph → windSeverity(65) = 4.
    // 10 mph wind → windSeverity(10) = 1.
    const { container } = render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    // High-wind cell must carry sev-4
    expect(container.querySelector("td.sev-4")).toBeInTheDocument();
    // Low-wind cell must carry sev-1
    expect(container.querySelector("td.sev-1")).toBeInTheDocument();
  });

  it("high-wind cells retain the ⚡ glyph and high-wind aria-label alongside the sev-* class", () => {
    const { container } = render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    // E9: high-wind td must carry sev-4 + cell-hot + ⚡ glyph (distinct from ▲ hot-temp) + aria-label
    const highWindCell = container.querySelector("td.sev-4.cell-hot");
    expect(highWindCell).toBeInTheDocument();
    expect(highWindCell!.querySelector(".cell-flag")).toBeInTheDocument();
    expect(highWindCell!.querySelector(".cell-flag")!.textContent).toContain("⚡");
    expect(highWindCell!.getAttribute("aria-label")).toMatch(/high wind/i);
  });

  it("E9: cold-temp cells use ❄ glyph (distinct from ▲ hot-temp and ⚡ wind)", () => {
    const { container } = render(<HourlyGrid blob={blob} targetDate="2026-02-14" />);
    // The 8°F summit is cold (≤15°F) → ❄ glyph, not △ or ⚡
    const coldCell = container.querySelector("td.cell-cold");
    expect(coldCell).toBeInTheDocument();
    expect(coldCell!.querySelector(".cell-flag")!.textContent).toContain("❄");
  });
});
