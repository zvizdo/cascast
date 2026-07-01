import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import { readPins, addPin, removePin, updatePin, getPin, usePins } from "@/lib/pins";

beforeEach(() => localStorage.clear());

describe("pins store", () => {
  it("adds and reads a pin", () => {
    addPin({ mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-19", notes: "" });
    const pins = readPins();
    expect(pins).toHaveLength(1);
    expect(pins[0].mountainId).toBe("mt-rainier");
    expect(pins[0].createdAt).toBeTruthy();
  });
  it("upserts by mountainId (no duplicates)", () => {
    addPin({ mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-19", notes: "" });
    addPin({ mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-20", notes: "x" });
    expect(readPins()).toHaveLength(1);
    expect(getPin("mt-rainier")?.targetDate).toBe("2026-06-20");
  });
  it("updates notes and removes", () => {
    addPin({ mountainId: "mt-baker", name: "Mount Baker", targetDate: "2026-07-01", notes: "" });
    updatePin("mt-baker", { notes: "bring crampons" });
    expect(getPin("mt-baker")?.notes).toBe("bring crampons");
    removePin("mt-baker");
    expect(readPins()).toHaveLength(0);
  });
  it("readPins tolerates corrupt storage", () => {
    localStorage.setItem("cascast.pins", "{not json");
    expect(readPins()).toEqual([]);
  });
});

describe("usePins hook", () => {
  it("reflects add and remove updates", () => {
    const { result } = renderHook(() => usePins());
    expect(result.current).toEqual([]);
    act(() => addPin({ mountainId: "mt-baker", name: "Mount Baker", targetDate: "2026-07-01", notes: "" }));
    expect(result.current).toHaveLength(1);
    expect(result.current[0].mountainId).toBe("mt-baker");
    act(() => removePin("mt-baker"));
    expect(result.current).toEqual([]);
  });
  it("snapshot tolerates corrupt storage", () => {
    localStorage.setItem("cascast.pins", "{not json");
    const { result } = renderHook(() => usePins());
    expect(result.current).toEqual([]);
  });
});
