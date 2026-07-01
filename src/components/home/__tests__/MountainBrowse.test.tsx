import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { MountainBrowse } from "@/components/home/MountainBrowse";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { Mountain } from "@/lib/types";

const base: Omit<Mountain, "slug" | "name" | "elevations" | "region"> = {
  lat: 46.85, lng: -121.76, nwacZone: "z", nwacZoneId: "1", snotelStationId: "1",
  snotelStationTriplet: "1:WA:SNTL", snotelStationName: "S", timezone: "America/Los_Angeles",
  description: "A test peak descriptor.",
};
const M = (slug: string, name: string, region: string, summit: number): Mountain =>
  ({ ...base, slug, name, region, elevations: { base: 1000, mid: 5000, summit } } as Mountain);

const mts: Mountain[] = [
  M("mt-rainier", "Mount Rainier", "cascades-south", 14410),
  M("mt-baker", "Mount Baker", "cascades-north", 10781),
  M("mt-stuart", "Mount Stuart", "cascades-central", 9415),
  M("mt-olympus", "Mount Olympus", "olympics", 7980),
  M("mt-hood", "Mount Hood", "oregon", 11249),
  M("mt-whitney", "Mount Whitney", "sierra-nevada", 14505),
];

beforeEach(() => useUnits.setState(DEFAULT_UNITS));

describe("MountainBrowse", () => {
  it("renders the three region headings", () => {
    render(<MountainBrowse mountains={mts} />);
    expect(screen.getByRole("heading", { name: "Washington" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Oregon" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Beyond the Northwest" })).toBeInTheDocument();
  });

  it("renders the four Washington sub-labels", () => {
    render(<MountainBrowse mountains={mts} />);
    for (const label of ["North Cascades", "Central Cascades · Enchantments", "South Cascades", "Olympics"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders a card linking to the peak with its summit elevation in feet", () => {
    render(<MountainBrowse mountains={mts} />);
    const link = screen.getByRole("link", { name: /Mount Rainier/i });
    expect(link).toHaveAttribute("href", "/mountains/mt-rainier");
    expect(screen.getByText(/14,410 ft/)).toBeInTheDocument();
  });

  it("respects the units toggle (feet → meters)", () => {
    useUnits.setState({ dist: "m" });
    render(<MountainBrowse mountains={mts} />);
    expect(screen.getByText(/4,392 m/)).toBeInTheDocument(); // 14410 ft → 4392 m
  });
});
