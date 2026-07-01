import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { SectionError } from "@/components/shared/SectionError";

describe("SectionError", () => {
  it("renders the message in an alert region", () => {
    render(<SectionError message="Couldn't load the daily outlook." onRetry={() => {}} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load the daily outlook.");
  });

  it("calls onRetry when Retry is clicked", () => {
    const onRetry = vi.fn();
    render(<SectionError message="Failed." onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
