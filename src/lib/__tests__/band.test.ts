import { describe, it, expect, beforeEach } from "vitest";
import { useBand } from "@/lib/band";

describe("useBand store", () => {
  beforeEach(() => useBand.setState({ band: "summit" }));
  it("defaults to summit", () => {
    expect(useBand.getState().band).toBe("summit");
  });
  it("updates the band", () => {
    useBand.getState().setBand("base");
    expect(useBand.getState().band).toBe("base");
  });
});
