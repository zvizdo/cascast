import { describe, it, expect } from "vitest";
import { todayISO, addDaysISO, defaultTargetISO, isInRange, dayStripDays } from "@/lib/target-date";

const NOW = new Date(2026, 5, 20, 9, 0, 0); // Sat Jun 20 2026 local

describe("target-date", () => {
  it("todayISO returns local YYYY-MM-DD", () => {
    expect(todayISO(NOW)).toBe("2026-06-20");
  });
  it("addDaysISO crosses month boundaries", () => {
    expect(addDaysISO("2026-06-30", 2)).toBe("2026-07-02");
  });
  it("defaultTargetISO is tomorrow", () => {
    expect(defaultTargetISO(NOW)).toBe("2026-06-21");
  });
  it("isInRange checks membership", () => {
    expect(isInRange(["2026-06-21", "2026-06-22"], "2026-06-21")).toBe(true);
    expect(isInRange(["2026-06-21"], "2026-07-01")).toBe(false);
  });
  it("dayStripDays labels Today/Tomorrow and flags range + target", () => {
    const days = dayStripDays(["2026-06-20", "2026-06-21"], "2026-06-21", NOW, 4);
    expect(days[0]).toMatchObject({ date: "2026-06-20", label: "Today", isToday: true, inRange: true });
    expect(days[1]).toMatchObject({ date: "2026-06-21", label: "Tomorrow", inRange: true });
    expect(days[2].inRange).toBe(false); // 2026-06-22 not in dayKeys
    expect(days[2].dow).toBe("Mon");
  });
});
