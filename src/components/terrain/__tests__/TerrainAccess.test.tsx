import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import type { Mountain } from "@/lib/types";

// Mock next/dynamic so jsdom doesn't load maplibre-gl (WebGL not available in jsdom).
vi.mock("next/dynamic", () => ({
  default: (_fn: unknown) => {
    const Stub = (_props: unknown) => <div data-testid="terrain-map-stub" />;
    return Stub;
  },
}));

// Also mock the TerrainMap module directly in case it's imported without dynamic.
vi.mock("@/components/map/TerrainMap", () => ({
  TerrainMap: () => <div data-testid="terrain-map-stub" />,
}));

// Mock the geo hooks so they're deterministic and no network occurs.
const useMountainSeismic = vi.fn();
const useMountainRoads = vi.fn();
const useMountainTrails = vi.fn();
vi.mock("@/lib/hooks", () => ({
  useMountainSeismic: (slug: string) => useMountainSeismic(slug),
  useMountainRoads: (slug: string) => useMountainRoads(slug),
  useMountainTrails: (slug: string) => useMountainTrails(slug),
}));

// Import after mocks are registered.
import { TerrainAccess } from "@/components/terrain/TerrainAccess";

const mountain: Mountain = {
  slug: "mt-rainier",
  name: "Mount Rainier",
  lat: 46.853,
  lng: -121.76,
  elevations: { base: 5400, mid: 10000, summit: 14411 },
  nwacZone: "Mt Rainier",
  nwacZoneId: "mt-rainier",
  snotelStationId: "679",
  snotelStationTriplet: "679:WA:SNTL",
  snotelStationName: "Paradise",
  region: "cascades-south",
  timezone: "America/Los_Angeles",
  description: "The highest peak in Washington.",
  mapBbox: { west: -121.84, south: 46.77, east: -121.68, north: 46.93 },
  webcams: [],
  permits: [
    { label: "Climbing Permit (NPS MORA)", url: "https://example.com/permit", note: "Required above 10k" },
  ],
};

beforeEach(() => {
  useMountainSeismic.mockReset();
  useMountainSeismic.mockReturnValue({ seismic: undefined, isLoading: false, error: undefined, mutate: vi.fn() });
  useMountainRoads.mockReset();
  useMountainRoads.mockReturnValue({ roads: undefined, isLoading: false, error: undefined });
  useMountainTrails.mockReset();
  useMountainTrails.mockReturnValue({ trails: undefined, isLoading: false, error: undefined });
});

describe("TerrainAccess", () => {
  it("(a) renders the Topo/Satellite base Segmented", () => {
    render(<TerrainAccess mountain={mountain} />);
    expect(screen.getByRole("radiogroup", { name: /base map style/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /topo/i })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /satellite/i })).toBeInTheDocument();
  });

  it("(b) toggling Snow cover checkbox flips it and shows acquisition-date caveat", () => {
    render(<TerrainAccess mountain={mountain} />);
    const checkbox = screen.getByRole("checkbox", { name: /snow cover \(gibs\)/i });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
    const caveat = screen.getByText(/modis snow.*\d{4}-\d{2}-\d{2}/i);
    expect(caveat).toBeInTheDocument();
  });

  it("(c) attribution line names OpenTopoMap and GIBS", () => {
    render(<TerrainAccess mountain={mountain} />);
    const attr = screen.getByText(/opentopomap/i);
    expect(attr).toBeInTheDocument();
    expect(attr.textContent).toMatch(/gibs/i);
  });

  it("(d) WebcamStrip and AccessCards render their headings / empty-states", () => {
    render(<TerrainAccess mountain={mountain} />);
    expect(screen.getByText(/live webcams/i)).toBeInTheDocument();
    expect(screen.getByText(/no webcam available/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /roads/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /trails/i })).toBeInTheDocument();
    expect(screen.getByText(/climbing permit/i)).toBeInTheDocument();
  });

  it("(e) 3D link href contains /mountains/mt-rainier/3d", () => {
    render(<TerrainAccess mountain={mountain} />);
    const link = screen.getByRole("link", { name: /explore in 3d/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute("href", expect.stringContaining("/mountains/mt-rainier/3d"));
  });

  it("(e) 3D link includes ?target= when target prop is set", () => {
    render(<TerrainAccess mountain={mountain} target="2026-06-22" />);
    const link = screen.getByRole("link", { name: /explore in 3d/i });
    expect(link).toHaveAttribute("href", expect.stringContaining("?target=2026-06-22"));
  });

  it("(f) the 5 layer checkboxes are now ENABLED (not disabled)", () => {
    render(<TerrainAccess mountain={mountain} />);
    for (const name of [/^trails$/i, /^roads$/i, /^wilderness$/i, /^trailheads$/i, /^earthquakes$/i]) {
      const cb = screen.getByRole("checkbox", { name });
      expect(cb).not.toBeChecked();
      expect(cb).not.toBeDisabled();
    }
    // No "coming soon" copy remains.
    expect(screen.queryByText(/coming soon/i)).not.toBeInTheDocument();
  });

  it("(b2) toggling Trails shows the OSM ODbL attribution + a legend entry", () => {
    render(<TerrainAccess mountain={mountain} />);
    // OSM attribution absent before Trails is on.
    expect(screen.queryByText(/openstreetmap \(odbl\)/i)).not.toBeInTheDocument();
    const trails = screen.getByRole("checkbox", { name: /^trails$/i });
    fireEvent.click(trails);
    expect(trails).toBeChecked();
    // Attribution line gains the OSM ODbL credit.
    expect(screen.getByText(/openstreetmap \(odbl\)/i)).toBeInTheDocument();
    // Legend gains a Trails entry.
    const legend = screen.getByRole("list", { name: /map layer legend/i });
    expect(legend.textContent).toMatch(/trails/i);
  });

  it("(c2) checking Earthquakes works and adds a legend entry", () => {
    render(<TerrainAccess mountain={mountain} />);
    const quakes = screen.getByRole("checkbox", { name: /^earthquakes$/i });
    fireEvent.click(quakes);
    expect(quakes).toBeChecked();
    const legend = screen.getByRole("list", { name: /map layer legend/i });
    expect(legend.textContent).toMatch(/earthquakes/i);
    // Unchecking removes it again.
    fireEvent.click(quakes);
    expect(quakes).not.toBeChecked();
  });

  it("(g) no a11y violations", async () => {
    const { container } = render(<TerrainAccess mountain={mountain} />);
    await expectNoA11yViolations(container);
  });

  it("(g2) no a11y violations with layers + legend enabled", async () => {
    useMountainSeismic.mockReturnValue({
      seismic: { events: [{ mag: 2.1, place: "near Rainier", lng: -121.7, lat: 46.85 }] },
      isLoading: false,
      error: undefined,
      mutate: vi.fn(),
    });
    const { container } = render(<TerrainAccess mountain={mountain} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /^trails$/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /^earthquakes$/i }));
    await expectNoA11yViolations(container);
  });

  it("notes that Forest Service layers are unavailable inside a National Park", () => {
    render(<TerrainAccess mountain={{ ...mountain, npsParkCode: "noca" }} />);
    expect(screen.getByText(/national forest/i)).toBeInTheDocument();
  });

  it("omits the National-Park note for non-park peaks", () => {
    render(<TerrainAccess mountain={{ ...mountain, npsParkCode: undefined }} />);
    expect(screen.queryByText(/national forest/i)).toBeNull();
  });
});
