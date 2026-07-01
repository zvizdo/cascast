import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Footer } from "@/components/shared/Footer";

afterEach(cleanup);

describe("Footer", () => {
  it("renders the required data-source attributions, incl. 3D terrain", () => {
    render(<Footer />);
    expect(screen.getByText(/Open-Meteo\.com/)).toBeInTheDocument();
    expect(screen.getByText(/NWAC/)).toBeInTheDocument();
    expect(screen.getByText(/NRCS SNOTEL/)).toBeInTheDocument();
    expect(screen.getByText(/EOX IT Services/)).toBeInTheDocument();
    expect(screen.getByText(/USGS 3DEP/)).toBeInTheDocument();
    expect(screen.getByText(/OpenStreetMap contributors/)).toBeInTheDocument();
  });

  it("links to the Models & sources explainer page", () => {
    render(<Footer />);
    const link = screen.getByRole("link", { name: /models & sources/i });
    expect(link).toHaveAttribute("href", "/sources");
  });

  it("Open-Meteo is a link to open-meteo.com", () => {
    render(<Footer />);
    const link = screen.getByRole("link", { name: /Open-Meteo\.com/ });
    expect(link).toHaveAttribute("href", "https://open-meteo.com");
  });

  it("uses NEXT_PUBLIC_EOX_ATTRIBUTION when set", () => {
    const prev = process.env.NEXT_PUBLIC_EOX_ATTRIBUTION;
    process.env.NEXT_PUBLIC_EOX_ATTRIBUTION = "Custom EOX IT Services attribution string";
    render(<Footer />);
    expect(screen.getByText("Custom EOX IT Services attribution string")).toBeInTheDocument();
    process.env.NEXT_PUBLIC_EOX_ATTRIBUTION = prev;
  });

  it("links to the About page", () => {
    render(<Footer />);
    expect(screen.getByRole("link", { name: /^about$/i })).toHaveAttribute("href", "/about");
  });
});
