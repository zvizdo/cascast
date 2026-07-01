import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyState } from "@/components/dashboard/EmptyState";

describe("EmptyState", () => {
  it("renders title, body, and optional cta", () => {
    render(
      <EmptyState
        title="No pinned mountains yet"
        body="Pin your first peak to start tracking."
        cta={<a href="/">Pin a Peak</a>}
      />,
    );
    expect(screen.getByText("No pinned mountains yet")).toBeInTheDocument();
    expect(screen.getByText(/pin your first peak/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /pin a peak/i })).toBeInTheDocument();
  });

  it("renders without a cta", () => {
    render(<EmptyState title="Nothing here" body="Empty." />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});
