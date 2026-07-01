import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ForecastEvolutionChart } from "@/components/modellab/ForecastEvolutionChart";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { WeatherSnapshot, ModelDaySummary } from "@/lib/types";

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
const TARGET = "2026-02-14";
const mk = (id: string, day: string, high: number): WeatherSnapshot => ({
  id,
  fetchedAt: `${day}T12:00:00Z`,
  models: { hrrr: {}, gfs: { [TARGET]: dm(high) }, ecmwf: { [TARGET]: dm(high + 2) } },
});
const active = { hrrr: true, gfs: true, ecmwf: true };

describe("ForecastEvolutionChart", () => {
  beforeEach(() => useUnits.setState(DEFAULT_UNITS));

  it("renders an empty state with fewer than 3 snapshots", () => {
    render(
      <ForecastEvolutionChart
        snapshots={[mk("a", "2026-02-12", 12)]}
        targetDate={TARGET}
        active={active}
      />,
    );
    expect(screen.getByText(/tracking just started/i)).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeNull();
  });

  it("renders the chart with 3+ snapshots", () => {
    const snaps = [
      mk("a", "2026-02-05", 24),
      mk("b", "2026-02-06", 20),
      mk("c", "2026-02-11", 16),
      mk("d", "2026-02-12", 13),
    ];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate={TARGET} active={active} />);
    expect(document.querySelector("svg")).toBeInTheDocument();
    // solid line(s) + filled markers drawn for the models with data.
    expect(document.querySelectorAll("circle").length).toBeGreaterThanOrEqual(1);
  });

  it("plots only snapshots that carry the chosen target date", () => {
    const other = "2026-02-15";
    const snaps: WeatherSnapshot[] = [
      // newest two carry `other`; older three carry only TARGET (via mk)
      { id: "n2", fetchedAt: "2026-02-13T12:00:00Z",
        models: { hrrr: {}, gfs: { [other]: dm(40) }, ecmwf: { [other]: dm(42) } } },
      { id: "n1", fetchedAt: "2026-02-12T12:00:00Z",
        models: { hrrr: {}, gfs: { [other]: dm(38) }, ecmwf: { [other]: dm(40) } } },
      mk("a", "2026-02-05", 24),
      mk("b", "2026-02-06", 20),
      mk("c", "2026-02-11", 16),
    ];
    const { container } = render(
      <ForecastEvolutionChart snapshots={snaps} targetDate={other} active={active} />,
    );
    // gfs + ecmwf each have 2 markers (only the 2 snapshots with `other`): 4 total.
    expect(container.querySelectorAll("circle").length).toBe(4);
  });

  it("switches the plotted variable", () => {
    const snaps = [
      mk("a", "2026-02-05", 24),
      mk("b", "2026-02-06", 20),
      mk("c", "2026-02-11", 16),
    ];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate={TARGET} active={active} />);
    fireEvent.click(screen.getByRole("radio", { name: /wind/i }));
    expect(screen.getByRole("radio", { name: /wind/i })).toHaveAttribute("aria-checked", "true");
  });

  it("renders a Models legend with model names", () => {
    const snaps = [
      mk("a", "2026-02-05", 24),
      mk("b", "2026-02-06", 20),
      mk("c", "2026-02-11", 16),
    ];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate={TARGET} active={active} />);
    expect(screen.getByText(/^models$/i)).toBeInTheDocument();
    expect(screen.getByText(/^GFS$/)).toBeInTheDocument();
    expect(screen.getByText(/^ECMWF$/)).toBeInTheDocument();
  });

  it("fades an inactive model series", () => {
    const snaps = [
      mk("a", "2026-02-05", 24),
      mk("b", "2026-02-06", 20),
      mk("c", "2026-02-11", 16),
    ];
    const { container } = render(
      <ForecastEvolutionChart
        snapshots={snaps}
        targetDate={TARGET}
        active={{ ...active, gfs: false }}
      />,
    );
    const faded = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("opacity") === "0.45",
    );
    expect(faded.length).toBeGreaterThanOrEqual(1);
  });

  it("shows the new two-signal caption", () => {
    const snaps = [mk("a", "2026-02-05", 24), mk("b", "2026-02-06", 20), mk("c", "2026-02-11", 16)];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate={TARGET} active={active} />);
    expect(screen.getByText(/how settled each model is/i)).toBeInTheDocument();
  });

  it("renders a per-model stability chip (settled green when a model holds steady)", () => {
    // newest-first: gfs highs over newest 3 = 22, 21, 20 → range 2 ≤ 4 ⇒ settled.
    const snaps = [
      mk("c", "2026-02-11", 22),
      mk("b", "2026-02-06", 21),
      mk("a", "2026-02-05", 20),
    ];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate={TARGET} active={active} />);
    // chip text format: "±N °F / 3 runs" — GFS and ECMWF each have 3 runs → exactly 2 chips
    expect(screen.getAllByText(/\/\s*3\s*runs/i)).toHaveLength(2);
  });

  it("shows '—' stability for a model with no target-day data (HRRR absent)", () => {
    const snaps = [mk("a", "2026-02-05", 24), mk("b", "2026-02-06", 20), mk("c", "2026-02-11", 16)];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate={TARGET} active={active} />);
    expect(screen.getAllByText("—")).toHaveLength(1);
  });
});
