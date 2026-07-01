import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useUnits, DEFAULT_UNITS } from "@/lib/units";

/* Mutable pathname so individual tests can override it. */
let mockPathname = "/";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

import { Header } from "@/components/layout/Header";

beforeEach(() => {
  mockPathname = "/";
  document.documentElement.dataset.theme = "glacier";
  localStorage.clear();
  useUnits.setState(DEFAULT_UNITS);
});

describe("Header", () => {
  it("renders brand and the Search / Your Mountains nav links", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /cascast home/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /^search$/i })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /your mountains/i })).toHaveAttribute(
      "href",
      "/your-mountains",
    );
  });

  it("no longer renders Projects/Peaks links", () => {
    render(<Header />);
    expect(screen.queryByRole("link", { name: /^projects$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^peaks$/i })).not.toBeInTheDocument();
  });

  it("marks the active nav link based on pathname", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /^search$/i })).toHaveClass("is-active");
    expect(screen.getByRole("link", { name: /your mountains/i })).not.toHaveClass("is-active");
  });

  it("sets aria-current=page on the active nav link only", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /^search$/i })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: /your mountains/i })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("includes the theme and units toggles", () => {
    render(<Header />);
    // Both desktop-cluster and mobile-menu instances render in jsdom (CSS visibility not applied).
    expect(screen.getAllByRole("button", { name: /switch to .* theme/i })).toHaveLength(2);
    expect(screen.getAllByRole("group", { name: /display units/i })).toHaveLength(2);
  });

  it("links the brand to home", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /cascast home/i })).toHaveAttribute("href", "/");
  });

  it("hides the Pin a Peak CTA on the home route", () => {
    mockPathname = "/";
    render(<Header />);
    expect(screen.queryByRole("link", { name: /pin a peak/i })).toBeNull();
  });

  it("shows the Pin a Peak CTA off the home route", () => {
    mockPathname = "/mountains/mt-rainier";
    render(<Header />);
    expect(screen.getByRole("link", { name: /pin a peak/i })).toBeInTheDocument();
  });

  it("renders an About nav link", () => {
    render(<Header />);
    expect(screen.getByRole("link", { name: /^about$/i })).toHaveAttribute("href", "/about");
  });
});
