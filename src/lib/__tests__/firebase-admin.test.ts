import { describe, it, expect, beforeAll } from "vitest";

beforeAll(() => {
  process.env.GCP_PROJECT = "mountain-weatherman-app";
  process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
});

describe("firebase-admin singleton", () => {
  it("returns the same Firestore instance across imports", async () => {
    const { getDb } = await import("@/lib/firebase-admin");
    const a = getDb();
    const b = getDb();
    expect(a).toBe(b);
  });
});
