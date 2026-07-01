import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { SatellitePanel } from "@/components/project/SatellitePanel";
import type { SatelliteCache } from "@/lib/types";

// A recent (fresh, ≤14d) scene date so the non-stale branch renders.
const freshDate = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);

const sat: SatelliteCache = {
  mountainId: "mt-rainier",
  latestImageDate: freshDate,
  cloudCoverPercent: 18,
  tileUrlTemplate: "https://tiles/{z}/{y}/{x}.jpg",
  tileSource: "eox-s2cloudless",
  attribution: "Sentinel-2 cloudless — EOX",
  boundingBox: { north: 47, south: 46, east: -121, west: -122 },
};

describe("SatellitePanel", () => {
  it("shows scene date, cloud cover, and attribution", () => {
    render(<SatellitePanel sat={sat} mountainName="Mount Rainier" imageUrl="/api/mountains/mt-rainier/satellite/image" />);
    expect(screen.getByText(/18%/)).toBeInTheDocument();
    expect(screen.getByText(/Sentinel-2 cloudless/)).toBeInTheDocument();
    expect(screen.getByText(/recent cloud-free scene/i)).toBeInTheDocument();
  });

  it("rounds a fractional cloudCoverPercent to an integer", () => {
    render(<SatellitePanel sat={{ ...sat, cloudCoverPercent: 18.4271 }} mountainName="Mount Rainier" imageUrl="/api/mountains/mt-rainier/satellite/image" />);
    expect(screen.getByText(/18%/)).toBeInTheDocument();
    expect(screen.queryByText(/18\.42/)).not.toBeInTheDocument();
  });

  it("shows the StaleNotice with the scene date and age for old imagery", () => {
    render(<SatellitePanel sat={{ ...sat, latestImageDate: "2025-01-01" }} mountainName="X" imageUrl="/api/mountains/mt-rainier/satellite/image" />);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent(/imagery from jan 1, 2025/i);
    expect(notice).toHaveTextContent(/days old/i);
  });

  it("shows the labeled placeholder when there is no scene", () => {
    const { container } = render(<SatellitePanel sat={null} mountainName="Mount Baker" imageUrl="/api/mountains/mt-rainier/satellite/image" />);
    expect(screen.getByText(/RGB tile/i)).toBeInTheDocument();
    expect(container.querySelector(".sat-placeholder")?.textContent).toContain("Mount Baker");
  });

  it("handles a null latestImageDate gracefully", () => {
    render(<SatellitePanel sat={{ ...sat, latestImageDate: null }} mountainName="X" imageUrl="/api/mountains/mt-rainier/satellite/image" />);
    expect(screen.getByText(/RGB tile/i)).toBeInTheDocument();
  });

  it("renders the scene image when a scene exists", () => {
    render(<SatellitePanel sat={sat} mountainName="Mt Rainier" imageUrl="/api/mountains/mt-rainier/satellite/image" />);
    const img = screen.getByRole("img", { name: /sentinel-2 .*mt rainier/i });
    expect(img).toHaveAttribute("src", "/api/mountains/mt-rainier/satellite/image");
  });

  it("falls back to the placeholder when the image fails to load", () => {
    render(<SatellitePanel sat={sat} mountainName="Mt Rainier" imageUrl="/api/mountains/mt-rainier/satellite/image" />);
    fireEvent.error(screen.getByRole("img"));
    expect(screen.getByText(/RGB tile/i)).toBeInTheDocument();
  });

  it("shows the placeholder when there is no scene", () => {
    render(<SatellitePanel sat={null} mountainName="Mt Rainier" imageUrl="/api/mountains/mt-rainier/satellite/image" />);
    expect(screen.queryByRole("img", { name: /sentinel-2/i })).toBeNull();
    expect(screen.getByText(/RGB tile/i)).toBeInTheDocument();
  });
});
