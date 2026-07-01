import { describe, it, expect } from "vitest";
import { windSeverity, precipSeverity, tileSeverity, sevToken } from "@/lib/severity";

describe("severity", () => {
  it("windSeverity buckets sustained mph per the summit scale", () => {
    expect(windSeverity(5)).toBe(1);
    expect(windSeverity(12)).toBe(2);
    expect(windSeverity(25)).toBe(3);
    expect(windSeverity(40)).toBe(4);
    expect(windSeverity(80)).toBe(4);
  });
  it("precipSeverity: dry < chance < active < heavy", () => {
    expect(precipSeverity({ precip: 0, snow: 0, pop: 5 })).toBe(1);
    expect(precipSeverity({ precip: 0, snow: 0, pop: 50 })).toBe(2);
    expect(precipSeverity({ precip: 0.1, snow: 0, pop: 80 })).toBe(3);
    expect(precipSeverity({ precip: 0, snow: 8, pop: 100 })).toBe(4);
  });
  it("tileSeverity is the worst of wind and precip", () => {
    expect(tileSeverity({ wind: 5, precip: 0, snow: 0, pop: 0 })).toBe(1);
    expect(tileSeverity({ wind: 30, precip: 0, snow: 0, pop: 0 })).toBe(3); // wind dominates
    expect(tileSeverity({ wind: 5, precip: 0.6, snow: 0, pop: 100 })).toBe(4); // precip dominates
  });
  it("sevToken maps to the avalanche ramp (never --d5)", () => {
    expect(sevToken(1)).toBe("--d1");
    expect(sevToken(4)).toBe("--d4");
  });
});
