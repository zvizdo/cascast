import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { UpdatingPill } from "@/components/shared/UpdatingPill";

describe("UpdatingPill", () => {
  it("renders the pill when show is true", () => {
    render(<UpdatingPill show />);
    expect(screen.getByRole("status")).toHaveTextContent(/updating/i);
  });

  it("renders nothing when show is false", () => {
    const { container } = render(<UpdatingPill show={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("accepts a custom label", () => {
    render(<UpdatingPill show label="Refreshing…" />);
    expect(screen.getByRole("status")).toHaveTextContent("Refreshing…");
  });
});
