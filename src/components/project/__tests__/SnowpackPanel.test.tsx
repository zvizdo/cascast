import { render, screen, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { SnowpackPanel } from "@/components/project/SnowpackPanel";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { SnotelData } from "@/lib/types";

const snotel = {
  stationName: "Paradise",
  elevationFt: 5430,
  current: { snowDepthIn: 112, sweIn: 38.2, percentOfMedian: 108 },
  trend: [{ snowDepthIn: 90 }, { snowDepthIn: 100 }, { snowDepthIn: 112 }],
} as unknown as SnotelData;

beforeEach(() => useUnits.setState(DEFAULT_UNITS));

describe("SnowpackPanel", () => {
  it("shows depth, SWE, and percent-of-median", () => {
    render(<SnowpackPanel snotel={snotel} />);
    expect(screen.getByText("Snow depth")).toBeInTheDocument();
    expect(screen.getByText("SWE")).toBeInTheDocument();
    expect(screen.getByText("108%")).toBeInTheDocument();
    expect(screen.getByText(/112/)).toBeInTheDocument();
    expect(screen.getAllByText(/Paradise/).length).toBeGreaterThan(0);
  });

  it("rounds a fractional percentOfMedian to an integer and SWE to one decimal", () => {
    render(
      <SnowpackPanel
        snotel={
          {
            ...snotel,
            current: { snowDepthIn: 112, sweIn: 38.249, percentOfMedian: 7.786885245901639 },
          } as unknown as SnotelData
        }
      />,
    );
    expect(screen.getByText("8%")).toBeInTheDocument();
    expect(screen.queryByText(/7\.78/)).not.toBeInTheDocument();
    expect(screen.getByText(/38\.2/)).toBeInTheDocument();
    expect(screen.queryByText(/38\.249/)).not.toBeInTheDocument();
  });

  it("renders depth in inches by default", () => {
    const { container } = render(<SnowpackPanel snotel={snotel} />);
    const depthUnit = container.querySelector(".snotel-top .stat-unit");
    expect(depthUnit?.textContent).toBe("in");
  });

  it("converts depth to cm when dist=m", () => {
    render(<SnowpackPanel snotel={snotel} />);
    act(() => useUnits.getState().setDist("m"));
    expect(screen.getByText(/cm/)).toBeInTheDocument();
  });

  it("renders the 30-day AreaSpark", () => {
    const { container } = render(<SnowpackPanel snotel={snotel} />);
    expect(container.querySelector("svg path")).toBeTruthy();
  });

  it("handles missing data", () => {
    render(<SnowpackPanel snotel={null} />);
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("handles a snotel doc with no current reading", () => {
    render(<SnowpackPanel snotel={{ stationName: "X", trend: [] } as unknown as SnotelData} />);
    expect(screen.getByText(/pending/i)).toBeInTheDocument();
  });

  it("omits the spark when the trend has fewer than two points", () => {
    const { container } = render(
      <SnowpackPanel
        snotel={
          { ...snotel, trend: [{ snowDepthIn: 100 }] } as unknown as SnotelData
        }
      />,
    );
    expect(container.querySelector(".snotel-trend")).toBeNull();
  });
});
