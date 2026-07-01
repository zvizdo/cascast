import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { Verdict } from "@/components/project/Verdict";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { CurrentSummary } from "@/lib/types";

const summary: CurrentSummary = {
  tone: "caution",
  verdict: "A cold window holds before a front edges in.",
  targetDateHigh: 18,
  targetDateLow: 2,
  targetDateWind: 24,
  targetDatePrecip: 0.3,
  freezingLevelFt: 5815,
  precipType: "snow",
  summaryModel: "hrrr",
  updatedAt: "2026-02-14T12:00:00.000Z",
};

beforeEach(() => useUnits.setState(DEFAULT_UNITS));

describe("Verdict", () => {
  it("renders tone dot + context, the verdict sentence, and three stats", () => {
    render(<Verdict summary={summary} targetDateStart="2026-02-14" />);
    expect(screen.getByText(/The call for/)).toBeInTheDocument();
    expect(screen.getByText(summary.verdict)).toBeInTheDocument();
    expect(screen.getByText("Summit")).toBeInTheDocument();
    expect(screen.getByText("Wind")).toBeInTheDocument();
    expect(screen.getByText("Freezing")).toBeInTheDocument();
    expect(screen.getByText(/24 mph/)).toBeInTheDocument();
    expect(screen.getByText(/5,815 ft/)).toBeInTheDocument();
  });

  it("shows the tone word (not color-only)", () => {
    render(<Verdict summary={summary} targetDateStart="2026-02-14" />);
    expect(screen.getByText(/Marginal/)).toBeInTheDocument();
  });

  it("converts stats with the units store", () => {
    render(<Verdict summary={summary} targetDateStart="2026-02-14" />);
    act(() => {
      useUnits.getState().setWind("kmh");
      useUnits.getState().setDist("m");
    });
    expect(screen.getByText(/km\/h/)).toBeInTheDocument();
    expect(screen.getByText(/m$/)).toBeTruthy();
  });
});
