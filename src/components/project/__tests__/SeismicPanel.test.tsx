import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SeismicPanel } from "@/components/project/SeismicPanel";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import type { SeismicSummary } from "@/lib/hazards/types";

const baseProvenance = {
  source: "USGS ComCat",
  observedAt: "2026-06-20T18:00:00Z",
};

// Relative to the actual current time so formatTimeAgo always returns "X hr ago" regardless
// of when the test runs. 2 hours in the past is safely < 24 h → formatTimeAgo ⇒ "hr ago".
const recentEventTime = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2 hr ago

const withEvents: SeismicSummary = {
  count30d: 11,
  count7d: 4,
  largestMag: 1.8,
  swarm: false,
  events: [
    { mag: 1.8, place: "4 km NW of Mount Rainier", depthKm: 7, lng: -121.76, lat: 46.85, time: recentEventTime, type: "earthquake", status: "reviewed" },
    { mag: 0.9, place: "6 km SE of Mount Rainier", depthKm: 12, lng: -121.73, lat: 46.83, time: recentEventTime, type: "earthquake", status: "automatic" },
  ],
  provenance: baseProvenance,
};

const withSwarm: SeismicSummary = {
  count30d: 42,
  count7d: 20,
  largestMag: 2.3,
  swarm: true,
  events: [
    { mag: 2.3, place: "1 km N of Mount Rainier", depthKm: 5, lng: -121.76, lat: 46.86, time: recentEventTime, type: "earthquake", status: "reviewed" },
  ],
  provenance: baseProvenance,
};

const noSwarm: SeismicSummary = {
  count30d: 3,
  count7d: 1,
  largestMag: 0.7,
  swarm: false,
  events: [],
  provenance: baseProvenance,
};

const noEvents: SeismicSummary = {
  count30d: 0,
  count7d: 0,
  largestMag: null,
  swarm: false,
  events: [],
  provenance: baseProvenance,
};

describe("SeismicPanel", () => {
  it("(a) count30d 11 + largestMag 1.8 + event row renders count, M1.8 event, and relative time", () => {
    render(<SeismicPanel seismic={withEvents} />);
    // count in summary line (contains "11 events")
    expect(screen.getByText(/11 events in 30 days/)).toBeInTheDocument();
    // largest mag in summary line
    expect(screen.getByText(/largest M1\.8/)).toBeInTheDocument();
    // event row: place text
    expect(screen.getByText(/4 km NW of Mount Rainier/)).toBeInTheDocument();
    // event row: depth
    expect(screen.getByText(/7 km deep/)).toBeInTheDocument();
    // event row: relative time (hr ago)
    expect(screen.getAllByText(/hr ago/).length).toBeGreaterThan(0);
  });

  it("(b) swarm:true → Swarm badge present; swarm:false → baseline copy and NO swarm badge", () => {
    const { rerender } = render(<SeismicPanel seismic={withSwarm} />);
    expect(screen.getByText("Swarm")).toBeInTheDocument();

    rerender(<SeismicPanel seismic={noSwarm} />);
    expect(screen.queryByText("Swarm")).toBeNull();
    expect(screen.getByText(/normal baseline|No swarm/i)).toBeInTheDocument();
  });

  it("(c) count30d:0 → no-quakes copy and no .evt rows", () => {
    const { container } = render(<SeismicPanel seismic={noEvents} />);
    expect(screen.getByText(/No recent earthquakes within ~30 km/i)).toBeInTheDocument();
    expect(container.querySelectorAll(".evt").length).toBe(0);
  });

  it("(d) Provenance button matching /ComCat/ is rendered", () => {
    render(<SeismicPanel seismic={withEvents} />);
    const btn = screen.getByRole("button", { name: /ComCat/i });
    expect(btn).toBeInTheDocument();
  });

  it("(e) seismic={null} → renders nothing", () => {
    const { container } = render(<SeismicPanel seismic={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("(e) seismic={undefined} → renders nothing", () => {
    const { container } = render(<SeismicPanel seismic={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("(f) has no a11y violations with events", async () => {
    const { container } = render(<SeismicPanel seismic={withEvents} />);
    await expectNoA11yViolations(container);
  });

  it("(f) has no a11y violations with swarm", async () => {
    const { container } = render(<SeismicPanel seismic={withSwarm} />);
    await expectNoA11yViolations(container);
  });

  it("(f) has no a11y violations in empty state", async () => {
    const { container } = render(<SeismicPanel seismic={noEvents} />);
    await expectNoA11yViolations(container);
  });

  it("caps displayed events at 5 when more than 5 provided", () => {
    const manyEvents: SeismicSummary = {
      ...withEvents,
      count30d: 10,
      events: Array.from({ length: 8 }, (_, i) => ({
        mag: 1.0 + i * 0.1,
        place: `Location ${i}`,
        depthKm: 5,
        lng: -121.76,
        lat: 46.85,
        time: recentEventTime,
        type: "earthquake",
        status: "automatic",
      })),
    };
    const { container } = render(<SeismicPanel seismic={manyEvents} />);
    expect(container.querySelectorAll(".evt").length).toBe(5);
  });
});
