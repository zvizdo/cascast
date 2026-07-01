import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { LastUpdated } from "@/components/shared/LastUpdated";

afterEach(() => vi.useRealTimers());

describe("LastUpdated", () => {
  it("renders pending when iso is null", () => {
    render(<LastUpdated iso={null} />);
    expect(screen.getByText(/pending first refresh/i)).toBeInTheDocument();
  });

  it("renders a relative 'X min ago' stamp with the default prefix", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-14T14:14:00Z"));
    render(<LastUpdated iso="2026-02-14T14:00:00Z" />);
    expect(screen.getByText(/updated 14 min ago/i)).toBeInTheDocument();
  });

  it("carries the absolute time in the title attribute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-14T14:14:00Z"));
    render(<LastUpdated iso="2026-02-14T14:00:00Z" />);
    expect(screen.getByText(/updated 14 min ago/i)).toHaveAttribute("title");
  });

  it("honors a custom prefix", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-14T16:00:00Z"));
    render(<LastUpdated iso="2026-02-14T14:00:00Z" prefix="Refreshed" />);
    expect(screen.getByText(/refreshed 2 hr ago/i)).toBeInTheDocument();
  });
});
