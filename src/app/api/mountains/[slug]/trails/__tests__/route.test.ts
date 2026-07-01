import { describe, it, expect, vi, afterEach } from "vitest";

// Mock storage before importing the route
const readCachedGeo = vi.fn();
const writeCachedGeo = vi.fn();
vi.mock("@/lib/storage", () => ({ readCachedGeo, writeCachedGeo }));

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// A small but valid Overpass response
const OVERPASS_RESPONSE = {
  elements: [
    {
      type: "way",
      tags: { name: "Skyline Trail", sac_scale: "hiking", highway: "path" },
      geometry: [
        { lat: 46.8, lon: -121.7 },
        { lat: 46.81, lon: -121.71 },
      ],
    },
  ],
};

const FRESH_FC = {
  type: "FeatureCollection",
  features: [{ type: "Feature", geometry: { type: "LineString", coordinates: [[-121.7, 46.8]] }, properties: { name: "Cached Trail" } }],
};

function makeStubFetch(status = 200, body: unknown = OVERPASS_RESPONSE) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), { status })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/mountains/[slug]/trails", () => {
  it("(a) cache HIT → returns cached data, fetch NOT called, writeCachedGeo NOT called", async () => {
    readCachedGeo.mockResolvedValue({
      data: FRESH_FC,
      cachedAt: new Date().toISOString(), // just now = fresh
    });
    const fetchMock = makeStubFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/trails/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(FRESH_FC);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeCachedGeo).not.toHaveBeenCalled();
    expect(readCachedGeo).toHaveBeenCalledWith("mt-rainier", "trails");
  });

  it("(b) cache MISS → POSTs Overpass with correct method/body/User-Agent, normalizes, caches, returns FC", async () => {
    readCachedGeo.mockResolvedValue(null);
    writeCachedGeo.mockResolvedValue(undefined);
    const fetchMock = makeStubFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/trails/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);

    // Assert fetch was called with POST + correct headers
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://overpass-api.de/api/interpreter");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe(
      "application/x-www-form-urlencoded"
    );

    // User-Agent must NOT contain "@"
    const ua = (init.headers as Record<string, string>)["User-Agent"];
    expect(ua).toBeTruthy();
    expect(ua).not.toContain("@");

    // Body must start with "data=" and contain the mt-rainier bbox
    const body = init.body as string;
    expect(body).toMatch(/^data=/);
    const decoded = decodeURIComponent(body.replace(/^data=/, ""));
    // mt-rainier lat=46.8517 lng=-121.7603 → bbox covers those coords
    expect(decoded).toContain("46.7");  // south ~lat-0.08 or mapBbox.south
    expect(decoded).toContain("out geom");

    // writeCachedGeo called with slug="mt-rainier", layer="trails", a FeatureCollection
    expect(writeCachedGeo).toHaveBeenCalledWith(
      "mt-rainier",
      "trails",
      expect.objectContaining({ type: "FeatureCollection", features: expect.any(Array) })
    );

    const body2 = await res.json();
    expect(body2.type).toBe("FeatureCollection");
    expect(body2.features.length).toBe(1);
    expect(body2.features[0].geometry.type).toBe("LineString");
    expect(body2.features[0].properties.name).toBe("Skyline Trail");
  });

  it("(c) STALE cache (cachedAt 30 days ago) → re-fetches Overpass", async () => {
    const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    readCachedGeo.mockResolvedValue({ data: FRESH_FC, cachedAt: staleDate });
    writeCachedGeo.mockResolvedValue(undefined);
    const fetchMock = makeStubFetch();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/trails/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(writeCachedGeo).toHaveBeenCalled();
  });

  it("(d) upstream non-ok on cache miss → returns EMPTY_FC 200 (graceful, not 500)", async () => {
    readCachedGeo.mockResolvedValue(null);
    const fetchMock = makeStubFetch(503, "Service Unavailable");
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/trails/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ type: "FeatureCollection", features: [] });
    expect(writeCachedGeo).not.toHaveBeenCalled();
  });

  it("(d2) upstream throws on cache miss → returns EMPTY_FC 200 (graceful)", async () => {
    readCachedGeo.mockResolvedValue(null);
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/trails/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("(e) unknown slug → 404 Mountain not found", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/trails/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-peak"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Cache-Control header is set on success (cache hit)", async () => {
    readCachedGeo.mockResolvedValue({
      data: FRESH_FC,
      cachedAt: new Date().toISOString(),
    });
    vi.stubGlobal("fetch", vi.fn());

    const { GET } = await import("@/app/api/mountains/[slug]/trails/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });

  it("Cache-Control header is set on EMPTY_FC (upstream error)", async () => {
    readCachedGeo.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

    const { GET } = await import("@/app/api/mountains/[slug]/trails/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });
});
