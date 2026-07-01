import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AirQualityPanel } from "@/components/project/AirQualityPanel";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import type { AirQuality } from "@/lib/hazards/types";

const baseAirQuality: AirQuality = {
  aqi: 112,
  categoryNumber: 3,
  categoryName: "Unhealthy for Sensitive Groups",
  parameter: "PM2.5",
  reportingArea: "Enumclaw",
  trend: [
    { date: "2026-06-14", aqi: 45 },
    { date: "2026-06-15", aqi: 60 },
    { date: "2026-06-16", aqi: 80 },
    { date: "2026-06-17", aqi: 95 },
    { date: "2026-06-18", aqi: 105 },
    { date: "2026-06-19", aqi: 110 },
    { date: "2026-06-20", aqi: 112 },
  ],
  provenance: {
    source: "AirNow",
    observedAt: "2026-06-20T18:00:00Z",
    distanceMi: 22,
    note: "Enumclaw reporting area",
  },
};

describe("AirQualityPanel", () => {
  it("(a) renders AQI number, category, reporting area, and distance caveat", () => {
    render(<AirQualityPanel airQuality={baseAirQuality} />);
    expect(screen.getByText("112")).toBeInTheDocument();
    expect(screen.getByText(/Unhealthy for Sensitive Groups/)).toBeInTheDocument();
    expect(screen.getByText(/Enumclaw/)).toBeInTheDocument();
    expect(screen.getByText(/22 mi/)).toBeInTheDocument();
    expect(screen.getByText(/summit may differ/i)).toBeInTheDocument();
  });

  it("(b) shows smoke caveat for PM2.5 aqi >= 100, absent for aqi 30", () => {
    const { rerender } = render(<AirQualityPanel airQuality={baseAirQuality} />);
    expect(screen.getByText(/Wildfire smoke likely/i)).toBeInTheDocument();

    rerender(
      <AirQualityPanel
        airQuality={{
          ...baseAirQuality,
          aqi: 30,
          categoryNumber: 1,
          categoryName: "Good",
        }}
      />,
    );
    expect(screen.queryByText(/Wildfire smoke likely/i)).not.toBeInTheDocument();
  });

  it("(c) renders a Provenance button matching /AirNow/", () => {
    render(<AirQualityPanel airQuality={baseAirQuality} />);
    const btn = screen.getByRole("button", { name: /AirNow/i });
    expect(btn).toBeInTheDocument();
  });

  it("(d) renders an svg[role='img'] with AQI aria-label when trend >= 2 points", () => {
    const { container } = render(<AirQualityPanel airQuality={baseAirQuality} />);
    const svg = container.querySelector("svg[role='img']");
    expect(svg).toBeTruthy();
    expect(svg?.getAttribute("aria-label")).toMatch(/AQI/i);
  });

  it("(d) omits sparkline when fewer than 2 trend points", () => {
    const { container } = render(
      <AirQualityPanel
        airQuality={{ ...baseAirQuality, trend: [{ date: "2026-06-20", aqi: 112 }] }}
      />,
    );
    expect(container.querySelector("svg[role='img']")).toBeNull();
  });

  it("(e) renders null when airQuality is null", () => {
    const { container } = render(<AirQualityPanel airQuality={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("(e) renders null when airQuality is undefined", () => {
    const { container } = render(<AirQualityPanel airQuality={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("(f) has no a11y violations", async () => {
    const { container } = render(<AirQualityPanel airQuality={baseAirQuality} />);
    await expectNoA11yViolations(container);
  });
});
