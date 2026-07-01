import { describe, it, expect, vi } from "vitest";
import { makeDb } from "@/app/api/__tests__/test-helpers";

const dbHolder: { db: ReturnType<typeof makeDb>["db"] } = { db: makeDb({}).db };
vi.mock("@/lib/firebase-admin", () => ({ getDb: () => dbHolder.db }));
function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

describe("GET /api/mountains/[slug]/snotel", () => {
  it("returns station data with cache header", async () => {
    dbHolder.db = makeDb({ docs: {
      "snotelData/mt-rainier": { stationId: "679", stationName: "Paradise" },
    } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/snotel/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600");
    expect((await res.json()).stationId).toBe("679");
  });

  it("returns 404 when station data is not yet available", async () => {
    dbHolder.db = makeDb({ docs: {} }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/snotel/route");
    expect((await GET(new Request("http://t"), ctx("mt-rainier"))).status).toBe(404);
  });

  it("returns 404 Mountain not found for an unknown slug", async () => {
    const { GET } = await import("@/app/api/mountains/[slug]/snotel/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-mountain"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
  });
});
