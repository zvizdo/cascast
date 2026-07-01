// src/components/mountain/__tests__/MountainTabs.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { expectNoA11yViolations } from "@/components/shared/__tests__/test-utils";
import { MountainTabs } from "@/components/mountain/MountainTabs";

// --- navigation mock setup ---
// mockParams holds the current search string; tests mutate it before each render.
const replace = vi.fn();
let mockParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace }),
  usePathname: () => "/mountains/mt-rainier",
  useSearchParams: () => mockParams,
}));

const tabs = [
  { key: "forecast", label: "Forecast", content: <div>FORECAST BODY</div> },
  { key: "safety", label: "Safety", content: <div>SAFETY BODY</div> },
];

beforeEach(() => {
  replace.mockClear();
  mockParams = new URLSearchParams(); // reset to empty each test
});

describe("MountainTabs", () => {
  // --- existing tests (now with navigation mock wired) ---
  it("shows the first tab by default", () => {
    render(<MountainTabs tabs={tabs} />);
    expect(screen.getByText("FORECAST BODY")).toBeInTheDocument();
    expect(screen.queryByText("SAFETY BODY")).not.toBeInTheDocument();
  });
  it("switches tabs on click", () => {
    render(<MountainTabs tabs={tabs} />);
    fireEvent.click(screen.getByRole("tab", { name: "Safety" }));
    expect(screen.getByText("SAFETY BODY")).toBeInTheDocument();
  });
  it("marks the active tab aria-selected", () => {
    render(<MountainTabs tabs={tabs} />);
    expect(screen.getByRole("tab", { name: "Forecast" })).toHaveAttribute("aria-selected", "true");
  });
  it("has no a11y violations", async () => {
    const { container } = render(<MountainTabs tabs={tabs} />);
    await expectNoA11yViolations(container);
  });
  it("moves and activates tabs with arrow and Home/End keys", () => {
    render(<MountainTabs tabs={tabs} />);
    const forecast = screen.getByRole("tab", { name: "Forecast" });
    forecast.focus();
    fireEvent.keyDown(forecast, { key: "ArrowRight" });
    expect(screen.getByRole("tab", { name: "Safety" })).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(screen.getByRole("tab", { name: "Safety" }), { key: "Home" });
    expect(screen.getByRole("tab", { name: "Forecast" })).toHaveAttribute("aria-selected", "true");
  });

  // --- new URL-param-aware tests ---
  it("(a) ?tab=safety initialises Safety as active", () => {
    mockParams = new URLSearchParams("tab=safety");
    render(<MountainTabs tabs={tabs} />);
    expect(screen.getByRole("tab", { name: "Safety" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("SAFETY BODY")).toBeInTheDocument();
  });

  it("(b) clicking a tab calls router.replace with ?tab= set and preserves other params", () => {
    mockParams = new URLSearchParams("target=2026-06-22");
    render(<MountainTabs tabs={tabs} />);
    fireEvent.click(screen.getByRole("tab", { name: "Safety" }));
    expect(replace).toHaveBeenCalledOnce();
    const calledUrl: string = replace.mock.calls[0][0];
    const url = new URL(calledUrl, "http://localhost");
    expect(url.searchParams.get("tab")).toBe("safety");
    expect(url.searchParams.get("target")).toBe("2026-06-22");
    expect(replace.mock.calls[0][1]).toEqual({ scroll: false });
  });

  it("(c) ?tab=bogus falls back to the first tab", () => {
    mockParams = new URLSearchParams("tab=bogus");
    render(<MountainTabs tabs={tabs} />);
    expect(screen.getByRole("tab", { name: "Forecast" })).toHaveAttribute("aria-selected", "true");
  });

  it("(d) external ?tab= change after mount syncs the active tab (Storm-chip deep-link)", () => {
    const { rerender } = render(<MountainTabs tabs={tabs} />);
    expect(screen.getByRole("tab", { name: "Forecast" })).toHaveAttribute("aria-selected", "true");

    mockParams = new URLSearchParams("tab=safety");
    rerender(<MountainTabs tabs={tabs} />);

    expect(screen.getByRole("tab", { name: "Safety" })).toHaveAttribute("aria-selected", "true");
  });
});
