import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ModelInfo } from "@/components/modellab/ModelInfo";

describe("ModelInfo", () => {
  it("renders all three models with source, resolution, coverage, horizon, and best-for", () => {
    render(<ModelInfo defaultOpen />);

    // model names
    expect(screen.getByText(/^HRRR$/)).toBeInTheDocument();
    expect(screen.getByText(/^GFS$/)).toBeInTheDocument();
    expect(screen.getByText(/^ECMWF$/)).toBeInTheDocument();

    // resolution + horizon details (the test the plan requires)
    expect(screen.getByText(/3 km/i)).toBeInTheDocument();
    expect(screen.getByText(/~48 h/i)).toBeInTheDocument();
    expect(screen.getByText(/13–25 km/i)).toBeInTheDocument();
    expect(screen.getByText(/16 days/i)).toBeInTheDocument();
    expect(screen.getByText(/9–25 km/i)).toBeInTheDocument();
    expect(screen.getByText(/15 days/i)).toBeInTheDocument();

    // source + coverage + best-for surface somewhere per model
    expect(screen.getByText(/NOAA HRRR/i)).toBeInTheDocument();
    expect(screen.getByText(/CONUS only/i)).toBeInTheDocument();
    expect(screen.getByText(/near-term/i)).toBeInTheDocument();
    expect(screen.getByText(/seamless/i)).toBeInTheDocument();
    expect(screen.getByText(/ECMWF IFS/i)).toBeInTheDocument();
    expect(screen.getAllByText(/medium-range/i).length).toBeGreaterThanOrEqual(1);
  });

  it("is collapsed by default and toggles open", () => {
    render(<ModelInfo />);
    const toggle = screen.getByRole("button", { name: /about the models/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/NOAA HRRR/i)).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/NOAA HRRR/i)).toBeInTheDocument();
  });
});
