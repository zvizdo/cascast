import { describe, it, expect } from "vitest";
import { Timestamp } from "firebase-admin/firestore";
import { serializeTimestamps } from "@/lib/serialize";

describe("serializeTimestamps", () => {
  it("converts a real firebase-admin Timestamp to an ISO string", () => {
    const ts = Timestamp.fromMillis(1718000000000);
    const out = serializeTimestamps({ updatedAt: ts });
    expect(out.updatedAt).toBe("2024-06-10T06:13:20.000Z");
    expect(typeof out.updatedAt).toBe("string");
  });

  it("converts a plain {_seconds,_nanoseconds} shape to ISO", () => {
    const out = serializeTimestamps({ fetchedAt: { _seconds: 1718000000, _nanoseconds: 0 } });
    expect(out.fetchedAt).toBe("2024-06-10T06:13:20.000Z");
  });

  it("converts a plain {seconds,nanoseconds} shape to ISO", () => {
    const out = serializeTimestamps({ createdAt: { seconds: 1718000000, nanoseconds: 0 } });
    expect(out.createdAt).toBe("2024-06-10T06:13:20.000Z");
  });

  it("converts an object exposing a toDate() function to ISO", () => {
    const d = new Date("2024-06-10T06:13:20.000Z");
    const out = serializeTimestamps({ updatedAt: { toDate: () => d } });
    expect(out.updatedAt).toBe("2024-06-10T06:13:20.000Z");
  });

  it("walks nested objects", () => {
    const out = serializeTimestamps({
      currentSummary: { updatedAt: { _seconds: 1718000000, _nanoseconds: 0 }, tone: "good" },
    });
    expect(out.currentSummary.updatedAt).toBe("2024-06-10T06:13:20.000Z");
    expect(out.currentSummary.tone).toBe("good");
  });

  it("walks arrays of objects", () => {
    const out = serializeTimestamps([
      { fetchedAt: { _seconds: 1718000000, _nanoseconds: 0 } },
      { fetchedAt: { _seconds: 1718000001, _nanoseconds: 0 } },
    ]);
    expect(out[0].fetchedAt).toBe("2024-06-10T06:13:20.000Z");
    expect(out[1].fetchedAt).toBe("2024-06-10T06:13:21.000Z");
  });

  it("leaves nulls, primitives, and non-timestamp objects untouched", () => {
    const input = {
      name: "Rainier",
      count: 7,
      flag: true,
      missing: null,
      nested: { notes: "", deep: { x: 1 } },
      tags: ["a", "b"],
    };
    expect(serializeTimestamps(input)).toEqual(input);
  });

  it("leaves real ISO strings untouched", () => {
    const out = serializeTimestamps({ createdAt: "2026-06-14T00:00:00.000Z" });
    expect(out.createdAt).toBe("2026-06-14T00:00:00.000Z");
  });

  it("handles a top-level null/primitive", () => {
    expect(serializeTimestamps(null)).toBe(null);
    expect(serializeTimestamps(42)).toBe(42);
  });
});
