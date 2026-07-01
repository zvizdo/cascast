import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/env", () => ({ requireEnv: () => "test-key" }));

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

// AirNow current record shape
interface AirNowRecord {
  DateObserved: string;
  HourObserved: number;
  ReportingArea: string;
  Latitude: number;
  Longitude: number;
  ParameterName: string;
  AQI: number;
  Category: { Number: number; Name: string };
}

function makeAirNowRecord(overrides: Partial<AirNowRecord> = {}): AirNowRecord {
  return {
    DateObserved: "2026-06-20 ",
    HourObserved: 14,
    ReportingArea: "Seattle-Tacoma",
    Latitude: 47.4502,
    Longitude: -122.3088,
    ParameterName: "PM2.5",
    AQI: 55,
    Category: { Number: 2, Name: "Moderate" },
    ...overrides,
  };
}

// NWS/SPC shapes
interface NwsFeature {
  properties: {
    event: string; severity: string; urgency: string;
    headline: string; onset: string | null; expires: string | null; areaDesc: string;
  };
}
function makeNwsResponse(features: NwsFeature[]) { return { features }; }
function makeNwsFeature(event: string): NwsFeature {
  return {
    properties: {
      event, severity: "Severe", urgency: "Immediate",
      headline: `${event} in effect`, onset: "2026-06-20T14:00:00-07:00",
      expires: "2026-06-20T20:00:00-07:00", areaDesc: "King County",
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/mountains/[slug]/hazards-summary", () => {
  it("(a) both AQI + storm present → both summary fields set", async () => {
    const airNowPayload = [makeAirNowRecord({ AQI: 55, Category: { Number: 2, Name: "Moderate" } })];
    const nwsPayload = makeNwsResponse([makeNwsFeature("Severe Thunderstorm Warning")]);
    const spcPayload = { features: [] as never[] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("airnowapi.org")) {
        return Promise.resolve(new Response(JSON.stringify(airNowPayload), { status: 200 }));
      }
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      // SPC
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/hazards-summary/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.aqi).not.toBeNull();
    expect(body.aqi.value).toBe(55);
    expect(body.aqi.category).toBe("Moderate");
    expect(body.storm).not.toBeNull();
    expect(body.storm.active).toBe(true);
    expect(body.provenance.source).toBe("AirNow + NWS/SPC");
    expect(body.provenance.observedAt).toBeDefined();
  });

  it("(b) AQI fetch rejects → aqi===null but storm still set, status 200", async () => {
    const nwsPayload = makeNwsResponse([makeNwsFeature("Tornado Warning")]);
    const spcPayload = { features: [] as never[] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("airnowapi.org")) {
        return Promise.reject(new Error("AirNow service unavailable"));
      }
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/hazards-summary/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.aqi).toBeNull();
    expect(body.storm).not.toBeNull();
    expect(body.storm.active).toBe(true);
  });

  it("(c) both reject → both null, status 200 (never 500)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Network failure"));
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/hazards-summary/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.aqi).toBeNull();
    expect(body.storm).toBeNull();
    expect(body.provenance.source).toBe("AirNow + NWS/SPC");
  });

  it("(d) unknown slug → 404", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/hazards-summary/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-peak"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cache header is set on success", async () => {
    const airNowPayload = [makeAirNowRecord()];
    const nwsPayload = makeNwsResponse([]);
    const spcPayload = { features: [] as never[] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("airnowapi.org")) {
        return Promise.resolve(new Response(JSON.stringify(airNowPayload), { status: 200 }));
      }
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/hazards-summary/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });

  it("(storm-label) storm label is SPC label2 when SPC is present", async () => {
    const airNowPayload = [makeAirNowRecord()];
    const nwsPayload = makeNwsResponse([]);
    const spcPayload = { features: [{ properties: { label: "ENH", label2: "Enhanced Risk", fill: "#FF6600" } }] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("airnowapi.org")) {
        return Promise.resolve(new Response(JSON.stringify(airNowPayload), { status: 200 }));
      }
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/hazards-summary/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.storm.label).toBe("Enhanced Risk");
  });

  it("(storm-label) storm label uses NWS event when no SPC", async () => {
    const airNowPayload = [makeAirNowRecord()];
    const nwsPayload = makeNwsResponse([makeNwsFeature("Severe Thunderstorm Watch")]);
    const spcPayload = { features: [] as never[] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("airnowapi.org")) {
        return Promise.resolve(new Response(JSON.stringify(airNowPayload), { status: 200 }));
      }
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/hazards-summary/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.storm.label).toBe("Severe Thunderstorm Watch");
  });

  it("(storm-label) quiet state → label 'No active storm'", async () => {
    const airNowPayload = [makeAirNowRecord()];
    const nwsPayload = makeNwsResponse([]);
    const spcPayload = { features: [] as never[] };

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("airnowapi.org")) {
        return Promise.resolve(new Response(JSON.stringify(airNowPayload), { status: 200 }));
      }
      if (url.includes("api.weather.gov")) {
        return Promise.resolve(new Response(JSON.stringify(nwsPayload), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(spcPayload), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/hazards-summary/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.storm.label).toBe("No active storm");
  });
});
