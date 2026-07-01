import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { ConditionTone } from "@/components/shared/ConditionTone";

describe("ConditionTone", () => {
  it("shows dot + word", () => {
    const { container } = render(<ConditionTone tone="caution" />);
    expect(container.querySelector(".tone-dot.tone-caution")).toBeTruthy();
    expect(screen.getByText("Marginal")).toBeInTheDocument();
  });

  it("renders the good and alert labels", () => {
    const { rerender } = render(<ConditionTone tone="good" />);
    expect(screen.getByText("Favorable")).toBeInTheDocument();
    rerender(<ConditionTone tone="alert" />);
    expect(screen.getByText("Hazardous")).toBeInTheDocument();
  });

  it("uses pc-tone pill style when chip", () => {
    const { container } = render(<ConditionTone tone="alert" chip />);
    expect(container.querySelector(".pc-tone.alert")).toBeTruthy();
  });
});
