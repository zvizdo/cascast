import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { OffSeasonState } from "@/components/shared/OffSeasonState";

describe("OffSeasonState", () => {
  it("shows the default summer-operations copy", () => {
    render(<OffSeasonState />);
    expect(screen.getByRole("status")).toHaveTextContent(/summer operations/i);
    expect(screen.getByRole("status")).toHaveTextContent(/NWAC resumes/i);
  });

  it("accepts a custom message", () => {
    render(<OffSeasonState message="Closed for the season." />);
    expect(screen.getByRole("status")).toHaveTextContent("Closed for the season.");
  });
});
