import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import SourcesPage from "@/app/sources/page";

describe("Sources (Models & sources explainer)", () => {
  it("renders the two section headings", () => {
    render(<SourcesPage />);
    expect(screen.getByRole("heading", { name: /weather models/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /data sources/i })).toBeInTheDocument();
  });

  it("describes all three weather models and the freezing-level rule", () => {
    render(<SourcesPage />);
    expect(screen.getAllByText(/HRRR/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/GFS/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ECMWF/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/freezing level/i).length).toBeGreaterThan(0);
  });

  it("lists the data sources including OpenStreetMap", () => {
    render(<SourcesPage />);
    expect(screen.getAllByText(/Open-Meteo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OpenStreetMap/).length).toBeGreaterThan(0);
  });
});
