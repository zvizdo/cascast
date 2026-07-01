import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DayStrip } from "@/components/project/DayStrip";
import type { HourRow } from "@/lib/forecast-select";

const rows: HourRow[] = [0, 6, 12, 18].map((h) => ({
  t: `2026-02-14T${String(h).padStart(2, "0")}:00`,
  hour: h,
  date: "2026-02-14",
  fl: 5000 + h * 50,
  tempF: 20, tempFRaw: 20,
  windMph: 20, windMphRaw: 20,
  gustMph: 30,
  precipIn: 0,
  pop: 10,
  snowIn: 0,
  code: 1,
  bandTempF: { base: 30, mid: 20, summit: 10 },
}));

describe("DayStrip", () => {
  const props = {
    rows,
    dist: "ft" as const,
    valleyFt: 2200,
    topFt: 16000,
    summitFt: 14410,
    bandsFt: { base: 5400, mid: 10000, summit: 14410 },
    bandNames: { base: "Base", mid: "Mid", summit: "Summit" },
    summitOffsetText: "x",
  };
  it("exposes the svg as a labelled image for screen readers", () => {
    const { container } = render(<DayStrip {...props} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("role", "img");
    expect(svg.getAttribute("aria-label")).toMatch(/freezing level/i);
  });
  it("renders an svg with the freezing-level path and hour ticks", () => {
    const { container } = render(<DayStrip {...props} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    // 2 shading areas + at least the FL line
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(3);
    // 4 hour ticks (12a 6a 12p 6p) + 3 Y-axis ticks + 3 band labels
    expect(container.querySelectorAll("text").length).toBe(10);
  });
  it("labels the elevation axis in the active distance unit and names the bands", () => {
    const { container } = render(<DayStrip {...props} />);
    const labels = [...container.querySelectorAll(".hero-axis-label")].map((n) => n.textContent);
    expect(labels.some((t) => t?.includes("ft"))).toBe(true); // units-aware Y-axis
    expect(labels).toContain("Summit"); // named band reference line
    expect(labels).toContain("Base");
  });
  it("does not throw on a single-row series", () => {
    expect(() => render(<DayStrip {...props} rows={[rows[2]]} />)).not.toThrow();
  });
  it("renders nothing usable but no crash with empty rows", () => {
    const { container } = render(<DayStrip {...props} rows={[]} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });
});
