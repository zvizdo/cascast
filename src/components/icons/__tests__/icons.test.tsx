import { render } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Icons, type IconName } from "@/components/icons/icons";
import { WeatherIcon } from "@/components/icons/WeatherIcon";
import { WindArrow } from "@/components/icons/WindArrow";

describe("Icons", () => {
  it("renders an svg with currentColor stroke + default size", () => {
    const { container } = render(<Icons.mountain />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("width", "24");
    expect(svg).toHaveAttribute("fill", "none");
    expect(svg).toHaveAttribute("stroke-width", "1.6");
  });

  it("respects size + sw props", () => {
    const { container } = render(<Icons.wind size={11} sw={2} />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("width", "11");
    expect(svg).toHaveAttribute("height", "11");
    expect(svg).toHaveAttribute("stroke-width", "2");
  });

  it("forwards arbitrary svg props", () => {
    const { container } = render(<Icons.pin aria-label="pinned" />);
    expect(container.querySelector('svg[aria-label="pinned"]')).toBeTruthy();
  });

  const names = Object.keys(Icons) as IconName[];
  it.each(names)("renders glyph %s", (name) => {
    const Glyph = Icons[name];
    const { container } = render(<Glyph />);
    expect(container.querySelector("svg")).toBeTruthy();
  });
});

describe("WeatherIcon", () => {
  it.each([
    [80, true],
    [71, true],
    [61, true],
    [51, true],
    [45, true],
    [48, true],
    [3, true],
    [2, true],
    [1, true],
    [0, true],
  ])("maps WMO %i to a weather glyph", (code) => {
    const { container } = render(<WeatherIcon code={code} />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("passes props through to the glyph", () => {
    const { container } = render(<WeatherIcon code={0} size={9} />);
    expect(container.querySelector("svg")).toHaveAttribute("width", "9");
  });

  it("tints snow code (73) with var(--wx-snow)", () => {
    const { container } = render(<WeatherIcon code={73} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("style")).toContain("var(--wx-snow)");
  });

  it("tints clear code (0) with var(--wx-sun)", () => {
    const { container } = render(<WeatherIcon code={0} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("style")).toContain("var(--wx-sun)");
  });
});

describe("WindArrow", () => {
  it("rotates the wind arrow by deg", () => {
    const { container } = render(<WindArrow deg={90} />);
    expect(container.querySelector("svg")!.getAttribute("style")).toContain("rotate(90deg)");
  });

  it("defaults deg to 225 and renders a filled path", () => {
    const { container } = render(<WindArrow />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("style")).toContain("rotate(225deg)");
    expect(container.querySelector('path[fill="currentColor"]')).toBeTruthy();
  });
});
