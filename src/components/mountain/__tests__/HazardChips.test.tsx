// src/components/mountain/__tests__/HazardChips.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HazardChips, avalancheChip, airQualityChip, stormChip } from "@/components/mountain/HazardChips";
import type { HazardsSummary } from "@/lib/hazards/types";

describe("HazardChips", () => {
  it("renders nothing when empty", () => {
    const { container } = render(<HazardChips chips={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it("renders a chip and fires onClick", () => {
    const onClick = vi.fn();
    render(<HazardChips chips={[{ key: "avy", label: "Avy Mod", tokenVar: "--d2", onClick }]} />);
    fireEvent.click(screen.getByText("Avy Mod"));
    expect(onClick).toHaveBeenCalled();
  });
  it("carries the status color on a dot, not as a loud chip fill", () => {
    const { container } = render(<HazardChips chips={[{ key: "aqi", label: "AQI 33", tokenVar: "--d1" }]} />);
    const dot = container.querySelector(".hz-dot") as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.background).toBe("var(--d1)");
    // the chip itself stays a quiet surface pill (no token-colored background)
    const chip = container.querySelector(".hz-chip") as HTMLElement;
    expect(chip.style.background).toBe("");
  });
  it("avalancheChip picks the worst band and a danger token", () => {
    const chip = avalancheChip({ season: "winter", danger: { current: { upper: 3, middle: 2, lower: 1 }, tomorrow: { upper: 1, middle: 1, lower: 1 } } } as never);
    expect(chip?.tokenVar).toBe("--d3");
    expect(chip?.label).toMatch(/Avy/);
  });
  it("avalancheChip returns null in summer", () => {
    expect(avalancheChip({ season: "summer" })).toBeNull();
  });
});

const provenance = { source: "AirNow" };

describe("airQualityChip", () => {
  it("returns chip with --d3 token for Unhealthy for Sensitive Groups", () => {
    const summary: HazardsSummary = { aqi: { value: 112, category: "Unhealthy for Sensitive Groups" }, storm: null, provenance };
    const chip = airQualityChip(summary);
    expect(chip).not.toBeNull();
    expect(chip?.label).toBe("AQI 112");
    expect(chip?.tokenVar).toBe("--d3");
  });
  it("returns null when aqi is null", () => {
    const summary: HazardsSummary = { aqi: null, storm: null, provenance };
    expect(airQualityChip(summary)).toBeNull();
  });
  it("returns null when summary is undefined", () => {
    expect(airQualityChip(undefined)).toBeNull();
  });
  it("returns --d1 for Good category", () => {
    const summary: HazardsSummary = { aqi: { value: 40, category: "Good" }, storm: null, provenance };
    expect(airQualityChip(summary)?.tokenVar).toBe("--d1");
  });
  it("returns --d5 for Hazardous category", () => {
    const summary: HazardsSummary = { aqi: { value: 350, category: "Hazardous" }, storm: null, provenance };
    expect(airQualityChip(summary)?.tokenVar).toBe("--d5");
  });
  it("returns --d4 for Unhealthy category (not sensitive-groups)", () => {
    const summary: HazardsSummary = { aqi: { value: 160, category: "Unhealthy" }, storm: null, provenance: { source: "x" } };
    expect(airQualityChip(summary)?.tokenVar).toBe("--d4");
  });
  it("returns --d4 for Very Unhealthy category (not --d3)", () => {
    const summary: HazardsSummary = { aqi: { value: 210, category: "Very Unhealthy" }, storm: null, provenance: { source: "x" } };
    expect(airQualityChip(summary)?.tokenVar).toBe("--d4");
  });
});

describe("stormChip", () => {
  it("returns chip with --d4 token and onClick when storm is active", () => {
    const fn = vi.fn();
    const summary: HazardsSummary = { aqi: null, storm: { active: true, label: "Winter Storm Warning" }, provenance };
    const chip = stormChip(summary, fn);
    expect(chip).not.toBeNull();
    expect(chip?.label).toBe("Storm");
    expect(chip?.tokenVar).toBe("--d4");
    expect(chip?.onClick).toBe(fn);
  });
  it("returns null when storm is not active", () => {
    const summary: HazardsSummary = { aqi: null, storm: { active: false, label: "" }, provenance };
    expect(stormChip(summary)).toBeNull();
  });
  it("returns null when storm is null", () => {
    const summary: HazardsSummary = { aqi: null, storm: null, provenance };
    expect(stormChip(summary)).toBeNull();
  });
});
