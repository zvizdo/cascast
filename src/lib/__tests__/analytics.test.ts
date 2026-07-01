import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendGAEvent = vi.fn();
vi.mock("@next/third-parties/google", () => ({ sendGAEvent: (...a: unknown[]) => sendGAEvent(...a) }));

import { track, mountainParams, horizonDays } from "../analytics";

describe("analytics", () => {
  beforeEach(() => {
    sendGAEvent.mockClear();
    delete (window as unknown as { gtag?: unknown }).gtag;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (window as unknown as { gtag?: unknown }).gtag;
  });

  describe("track", () => {
    it("no-ops when window.gtag is absent", () => {
      track("pin_added", { mountain_slug: "rainier" });
      expect(sendGAEvent).not.toHaveBeenCalled();
    });

    it("calls sendGAEvent with the event name and params when gtag is present", () => {
      (window as unknown as { gtag: () => void }).gtag = () => {};
      track("pin_added", { mountain_slug: "rainier", target_horizon_days: 2 });
      expect(sendGAEvent).toHaveBeenCalledWith("event", "pin_added", {
        mountain_slug: "rainier",
        target_horizon_days: 2,
      });
    });

    it("defaults params to an empty object", () => {
      (window as unknown as { gtag: () => void }).gtag = () => {};
      track("explore_3d_opened");
      expect(sendGAEvent).toHaveBeenCalledWith("event", "explore_3d_opened", {});
    });
  });

  describe("mountainParams", () => {
    it("maps slug/name/region to GA param names", () => {
      expect(mountainParams({ slug: "mt-baker", name: "Mount Baker", region: "north-cascades" })).toEqual({
        mountain_slug: "mt-baker",
        mountain_name: "Mount Baker",
        region: "north-cascades",
      });
    });
  });

  describe("horizonDays", () => {
    it("returns whole days from today to the target", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 20, 9, 30)); // 2026-06-20 local
      expect(horizonDays("2026-06-22")).toBe(2);
      expect(horizonDays("2026-06-20")).toBe(0);
    });

    it("floors past dates at 0", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 5, 20, 9, 30));
      expect(horizonDays("2026-06-18")).toBe(0);
    });
  });
});
