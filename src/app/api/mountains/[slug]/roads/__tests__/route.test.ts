import { describe, it, expect, vi, afterEach } from "vitest";

// Mock storage before importing the route
const readCachedGeo = vi.fn();
const writeCachedGeo = vi.fn();
vi.mock("@/lib/storage", () => ({ readCachedGeo, writeCachedGeo }));

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// Small valid EDW FeatureCollections for layer 0 (all roads) and layer 1 (closed-to-motorized)
const LAYER0_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[-121.7, 46.8], [-121.71, 46.81]] },
      properties: { NAME: "Road 123", oper_maint_level: "3", openforuseto: "OPEN" },
    },
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[-121.72, 46.82], [-121.73, 46.83]] },
      properties: { NAME: "Road 456", oper_maint_level: "2", openforuseto: "RESTRICTED" },
    },
  ],
};

const LAYER1_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[-121.8, 46.85], [-121.81, 46.86]] },
      properties: { NAME: "Closed Spur", oper_maint_level: "1", openforuseto: "CLOSED" },
    },
  ],
};

const FRESH_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "LineString", coordinates: [[-121.7, 46.8]] },
      properties: { name: "Cached Road", closed: false },
    },
  ],
};

function makeFetchMock(layer0 = LAYER0_FC, layer1 = LAYER1_FC) {
  return vi.fn().mockImplementation((url: string) => {
    const fc = url.includes("/MapServer/1/") ? layer1 : layer0;
    return Promise.resolve(new Response(JSON.stringify(fc), { status: 200 }));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/mountains/[slug]/roads", () => {
  it("(a) cache HIT → returns cached data, fetch NOT called, writeCachedGeo NOT called", async () => {
    readCachedGeo.mockResolvedValue({
      data: FRESH_FC,
      cachedAt: new Date().toISOString(), // just now = fresh
    });
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/roads/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(FRESH_FC);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeCachedGeo).not.toHaveBeenCalled();
    expect(readCachedGeo).toHaveBeenCalledWith("mt-rainier", "roads");
  });

  it("(b) cache MISS → fetches both EDW layers, merges, layer-1 features get closed:true, caches, returns merged FC", async () => {
    readCachedGeo.mockResolvedValue(null);
    writeCachedGeo.mockResolvedValue(undefined);
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/roads/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);

    // Both layer 0 and layer 1 must have been fetched
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((call: unknown[]) => call[0] as string);
    const layer0Url = urls.find((u: string) => u.includes("/MapServer/0/"));
    const layer1Url = urls.find((u: string) => u.includes("/MapServer/1/"));
    expect(layer0Url).toBeTruthy();
    expect(layer1Url).toBeTruthy();

    // Layer 0 URL must contain EDW_RoadBasic_01, f=geojson, and an esriGeometryEnvelope bbox
    expect(layer0Url).toContain("EDW_RoadBasic_01/MapServer/0/query");
    expect(layer0Url).toContain("f=geojson");
    expect(layer0Url).toContain("esriGeometryEnvelope");

    // Merged FC: 2 (layer 0) + 1 (layer 1) = 3 total features
    const body = await res.json();
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toHaveLength(3);

    // Layer-0 features get closed:false
    const openFeatures = body.features.filter((f: GeoJSON.Feature) => f.properties?.closed === false);
    expect(openFeatures).toHaveLength(2);

    // Layer-1 feature gets closed:true
    const closedFeatures = body.features.filter((f: GeoJSON.Feature) => f.properties?.closed === true);
    expect(closedFeatures).toHaveLength(1);
    expect(closedFeatures[0].properties?.name).toBe("Closed Spur");

    // writeCachedGeo called with slug, "roads", and the merged FeatureCollection
    expect(writeCachedGeo).toHaveBeenCalledWith(
      "mt-rainier",
      "roads",
      expect.objectContaining({ type: "FeatureCollection", features: expect.any(Array) })
    );
  });

  it("(b2) merged features carry a normalized name prop from EDW NAME field", async () => {
    readCachedGeo.mockResolvedValue(null);
    writeCachedGeo.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", makeFetchMock());

    const { GET } = await import("@/app/api/mountains/[slug]/roads/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();

    const names = body.features.map((f: GeoJSON.Feature) => f.properties?.name);
    expect(names).toContain("Road 123");
    expect(names).toContain("Road 456");
    expect(names).toContain("Closed Spur");
  });

  it("(c) STALE cache (cachedAt 2 days ago for 1d TTL) → re-fetches EDW", async () => {
    const staleDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    readCachedGeo.mockResolvedValue({ data: FRESH_FC, cachedAt: staleDate });
    writeCachedGeo.mockResolvedValue(undefined);
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/roads/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(writeCachedGeo).toHaveBeenCalled();
  });

  it("(d) upstream throw on cache miss → returns EMPTY_FC 200 (graceful, not 500)", async () => {
    readCachedGeo.mockResolvedValue(null);
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/roads/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: "FeatureCollection", features: [] });
    expect(writeCachedGeo).not.toHaveBeenCalled();
  });

  it("(d2) upstream non-ok on cache miss → returns EMPTY_FC 200 (graceful)", async () => {
    readCachedGeo.mockResolvedValue(null);
    const fetchMock = vi.fn().mockResolvedValue(new Response("error", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/roads/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: "FeatureCollection", features: [] });
  });

  it("(e) unknown slug → 404 Mountain not found", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/roads/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-peak"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Cache-Control header is set on cache hit", async () => {
    readCachedGeo.mockResolvedValue({
      data: FRESH_FC,
      cachedAt: new Date().toISOString(),
    });
    vi.stubGlobal("fetch", vi.fn());

    const { GET } = await import("@/app/api/mountains/[slug]/roads/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });

  it("Cache-Control header is set on EMPTY_FC (upstream error)", async () => {
    readCachedGeo.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

    const { GET } = await import("@/app/api/mountains/[slug]/roads/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });
});
