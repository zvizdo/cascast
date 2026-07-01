// src/components/shared/__tests__/Provenance.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { expectNoA11yViolations } from "./test-utils";
import { Provenance } from "@/components/shared/Provenance";

describe("Provenance", () => {
  it("renders a compact tag with the source label", () => {
    render(<Provenance data={{ label: "GFS", reason: "only model with freezing at range" }} />);
    expect(screen.getByText("GFS")).toBeInTheDocument();
  });

  it("shows the reason inline when loud", () => {
    render(<Provenance loud data={{ label: "GFS", reason: "HRRR ends at 48h" }} />);
    expect(screen.getByText(/HRRR ends at 48h/)).toBeInTheDocument();
  });

  it("exposes the reason to assistive tech via the button title/aria when quiet", () => {
    render(<Provenance data={{ label: "AirNow", reason: "Enumclaw monitor, 22 mi" }} />);
    const btn = screen.getByRole("button", { name: /AirNow/ });
    expect(btn).toHaveAttribute("aria-label", expect.stringContaining("Enumclaw"));
  });

  it("toggles the popover on click", () => {
    render(<Provenance data={{ label: "GFS", reason: "only model with FL" }} />);
    const btn = screen.getByRole("button");
    expect(screen.queryByRole("note")).toBeNull();
    fireEvent.click(btn);
    expect(screen.getByRole("note")).toBeInTheDocument();
    expect(btn).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(btn);
    expect(screen.queryByRole("note")).toBeNull();
  });

  it("has no a11y violations", async () => {
    const { container } = render(<Provenance data={{ label: "OSM", reason: "OpenStreetMap" }} />);
    await expectNoA11yViolations(container);
  });
});
