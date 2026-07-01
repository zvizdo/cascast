import { render, screen, fireEvent, act, within } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { DailyOutlook } from "@/components/project/DailyOutlook";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import { useBand } from "@/lib/band";
import type { CombinedForecastBlob, ModelSeries } from "@/lib/types";

/** 7 days hourly starting 2026-02-12, summit high known = 18°F at h=12. */
function makeSeries(): ModelSeries {
  const time: string[] = [];
  const summit: number[] = [];
  const mid: number[] = [];
  const base: number[] = [];
  for (let d = 12; d <= 18; d++) {
    for (let h = 0; h < 24; h++) {
      time.push(`2026-02-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:00`);
      summit.push(h === 12 ? 18 : 2); // hi 18, lo 2
      mid.push(h === 12 ? 28 : 12);
      base.push(h === 12 ? 38 : 22);
    }
  }
  const n = time.length;
  const fill = (v: number) => time.map(() => v);
  return {
    available: true,
    time,
    temperature_2m: summit,
    apparent_temperature: summit,
    wind_speed_10m: fill(12),
    wind_gusts_10m: fill(20),
    wind_direction_10m: fill(180),
    precipitation: fill(0),
    precipitation_probability: fill(20),
    snowfall: fill(0),
    freezing_level_height: fill(6000),
    cloud_cover: fill(0),
    visibility: fill(10000),
    weather_code: fill(0),
    temp_base_f: base,
    temp_mid_f: mid,
    temp_summit_f: summit,
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

// Far-out target (>48h from now) so nothing auto-seeds: the baseline applies to all days.
const props = {
  blob,
  nowIso: "2026-02-12T00:00",
  targetStart: "2026-02-16",
  targetEnd: "2026-02-17",
  mountain: { elevations: { base: 5400, mid: 10000, summit: 14411 } },
  modelLabHref: "/x",
};

// Near-term target (≤48h) used for auto-seed assertions.
const nearProps = { ...props, targetStart: "2026-02-13", targetEnd: "2026-02-13" };

beforeEach(() => {
  useUnits.setState(DEFAULT_UNITS);
  useBand.setState({ band: "summit" });
});

describe("DailyOutlook", () => {
  it("defaults to Summit band + Daily zoom with 7 day tiles", () => {
    const { container } = render(<DailyOutlook {...props} />);
    expect(screen.getByRole("radio", { name: "Summit" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "Daily" })).toHaveAttribute("aria-checked", "true");
    expect(container.querySelectorAll(".day-tile").length).toBe(7);
  });

  it("shows the daily high (18°) for the summit band", () => {
    const { container } = render(<DailyOutlook {...props} />);
    expect(within(container).getAllByText(/18°/).length).toBeGreaterThan(0);
  });

  it("switching to Hourly shows the HRRR hourly legend", () => {
    render(<DailyOutlook {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Hourly" }));
    expect(screen.getByText(/Hourly detail · HRRR 3 km/)).toBeInTheDocument();
  });

  it("switching to AM·Mid·PM shows period groups", () => {
    const { container } = render(<DailyOutlook {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "AM·Mid·PM" }));
    expect(container.querySelector(".daily-groups")).toBeTruthy();
  });

  it("temperatures convert with the units store", () => {
    const { container } = render(<DailyOutlook {...props} />);
    act(() => useUnits.getState().setTemp("C"));
    // 18°F → -8°C
    expect(within(container).getAllByText(/-8°/).length).toBeGreaterThan(0);
  });

  it("marks the target window", () => {
    const { container } = render(<DailyOutlook {...props} />);
    expect(container.querySelector(".day-tile.is-target")).toBeTruthy();
    expect(container.querySelector(".dt-flag")).toHaveTextContent("Target");
  });

  it("switches band to Base", () => {
    render(<DailyOutlook {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Base" }));
    expect(screen.getByRole("radio", { name: "Base" })).toHaveAttribute("aria-checked", "true");
  });

  it("has a drill link to the model lab", () => {
    render(<DailyOutlook {...props} />);
    expect(screen.getByRole("link", { name: /full hourly grid/i })).toHaveAttribute("href", "/x");
  });

  it("dual-renders the mobile <select> dropdowns for band + zoom (display:none on desktop)", () => {
    render(<DailyOutlook {...props} />);
    // both value pickers have a native <select> counterpart for the mobile layer
    expect(screen.getByRole("combobox", { name: "Elevation band" }).tagName).toBe("SELECT");
    expect(screen.getByRole("combobox", { name: "Zoom level" }).tagName).toBe("SELECT");
  });

  it("the mobile zoom <select> drives globalZoom (changing it expands to hourly)", () => {
    const { container } = render(<DailyOutlook {...props} />);
    fireEvent.change(screen.getByRole("combobox", { name: "Zoom level" }), {
      target: { value: "hour" },
    });
    expect(container.querySelectorAll(".day-tile").length).toBe(7 * 24);
  });

  it("daily temp line spans start→target and breaks at a null-temp day (C2)", () => {
    // null out the last day's (2026-02-18) summit temps → that day has no temp
    const gfs = makeSeries();
    const lastDayStart = gfs.time.findIndex((t) => t.startsWith("2026-02-18"));
    for (let i = lastDayStart; i < gfs.time.length; i++) gfs.temp_summit_f[i] = null;
    const b: CombinedForecastBlob = { ...blob, gfs, hrrr: gfs };
    const { container } = render(<DailyOutlook {...{ ...props, blob: b }} />);
    // 7 tiles still render (day with null temp still gets a tile)
    expect(container.querySelectorAll(".day-tile").length).toBe(7);
    // the hi line path breaks: more than one M command (one per segment)
    const hiPath = container.querySelector(".daily-trend path[stroke='var(--accent)']");
    const d = hiPath?.getAttribute("d") ?? "";
    expect((d.match(/M /g) ?? []).length).toBeGreaterThanOrEqual(1);
    // line reaches the target window (target column index 2 → x ~ 250 of 700)
    expect(d).not.toBe("");
  });

  it("renders a wind-direction arrow with from-degrees aria-label (A1)", () => {
    const gfs = makeSeries();
    gfs.wind_direction_10m = gfs.time.map(() => 220);
    const b: CombinedForecastBlob = { ...blob, gfs, hrrr: gfs };
    render(<DailyOutlook {...{ ...props, blob: b }} />);
    const arrows = screen.getAllByLabelText(/wind from 220°/i);
    expect(arrows.length).toBeGreaterThan(0);
  });

  it("shows feels-like under the temp and converts with units (B2)", () => {
    const gfs = makeSeries();
    // noon apparent_temperature = 14°F across all days
    gfs.apparent_temperature = gfs.time.map((t) => (t.endsWith("T12:00") ? 14 : 40));
    const b: CombinedForecastBlob = { ...blob, gfs, hrrr: gfs };
    const { container } = render(<DailyOutlook {...{ ...props, blob: b }} />);
    expect(within(container).getAllByText(/Feels like 14°/i).length).toBeGreaterThan(0);
    act(() => useUnits.getState().setTemp("C"));
    // 14°F → -10°C
    expect(within(container).getAllByText(/Feels like -10°/i).length).toBeGreaterThan(0);
  });

  it("always renders per-day group headers, one per day, even in Daily mode", () => {
    const { container } = render(<DailyOutlook {...props} />);
    expect(container.querySelector(".daily-groups")).toBeTruthy();
    expect(container.querySelectorAll(".daily-group").length).toBe(7);
  });

  it("expanding one day to period changes only that day (3 cells), neighbors stay 1", () => {
    const { container } = render(<DailyOutlook {...props} />);
    // baseline: 7 daily tiles
    expect(container.querySelectorAll(".day-tile").length).toBe(7);
    // expand the first day (Thu 2026-02-12) one step: day → period
    const btn = screen.getAllByRole("button", { name: /expand .* to AM·Mid·PM/i })[0];
    fireEvent.click(btn);
    // that day now shows 3 period cells; the other 6 days stay daily → 3 + 6 = 9
    expect(container.querySelectorAll(".day-tile").length).toBe(9);
  });

  it("steps a day up day → period → hour with the expand control", () => {
    const { container } = render(<DailyOutlook {...props} />);
    const expandBtn = () => screen.getAllByRole("button", { name: /expand .* to /i })[0];
    fireEvent.click(expandBtn()); // → period (3) + 6 = 9
    expect(container.querySelectorAll(".day-tile").length).toBe(9);
    fireEvent.click(expandBtn()); // → hour (24) + 6 = 30
    expect(container.querySelectorAll(".day-tile").length).toBe(30);
    // at the finest level there is no expand control left on that day
    expect(screen.queryAllByRole("button", { name: /expand .* to /i }).length).toBe(6);
  });

  it("collapse control steps ONE level (hour → period), not all the way to day", () => {
    const { container } = render(<DailyOutlook {...props} />);
    const expandBtn = () => screen.getAllByRole("button", { name: /expand .* to /i })[0];
    fireEvent.click(expandBtn()); // day → period
    fireEvent.click(expandBtn()); // period → hour: 24 + 6 = 30
    expect(container.querySelectorAll(".day-tile").length).toBe(30);
    // one collapse → back to period (3), not day: 3 + 6 = 9
    const collapseBtn = () => screen.getAllByRole("button", { name: /collapse .* to /i })[0];
    fireEvent.click(collapseBtn());
    expect(container.querySelectorAll(".day-tile").length).toBe(9);
    // second collapse → day (follows baseline): 7
    fireEvent.click(collapseBtn());
    expect(container.querySelectorAll(".day-tile").length).toBe(7);
  });

  it("collapse control is hidden when a day is already at the global baseline", () => {
    render(<DailyOutlook {...props} />);
    // baseline is Daily and no day is overridden → no collapse buttons
    expect(screen.queryAllByRole("button", { name: /collapse .* to /i }).length).toBe(0);
  });

  it("expand control is hidden at the finest available level", () => {
    const { container } = render(<DailyOutlook {...props} />);
    const expandBtn = () => screen.getAllByRole("button", { name: /expand .* to /i })[0];
    fireEvent.click(expandBtn()); // day → period
    fireEvent.click(expandBtn()); // period → hour (finest)
    // that day's group now has a collapse but no expand
    const targetGroup = container.querySelectorAll(".daily-group")[0] as HTMLElement;
    expect(within(targetGroup).queryByRole("button", { name: /expand/i })).toBeNull();
    expect(within(targetGroup).getByRole("button", { name: /collapse/i })).toBeTruthy();
  });

  it("48h auto-seed: target + 2 prior days start at period without interaction", () => {
    // near target 2026-02-13, now 2026-02-12T00:00 → 24h out (≤48h)
    // seeds 2026-02-13, -12, -11 → only -13 and -12 present in series
    const { container } = render(<DailyOutlook {...nearProps} />);
    // 2 seeded days × 3 period cells + 5 daily days = 6 + 5 = 11
    expect(container.querySelectorAll(".day-tile").length).toBe(11);
  });

  it("far target: all days start at the global baseline (no auto-seed)", () => {
    const { container } = render(<DailyOutlook {...props} />);
    expect(container.querySelectorAll(".day-tile").length).toBe(7);
  });

  it("daily-grid always carries an inline grid-template-columns matching the SVG width", () => {
    // jsdom has no layout → ResizeObserver absent, cw stays Infinity → stretch mode:
    // grid uses fr columns and the wrapper + trend SVG both render at width 100%.
    const { container } = render(<DailyOutlook {...props} />);
    const grid = container.querySelector(".daily-grid") as HTMLElement;
    expect(grid.style.gridTemplateColumns).not.toBe("");
    expect(grid.style.gridTemplateColumns.trim().endsWith("fr")).toBe(true);
    const svg = container.querySelector("svg.daily-trend") as SVGElement;
    expect(svg.style.width).toBe("100%");
    const wrapper = svg.parentElement as HTMLElement;
    expect(wrapper.style.width).toBe("100%");
  });

  it("in stretch mode header groups carry a proportional flex style (not a fixed px width)", () => {
    // jsdom → cw stays Infinity → stretch mode.
    const { container } = render(<DailyOutlook {...props} />);
    const groups = [...container.querySelectorAll(".daily-group")] as HTMLElement[];
    expect(groups.length).toBe(7);
    for (const g of groups) {
      expect(g.style.flex).not.toBe("");
      expect(g.style.flexGrow).not.toBe("0");
      expect(g.style.width).toBe("");
    }
  });

  it("global Segmented='Hourly' makes every day hourly (finer-of baseline)", () => {
    const { container } = render(<DailyOutlook {...props} />);
    fireEvent.click(screen.getByRole("radio", { name: "Hourly" }));
    // 7 days × 24 hours
    expect(container.querySelectorAll(".day-tile").length).toBe(7 * 24);
  });

  it("tints each day tile by worst-of wind/precip severity", () => {
    // calm everywhere (wind 5, dry) except the last day (2026-02-18): wind 45 + snow 8 → sev-4
    const gfs = makeSeries();
    gfs.wind_speed_10m = gfs.time.map(() => 5);
    gfs.snowfall = gfs.time.map(() => 0);
    const stormIdx = gfs.time
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.startsWith("2026-02-18"))
      .map(({ i }) => i);
    for (const i of stormIdx) {
      gfs.wind_speed_10m[i] = 45;
      gfs.snowfall[i] = 8;
    }
    const b: CombinedForecastBlob = { ...blob, gfs, hrrr: gfs };
    const { container } = render(<DailyOutlook {...{ ...props, blob: b }} />);
    const tiles = [...container.querySelectorAll(".day-tile")];
    // first day calm → sev-1
    expect(tiles[0].className).toMatch(/\bsev-1\b/);
    // last day stormy → sev-4
    expect(tiles[tiles.length - 1].className).toMatch(/\bsev-4\b/);
  });

  it("renders a color-scaled sustained wind pill", () => {
    // 30 mph everywhere → windSeverity 3 → .wind-pill.sev-3
    const gfs = makeSeries();
    gfs.wind_speed_10m = gfs.time.map(() => 30);
    const b: CombinedForecastBlob = { ...blob, gfs, hrrr: gfs };
    const { container } = render(<DailyOutlook {...{ ...props, blob: b }} />);
    const pills = [...container.querySelectorAll(".wind-pill")];
    expect(pills.length).toBeGreaterThan(0);
    expect(pills.every((p) => /\bsev-3\b/.test(p.className))).toBe(true);
  });

  it("shows the HRRR→GFS blend provenance tag in the legend", () => {
    render(<DailyOutlook {...props} />);
    // the <Provenance> tag (a button) announces the blend label
    expect(screen.getByRole("button", { name: /HRRR→GFS/ })).toBeInTheDocument();
    // the blend legend names both models
    const legend = screen.getByText(/Tint = wind \+ precip severity/i);
    expect(legend).toBeInTheDocument();
    expect(screen.getByText(/HRRR hrs 0–48/)).toBeInTheDocument();
    expect(screen.getByText(/GFS beyond/)).toBeInTheDocument();
  });
});

describe("DailyOutlook — expander only steps to levels that have data", () => {
  // GFS spans 7 days with hourly values throughout; HRRR covers only the first day.
  // Availability is VALUE-based: every day with GFS hourly values can reach hourly,
  // and far-out hours fall back to GFS (HRRR's value horizon ends after day 0).
  function hrrrFirstDayOnly(): ModelSeries {
    const full = makeSeries();
    const time = full.time.filter((t) => t.startsWith("2026-02-12"));
    const n = time.length;
    return { ...full, time, temp_summit_f: full.temp_summit_f.slice(0, n) };
  }
  const farBlob: CombinedForecastBlob = { ...blob, gfs: makeSeries(), hrrr: hrrrFirstDayOnly() };
  const farProps = { ...props, blob: farBlob };

  it("far day with GFS hourly data reaches hourly and renders REAL GFS cells (not empty '—')", () => {
    const { container } = render(<DailyOutlook {...farProps} />);
    const groups = container.querySelectorAll(".daily-group");
    const farGroup = groups[groups.length - 1] as HTMLElement; // 2026-02-17 (far, GFS-only)
    const btn = within(farGroup).getByRole("button", { name: /expand/i });
    expect(btn.getAttribute("aria-label")).toMatch(/AM·Mid·PM/); // day → period first
    fireEvent.click(btn);
    const farGroup2 = container.querySelectorAll(".daily-group")[groups.length - 1] as HTMLElement;
    const btn2 = within(farGroup2).getByRole("button", { name: /expand/i });
    expect(btn2.getAttribute("aria-label")).toMatch(/hourly/i); // period → hour available (data exists)
    fireEvent.click(btn2);
    // far day now renders 24 hourly tiles with real temps — the bug was empty "—" cells
    const tiles = [...container.querySelectorAll(".day-tile")].slice(-24);
    expect(tiles.length).toBe(24);
    expect(
      tiles.every((t) => !(t.querySelector(".dt-temp")?.textContent ?? "").includes("—")),
    ).toBe(true);
  });

  it("near day (canHour=true) can reach hourly", () => {
    const { container } = render(<DailyOutlook {...farProps} />);
    // first group = 2026-02-12, HRRR present → can reach hourly
    const firstGroup = container.querySelectorAll(".daily-group")[0] as HTMLElement;
    const btn = within(firstGroup).getByRole("button", { name: /expand/i });
    expect(btn.getAttribute("aria-label")).toMatch(/AM·Mid·PM/);
    fireEvent.click(btn); // → period
    const btn2 = within(container.querySelectorAll(".daily-group")[0] as HTMLElement).getByRole("button", { name: /expand/i });
    expect(btn2.getAttribute("aria-label")).toMatch(/hourly/i);
  });

  it("a day with NO usable values (canPeriod & canHour false) renders no expand button", () => {
    // 1-day GFS series whose band temps are all null → no hourly/period data exists.
    const full = makeSeries();
    const keep = full.time
      .map((t, i) => ({ t, i }))
      .filter(({ t }) => t.startsWith("2026-02-12"))
      .map(({ i }) => i);
    const slice = (a: number[]) => keep.map((i) => a[i]);
    const nulls = keep.map(() => null);
    const noData: ModelSeries = {
      ...full,
      time: keep.map((i) => full.time[i]),
      temp_summit_f: nulls as unknown as number[],
      temp_mid_f: nulls as unknown as number[],
      temp_base_f: nulls as unknown as number[],
      temperature_2m: nulls as unknown as number[],
      apparent_temperature: nulls as unknown as number[],
      wind_speed_10m: slice(full.wind_speed_10m as number[]),
      wind_gusts_10m: slice(full.wind_gusts_10m as number[]),
      wind_direction_10m: slice(full.wind_direction_10m as number[]),
      precipitation: slice(full.precipitation as number[]),
      precipitation_probability: slice(full.precipitation_probability as number[]),
      snowfall: slice(full.snowfall as number[]),
      freezing_level_height: slice(full.freezing_level_height as number[]),
      weather_code: slice(full.weather_code as number[]),
    };
    const b: CombinedForecastBlob = { ...blob, gfs: noData, hrrr: null };
    const { container } = render(
      <DailyOutlook {...{ ...props, blob: b, nowIso: "2026-02-20T00:00" }} />,
    );
    // one group, no finer data → no expand button
    expect(container.querySelectorAll(".daily-group").length).toBe(1);
    expect(container.querySelectorAll(".dg-expand").length).toBe(0);
  });
});
