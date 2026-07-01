import { describe, it, expect, vi } from "vitest";
import { makeDb } from "@/app/api/__tests__/test-helpers";

const dbHolder: { db: ReturnType<typeof makeDb>["db"] } = { db: makeDb({}).db };
vi.mock("@/lib/firebase-admin", () => ({ getDb: () => dbHolder.db }));
const readCombinedBlob = vi.fn();
vi.mock("@/lib/storage", () => ({ readCombinedBlob }));

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

describe("GET /api/mountains/[slug]/weather", () => {
  it("serves the combined blob with cache header", async () => {
    dbHolder.db = makeDb({ docs: {
      "mountainConditions/mt-rainier": { forecastBlobPath: "forecasts/mt-rainier/x/0000-combined.json" },
    } }).db;
    const blob = { mountainId: "mt-rainier", timezone: "America/Los_Angeles", fetchedAt: "z", hrrr: null, gfs: null, ecmwf: null };
    readCombinedBlob.mockResolvedValue(blob);
    const { GET } = await import("@/app/api/mountains/[slug]/weather/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600");
    expect(await res.json()).toEqual(blob);
    expect(readCombinedBlob).toHaveBeenCalledWith("forecasts/mt-rainier/x/0000-combined.json");
  });

  it("returns 404 when no conditions exist yet", async () => {
    dbHolder.db = makeDb({ docs: {} }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/weather/route");
    expect((await GET(new Request("http://t"), ctx("mt-rainier"))).status).toBe(404);
  });

  it("returns 404 Mountain not found for an unknown slug", async () => {
    const { GET } = await import("@/app/api/mountains/[slug]/weather/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-mountain"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
  });

  it("returns 404 when conditions exist but blob is missing", async () => {
    dbHolder.db = makeDb({ docs: {
      "mountainConditions/mt-rainier": { forecastBlobPath: "forecasts/mt-rainier/x/0000-combined.json" },
    } }).db;
    readCombinedBlob.mockResolvedValue(null);
    const { GET } = await import("@/app/api/mountains/[slug]/weather/route");
    expect((await GET(new Request("http://t"), ctx("mt-rainier"))).status).toBe(404);
  });
});
