import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { PanelError } from "@/components/shared/PanelError";

describe("PanelError", () => {
  it("renders the Couldn't load {label} message as an alert", () => {
    render(<PanelError label="the avalanche forecast" onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/couldn.t load the avalanche forecast/i);
  });

  it("calls onRetry when the Retry button is clicked", () => {
    const onRetry = vi.fn();
    render(<PanelError label="the snowpack data" onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry loading the snowpack data/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
