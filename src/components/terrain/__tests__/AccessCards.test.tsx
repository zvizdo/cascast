import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AccessCards } from "@/components/terrain/AccessCards";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import type { Mountain } from "@/lib/types";

type Permit = NonNullable<Mountain["permits"]>[number];

const permit1: Permit = {
  label: "Mount Rainier Climbing Permit",
  url: "https://www.recreation.gov/permits/233262",
  note: "Required above 10,000 ft",
};

const permit2: Permit = {
  label: "National Park Pass",
  url: "https://www.nps.gov/mora/planyourvisit/fees.htm",
};

function makeRoadsFc(count: number, closedCount: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: count }, (_, i) => ({
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: [] },
      properties: { closed: i < closedCount },
    })),
  };
}

function makeTrailsFc(count: number): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: Array.from({ length: count }, () => ({
      type: "Feature" as const,
      geometry: { type: "LineString" as const, coordinates: [] },
      properties: {},
    })),
  };
}

describe("AccessCards", () => {
  it("renders two permit links with correct hrefs and rel='noopener noreferrer'", () => {
    render(<AccessCards permits={[permit1, permit2]} />);
    const links = screen.getAllByRole("link");
    const permitLinks = links.filter(
      (l) => l.getAttribute("href") === permit1.url || l.getAttribute("href") === permit2.url
    );
    expect(permitLinks).toHaveLength(2);
    permitLinks.forEach((link) => {
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(link).toHaveAttribute("target", "_blank");
    });
    expect(permitLinks[0]).toHaveTextContent("Mount Rainier Climbing Permit");
    expect(permitLinks[1]).toHaveTextContent("National Park Pass");
  });

  it("shows permit notes when present", () => {
    render(<AccessCards permits={[permit1]} />);
    expect(screen.getByText("Required above 10,000 ft")).toBeInTheDocument();
  });

  it("omits the Permits card entirely when permits is undefined", () => {
    render(<AccessCards permits={undefined} />);
    expect(screen.queryByRole("heading", { name: /permits/i })).toBeNull();
    expect(screen.getByRole("heading", { name: /roads/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /trails/i })).toBeInTheDocument();
  });

  it("omits the Permits card entirely when permits is empty array", () => {
    render(<AccessCards permits={[]} />);
    expect(screen.queryByRole("heading", { name: /permits/i })).toBeNull();
    expect(screen.getByRole("heading", { name: /roads/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /trails/i })).toBeInTheDocument();
  });

  // --- Roads card ---

  it("(roads-a) 5 features, 2 closed → shows segment count + closed count", () => {
    render(<AccessCards permits={[]} roads={makeRoadsFc(5, 2)} />);
    expect(screen.getByText(/5 forest road segments · 2 closed near the peak/i)).toBeInTheDocument();
  });

  it("(roads-b) roads undefined → 'Road data unavailable for this area.'", () => {
    render(<AccessCards permits={[]} />);
    expect(screen.getByText("Road data unavailable for this area.")).toBeInTheDocument();
  });

  it("(roads-c) roads empty FeatureCollection → 'Road data unavailable for this area.'", () => {
    const emptyRoads: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    render(<AccessCards permits={[]} roads={emptyRoads} />);
    expect(screen.getByText("Road data unavailable for this area.")).toBeInTheDocument();
  });

  it("(roads-d) 3 features, 0 closed → shows '3 forest road segments · 0 closed'", () => {
    render(<AccessCards permits={[]} roads={makeRoadsFc(3, 0)} />);
    expect(screen.getByText(/3 forest road segments · 0 closed near the peak/i)).toBeInTheDocument();
  });

  // --- Trails card ---

  it("(trails-a) 8 features → '8 mapped trail segments near the peak'", () => {
    render(<AccessCards permits={[]} trails={makeTrailsFc(8)} />);
    expect(screen.getByText(/8 mapped trail segments near the peak/i)).toBeInTheDocument();
  });

  it("(trails-b) trails undefined → 'Trail data unavailable for this area.'", () => {
    render(<AccessCards permits={[]} />);
    expect(screen.getByText("Trail data unavailable for this area.")).toBeInTheDocument();
  });

  it("(trails-c) trails empty FeatureCollection → 'Trail data unavailable for this area.'", () => {
    const emptyTrails: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
    render(<AccessCards permits={[]} trails={emptyTrails} />);
    expect(screen.getByText("Trail data unavailable for this area.")).toBeInTheDocument();
  });

  // --- Permits behavior unchanged ---

  it("(permits-e) permits card only appears when permits has entries", () => {
    const { rerender } = render(<AccessCards permits={[permit1]} />);
    expect(screen.getByRole("heading", { name: /permits/i })).toBeInTheDocument();
    rerender(<AccessCards permits={[]} />);
    expect(screen.queryByRole("heading", { name: /permits/i })).toBeNull();
  });

  // --- a11y ---

  it("(f) passes axe accessibility check — no data", async () => {
    const { container } = render(<AccessCards permits={[]} />);
    await expectNoA11yViolations(container);
  });

  it("(f2) passes axe accessibility check — with data", async () => {
    const { container } = render(
      <AccessCards permits={[permit1, permit2]} roads={makeRoadsFc(5, 2)} trails={makeTrailsFc(8)} />
    );
    await expectNoA11yViolations(container);
  });
});
