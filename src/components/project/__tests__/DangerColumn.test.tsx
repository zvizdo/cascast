import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { DangerColumn } from "@/components/project/DangerColumn";

describe("DangerColumn", () => {
  it("renders three bands with number+label (a11y, not color-only)", () => {
    render(<DangerColumn danger={{ upper: 3, middle: 3, lower: 2 }} />);
    expect(screen.getByText("Upper")).toBeInTheDocument();
    expect(screen.getByText("Middle")).toBeInTheDocument();
    expect(screen.getByText("Lower")).toBeInTheDocument();
    expect(screen.getAllByText(/3 · Considerable/).length).toBe(2);
    expect(screen.getByText(/2 · Moderate/)).toBeInTheDocument();
  });

  it("no-rating renders 'No rating' for -1 levels", () => {
    render(<DangerColumn danger={{ upper: -1, middle: -1, lower: -1 }} />);
    expect(screen.getAllByText(/no rating/i).length).toBe(3);
  });

  it("hides tags in compact mode", () => {
    const { container } = render(
      <DangerColumn danger={{ upper: 3, middle: 2, lower: 1 }} compact />,
    );
    expect(container.querySelector(".danger-col.compact")).toBeTruthy();
  });

  it("fills meter segments up to the danger level", () => {
    const { container } = render(<DangerColumn danger={{ upper: 2, middle: 0, lower: 0 }} />);
    const meters = container.querySelectorAll(".danger-meter");
    expect(meters.length).toBe(3);
    expect(meters[0].querySelectorAll(".danger-seg").length).toBe(5);
  });

});
