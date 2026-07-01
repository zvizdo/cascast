import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CallChart } from "@/components/project/CallChart";
import {
  renderWithProviders,
  resetUnits,
  expectNoA11yViolations,
} from "@/components/shared/__tests__/test-utils";
import type { ModelDaySummary, WeatherSnapshot } from "@/lib/types";

const TARGET = "2026-02-20";

function m(high: number, over: Partial<ModelDaySummary> = {}): ModelDaySummary {
  return {
    available: true,
    summitHighF: high,
    summitLowF: high - 8,
    summitMaxWindMph: 30,
    summitMaxSustainedWindMph: 24,
    summitPrecipIn: 0.1,
    freezingLevelFtNoon: 5800,
    snowfallIn: 0.3,
    ...over,
  };
}

/** Newest-first; band NARROWS toward the newest snapshot ⇒ firming. */
function narrowing(): WeatherSnapshot[] {
  return [
    { id: "s4", fetchedAt: "2026-02-18T12:00:00Z",
      models: { hrrr: { [TARGET]: m(24) }, gfs: { [TARGET]: m(25) }, ecmwf: { [TARGET]: m(26) } } },
    { id: "s3", fetchedAt: "2026-02-15T12:00:00Z",
      models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
    { id: "s2", fetchedAt: "2026-02-10T12:00:00Z",
      models: { hrrr: { [TARGET]: m(14) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(34) } } },
    { id: "s1", fetchedAt: "2026-02-09T12:00:00Z",
      models: { hrrr: { [TARGET]: m(10) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(38) } } },
  ];
}

/** Newest-first; band WIDENS toward the newest snapshot ⇒ volatile. */
function widening(): WeatherSnapshot[] {
  return [
    { id: "w4", fetchedAt: "2026-02-18T12:00:00Z",
      models: { hrrr: { [TARGET]: m(10) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(38) } } },
    { id: "w3", fetchedAt: "2026-02-15T12:00:00Z",
      models: { hrrr: { [TARGET]: m(14) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(34) } } },
    { id: "w2", fetchedAt: "2026-02-10T12:00:00Z",
      models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
    { id: "w1", fetchedAt: "2026-02-09T12:00:00Z",
      models: { hrrr: { [TARGET]: m(24) }, gfs: { [TARGET]: m(25) }, ecmwf: { [TARGET]: m(26) } } },
  ];
}

describe("CallChart", () => {
  beforeEach(resetUnits);

  it("renders the 'Settling' verdict chip for a narrowing band", () => {
    render(<CallChart snapshots={narrowing()} targetDate={TARGET} />);
    expect(screen.getByText(/settling/i)).toBeInTheDocument();
  });

  it("renders the 'Still shifting' verdict chip for a widening band", () => {
    render(<CallChart snapshots={widening()} targetDate={TARGET} />);
    expect(screen.getByText(/still shifting/i)).toBeInTheDocument();
  });

  it("shows the trimmed convergence caption", () => {
    render(<CallChart snapshots={narrowing()} targetDate={TARGET} />);
    expect(screen.getByText(/converging toward your day/i)).toBeInTheDocument();
  });

  it("labels all three models in a legend", () => {
    render(<CallChart snapshots={narrowing()} targetDate={TARGET} />);
    expect(screen.getByText("HRRR")).toBeInTheDocument();
    expect(screen.getByText("GFS")).toBeInTheDocument();
    expect(screen.getByText("ECMWF")).toBeInTheDocument();
  });

  it("renders a variable radiogroup that re-charts without NaN paths when switched to Wind", () => {
    const { container } = render(
      <CallChart snapshots={narrowing()} targetDate={TARGET} />,
    );
    const group = screen.getByRole("radiogroup", { name: /call variable/i });
    expect(group).toBeInTheDocument();
    // No NaN in any path before switching.
    const pathsBefore = Array.from(container.querySelectorAll("path"));
    expect(pathsBefore.length).toBeGreaterThan(0);
    pathsBefore.forEach((p) => expect(p.getAttribute("d") ?? "").not.toMatch(/NaN/));
    // Switch to Wind.
    fireEvent.click(screen.getByRole("radio", { name: /wind/i }));
    const pathsAfter = Array.from(container.querySelectorAll("path"));
    expect(pathsAfter.length).toBeGreaterThan(0);
    pathsAfter.forEach((p) => expect(p.getAttribute("d") ?? "").not.toMatch(/NaN/));
  });

  it("renders a calm empty state (no chart) when snapshots are sparse", () => {
    const sparse = narrowing().slice(0, 2);
    const { container } = render(
      <CallChart snapshots={sparse} targetDate={TARGET} />,
    );
    expect(container.querySelector("svg[role='img']")).toBeNull();
    expect(screen.getByText(/tracking just started/i)).toBeInTheDocument();
  });

  it("has no a11y violations", async () => {
    const { container } = renderWithProviders(
      <CallChart snapshots={narrowing()} targetDate={TARGET} />,
    );
    await expectNoA11yViolations(container);
  });
});
