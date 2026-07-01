import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { AreaSpark } from "@/components/charts/AreaSpark";
import { LineChart } from "@/components/charts/LineChart";
import { BarChart } from "@/components/charts/BarChart";
import { sx, linePath } from "@/components/charts/chart-utils";

describe("chart-utils", () => {
  it("sx maps domain to range linearly", () => {
    const f = sx(0, 10, 0, 100);
    expect(f(5)).toBe(50);
    expect(f(0)).toBe(0);
    expect(f(10)).toBe(100);
  });

  it("sx guards a zero-width domain", () => {
    const f = sx(5, 5, 0, 100);
    expect(Number.isFinite(f(5))).toBe(true);
  });

  it("linePath starts with a moveTo", () => {
    expect(linePath([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toMatch(/^M 0 0/);
  });

  it("linePath empty → empty string", () => {
    expect(linePath([])).toBe("");
  });

  it("linePath emits a cubic for each segment", () => {
    const d = linePath([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 0 }]);
    expect((d.match(/C/g) || []).length).toBe(2);
  });
});

describe("AreaSpark", () => {
  it("draws area + line + end dot", () => {
    const { container } = render(<AreaSpark data={[{ v: 1 }, { v: 3 }, { v: 2 }]} />);
    expect(container.querySelectorAll("path").length).toBe(2);
    expect(container.querySelector("circle")).toBeTruthy();
  });

  it("renders a responsive svg with a viewBox", () => {
    const { container } = render(<AreaSpark data={[{ v: 1 }, { v: 2 }]} w={100} h={40} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "100%");
    expect(svg).toHaveAttribute("viewBox", "0 0 100 40");
    expect(svg).toHaveAttribute("preserveAspectRatio", "none");
  });
});

describe("LineChart", () => {
  it("draws gridlines, a band, and one path per series", () => {
    const { container } = render(
      <LineChart
        band={{ x0: 1, x1: 2 }}
        series={[
          {
            key: "a",
            color: "var(--accent)",
            points: [
              { x: 0, y: 10 },
              { x: 1, y: 20 },
              { x: 2, y: 15 },
            ],
          },
        ]}
      />,
    );
    expect(container.querySelector("rect")).toBeTruthy(); // band
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(1);
    expect(container.querySelectorAll("text").length).toBeGreaterThan(0); // tick labels
  });

  it("renders x labels and respects yMin/yMax", () => {
    const { container } = render(
      <LineChart
        yMin={0}
        yMax={40}
        xLabels={[{ i: 0, t: "Sat" }, { i: 1, t: "Sun" }]}
        series={[
          { key: "a", color: "var(--accent)", points: [{ x: 0, y: 10 }, { x: 1, y: 30 }], dashed: true },
          { key: "b", color: "var(--good)", points: [{ x: 0, y: 5 }, { x: 1, y: 20 }], faded: true },
        ]}
      />,
    );
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("Sat");
    expect(texts).toContain("Sun");
    // dashed series carries a dasharray
    expect(container.querySelector('path[stroke-dasharray="4 4"]')).toBeTruthy();
  });

  it("shares one x-domain so a short series ends partway across (not stretched)", () => {
    const { container } = render(
      <LineChart
        series={[
          // long series spans x 0..3
          { key: "long", color: "var(--good)", points: [
            { x: 0, y: 10 }, { x: 1, y: 20 }, { x: 2, y: 15 }, { x: 3, y: 25 },
          ] },
          // short series only spans x 0..1
          { key: "short", color: "var(--accent)", points: [{ x: 0, y: 12 }, { x: 1, y: 18 }] },
        ]}
      />,
    );
    // The short series' end dot sits at x=1 of the shared domain (maxX=3), i.e. ~1/3 across,
    // strictly left of the long series' end dot at x=3.
    const dots = Array.from(container.querySelectorAll("circle"));
    const cx = dots.map((d) => parseFloat(d.getAttribute("cx")!)).sort((a, b) => a - b);
    expect(cx.length).toBe(2);
    expect(cx[0]).toBeLessThan(cx[1]); // short dot is left of long dot
    // long dot lands at the right edge of the plot area
    expect(cx[1]).toBeCloseTo(640 - 14, 1);
  });

  it("breaks the line at null points instead of interpolating across the gap", () => {
    const { container } = render(
      <LineChart
        series={[
          { key: "g", color: "var(--accent)", points: [
            { x: 0, y: 10 }, { x: 1, y: 20 }, null, { x: 3, y: 15 }, { x: 4, y: 18 },
          ] },
        ]}
      />,
    );
    // two contiguous runs → two separate <path> stroke segments for the one series
    const strokePaths = Array.from(container.querySelectorAll("path")).filter(
      (p) => p.getAttribute("stroke") === "var(--accent)",
    );
    expect(strokePaths.length).toBe(2);
  });

  it("renders the yUnit on the y-axis when provided", () => {
    const { container } = render(
      <LineChart yUnit="°F" series={[{ key: "a", color: "var(--accent)", points: [{ x: 0, y: 1 }, { x: 1, y: 2 }] }]} />,
    );
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("°F");
  });

  it("does not emit NaN paths for an empty / all-null series", () => {
    const { container } = render(
      <LineChart
        series={[
          { key: "empty", color: "var(--accent)", points: [] },
          { key: "allnull", color: "var(--good)", points: [null, null] },
        ]}
      />,
    );
    const paths = Array.from(container.querySelectorAll("path")).map((p) => p.getAttribute("d") || "");
    expect(paths.some((d) => d.includes("NaN"))).toBe(false);
    // gridlines should still have finite y coords
    const lines = Array.from(container.querySelectorAll("line"));
    for (const l of lines) {
      expect(Number.isFinite(parseFloat(l.getAttribute("y1")!))).toBe(true);
    }
  });
});

describe("BarChart", () => {
  it("renders a bar per positive datum (plus baseline)", () => {
    const { container } = render(<BarChart data={[{ v: 0 }, { v: 0.4 }, { v: 0.2 }]} />);
    // 2 bars (v>0) + baseline rect? baseline is a <line>, so only bars are <rect>
    expect(container.querySelectorAll("rect").length).toBe(2);
    expect(container.querySelector("line")).toBeTruthy(); // baseline
  });

  it("renders a band, unit label, and x labels", () => {
    const { container } = render(
      <BarChart
        data={[{ v: 0.1 }, { v: 0.5 }]}
        unit="in"
        band={{ x0: 0, x1: 1 }}
        xLabels={[{ i: 0, t: "Sat" }]}
      />,
    );
    expect(container.querySelectorAll("rect").length).toBe(3); // 2 bars + band
    const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
    expect(texts).toContain("in");
    expect(texts).toContain("Sat");
  });
});
