import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  FreezingLevelHero,
  ridgeProfile,
  spreadTops,
  bandCardTops,
} from "@/components/project/FreezingLevelHero";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { HourRow } from "@/lib/forecast-select";

const mountain = { name: "Mount Rainier", elevations: { base: 5400, mid: 10000, summit: 14410 } };
const dayRows: HourRow[] = [0, 6, 12, 18].map((h) => ({
  t: `2026-02-14T${String(h).padStart(2, "0")}:00`,
  hour: h,
  date: "2026-02-14",
  fl: h === 12 ? 5800 : 5000 + h * 40,
  tempF: 20, tempFRaw: 20,
  windMph: 20, windMphRaw: 20,
  gustMph: 30,
  precipIn: 0,
  pop: 10,
  snowIn: 0,
  code: 1,
  bandTempF: { base: 33, mid: 22, summit: 12 },
}));
const props = { mountain, dayRows, modelLabel: "HRRR · 3 km" };

describe("FreezingLevelHero", () => {
  beforeEach(() => useUnits.setState(DEFAULT_UNITS));

  it("renders the freezing-level tag with imperial units at the featured (Dawn) FL", () => {
    render(<FreezingLevelHero {...props} />);
    // The SVG cross-section tag (caps) carries the featured FL — Dawn (hour 6) = 5,240 ft.
    expect(screen.getByText(/FREEZING LEVEL ·/)).toHaveTextContent(/5,240\s*ft/);
  });
  it("renders three band cards with names and temps", () => {
    render(<FreezingLevelHero {...props} />);
    // band-card-name renders the exact band label
    expect(screen.getByText("Summit", { selector: ".band-card-name" })).toBeInTheDocument();
    expect(screen.getByText(/12°/)).toBeInTheDocument(); // summit band temp °F
  });
  it("renders the side-rail takeaway sentence", () => {
    // Midday FL (5,800 ft) sits between base and summit → "below the summit".
    render(<FreezingLevelHero {...props} />);
    fireEvent.click(
      within(screen.getByRole("radiogroup", { name: /featured time of day/i })).getByRole("radio", {
        name: "Midday",
      }),
    );
    expect(screen.getByText(/below the summit/i)).toBeInTheDocument();
  });
  it("does NOT render any time scrubber/range input", () => {
    const { container } = render(<FreezingLevelHero {...props} />);
    expect(container.querySelector('input[type="range"]')).toBeNull();
    expect(container.querySelector("input")).toBeNull();
  });
  it("honors the units toggle (ft → m, °F → °C)", () => {
    useUnits.setState({ temp: "C", wind: "mph", dist: "m" });
    render(<FreezingLevelHero {...props} />);
    expect(screen.getByText(/FREEZING LEVEL ·/)).toHaveTextContent(/1,5\d{2}\s*m/); // 5240 ft ≈ 1597 m
    expect(screen.getByText(/-11°/)).toBeInTheDocument(); // 12°F ≈ -11°C
  });
  it("renders precip-type labels per band relative to the noon freezing level", () => {
    render(<FreezingLevelHero {...props} />);
    // default Dawn FL 5,240: summit (14410) + mid (10000) above → all snow; base (5400) within 600 ft → mixed
    expect(screen.getAllByText(/All snow/i).length).toBe(2);
    expect(screen.getByText(/Mixed \/ near freezing/i)).toBeInTheDocument();
  });

  it("renders a fallback when no freezing-level data is available", () => {
    const noFl = dayRows.map((r) => ({ ...r, fl: null }));
    render(<FreezingLevelHero {...props} dayRows={noFl} />);
    expect(screen.getByText(/unavailable/i)).toBeInTheDocument();
  });

  it("says 'above the summit' when the freezing level tops the peak", () => {
    const high = dayRows.map((r) => ({ ...r, fl: 20000 })); // above 14410 summit
    render(<FreezingLevelHero {...props} dayRows={high} />);
    expect(screen.getByText(/above the summit/i)).toBeInTheDocument();
  });

  it("says 'below the trailhead' when the freezing level sinks below base", () => {
    const low = dayRows.map((r) => ({ ...r, fl: 3000 })); // below 5400 base
    render(<FreezingLevelHero {...props} dayRows={low} />);
    expect(screen.getByText(/below the trailhead/i)).toBeInTheDocument();
  });

  // dawn(6)=5000+6*40=5240, midday(12)=5800, pm(17→nearest 18)=5000+18*40=5720
  it("defaults the featured time to Dawn and exposes a time radiogroup", () => {
    render(<FreezingLevelHero {...props} />);
    const group = screen.getByRole("radiogroup", { name: /featured time of day/i });
    const dawn = within(group).getByRole("radio", { name: "Dawn" });
    expect(dawn).toHaveAttribute("aria-checked", "true");
    // featured number = dawn row's fl (5240) shown in the side readout
    expect(document.querySelector(".hero-fl")).toHaveTextContent(/5,240/);
  });

  it("re-points the featured freezing number when PM is chosen", () => {
    render(<FreezingLevelHero {...props} />);
    const group = screen.getByRole("radiogroup", { name: /featured time of day/i });
    fireEvent.click(within(group).getByRole("radio", { name: "PM" }));
    expect(document.querySelector(".hero-fl")).toHaveTextContent(/5,720/);
  });

  it("labels the elevation axis in the active unit with band reference lines", () => {
    const { container } = render(<FreezingLevelHero {...props} />);
    const labels = [...container.querySelectorAll(".hero-axis-label")].map((n) => n.textContent);
    // a band reference is named on the cross-section axis
    expect(labels).toContain("Summit");
    // the axis carries the active distance unit (ft)
    expect(labels.some((t) => t?.includes("ft"))).toBe(true);
  });

  it("shows the loud provenance reason when prov is provided", () => {
    render(
      <FreezingLevelHero
        {...props}
        prov={{ label: "GFS", reason: "only model with a freezing field at this range" }}
      />,
    );
    expect(screen.getByText(/only model with a freezing field/i)).toBeInTheDocument();
  });

  it("wraps the band cards in a .band-cards container", () => {
    const { container } = render(<FreezingLevelHero {...props} />);
    expect(container.querySelector(".band-cards")).not.toBeNull();
    expect(container.querySelectorAll(".band-cards .band-card").length).toBeGreaterThan(0);
  });
});

