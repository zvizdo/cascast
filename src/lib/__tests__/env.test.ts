import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { requireEnv } from "@/lib/env";

describe("requireEnv", () => {
  const OLD = process.env;
  beforeEach(() => { process.env = { ...OLD }; });
  afterEach(() => { process.env = OLD; });

  it("returns the value when set", () => {
    process.env.GCP_PROJECT = "mountain-weatherman-app";
    expect(requireEnv("GCP_PROJECT")).toBe("mountain-weatherman-app");
  });

  it("throws a descriptive error when missing", () => {
    delete process.env.GCP_PROJECT;
    expect(() => requireEnv("GCP_PROJECT")).toThrow(/Missing required env var: GCP_PROJECT/);
  });
});
