import { describe, it, expect, vi, afterEach } from "vitest";

// Mock storage before importing the route
const readCachedGeo = vi.fn();
const writeCachedGeo = vi.fn();
vi.mock("@/lib/storage", () => ({ readCachedGeo, writeCachedGeo }));

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

// Small valid EDW FeatureCollection with 2 Point features: one open, one closed
const UPSTREAM_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-121.7, 46.8] },
      properties: { SITE_NAME: "Paradise" },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-121.72, 46.82] },
      properties: { SITE_NAME: "Camp Muir", CLOSURE_REASON: "snow" },
    },
  ],
};

// Cached FC (already normalized)
const CACHED_FC: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-121.7, 46.8] },
      properties: { name: "Paradise", closed: false },
    },
    {
      type: "Feature",
      geometry: { type: "Point", coordinates: [-121.72, 46.82] },
      properties: { name: "Camp Muir", closed: true },
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

describe("GET /api/mountains/[slug]/rec-sites", () => {
  it("(a) cache HIT → returns cached data, fetch NOT called, writeCachedGeo NOT called", async () => {
    readCachedGeo.mockResolvedValue({
      data: CACHED_FC,
      cachedAt: new Date().toISOString(), // just now = fresh
    });
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(CACHED_FC);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(writeCachedGeo).not.toHaveBeenCalled();
    expect(readCachedGeo).toHaveBeenCalledWith("mt-rainier", "rec-sites");
  });

  it("(b) cache MISS → fetches EDW_InfraRecreationSites_01, normalizes name + closed, caches, returns FC", async () => {
    readCachedGeo.mockResolvedValue(null);
    writeCachedGeo.mockResolvedValue(undefined);
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("EDW_InfraRecreationSites_01/MapServer/0/query");
    expect(url).toContain("f=geojson");
    expect(url).toContain("esriGeometryEnvelope");
    expect(url).toMatch(/xmin/);

    const body = await res.json();
    expect(body.type).toBe("FeatureCollection");
    expect(body.features).toHaveLength(2);

    // First feature: open site — name normalized, closed:false
    expect(body.features[0].properties?.name).toBe("Paradise");
    expect(body.features[0].properties?.closed).toBe(false);

    // Second feature: CLOSURE_REASON present → closed:true
    expect(body.features[1].properties?.name).toBe("Camp Muir");
    expect(body.features[1].properties?.closed).toBe(true);

    // Geometry passes through
    expect(body.features[0].geometry.type).toBe("Point");

    expect(writeCachedGeo).toHaveBeenCalledWith(
      "mt-rainier",
      "rec-sites",
      expect.objectContaining({ type: "FeatureCollection", features: expect.any(Array) })
    );
  });

  it("(b2) name fallback chain: PUBLIC_SITE_NAME → SITE_NAME → UNIT_NAME → NAME → ''", async () => {
    const variants = [
      { props: { PUBLIC_SITE_NAME: "Alpha Site" }, expectedName: "Alpha Site" },
      { props: { SITE_NAME: "Beta Site" }, expectedName: "Beta Site" },
      { props: { UNIT_NAME: "Gamma Site" }, expectedName: "Gamma Site" },
      { props: { NAME: "Delta Site" }, expectedName: "Delta Site" },
      { props: { OTHER: "nope" }, expectedName: "" },
    ];

    for (const { props, expectedName } of variants) {
      vi.clearAllMocks();
      const fc: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [0, 0] },
            properties: props,
          },
        ],
      };
      readCachedGeo.mockResolvedValue(null);
      writeCachedGeo.mockResolvedValue(undefined);
      vi.stubGlobal("fetch", makeFetchMock(fc));

      const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
      const res = await GET(new Request("http://t"), ctx("mt-rainier"));
      const body = await res.json();
      expect(body.features[0].properties?.name).toBe(expectedName);
      vi.unstubAllGlobals();
    }
  });

  it("(b2-lc) live ArcGIS f=geojson lowercase fields drive name + closed", async () => {
    // Real EDW geojson returns lowercase keys (public_site_name, closure_reason),
    // not the uppercase aliases. Verify the route normalizes them.
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { recarea_name: "Eightmile Trailhead", closure_reason: "washout" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { public_site_name: "Open Camp", closure_reason: null },
        },
      ],
    };
    readCachedGeo.mockResolvedValue(null);
    writeCachedGeo.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", makeFetchMock(fc));

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.features[0].properties?.name).toBe("Eightmile Trailhead");
    expect(body.features[0].properties?.closed).toBe(true);
    expect(body.features[1].properties?.name).toBe("Open Camp");
    expect(body.features[1].properties?.closed).toBe(false);
    vi.unstubAllGlobals();
  });

  it("(b3) closed=true when UNIT_CLOSURE_END_DATE is in the future", async () => {
    const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { SITE_NAME: "Future Closure", UNIT_CLOSURE_END_DATE: futureDate },
        },
      ],
    };
    readCachedGeo.mockResolvedValue(null);
    writeCachedGeo.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", makeFetchMock(fc));

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.features[0].properties?.closed).toBe(true);
  });

  it("(b4) closed=false when UNIT_CLOSURE_END_DATE is in the past", async () => {
    const pastDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { SITE_NAME: "Past Closure", UNIT_CLOSURE_END_DATE: pastDate },
        },
      ],
    };
    readCachedGeo.mockResolvedValue(null);
    writeCachedGeo.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", makeFetchMock(fc));

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.features[0].properties?.closed).toBe(false);
  });

  it("(b5) closed=false when UNIT_CLOSURE_END_DATE is unparseable (defensive)", async () => {
    const fc: GeoJSON.FeatureCollection = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { SITE_NAME: "Bad Date", UNIT_CLOSURE_END_DATE: "not-a-date" },
        },
      ],
    };
    readCachedGeo.mockResolvedValue(null);
    writeCachedGeo.mockResolvedValue(undefined);
    vi.stubGlobal("fetch", makeFetchMock(fc));

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.features[0].properties?.closed).toBe(false);
  });

  it("(c) STALE cache (cachedAt 2 days ago for 1d TTL) → re-fetches EDW", async () => {
    const staleDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    readCachedGeo.mockResolvedValue({ data: CACHED_FC, cachedAt: staleDate });
    writeCachedGeo.mockResolvedValue(undefined);
    const fetchMock = makeFetchMock();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(writeCachedGeo).toHaveBeenCalled();
  });

  it("(d) upstream throw on cache miss → returns EMPTY_FC 200 (graceful)", async () => {
    readCachedGeo.mockResolvedValue(null);
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network error"));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ type: "FeatureCollection", features: [] });
    expect(writeCachedGeo).not.toHaveBeenCalled();
  });

  it("(e) unknown slug → 404 Mountain not found", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
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

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });

  it("Cache-Control header is set on EMPTY_FC (upstream error)", async () => {
    readCachedGeo.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fail")));

    const { GET } = await import("@/app/api/mountains/[slug]/rec-sites/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));

    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });
});
