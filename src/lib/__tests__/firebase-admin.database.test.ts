import { describe, it, expect, vi, beforeEach } from "vitest";

const getFirestore = vi.fn(() => ({}));
vi.mock("firebase-admin/firestore", () => ({ getFirestore }));
vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
  cert: vi.fn(),
  applicationDefault: vi.fn(),
}));

describe("getDb database selection", () => {
  beforeEach(() => {
    vi.resetModules();
    getFirestore.mockClear();
    process.env.GCP_PROJECT = "mountain-weatherman-app";
  });

  it("passes FIRESTORE_DATABASE to getFirestore when set", async () => {
    process.env.FIRESTORE_DATABASE = "dev";
    const { getDb } = await import("@/lib/firebase-admin");
    getDb();
    expect(getFirestore).toHaveBeenCalledWith(expect.anything(), "dev");
  });

  it("defaults to (default) when FIRESTORE_DATABASE unset", async () => {
    delete process.env.FIRESTORE_DATABASE;
    const { getDb } = await import("@/lib/firebase-admin");
    getDb();
    expect(getFirestore).toHaveBeenCalledWith(expect.anything(), "(default)");
  });
});
