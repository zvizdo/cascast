import { describe, it, expect, vi, afterEach } from "vitest";

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

// Epoch ms helpers relative to "now" at test import time
const NOW_MS = Date.now();
const daysAgo = (d: number) => NOW_MS - d * 24 * 60 * 60 * 1000;

interface ComCatProperties {
  mag: number;
  place: string;
  time: number; // epoch ms
  type: string;
  status: string;
}
interface ComCatFeature {
  properties: ComCatProperties;
  geometry: { coordinates: [number, number, number] }; // [lng, lat, depthKm]
}
interface ComCatCollection {
  features: ComCatFeature[];
  metadata: { count: number };
}

function makeFeature(overrides: Partial<ComCatProperties & { depthKm: number; timeMsAgo: number }> = {}): ComCatFeature {
  const { depthKm = 10, timeMsAgo = daysAgo(5), ...props } = overrides;
  return {
    properties: {
      mag: props.mag ?? 2.1,
      place: props.place ?? "5km N of Ashford, WA",
      time: props.time ?? timeMsAgo,
      type: props.type ?? "earthquake",
      status: props.status ?? "reviewed",
    },
    geometry: { coordinates: [-121.76, 46.85, depthKm] },
  };
}

function mockFetch(collection: ComCatCollection) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(collection), { status: 200 })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/mountains/[slug]/seismic", () => {
  it("(a) normalizes count30d, largestMag, depthKm, and time as ISO; URL contains required params", async () => {
    // USGS orderby=time returns most-recent first
    const features = [
      makeFeature({ mag: 2.8, depthKm: 5.0, time: daysAgo(2) }),
      makeFeature({ mag: 3.5, depthKm: 8.2, time: daysAgo(10) }),
      makeFeature({ mag: 1.2, depthKm: 15.0, time: daysAgo(20) }),
    ];
    const fetchMock = mockFetch({ features, metadata: { count: features.length } });

    const { GET } = await import("@/app/api/mountains/[slug]/seismic/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.count30d).toBe(3);
    expect(body.largestMag).toBe(3.5);
    // events are most-recent first (ordered by time desc)
    expect(body.events[0].depthKm).toBe(5.0);
    expect(body.events[0].lng).toBe(-121.76);
    expect(body.events[0].lat).toBe(46.85);
    expect(body.events[0].time).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO string
    expect(body.provenance.source).toBe("USGS ComCat");
    expect(body.provenance.observedAt).toBeTruthy();

    // Verify the URL built for USGS
    const url: string = (fetchMock.mock.calls as [string][]).find(() => true)![0];
    expect(url).toContain("maxradiuskm=30");
    expect(url).toContain("format=geojson");
    expect(url).toContain("latitude=46.8517");
    expect(url).toContain("longitude=-121.7603");
    expect(url).toContain("minmagnitude=0");
    expect(url).toContain("orderby=time");
    expect(url).toContain("starttime=");
  });

  it("(b) swarm=true when 7-day count > 2× the 30-day daily-rate baseline for a week", async () => {
    // 10 events in last 7 days, 12 total in 30 days
    // daily rate = 12/30 = 0.4/day → 7-day baseline = 2.8 → threshold = 5.6
    // 10 > 5.6 → swarm=true
    const recent = Array.from({ length: 10 }, () => makeFeature({ time: daysAgo(3) }));
    const older = Array.from({ length: 2 }, () => makeFeature({ time: daysAgo(20) }));
    mockFetch({ features: [...recent, ...older], metadata: { count: 12 } });

    const { GET } = await import("@/app/api/mountains/[slug]/seismic/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.swarm).toBe(true);
    expect(body.count7d).toBe(10);
    expect(body.count30d).toBe(12);
  });

  it("(b2) swarm=false when 7-day count is within normal baseline", async () => {
    // 1 event in last 7 days, 20 total in 30 days
    // daily rate = 20/30 ≈ 0.667/day → 7-day baseline = 4.67 → threshold ≈ 9.33
    // 1 < 9.33 → swarm=false
    const recent = [makeFeature({ time: daysAgo(2) })];
    const older = Array.from({ length: 19 }, () => makeFeature({ time: daysAgo(15) }));
    mockFetch({ features: [...recent, ...older], metadata: { count: 20 } });

    const { GET } = await import("@/app/api/mountains/[slug]/seismic/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.swarm).toBe(false);
  });

  it("(c) empty features → 200 with zeroed summary", async () => {
    mockFetch({ features: [], metadata: { count: 0 } });

    const { GET } = await import("@/app/api/mountains/[slug]/seismic/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.count30d).toBe(0);
    expect(body.count7d).toBe(0);
    expect(body.largestMag).toBeNull();
    expect(body.swarm).toBe(false);
    expect(body.events).toEqual([]);
  });

  it("(d) >15 events → events capped at 15, provenance.note mentions truncation", async () => {
    const features = Array.from({ length: 20 }, (_, i) =>
      makeFeature({ mag: 1 + i * 0.1, time: daysAgo(i * 1.2) })
    );
    mockFetch({ features, metadata: { count: 20 } });

    const { GET } = await import("@/app/api/mountains/[slug]/seismic/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.events.length).toBe(15);
    expect(body.provenance.note).toContain("15");
    expect(body.provenance.note).toContain("20");
  });

  it("(e) unknown slug → 404", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/seismic/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-peak"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cache header is set on success", async () => {
    mockFetch({ features: [], metadata: { count: 0 } });

    const { GET } = await import("@/app/api/mountains/[slug]/seismic/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });
});
