import { describe, it, expect, vi, afterEach } from "vitest";

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

afterEach(() => vi.unstubAllGlobals());

// Shape returned by HANS getVolcano/{id} — no colorCode/alertLevel in live response
interface HansVolcano {
  volcano_name: string;
  nvews_threat?: string | null;
  newest_notice_url?: string | null;
}

// Shape returned by HANS newestForVolcano/{id}
interface HansNewestNotice {
  noticeHighestAlertLevel?: string;
  noticeHighestColorCode?: string;
  noticeUrl?: string | null;
  sentUtc?: string;
}

function makeHansVolcano(overrides: Partial<HansVolcano> = {}): HansVolcano {
  return {
    volcano_name: "Mount Rainier",
    nvews_threat: "Very High",
    newest_notice_url: "https://volcanoes.usgs.gov/hans-public/notice/1234",
    ...overrides,
  };
}

function makeNewestNotice(overrides: Partial<HansNewestNotice> = {}): HansNewestNotice {
  return {
    noticeHighestAlertLevel: "NORMAL",
    noticeHighestColorCode: "GREEN",
    noticeUrl: "https://volcanoes.usgs.gov/hans-public/notice/9999",
    ...overrides,
  };
}

describe("GET /api/mountains/[slug]/volcano", () => {
  it("(a) volcano peak → maps getVolcano + newestForVolcano to VolcanoStatus", async () => {
    const volcano = makeHansVolcano();
    const notice = makeNewestNotice();

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("getVolcano/wa6")) {
        return Promise.resolve(new Response(JSON.stringify(volcano), { status: 200 }));
      }
      // newestForVolcano
      return Promise.resolve(new Response(JSON.stringify(notice), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/volcano/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.name).toBe("Mount Rainier");
    // colorCode and alertLevel come from newestForVolcano, NOT getVolcano
    expect(body.colorCode).toBe("GREEN");
    expect(body.alertLevel).toBe("NORMAL");
    expect(body.nvewsThreat).toBe("Very High");
    // noticeUrl prefers newestForVolcano.noticeUrl
    expect(body.noticeUrl).toBe("https://volcanoes.usgs.gov/hans-public/notice/9999");
    expect(body.provenance.source).toBe("USGS HANS");
    expect(body.provenance.observedAt).toBeDefined();

    // fetch URLs must contain the HANS id
    const urls = (fetchMock.mock.calls as [string][]).map(([u]) => u);
    expect(urls.some((u) => u.includes("getVolcano/wa6"))).toBe(true);
    expect(urls.some((u) => u.includes("newestForVolcano/wa6"))).toBe(true);
  });

  it("(a2) null optional fields are passed through as null", async () => {
    const volcano = makeHansVolcano({ nvews_threat: null, newest_notice_url: null });
    const notice = makeNewestNotice({ noticeUrl: null });

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("getVolcano/wa6")) {
        return Promise.resolve(new Response(JSON.stringify(volcano), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(notice), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/volcano/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();
    expect(body.nvewsThreat).toBeNull();
    // noticeUrl: newestForVolcano.noticeUrl is null, falls back to getVolcano.newest_notice_url (also null)
    expect(body.noticeUrl).toBeNull();
  });

  it("(b) non-volcano peak → 404 'Not a monitored volcano' and fetch NOT called", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/volcano/route");
    // colchuck-peak has no hansVolcanoId
    const res = await GET(new Request("http://t"), ctx("colchuck-peak"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not a monitored volcano" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("(c) unknown slug → 404 Mountain not found", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/volcano/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-peak"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("(d) newestForVolcano failing → defaults to NORMAL/GREEN, still 200", async () => {
    const volcano = makeHansVolcano();

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("getVolcano/wa6")) {
        return Promise.resolve(new Response(JSON.stringify(volcano), { status: 200 }));
      }
      // newestForVolcano throws — route must still return 200 with safe defaults
      return Promise.reject(new Error("network error"));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/volcano/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    // Still 200 — enrichment failure is non-fatal
    expect(res.status).toBe(200);
    const body = await res.json();
    // Safe defaults when newestForVolcano is unavailable
    expect(body.colorCode).toBe("GREEN");
    expect(body.alertLevel).toBe("NORMAL");
    expect(body.provenance.source).toBe("USGS HANS");
  });

  it("(e) newestForVolcano missing fields → defaults NORMAL/GREEN, noticeUrl from getVolcano", async () => {
    const volcano = makeHansVolcano();
    // Notice response exists but lacks the expected fields
    const notice = {};

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("getVolcano/wa6")) {
        return Promise.resolve(new Response(JSON.stringify(volcano), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(notice), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/volcano/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.colorCode).toBe("GREEN");
    expect(body.alertLevel).toBe("NORMAL");
    // noticeUrl falls back to getVolcano.newest_notice_url
    expect(body.noticeUrl).toBe("https://volcanoes.usgs.gov/hans-public/notice/1234");
  });

  it("cache header uses 3600s TTL (volcano status is slow-changing)", async () => {
    const volcano = makeHansVolcano();
    const notice = makeNewestNotice();

    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("getVolcano/wa6")) {
        return Promise.resolve(new Response(JSON.stringify(volcano), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify(notice), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/volcano/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, stale-while-revalidate=86400"
    );
  });
});
