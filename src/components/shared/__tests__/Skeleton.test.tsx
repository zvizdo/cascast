import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Skeleton, SkeletonGrid } from "@/components/shared/Skeleton";

describe("Skeleton", () => {
  it("renders the named testid for each variant", () => {
    const { rerender } = render(<Skeleton variant="chart" name="chart-x" />);
    expect(screen.getByTestId("skeleton-chart-x")).toBeInTheDocument();

    rerender(<Skeleton variant="card" name="card-x" />);
    expect(screen.getByTestId("skeleton-card-x")).toBeInTheDocument();

    rerender(<Skeleton variant="panel" name="panel-x" />);
    expect(screen.getByTestId("skeleton-panel-x")).toBeInTheDocument();

    rerender(<Skeleton variant="text" name="text-x" lines={2} />);
    expect(screen.getByTestId("skeleton-text-x")).toBeInTheDocument();
  });

  it("defaults to the text variant with no testid", () => {
    const { container } = render(<Skeleton />);
    expect(container.querySelectorAll(".skeleton-line").length).toBe(3);
  });

  it("applies a custom className", () => {
    render(<Skeleton variant="chart" name="c" className="extra" />);
    expect(screen.getByTestId("skeleton-c").className).toContain("extra");
  });

  it("is aria-hidden (decorative)", () => {
    render(<Skeleton variant="panel" name="p" />);
    expect(screen.getByTestId("skeleton-p")).toHaveAttribute("aria-hidden");
  });

  it("wraps each variant in a role=status region announcing Loading", () => {
    const { rerender } = render(<Skeleton variant="panel" name="p" />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    rerender(<Skeleton variant="chart" name="c" />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
    rerender(<Skeleton variant="text" name="t" />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);
  });

  it("SkeletonGrid renders N card skeletons under the dashboard testid", () => {
    render(<SkeletonGrid count={4} />);
    const grid = screen.getByTestId("skeleton-dashboard");
    expect(grid.querySelectorAll(".skeleton-card").length).toBe(4);
  });
});
