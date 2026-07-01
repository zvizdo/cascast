import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PanelHead } from "@/components/shared/PanelHead";

describe("PanelHead", () => {
  it("renders kicker + title + right slot", () => {
    render(<PanelHead kicker="Signature view" title="Freezing level" right={<span>HRRR</span>} />);
    expect(screen.getByText("Signature view")).toHaveClass("kicker");
    expect(screen.getByText("Freezing level")).toHaveClass("section-title");
    expect(screen.getByText("HRRR")).toBeInTheDocument();
  });
});
