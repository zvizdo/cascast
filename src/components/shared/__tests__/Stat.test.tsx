import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Stat } from "@/components/shared/Stat";

describe("Stat", () => {
  it("renders label, serif value, unit, sub", () => {
    render(<Stat label="Wind" value={45} unit="mph" sub="gust 60" />);
    expect(screen.getByText("Wind")).toHaveClass("stat-label");
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("mph")).toHaveClass("stat-unit");
    expect(screen.getByText("gust 60")).toHaveClass("stat-sub");
  });

  it("omits unit and sub when not provided", () => {
    const { container } = render(<Stat label="Zone" value="Stevens" />);
    expect(container.querySelector(".stat-unit")).toBeNull();
    expect(container.querySelector(".stat-sub")).toBeNull();
  });

  it("applies accent color to the value", () => {
    const { container } = render(<Stat label="Hi" value={10} accent="var(--alert)" />);
    expect(container.querySelector(".stat-value")).toHaveStyle({ color: "var(--alert)" });
  });
});
