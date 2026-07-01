import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DangerChip } from "@/components/shared/DangerChip";

describe("DangerChip", () => {
  it("shows number + label (not color-only)", () => {
    render(<DangerChip level={3} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Considerable")).toBeInTheDocument();
  });

  it("adds an arrow suffix when tomorrow", () => {
    render(<DangerChip level={2} tomorrow />);
    expect(screen.getByText(/Moderate →/)).toBeInTheDocument();
  });

  it("handles no-rating for level <= 0", () => {
    render(<DangerChip level={-1} />);
    expect(screen.getByText(/no rating/i)).toBeInTheDocument();
  });

  it("shows the arrow on a no-rating tomorrow chip", () => {
    render(<DangerChip level={0} tomorrow />);
    expect(screen.getByText(/No rating →/)).toBeInTheDocument();
  });

  it("falls back to Low for an out-of-range level", () => {
    render(<DangerChip level={9} />);
    expect(screen.getByText("Low")).toBeInTheDocument();
  });

  it("renders all five rated levels", () => {
    const labels = ["Low", "Moderate", "Considerable", "High", "Extreme"];
    labels.forEach((label, i) => {
      const { unmount } = render(<DangerChip level={i + 1} />);
      expect(screen.getByText(label)).toBeInTheDocument();
      unmount();
    });
  });

  it("slate theme: danger-num--d3 carries no inline color (dark ink is CSS-only, scoped to non-slate via :root:not([data-theme='slate']))", () => {
    // jsdom cannot evaluate stylesheets, so we assert the DOM side of the fix:
    // the element has the danger-num--d3 class and no inline style.color that would
    // force dark ink in the slate theme. The light-theme dark-ink rule is now scoped
    // to :root:not([data-theme="slate"]) in globals.css, so slate retains the base
    // .danger-num { color:#fff } without any override.
    const { container } = render(<DangerChip level={3} />);
    const d3El = container.querySelector(".danger-num--d3") as HTMLElement | null;
    expect(d3El).not.toBeNull();
    // No inline color override — color is controlled exclusively by the stylesheet.
    expect(d3El!.style.color).toBe("");
  });
});
