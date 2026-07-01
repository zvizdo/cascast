import { describe, it, expect, vi } from "vitest";
import { makeDb } from "@/app/api/__tests__/test-helpers";

const dbHolder: { db: ReturnType<typeof makeDb>["db"] } = { db: makeDb({}).db };
vi.mock("@/lib/firebase-admin", () => ({ getDb: () => dbHolder.db }));
function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

describe("GET /api/mountains/[slug]/nwac", () => {
  it("resolves the zone from the constant and returns the winter forecast", async () => {
    dbHolder.db = makeDb({ docs: {
      "nwacForecasts/1648": { zoneId: "1648", season: "winter", zoneName: "West Slopes South" },
    } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/nwac/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600");
    expect((await res.json()).season).toBe("winter");
  });

  it("returns a summer payload when no forecast doc exists", async () => {
    dbHolder.db = makeDb({ docs: {} }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/nwac/route");
    expect((await (await GET(new Request("http://t"), ctx("mt-rainier"))).json()).season).toBe("summer");
  });

  it("returns 404 when the mountain is missing", async () => {
    dbHolder.db = makeDb({ docs: {} }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/nwac/route");
    expect((await GET(new Request("http://t"), ctx("x"))).status).toBe(404);
  });

  it("returns summer for an out-of-NWAC-region peak (empty zone) without a Firestore lookup", async () => {
    dbHolder.db = makeDb({ docs: {} }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/nwac/route");
    const res = await GET(new Request("http://t"), ctx("mt-whitney"));
    const body = await res.json();
    expect(body.season).toBe("summer");
  });
});
