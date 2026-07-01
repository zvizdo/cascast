import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ElevationBandSelector } from "@/components/project/ElevationBandSelector";
import { useBand } from "@/lib/band";
import { track } from "@/lib/analytics";

vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/mountains/rainier" }));

describe("ElevationBandSelector", () => {
  beforeEach(() => {
    useBand.setState({ band: "summit" });
    vi.mocked(track).mockClear();
  });

  it("defaults to Summit selected", () => {
    render(<ElevationBandSelector />);
    expect(screen.getByRole("radio", { name: /summit/i })).toHaveAttribute("aria-checked", "true");
  });
  it("updates the shared store on click", () => {
    render(<ElevationBandSelector />);
    fireEvent.click(screen.getByRole("radio", { name: /base/i }));
    expect(useBand.getState().band).toBe("base");
  });
  it("reflects an externally-set band", () => {
    useBand.setState({ band: "mid" });
    render(<ElevationBandSelector />);
    expect(screen.getByRole("radio", { name: /mid/i })).toHaveAttribute("aria-checked", "true");
  });
  it("dual-renders a native <select> for mobile that updates the store", () => {
    render(<ElevationBandSelector />);
    const select = screen.getByRole("combobox", { name: "Elevation band" });
    expect(select.tagName).toBe("SELECT");
    fireEvent.change(select, { target: { value: "base" } });
    expect(useBand.getState().band).toBe("base");
  });

  it("tracks elevation_band_changed with slug from the path", () => {
    render(<ElevationBandSelector />);
    fireEvent.click(screen.getByRole("radio", { name: /base/i }));
    expect(track).toHaveBeenCalledWith("elevation_band_changed", { mountain_slug: "rainier", band: "base" });
  });
});
