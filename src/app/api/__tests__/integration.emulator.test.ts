import { describe, it, expect, vi, beforeAll } from "vitest";
import { MOUNTAINS } from "@/lib/mountains-data";

// Real Firestore (emulator) — do NOT mock firebase-admin. Mock only Pub/Sub.
vi.mock("@/lib/pubsub", () => ({ publish: vi.fn().mockResolvedValue("msg") }));

beforeAll(() => {
  process.env.GCP_PROJECT = "mountain-weatherman-app";
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "localhost:8080";
});

describe("emulator integration", () => {
  it("GET /api/mountains returns all seeded mountains", async () => {
    const { GET } = await import("@/app/api/mountains/route");
    const body = await (await GET()).json();
    expect(body.length).toBe(MOUNTAINS.length);
    expect(body.map((m: { slug: string }) => m.slug)).toContain("mt-rainier");
  });
});
