// lib/__tests__/format.test.ts
import { describe, it, expect } from "vitest";
import { formatDateInTz, formatTimeInTz, formatDayLabel, formatNumber, formatTemp, fmtRange, formatTimeAgo } from "@/lib/format";

const TZ = "America/Los_Angeles";

describe("lib/format", () => {
  it("formats an ISO instant as a date in the mountain timezone", () => {
    // 2026-08-02T06:00:00Z is 2026-08-01 23:00 PDT
    expect(formatDateInTz("2026-08-02T06:00:00Z", TZ)).toBe("2026-08-01");
  });

  it("formats a time in the mountain timezone", () => {
    expect(formatTimeInTz("2026-08-02T19:00:00Z", TZ)).toBe("12:00 PM"); // 19:00Z = 12:00 PDT
  });

  it("formats a weekday day label in the mountain timezone", () => {
    expect(formatDayLabel("2026-08-02T19:00:00Z", TZ)).toMatch(/Sun/);
  });

  it("rounds numbers to the given precision", () => {
    expect(formatNumber(12.345, 1)).toBe("12.3");
    expect(formatNumber(12, 0)).toBe("12");
  });

  it("formats a temperature with a degree suffix and handles null", () => {
    expect(formatTemp(31.6)).toBe("32°");
    expect(formatTemp(null)).toBe("—");
  });

  it("formats a target-window range across two days", () => {
    expect(fmtRange("2026-06-15", "2026-06-16")).toBe("Jun 15 – Jun 16");
  });

  it("formats a single-day target window with a weekday", () => {
    expect(fmtRange("2026-06-15", "2026-06-15")).toMatch(/Jun 15/);
  });

  describe("formatTimeAgo", () => {
    const now = new Date("2026-06-14T12:00:00Z").getTime();
    it("returns 'just now' under a minute", () => {
      expect(formatTimeAgo("2026-06-14T11:59:30Z", now)).toBe("just now");
    });
    it("clamps a future timestamp to 'just now'", () => {
      expect(formatTimeAgo("2026-06-14T13:00:00Z", now)).toBe("just now");
    });
    it("formats minutes", () => {
      expect(formatTimeAgo("2026-06-14T11:46:00Z", now)).toBe("14 min ago");
    });
    it("formats hours", () => {
      expect(formatTimeAgo("2026-06-14T09:00:00Z", now)).toBe("3 hr ago");
    });
    it("formats a single day", () => {
      expect(formatTimeAgo("2026-06-13T11:00:00Z", now)).toBe("1 day ago");
    });
    it("formats multiple days", () => {
      expect(formatTimeAgo("2026-06-11T12:00:00Z", now)).toBe("3 days ago");
    });
  });
});
