import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { DrillLink } from "@/components/shared/DrillLink";

describe("DrillLink", () => {
  it("renders a link when href is given", () => {
    render(<DrillLink href="/mountains/mt-rainier/models">Compare all models</DrillLink>);
    const link = screen.getByRole("link", { name: /compare all models/i });
    expect(link).toHaveAttribute("href", "/mountains/mt-rainier/models");
    expect(link).toHaveClass("drill-link");
  });

  it("renders a button that fires onClick when no href", () => {
    const onClick = vi.fn();
    render(<DrillLink onClick={onClick}>Open grid</DrillLink>);
    const btn = screen.getByRole("button", { name: /open grid/i });
    expect(btn).toHaveClass("drill-link");
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it("renders an optional icon", () => {
    const { container } = render(
      <DrillLink href="/x" icon={<svg data-testid="ic" />}>
        Go
      </DrillLink>,
    );
    expect(container.querySelector('[data-testid="ic"]')).toBeTruthy();
  });
});
