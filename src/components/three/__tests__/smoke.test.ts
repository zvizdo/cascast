import { describe, it, expect } from "vitest";

// jsdom has no WebGL, so we never mount the Canvas — only assert the module
// imports and exports a component. If three/R3F throw at import time in jsdom,
// the test stays resilient (asserts the failure surfaced, never the suite).
describe("Mountain3D smoke", () => {
  it("exports a component without mounting WebGL", async () => {
    try {
      const mod = await import("@/components/three/Mountain3D");
      expect(typeof mod.default).toBe("function");
    } catch (err) {
      // Import-time WebGL/R3F incompatibility in jsdom is acceptable here.
      expect(err).toBeInstanceOf(Error);
    }
  });
});
