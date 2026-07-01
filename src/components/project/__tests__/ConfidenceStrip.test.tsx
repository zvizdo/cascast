import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ConfidenceStrip } from "@/components/project/ConfidenceStrip";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { CombinedForecastBlob, ModelSeries } from "@/lib/types";

/** Build a one-row (noon) ModelSeries for the target day. */
function s(opts: {
  summit: number;
  fl?: number | null;
  available?: boolean;
}): ModelSeries {
  return {
    available: opts.available ?? true,
    time: ["2026-02-14T12:00"],
    temperature_2m: [opts.summit],
    apparent_temperature: [opts.summit],
    wind_speed_10m: [20],
    wind_gusts_10m: [30],
    wind_direction_10m: [180],
    precipitation: [0],
    precipitation_probability: [10],
    snowfall: [0],
    freezing_level_height: [opts.fl === undefined ? 5800 : opts.fl],
    cloud_cover: [10],
    visibility: [10000],
    weather_code: [1],
    temp_base_f: [33],
    temp_mid_f: [22],
    temp_summit_f: [opts.summit],
  };
}

const mountain = { name: "Mount Rainier", elevations: { base: 5400, mid: 10000, summit: 14410 } };

// All three models agree on summit high within 6° → High agreement.
const blobHigh: CombinedForecastBlob = {
  mountainId: "mt-rainier",
  timezone: "America/Los_Angeles",
  fetchedAt: "2026-02-12T14:00:00Z",
  hrrr: s({ summit: 12 }),
  gfs: s({ summit: 15 }),
  ecmwf: s({ summit: 18 }),
};

