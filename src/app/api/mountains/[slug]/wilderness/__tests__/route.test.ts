import { describe, it, expect, vi, afterEach } from "vitest";

// Mock storage before importing the route
const readCachedGeo = vi.fn();
const writeCachedGeo = vi.fn();
vi.mock("@/lib/storage", () => ({ readCachedGeo, writeCachedGeo }));

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// Small valid EDW FeatureCollection with 1 polygon feature
const UPSTREAM_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[-121.7, 46.8], [-121.71, 46.81], [-121.72, 46.8], [-121.7, 46.8]]],
      },
      properties: { wildernessname: "Glacier Peak Wilderness", AREANAME: "Glacier Peak" },
    },
  ],
};

// Cached FC (already normalized)
const CACHED_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [[[-121.7, 46.8], [-121.71, 46.81], [-121.72, 46.8], [-121.7, 46.8]]],
      },
      properties: { name: "Glacier Peak Wilderness" },
    },
  ],
};

function makeFetchMock(fc = UPSTREAM_FC) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(fc), { status: 200 })
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("GET /api/mountains/[slug]/wilderness", () => {
  it("(a) cache HIT → returns cached data, fetch NOT called, writeCachedGeo NOT called", async () => {
    readCachedGeo.mockResolvedValue({
      data: CACHED_FC,
      cachedAt: new Date().toISOString(), // just now = fresh
    });
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/wilderness/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CACHED_FC);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeCachedGeo).not.toHaveBeenCalled();
    expect(readCachedGeo).toHaveBeenCalledWith("mt-rainier", "wilderness");
  });

  it("(b) cache MISS → fetches EDW_Wilderness_01, normalizes name, caches, returns FC", async () => {
    readCachedGeo.mockResolvedValue(null);
    writeCachedGeo.mockResolvedValue(undefined);
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/wilderness/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("EDW_Wilderness_01/MapServer/0/query");
    expect(url).toContain("f=geojson");
    expect(url).toContain("esriGeometryEnvelope");
    // bbox coordinates should appear in the URL
    expect(url).toMatch(/xmin/);

    const body = await res.json();
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toHaveLength(1);
    // wildernessname normalized to name
    expect(body.features[0].properties?.name).toBe("Glacier Peak Wilderness");

    expect(writeCachedGeo).toHaveBeenCalledWith(
      "mt-rainier",
      "wilderness",
      expect.objectContaining({ type: "FeatureCollection", features: expect.any(Array) })
    );
  });

  it("(b2) name fallback chain: WILDERNESSNAME → wildernessname → NAME → ''", async () => {
    const variants = [
      { props: { WILDERNESSNAME: "Alpha Wilderness" }, expected: "Alpha Wilderness" },
      { props: { wildernessname: "Beta Wilderness" }, expected: "Beta Wilderness" },
      { props: { NAME: "Gamma Wilderness" }, expected: "Gamma Wilderness" },
      { props: { OTHER: "nope" }, expected: "" },
    ];

    for (const { props, expected } of variants) {
      vi.clearAllMocks();
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] },
            properties: props,
          },
        ],
      };
      readCachedGeo.mockResolvedValue(null);
      writeCachedGeo.mockResolvedValue(undefined);
      vi.stubGlobal("fetch", makeFetchMock(fc));

      const { GET } = await import("@/app/api/mountains/[slug]/wilderness/route");
      const res = await GET(new Request("http://t"), ctx("mt-rainier"));
      const body = await res.json();
      expect(body.features[0].properties?.name).toBe(expected);
      vi.unstubAllGlobals();
    }
  });

  it("(c) STALE cache (cachedAt 2 days ago for 1d TTL) → re-fetches EDW", async () => {
    const staleDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    readCachedGeo.mockResolvedValue({ data: CACHED_FC, cachedAt: staleDate });
    writeCachedGeo.mockResolvedValue(undefined);
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/wilderness/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(writeCachedGeo).toHaveBeenCalled();
  });

  it("(d) upstream throw on cache miss → returns EMPTY_FC 200 (graceful)", async () => {
    readCachedGeo.mockResolvedValue(null);
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/wilderness/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: "FeatureCollection", features: [] });
    expect(writeCachedGeo).not.toHaveBeenCalled();
  });

  it("(e) unknown slug → 404 Mountain not found", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/wilderness/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-peak"));

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("Cache-Control header is set on cache hit", async () => {
    readCachedGeo.mockResolvedValue({
      data: CACHED_FC,
      cachedAt: new Date().toISOString(),
    });
    vi.stubGlobal("fetch", vi.fn());

    const { GET } = await import("@/app/api/mountains/[slug]/wilderness/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });

  it("Cache-Control header is set on EMPTY_FC (upstream error)", async () => {
    readCachedGeo.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

    const { GET } = await import("@/app/api/mountains/[slug]/wilderness/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });
});
