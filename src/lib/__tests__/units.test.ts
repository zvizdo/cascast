import { describe, it, expect, beforeEach } from "vitest";
import {
  DEFAULT_UNITS, useUnits, convTemp, convWind, convDist, fmtTemp, fmtWind, fmtDist,
} from "@/lib/units";

describe("convTemp", () => {
  it("identity for F", () => expect(convTemp(50, "F")).toBe(50));
  it("freezing/boiling", () => { expect(convTemp(32, "C")).toBe(0); expect(convTemp(212, "C")).toBe(100); });
  it("rounds negatives", () => expect(convTemp(23, "C")).toBe(-5));
});
describe("convWind", () => {
  it("identity for mph", () => expect(convWind(10, "mph")).toBe(10));
  it("mph → km/h rounded", () => { expect(convWind(10, "kmh")).toBe(16); expect(convWind(60, "kmh")).toBe(97); });
});
describe("convDist", () => {
  it("identity for ft", () => expect(convDist(5420, "ft")).toBe(5420));
  // NOTE: plan asserts convDist(5815,"m")===1773, but 5815*0.3048=1772.412→1772.
  // The 0.3048 factor is the binding rule (matches 1000ft→305); 1773 is a plan arithmetic slip.
  it("ft → m rounded", () => { expect(convDist(1000, "m")).toBe(305); expect(convDist(5815, "m")).toBe(1772); });
});
describe("formatters", () => {
  it("fmtTemp adds symbol + converts", () => { expect(fmtTemp(23, "F")).toBe("23°F"); expect(fmtTemp(23, "C")).toBe("-5°C"); });
  it("fmtWind adds unit", () => { expect(fmtWind(45, "mph")).toBe("45 mph"); expect(fmtWind(45, "kmh")).toBe("72 km/h"); });
  it("fmtDist groups thousands + converts", () => {
    expect(fmtDist(5815, "ft")).toBe("5,815 ft");
    expect(fmtDist(5815, "m")).toBe("1,772 m");
  });
  it("fmtDist k-form", () => { expect(fmtDist(5420, "ft", { k: true })).toBe("5.4k ft"); });
  it("fmtDist k-form in meters", () => { expect(fmtDist(5815, "m", { k: true })).toBe("1.8k m"); });
  it("withUnit:false drops the symbol", () => expect(fmtTemp(23, "F", { withUnit: false })).toBe("23"));
  it("null → em dash", () => { expect(fmtTemp(null, "F")).toBe("—"); expect(fmtWind(undefined, "mph")).toBe("—"); expect(fmtDist(null, "ft")).toBe("—"); });
});
describe("useUnits store", () => {
  beforeEach(() => { localStorage.clear(); useUnits.setState(DEFAULT_UNITS); });
  it("defaults to imperial", () => {
    const s = useUnits.getState();
    expect({ temp: s.temp, wind: s.wind, dist: s.dist }).toEqual({ temp: "F", wind: "mph", dist: "ft" });
  });
  it("setTemp updates and persists", () => {
    useUnits.getState().setTemp("C");
    expect(useUnits.getState().temp).toBe("C");
    expect(localStorage.getItem("cascast.units")).toContain("\"temp\":\"C\"");
  });
  it("setWind updates", () => {
    useUnits.getState().setWind("kmh");
    expect(useUnits.getState().wind).toBe("kmh");
  });
  it("setDist updates", () => {
    useUnits.getState().setDist("m");
    expect(useUnits.getState().dist).toBe("m");
  });
  it("set(partial) updates multiple axes", () => {
    useUnits.getState().set({ temp: "C", wind: "kmh", dist: "m" });
    const s = useUnits.getState();
    expect({ temp: s.temp, wind: s.wind, dist: s.dist }).toEqual({ temp: "C", wind: "kmh", dist: "m" });
  });
  it("each axis is independent", () => {
    useUnits.getState().setWind("kmh");
    const s = useUnits.getState();
    expect(s.wind).toBe("kmh"); expect(s.temp).toBe("F"); expect(s.dist).toBe("ft");
  });
});