describe("ConfidenceStrip", () => {
  beforeEach(() => useUnits.setState(DEFAULT_UNITS));

  it("renders high agreement for a 6° summit-high spread", () => {
    render(<ConfidenceStrip blob={blobHigh} targetDate="2026-02-14" slug="mt-rainier" mountain={mountain} />);
    expect(screen.getByText(/High agreement/i)).toBeInTheDocument();
    expect(screen.getByText(/6°/)).toBeInTheDocument();
  });

  it("converts the summit-high SPREAD as a delta in °C (round(spreadF*5/9)), not offset-style", () => {
    // spread is 18-12 = 6°F → correct °C delta is round(6*5/9) = 3°.
    // The buggy offset-style conv (convTemp(6)-convTemp(0)) would read 4°.
    useUnits.setState({ ...DEFAULT_UNITS, temp: "C" });
    render(<ConfidenceStrip blob={blobHigh} targetDate="2026-02-14" slug="mt-rainier" mountain={mountain} />);
    expect(screen.getByText(/within 3° on the target-day summit high/i)).toBeInTheDocument();
    expect(screen.queryByText(/within 4°/i)).toBeNull();
  });

  it("shows each model target-day high with model tags", () => {
    render(<ConfidenceStrip blob={blobHigh} targetDate="2026-02-14" slug="mt-rainier" mountain={mountain} />);
    ["HRRR", "GFS", "ECMWF"].forEach((m) => expect(screen.getByText(m)).toBeInTheDocument());
    expect(screen.getByText(/15°/)).toBeInTheDocument();
  });

  it("renders a provenance tag for the chosen target model", () => {
    render(<ConfidenceStrip blob={blobHigh} targetDate="2026-02-14" slug="mt-rainier" mountain={mountain} />);
    // HRRR has target rows (with GFS present) → blend label "HRRR→GFS".
    const tag = screen.getByRole("button", { name: /HRRR.*HRRR is the highest-resolution model/i });
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveClass("prov-tag");
  });

  it("links to the Model Lab", () => {
    render(<ConfidenceStrip blob={blobHigh} targetDate="2026-02-14" slug="mt-rainier" mountain={mountain} />);
    expect(screen.getByRole("link", { name: /compare all models/i })).toHaveAttribute(
      "href",
      "/mountains/mt-rainier/models?target=2026-02-14",
    );
  });

  it("renders n/a for an unavailable model", () => {
    render(
      <ConfidenceStrip
        blob={{ ...blobHigh, hrrr: null }}
        targetDate="2026-02-14"
        slug="mt-rainier"
        mountain={mountain}
      />,
    );
    expect(screen.getByText(/n\/a/i)).toBeInTheDocument();
  });

  it("buckets a wide summit-high spread as Low agreement", () => {
    const blobLow: CombinedForecastBlob = {
      ...blobHigh,
      hrrr: s({ summit: 5 }),
      gfs: s({ summit: 25 }),
      ecmwf: s({ summit: 30 }),
    };
    render(<ConfidenceStrip blob={blobLow} targetDate="2026-02-14" slug="mt-rainier" mountain={mountain} />);
    expect(screen.getByText(/Low agreement/i)).toBeInTheDocument();
    expect(screen.getByText(/treat the forecast as a range/i)).toBeInTheDocument();
  });

  // --- P5 awareness: model disagreement on freezing level MUST be surfaced ---
  it("flags the freezing-level disagreement when GFS reads implausibly high and ECMWF lacks the field", () => {
    // GFS noon freezing level 16,207 ft sits ABOVE the 14,410 ft summit while its
    // summit temp is at/below freezing (12°F) — internally inconsistent.
    // ECMWF provides no freezing-level field (null). HRRR is plausible (5,800 ft).
    const blobFL: CombinedForecastBlob = {
      ...blobHigh,
      hrrr: s({ summit: 12, fl: 5800 }),
      gfs: s({ summit: 12, fl: 16207 }),
      ecmwf: s({ summit: 18, fl: null }),
    };
    render(<ConfidenceStrip blob={blobFL} targetDate="2026-02-14" slug="mt-rainier" mountain={mountain} />);

    const flags = screen.getByTestId("confidence-flags");
    // It must call out that the models disagree on freezing level.
    expect(within(flags).getAllByText(/freezing level/i).length).toBeGreaterThanOrEqual(1);
    // It must call out the inconsistency: FL above the summit while it's freezing.
    expect(within(flags).getByText(/above the summit/i)).toBeInTheDocument();
    // It must call out that ECMWF is missing the field.
    expect(within(flags).getByText(/ECMWF/i)).toBeInTheDocument();
    expect(within(flags).getByText(/no freezing[- ]level/i)).toBeInTheDocument();
  });

  it("does NOT show freezing-level flags when models agree and all provide the field", () => {
    const blobOk: CombinedForecastBlob = {
      ...blobHigh,
      hrrr: s({ summit: 30, fl: 6000 }),
      gfs: s({ summit: 31, fl: 6200 }),
      ecmwf: s({ summit: 32, fl: 6100 }),
    };
    render(<ConfidenceStrip blob={blobOk} targetDate="2026-02-14" slug="mt-rainier" mountain={mountain} />);
    expect(screen.queryByTestId("confidence-flags")).toBeNull();
  });

  // --- Issue 1: headline scoping ---
  // blobAgreeTempButFlag: temps agree within 6°F (High), but ECMWF has null FL → flag (c) fires.
  const blobAgreeTempButFlag: CombinedForecastBlob = {
    mountainId: "mt-rainier",
    timezone: "America/Los_Angeles",
    fetchedAt: "2026-02-12T14:00:00Z",
    hrrr: s({ summit: 12, fl: 5800 }),
    gfs: s({ summit: 15, fl: 6000 }),
    ecmwf: s({ summit: 14, fl: null }), // null FL → flag (c), temps still agree
  };

  // blobAgreeNoFlags: temps agree, all FL fields present and consistent → no flags.
  const blobAgreeNoFlags: CombinedForecastBlob = {
    mountainId: "mt-rainier",
    timezone: "America/Los_Angeles",
    fetchedAt: "2026-02-12T14:00:00Z",
    hrrr: s({ summit: 30, fl: 6000 }),
    gfs: s({ summit: 31, fl: 6200 }),
    ecmwf: s({ summit: 32, fl: 6100 }),
  };

  it("scopes the headline to temperature when a freezing-level caveat is present", () => {
    render(
      <ConfidenceStrip
        blob={blobAgreeTempButFlag}
        targetDate="2026-02-14"
        slug="x"
        mountain={{ elevations: { base: 1000, mid: 5000, summit: 9000 } }}
      />,
    );
    expect(screen.getByText(/agreement on temperature/i)).toBeInTheDocument();
    expect(screen.getByText(/why this number is uncertain/i)).toBeInTheDocument();
  });

  it("uses the plain agreement headline when there are no caveats", () => {
    render(
      <ConfidenceStrip
        blob={blobAgreeNoFlags}
        targetDate="2026-02-14"
        slug="x"
        mountain={{ elevations: { base: 1000, mid: 5000, summit: 9000 } }}
      />,
    );
    expect(screen.getByText(/^(High|Moderate|Low) agreement$/i)).toBeInTheDocument();
  });
});
