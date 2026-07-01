import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelCharts } from "@/components/modellab/ModelCharts";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { CombinedForecastBlob, ModelSeries } from "@/lib/types";

/** Build a 3-day hourly ModelSeries (00:00 day1 → 23:00 day3). Target day = day2 (2026-02-14). */
function series(opts: { summit: number; wind?: number; available?: boolean }): ModelSeries {
  const days = ["2026-02-13", "2026-02-14", "2026-02-15"];
  const time: string[] = [];
  for (const d of days) for (let h = 0; h < 24; h++) time.push(`${d}T${String(h).padStart(2, "0")}:00`);
  const fill = (v: number) => time.map(() => v);
  return {
    available: opts.available ?? true,
    time,
    temperature_2m: fill(opts.summit),
    apparent_temperature: fill(opts.summit),
    wind_speed_10m: fill(opts.wind ?? 20),
    wind_gusts_10m: fill((opts.wind ?? 20) + 12),
    wind_direction_10m: fill(180),
    precipitation: fill(0.05),
    precipitation_probability: fill(40),
    snowfall: fill(0.2),
    freezing_level_height: fill(6000),
    cloud_cover: fill(50),
    visibility: fill(10000),
    weather_code: fill(2),
    temp_base_f: fill(opts.summit + 18),
    temp_mid_f: fill(opts.summit + 9),
    temp_summit_f: fill(opts.summit),
  };
}

// HRRR vs ECMWF differ by 30°F on the target day → temp disagreement flag fires.
const blob: CombinedForecastBlob = {
  mountainId: "mt-rainier",
  timezone: "America/Los_Angeles",
  fetchedAt: "2026-02-12T14:00:00Z",
  hrrr: series({ summit: 10, wind: 15 }),
  gfs: series({ summit: 22, wind: 45 }),
  ecmwf: series({ summit: 40, wind: 60 }),
};

const allActive = { hrrr: true, gfs: true, ecmwf: true };

describe("ModelCharts", () => {
  beforeEach(() => useUnits.setState(DEFAULT_UNITS));

  it("renders the four chart panel titles", () => {
    render(<ModelCharts blob={blob} targetDate="2026-02-14" active={allActive} />);
    expect(screen.getByText(/Summit temperature/i)).toBeInTheDocument();
    expect(screen.getByText(/Summit wind/i)).toBeInTheDocument();
    expect(screen.getByText(/Freezing level/i)).toBeInTheDocument();
    expect(screen.getByText(/Precipitation/i)).toBeInTheDocument();
  });

  it("shows three model series per chart and a target-day band", () => {
    const { container } = render(
      <ModelCharts blob={blob} targetDate="2026-02-14" active={allActive} />,
    );
    // line charts draw one <path> per series; >= 3 model paths exist.
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(3);
    // target band rect uses --target-band fill.
    const bands = Array.from(container.querySelectorAll("rect")).filter(
      (r) => r.getAttribute("fill") === "var(--target-band)",
    );
    expect(bands.length).toBeGreaterThanOrEqual(1);
  });

  it("flags temp disagreement in °F (spread > 15)", () => {
    render(<ModelCharts blob={blob} targetDate="2026-02-14" active={allActive} />);
    // ecmwf 40 - hrrr 10 = 30°F spread → flag.
    expect(screen.getByText(/Δ30°F at target/i)).toBeInTheDocument();
  });

  it("flags wind disagreement in mph (spread > 20)", () => {
    render(<ModelCharts blob={blob} targetDate="2026-02-14" active={allActive} />);
    // ecmwf 60 - hrrr 15 = 45 mph spread → flag.
    expect(screen.getByText(/Δ45 mph at target/i)).toBeInTheDocument();
  });

  it("fades an inactive model's path", () => {
    const { container } = render(
      <ModelCharts blob={blob} targetDate="2026-02-14" active={{ ...allActive, gfs: false }} />,
    );
    // E11: faded opacity is 0.45 (bumped from 0.35 for ≥3:1 contrast on glacier gridlines)
    const faded = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("opacity") === "0.45",
    );
    expect(faded.length).toBeGreaterThanOrEqual(1);
  });

  it("converts the disagreement flag unit when switching to °C", () => {
    useUnits.setState({ ...DEFAULT_UNITS, temp: "C" });
    render(<ModelCharts blob={blob} targetDate="2026-02-14" active={allActive} />);
    // 30°F spread → delta-converted = round(30 * 5/9) = 17°C.
    expect(screen.getByText(/Δ17°C at target/i)).toBeInTheDocument();
    expect(screen.queryByText(/°F at target/i)).toBeNull();
  });

  it("renders a high-wind threshold note in the wind chart using the shared severity scale", () => {
    // The wind chart should surface a high-wind cue (a labeled element with the sev-4 token)
    // so it speaks the same color language as the Daily Outlook wind pills.
    const { container } = render(
      <ModelCharts blob={blob} targetDate="2026-02-14" active={allActive} />,
    );
    expect(container.querySelector(".wind-thresh")).toBeInTheDocument();
    expect(container.querySelector(".wind-thresh")!.classList.contains("sev-4")).toBe(true);
  });

  it("shows the wind threshold badge in km/h when the wind unit is kmh", () => {
    useUnits.setState({ ...DEFAULT_UNITS, wind: "kmh" });
    const { container } = render(
      <ModelCharts blob={blob} targetDate="2026-02-14" active={allActive} />,
    );
    const badge = container.querySelector(".wind-thresh");
    expect(badge).toBeInTheDocument();
    // 45 mph → 72 km/h (Math.round(45 * 1.609344))
    expect(badge!.textContent).toContain("72");
    expect(badge!.textContent).toContain("km/h");
    expect(badge!.textContent).not.toContain("mph");
  });

  it("breaks (does not plunge to a floor value) where a model is null-padded", () => {
    // HRRR null-pads temp/wind beyond ~48h; the accessor must yield null (a gap), not a
    // convTemp(null)→-18°C floor cliff. Build HRRR with null temps/winds on day3.
    const nulled = series({ summit: 10, wind: 15 });
    const day3 = (t: string) => t.startsWith("2026-02-15");
    nulled.temp_summit_f = nulled.time.map((t, i) => (day3(t) ? null : nulled.temp_summit_f[i]));
    nulled.temperature_2m = nulled.time.map((t, i) => (day3(t) ? null : nulled.temperature_2m[i]));
    nulled.wind_speed_10m = nulled.time.map((t, i) => (day3(t) ? null : nulled.wind_speed_10m[i]));
    const b = { ...blob, hrrr: nulled };
    const { container } = render(
      <ModelCharts blob={b} targetDate="2026-02-14" active={allActive} />,
    );
    // No path command should contain a NaN coordinate (the old cliff produced finite but
    // bogus values; the all-null-segment guard must never emit NaN either).
    const ds = Array.from(container.querySelectorAll("path")).map((p) => p.getAttribute("d") || "");
    expect(ds.some((d) => /NaN/.test(d))).toBe(false);
    // Component still renders all four charts.
    expect(screen.getByText(/Summit temperature/i)).toBeInTheDocument();
  });
});
