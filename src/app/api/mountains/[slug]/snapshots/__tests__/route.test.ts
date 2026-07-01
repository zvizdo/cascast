import { describe, it, expect, vi } from "vitest";
import { makeDb } from "@/app/api/__tests__/test-helpers";

const dbHolder: { db: ReturnType<typeof makeDb>["db"] } = { db: makeDb({}).db };
vi.mock("@/lib/firebase-admin", () => ({ getDb: () => dbHolder.db }));
function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

describe("GET /api/mountains/[slug]/snapshots", () => {
  it("returns snapshots ordered fetchedAt desc with no-store cache header", async () => {
    const snaps = Array.from({ length: 5 }, (_, i) => ({
      id: `s${i}`, fetchedAt: `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00Z`,
      forecastBlobPath: `forecasts/mt-rainier/${i}/0000-combined.json`,
      models: ["hrrr", "gfs"],
    }));
    dbHolder.db = makeDb({ collections: { "mountains/mt-rainier/snapshots": snaps } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/snapshots/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    const body = await res.json();
    expect(body).toHaveLength(5);
    expect(body[0].id).toBe("s4"); // newest first
  });

  it("serializes Firestore Timestamp fetchedAt fields to ISO strings", async () => {
    dbHolder.db = makeDb({ collections: { "mountains/mt-rainier/snapshots": [
      { id: "s0", fetchedAt: { _seconds: 1718000000, _nanoseconds: 0 }, forecastBlobPath: "p" },
    ] } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/snapshots/route");
    const body = await (await GET(new Request("http://t"), ctx("mt-rainier"))).json();
    expect(body[0].fetchedAt).toBe("2024-06-10T06:13:20.000Z");
  });

  it("caps the result at 240 snapshots", async () => {
    const many = Array.from({ length: 300 }, (_, i) => ({
      id: `s${i}`,
      fetchedAt: `2026-06-16T${String(i % 24).padStart(2, "0")}:00:00Z`,
      forecastBlobPath: `forecasts/mt-rainier/${i}/0000-combined.json`,
    }));
    dbHolder.db = makeDb({ collections: { "mountains/mt-rainier/snapshots": many } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/snapshots/route");
    const body = await (await GET(new Request("http://t"), ctx("mt-rainier"))).json();
    expect(body).toHaveLength(240);
  });

  it("returns an empty array when there are no snapshots", async () => {
    dbHolder.db = makeDb({ collections: { "mountains/mt-rainier/snapshots": [] } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/snapshots/route");
    expect(await (await GET(new Request("http://t"), ctx("mt-rainier"))).json()).toEqual([]);
  });

  it("returns 404 Mountain not found for an unknown slug", async () => {
    const { GET } = await import("@/app/api/mountains/[slug]/snapshots/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-mountain"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
  });
});
