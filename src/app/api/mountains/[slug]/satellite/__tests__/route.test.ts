import { describe, it, expect, vi } from "vitest";
import { makeDb } from "@/app/api/__tests__/test-helpers";

const dbHolder: { db: ReturnType<typeof makeDb>["db"] } = { db: makeDb({}).db };
vi.mock("@/lib/firebase-admin", () => ({ getDb: () => dbHolder.db }));
function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

const sat = {
  mountainId: "mt-rainier", latestImageDate: "2026-06-13",
  cloudCoverPercent: 12, tileUrlTemplate: "https://tiles/{z}/{x}/{y}.png",
  tileSource: "eox-s2cloudless", attribution: "EOX",
  boundingBox: { north: 47, south: 46, east: -121, west: -122 },
};

describe("GET /api/mountains/[slug]/satellite", () => {
  it("returns the satellite cache for the mountain with cache header", async () => {
    dbHolder.db = makeDb({ docs: {
      "satelliteCache/mt-rainier": sat,
    } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/satellite/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600");
    expect(await res.json()).toEqual(sat);
  });

  it("returns null when no satelliteCache doc exists", async () => {
    dbHolder.db = makeDb({ docs: {} }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/satellite/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600");
    expect(await res.json()).toBeNull();
  });

  it("returns 404 Mountain not found for an unknown slug", async () => {
    const { GET } = await import("@/app/api/mountains/[slug]/satellite/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-mountain"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
  });
});