describe("ridgeProfile", () => {
  // A short peak (e.g. Eldorado, summit 8,873 ft) must still render as ONE mountain:
  // the summit is the single high point, no foreground ridge towers above it.
  for (const summit of [8873, 9131, 14410]) {
    const valley = 2200;
    const ridge = ridgeProfile(valley, summit);
    const elevs = ridge.map(([, e]) => e);

    it(`makes the summit the unique high point for a ${summit} ft peak`, () => {
      const max = Math.max(...elevs);
      expect(max).toBe(summit);
      // exactly one vertex reaches the summit, and it sits at the peak x (0.64)
      const peaks = ridge.filter(([, e]) => e === summit);
      expect(peaks.length).toBe(1);
      expect(peaks[0][0]).toBe(0.64);
      // nothing pokes above the summit
      expect(elevs.every((e) => e <= summit)).toBe(true);
    });

    it(`is a single peak (monotonic up to the summit, then down) for a ${summit} ft peak`, () => {
      const peakIdx = ridge.findIndex(([, e]) => e === summit);
      for (let i = 1; i <= peakIdx; i++) expect(elevs[i]).toBeGreaterThan(elevs[i - 1]);
      for (let i = peakIdx + 1; i < elevs.length; i++) expect(elevs[i]).toBeLessThan(elevs[i - 1]);
    });

    it(`keeps every vertex at or above the valley floor for a ${summit} ft peak`, () => {
      expect(elevs.every((e) => e >= valley)).toBe(true);
    });
  }
});

describe("spreadTops", () => {
  it("leaves well-separated card tops unchanged", () => {
    expect(spreadTops([10, 40, 80], 18)).toEqual([10, 40, 80]);
  });
  it("pushes a card down when it's closer than the min gap to the one above", () => {
    // Eldorado-like: summit 26.5%, mid 39.8% (gap 13.3 < 18 → 44.5%), base 91.9% (clear)
    const out = spreadTops([26.5, 39.8, 91.9], 18);
    expect(out[0]).toBe(26.5);
    expect(out[1]).toBeCloseTo(44.5, 5);
    expect(out[2]).toBe(91.9);
  });
  it("cascades the push through several tightly-stacked cards", () => {
    expect(spreadTops([10, 12, 14], 18)).toEqual([10, 28, 46]);
  });
  it("never lets adjacent cards sit closer than the min gap", () => {
    const out = spreadTops([5, 6, 7, 30, 31], 18);
    for (let i = 1; i < out.length; i++) expect(out[i] - out[i - 1]).toBeGreaterThanOrEqual(18 - 1e-9);
  });
});

describe("bandCardTops", () => {
  it("returns the plain spread when the bottom card fits within maxTop", () => {
    // Rainier-like: summit 20, mid 45, base 72 — all clear, bottom 72 < 82.
    expect(bandCardTops([20, 45, 72], 22, 82)).toEqual([20, 45, 72]);
  });
  it("shifts the whole stack up (preserving gaps) when the bottom would clip the frame", () => {
    // Eldorado-like: summit 26.5, mid 39.8, base 91.9 → spread [26.5,48.5,91.9],
    // bottom 91.9 > 82 → shift up by 9.9 → bottom lands on 82, gaps unchanged.
    const out = bandCardTops([26.5, 39.8, 91.9], 22, 82);
    expect(out[2]).toBeCloseTo(82, 5);
    expect(out[1]).toBeCloseTo(38.6, 5);
    expect(out[0]).toBeCloseTo(16.6, 5);
    for (let i = 1; i < out.length; i++) expect(out[i] - out[i - 1]).toBeGreaterThanOrEqual(22 - 1e-9);
  });
  it("floors the top card at 2% so a tall stack never shifts off the top", () => {
    // spread [10,40,95]; bottom 95>82 → shift up 13 → top would be −3, floored to 2.
    const out = bandCardTops([10, 40, 95], 22, 82);
    expect(out[0]).toBe(2);
    expect(out[2]).toBeCloseTo(82, 5);
  });
});
