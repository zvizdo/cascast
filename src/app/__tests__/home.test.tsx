import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import Home from "@/app/page";
import { useMountains } from "@/lib/hooks";
import { useRouter } from "next/navigation";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";
import type { Mountain } from "@/lib/types";

vi.mock("@/lib/hooks", () => ({ useMountains: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

const base: Omit<Mountain, "slug" | "name" | "elevations"> = {
  lat: 46.85,
  lng: -121.76,
  nwacZone: "west-slopes-south",
  nwacZoneId: "1648",
  snotelStationId: "679",
  snotelStationTriplet: "679:WA:SNTL",
  snotelStationName: "Paradise",
  region: "cascades-south",
  timezone: "America/Los_Angeles",
  description: "",
};

const mts: Mountain[] = [
  { ...base, slug: "mt-rainier", name: "Mount Rainier", elevations: { base: 5420, mid: 10188, summit: 14410 } },
  { ...base, slug: "mt-baker", name: "Mount Baker", elevations: { base: 3500, mid: 6000, summit: 10781 } },
];

beforeEach(() => {
  useUnits.setState(DEFAULT_UNITS);
  vi.mocked(useMountains).mockReturnValue({ mountains: mts, isLoading: false, error: undefined });
  vi.mocked(useRouter).mockReturnValue({ push: vi.fn() } as never);
});

describe("Home (search-first)", () => {
  it("renders the search combobox", () => {
    render(<Home />);
    expect(screen.getByRole("combobox", { name: /search mountains/i })).toBeInTheDocument();
  });

  it("shows no suggestions before 3 characters are typed", () => {
    render(<Home />);
    const input = screen.getByRole("combobox", { name: /search mountains/i });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "ra" } });
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("shows matching suggestions once 3+ characters are typed", () => {
    render(<Home />);
    const input = screen.getByRole("combobox", { name: /search mountains/i });
    fireEvent.change(input, { target: { value: "rai" } });
    expect(screen.getByRole("option", { name: /mount rainier/i })).toBeInTheDocument();
    expect(screen.getAllByRole("option").length).toBeGreaterThanOrEqual(1);
  });

  it("navigates to the browse view when a suggestion is selected", () => {
    const push = vi.fn();
    vi.mocked(useRouter).mockReturnValue({ push } as never);
    render(<Home />);
    const input = screen.getByRole("combobox", { name: /search mountains/i });
    fireEvent.change(input, { target: { value: "rai" } });
    fireEvent.click(screen.getByRole("option", { name: /mount rainier/i }));
    expect(push).toHaveBeenCalledWith("/mountains/mt-rainier");
  });
});

describe("Home (explain + browse)", () => {
  it("renders the hero kicker and title", () => {
    render(<Home />);
    expect(screen.getByText(/free alpine weather/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /pacific northwest/i })).toBeInTheDocument();
  });

  it("links the Data feature to the sources page", () => {
    render(<Home />);
    expect(screen.getByRole("link", { name: /free, public sources/i })).toHaveAttribute("href", "/sources");
  });

  it("renders the browse-by-region section from the catalog", () => {
    render(<Home />);
    // mts fixture (Rainier + Baker) → Washington group present with a Rainier card
    expect(screen.getByRole("heading", { name: "Washington" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Mount Rainier/i })).toHaveAttribute("href", "/mountains/mt-rainier");
  });
});
