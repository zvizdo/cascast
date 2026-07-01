import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("globals.css — Cascast design tokens", () => {
  it("defines Glacier accent + background", () => {
    expect(css).toMatch(/--accent:\s*#2c6d8f/);
    expect(css).toMatch(/--bg:\s*#e9eef3/);
  });
  it("defines all five NAC danger colors", () => {
    for (const [k, v] of [["--d1", "#4e9c52"], ["--d2", "#ecc531"], ["--d3", "#ef8a26"], ["--d4", "#df3a2f"], ["--d5", "#1d1d1d"]]) {
      expect(css).toContain(`${k}: ${v}`);
    }
  });
  it("defines the three condition tones", () => {
    expect(css).toMatch(/--good:\s*#3f8f6b/);
    expect(css).toMatch(/--caution:\s*#c98a2e/);
    expect(css).toMatch(/--alert:\s*#c5503f/);
  });
  it("provides a Slate theme override of accent + bg", () => {
    expect(css).toMatch(/\[data-theme="slate"\][\s\S]*--accent:\s*#5cabd8/);
    expect(css).toMatch(/\[data-theme="slate"\][\s\S]*--bg:\s*#0d141d/);
  });
  it("ports the responsive breakpoints", () => {
    expect(css).toContain("@media (max-width: 900px)");
    expect(css).toContain("@media (max-width: 680px)");
  });
  it("ports the radius tokens", () => {
    expect(css).toMatch(/--radius:\s*14px/);
    expect(css).toMatch(/--radius-sm:\s*9px/);
  });
  it("hz-chip has a touch-friendly mobile rule", () => {
    // a coarse-pointer rule that bumps the hazard chip to a >=44px touch target
    expect(css).toMatch(/@media\s*\(pointer:\s*coarse\)[^}]*\.hz-chip[^}]*min-height:\s*44px/s);
  });
  it("band cards stop overlapping the chart on mobile", () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*680px\)[\s\S]*\.band-card\s*\{[^}]*position:\s*static/);
  });
});
