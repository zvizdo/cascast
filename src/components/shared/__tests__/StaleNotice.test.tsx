import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { StaleNotice } from "@/components/shared/StaleNotice";

describe("StaleNotice", () => {
  it("renders the date and pluralized day count", () => {
    render(<StaleNotice dateLabel="Jul 13, 2026" ageDays={20} />);
    expect(screen.getByRole("status")).toHaveTextContent("Imagery from Jul 13, 2026 · 20 days old");
  });

  it("uses the singular for one day and a custom noun", () => {
    render(<StaleNotice dateLabel="Aug 1, 2026" ageDays={1} noun="Snapshot" />);
    expect(screen.getByRole("status")).toHaveTextContent("Snapshot from Aug 1, 2026 · 1 day old");
  });
});
