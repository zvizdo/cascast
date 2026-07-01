import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeDb } from "@/app/api/__tests__/test-helpers";

const dbHolder: { db: ReturnType<typeof makeDb>["db"] } = { db: makeDb({}).db };
vi.mock("@/lib/firebase-admin", () => ({ getDb: () => dbHolder.db }));
const readCombinedBlob = vi.fn();
vi.mock("@/lib/storage", () => ({ readCombinedBlob }));

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }
const fresh = new Date(Date.now() - 60 * 60 * 1000).toISOString();      // 1h old
const stale = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();  // 5h old

beforeEach(() => { readCombinedBlob.mockReset(); });

describe("GET /api/mountains/[slug]", () => {
  it("returns fresh conditions + satellite with stale:false", async () => {
    dbHolder.db = makeDb({ docs: {
      "mountainConditions/mt-rainier": { mountainId: "mt-rainier", updatedAt: fresh },
      "satelliteCache/mt-rainier": { mountainId: "mt-rainier", tileUrl: "https://x" },
    } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600");
    const body = await res.json();
    expect(body.mountain.slug).toBe("mt-rainier");
    expect(body.conditions.updatedAt).toBe(fresh);
    expect(body.satellite.tileUrl).toBe("https://x");
    expect(body.stale).toBe(false);
  });

  it("computes staleness from a raw Firestore Timestamp shape ({_seconds})", async () => {
    const freshSecs = Math.floor((Date.now() - 60 * 60 * 1000) / 1000); // 1h old
    dbHolder.db = makeDb({ docs: {
      "mountainConditions/mt-rainier": {
        mountainId: "mt-rainier", updatedAt: { _seconds: freshSecs, _nanoseconds: 0 },
      },
    } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.stale).toBe(false); // 1h-old Timestamp is fresh; not Invalid-Date
  });

  it("stale conditions report stale:true", async () => {
    dbHolder.db = makeDb({ docs: {
      "mountainConditions/mt-rainier": { mountainId: "mt-rainier", updatedAt: stale },
    } }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.conditions.updatedAt).toBe(stale);
    expect(body.stale).toBe(true);
    expect(body.satellite).toBeNull();
  });

  it("absent conditions report conditions:null and stale:true", async () => {
    dbHolder.db = makeDb({ docs: {} }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/route");
    const body = await (await GET(new Request("http://t"), ctx("mt-rainier"))).json();
    expect(body.conditions).toBeNull();
    expect(body.stale).toBe(true);
  });

  it("returns 404 for a missing mountain", async () => {
    dbHolder.db = makeDb({ docs: {} }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/route");
    expect((await GET(new Request("http://t"), ctx("nope"))).status).toBe(404);
  });

  it("returns weather (combined blob), nwac, and snotel for the peak", async () => {
    dbHolder.db = makeDb({ docs: {
      "mountainConditions/mt-rainier": { mountainId: "mt-rainier", forecastBlobPath: "blobs/mt-rainier/latest.json", updatedAt: fresh },
      "nwacForecasts/1648": { zoneId: "1648", zoneName: "West Slopes South", season: "winter" },
      "snotelData/mt-rainier": { mountainId: "mt-rainier", stationName: "Paradise" },
    } }).db;
    const blob = { mountainId: "mt-rainier", timezone: "America/Los_Angeles", fetchedAt: "z", hrrr: null, gfs: null, ecmwf: null };
    readCombinedBlob.mockResolvedValue(blob);
    const { GET } = await import("@/app/api/mountains/[slug]/route");
    const body = await (await GET(new Request("http://t"), ctx("mt-rainier"))).json();
    expect(readCombinedBlob).toHaveBeenCalledWith("blobs/mt-rainier/latest.json");
    expect(body.weather).toEqual(blob);
    expect(body.nwac.zoneName).toBe("West Slopes South");
    expect(body.snotel.stationName).toBe("Paradise");
  });

  it("returns weather/nwac/snotel as null when blob/zone/station docs are absent", async () => {
    dbHolder.db = makeDb({ docs: {
      "mountainConditions/mt-rainier": { mountainId: "mt-rainier", forecastBlobPath: "blobs/mt-rainier/latest.json", updatedAt: fresh },
    } }).db;
    readCombinedBlob.mockResolvedValue(null);
    const { GET } = await import("@/app/api/mountains/[slug]/route");
    const body = await (await GET(new Request("http://t"), ctx("mt-rainier"))).json();
    expect(body.weather).toBeNull();
    expect(body.nwac).toBeNull();
    expect(body.snotel).toBeNull();
  });

  it("returns weather:null without touching storage when conditions are absent", async () => {
    dbHolder.db = makeDb({ docs: {} }).db;
    const { GET } = await import("@/app/api/mountains/[slug]/route");
    const body = await (await GET(new Request("http://t"), ctx("mt-rainier"))).json();
    expect(body.weather).toBeNull();
    expect(readCombinedBlob).not.toHaveBeenCalled();
  });
});
