import { describe, it, expect, vi, afterEach } from "vitest";

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

// NWS shapes
interface NwsProperties {
  event: string;
  severity: string;
  urgency: string;
  headline: string;
  onset: string | null;
  expires: string | null;
  areaDesc: string;
}
interface NwsFeature { properties: NwsProperties }
interface NwsResponse { features: NwsFeature[] }

// SPC shapes
interface SpcProperties { label: string; label2: string; fill: string }
interface SpcFeature { properties: SpcProperties }
interface SpcResponse { features: SpcFeature[] }

function makeNwsFeature(event: string, overrides: Partial<NwsProperties> = {}): NwsFeature {
  return {
    properties: {
      event,
      severity: "Severe",
      urgency: "Immediate",
      headline: `${event} in effect until 8 PM`,
      onset: "2026-06-20T14:00:00-07:00",
      expires: "2026-06-20T20:00:00-07:00",
      areaDesc: "King County",
      ...overrides,
    },
  };
}

function makeNwsResponse(features: NwsFeature[]): NwsResponse {
  return { features };
}

function makeSpcResponse(label: string, label2 = "Slight Risk"): SpcResponse {
  return {
    features: [{ properties: { label, label2, fill: "#FF0000" } }],
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/mountains/[slug]/alerts", () => {
  it("(a) active Severe Thunderstorm Warning → nws[0].event set + stormActive === true", async () => {
    const nwsPayload = makeNwsResponse([makeNwsFeature("Severe Thunderstorm Warning")]);
    const spcPayload: SpcResponse = { features: [] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.nws).toHaveLength(1);
    expect(body.nws[0].event).toBe("Severe Thunderstorm Warning");
    expect(body.stormActive).toBe(true);
    expect(body.provenance.source).toBe("NWS + SPC");
    expect(body.provenance.observedAt).toBeDefined();
  });

  it("(b) SPC returns ENH feature → spc.label === 'ENH', stormActive === true", async () => {
    const nwsPayload = makeNwsResponse([]);
    const spcPayload = makeSpcResponse("ENH", "Enhanced Risk");

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.nws).toEqual([]);
    expect(body.spc).toEqual({ label: "ENH", label2: "Enhanced Risk" });
    expect(body.stormActive).toBe(true);
  });

  it("(c) empty NWS + empty SPC features → quiet 200 (NOT 404), stormActive === false", async () => {
    const nwsPayload = makeNwsResponse([]);
    const spcPayload: SpcResponse = { features: [] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.nws).toEqual([]);
    expect(body.spc).toBeNull();
    expect(body.stormActive).toBe(false);
  });

  it("(d) NWS User-Agent header does NOT contain '@'", async () => {
    const nwsPayload = makeNwsResponse([]);
    const spcPayload: SpcResponse = { features: [] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    await GET(new Request("http://t"), ctx("mt-rainier"));

    // Find the NWS call
    const nwsCall = fetchMock.mock.calls.find((args: unknown[]) =>
      (args[0] as string).includes("api.weather.gov")
    );
    expect(nwsCall).toBeDefined();
    const ua: string = nwsCall![1]?.headers?.["User-Agent"] ?? "";
    expect(ua.length).toBeGreaterThan(0);
    expect(ua).not.toContain("@");
  });

  it("(e) SPC fetch rejects → nws still returned, spc === null, status 200", async () => {
    const nwsPayload = makeNwsResponse([makeNwsFeature("Tornado Warning")]);

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.reject(new Error("SPC service unavailable"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.nws).toHaveLength(1);
    expect(body.nws[0].event).toBe("Tornado Warning");
    expect(body.spc).toBeNull();
    // stormActive still true because Tornado Warning is in the active set
    expect(body.stormActive).toBe(true);
  });

  it("(f) unknown slug → 404 Mountain not found", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-peak"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cache header is set on success", async () => {
    const nwsPayload = makeNwsResponse([]);
    const spcPayload: SpcResponse = { features: [] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });

  it("SPC highest-rank wins when multiple features present", async () => {
    const nwsPayload = makeNwsResponse([]);
    // ENH is higher rank than SLGT
    const spcPayload: SpcResponse = {
      features: [
        { properties: { label: "SLGT", label2: "Slight Risk", fill: "#AAEE77" } },
        { properties: { label: "ENH", label2: "Enhanced Risk", fill: "#FF6600" } },
        { properties: { label: "MRGL", label2: "Marginal Risk", fill: "#006600" } },
      ],
    };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.spc?.label).toBe("ENH");
  });

  it("MDT rank → stormActive === true (above ENH threshold)", async () => {
    const nwsPayload = makeNwsResponse([]);
    const spcPayload = makeSpcResponse("MDT", "Moderate Risk");

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.stormActive).toBe(true);
  });

  it("SLGT rank → stormActive === false (below ENH threshold)", async () => {
    const nwsPayload = makeNwsResponse([]);
    const spcPayload = makeSpcResponse("SLGT", "Slight Risk");

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.stormActive).toBe(false);
  });

  it("Severe Thunderstorm Watch → stormActive === true", async () => {
    const nwsPayload = makeNwsResponse([makeNwsFeature("Severe Thunderstorm Watch")]);
    const spcPayload: SpcResponse = { features: [] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.stormActive).toBe(true);
    expect(body.nws[0].event).toBe("Severe Thunderstorm Watch");
  });
});
