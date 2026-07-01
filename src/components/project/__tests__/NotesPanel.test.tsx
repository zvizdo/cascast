import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { NotesPanel } from "@/components/project/NotesPanel";

describe("NotesPanel", () => {
  it("renders the plan notes and zone", () => {
    render(<NotesPanel notes="Two-day skills weekend." zoneName="West Slopes South" />);
    expect(screen.getByText(/Two-day skills weekend/)).toBeInTheDocument();
    expect(screen.getByText("West Slopes South")).toBeInTheDocument();
    expect(screen.getByText("Zone")).toBeInTheDocument();
  });

  it("renders without a zone", () => {
    render(<NotesPanel notes="Solo lap." />);
    expect(screen.getByText(/Solo lap/)).toBeInTheDocument();
  });

  it("shows a placeholder when there are no notes", () => {
    render(<NotesPanel notes="" zoneName="Z" />);
    expect(screen.getByText(/no notes/i)).toBeInTheDocument();
  });
});
