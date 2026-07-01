import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { PendingState } from "@/components/shared/PendingState";

describe("PendingState", () => {
  it("renders the kicker and default body", () => {
    render(<PendingState kicker="The call for your window" />);
    expect(screen.getByText("The call for your window")).toBeInTheDocument();
    expect(screen.getByText(/gathering the first forecast/i)).toBeInTheDocument();
  });

  it("accepts custom body copy", () => {
    render(<PendingState kicker="K" body="Custom pending." />);
    expect(screen.getByText("Custom pending.")).toBeInTheDocument();
  });
});
