import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/env", () => ({ requireEnv: () => "test-key" }));

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

// NPS alert shape returned by the API
interface NpsAlert {
  id: string;
  title: string;
  description: string;
  category: string;
  url: string;
  parkCode: string;
  lastIndexedDate: string;
}

function makeAlert(overrides: Partial<NpsAlert> = {}): NpsAlert {
  return {
    id: "abc123",
    title: "Trail Closure",
    description: "Paradise area trails closed due to snow.",
    category: "Closure",
    url: "https://www.nps.gov/mora/planyourvisit/trail-closure.htm",
    parkCode: "mora",
    lastIndexedDate: "2026-06-20T00:00:00Z",
    ...overrides,
  };
}

function makeNpsResponse(data: NpsAlert[], total = data.length) {
  return { data, total, limit: 50, start: 0 };
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/mountains/[slug]/park-alerts", () => {
  it("(a) park peak + mocked alerts → mapped ParkAlerts with provenance.source=NPS; key in header not body", async () => {
    const alerts = [
      makeAlert({ category: "Closure", title: "Trail Closure" }),
      makeAlert({ id: "def456", category: "Danger", title: "Bear Activity", url: "https://www.nps.gov/mora/bear.htm" }),
    ];

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeNpsResponse(alerts)), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/park-alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.alerts).toHaveLength(2);
    expect(body.alerts[0].category).toBe("Closure");
    expect(body.alerts[0].title).toBe("Trail Closure");
    expect(body.alerts[0].url).toBe("https://www.nps.gov/mora/planyourvisit/trail-closure.htm");
    expect(body.alerts[1].category).toBe("Danger");
    expect(body.provenance.source).toBe("NPS");
    expect(body.provenance.observedAt).toBeDefined();

    // Key must NOT appear in the response body (key-absence test)
    expect(JSON.stringify(body)).not.toContain("test-key");

    // Assert the request carries X-Api-Key header equal to the mocked key
    // and parkCode=mora in the URL
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit & { headers?: Record<string, string> }];
    expect(calledUrl).toContain("parkCode=mora");
    expect((calledOpts?.headers as Record<string, string>)?.["X-Api-Key"]).toBe("test-key");
  });

  it("(b) non-park peak (empty npsParkCode) → 404 and fetch NOT called", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/park-alerts/route");
    // mt-baker has no npsParkCode
    const res = await GET(new Request("http://t"), ctx("mt-baker"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No park alerts" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("(d) empty data array → alerts===[], 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeNpsResponse([])), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/park-alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts).toEqual([]);
    expect(body.provenance.source).toBe("NPS");
  });

  it("(e) unknown slug → 404 Mountain not found; fetch NOT called", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/park-alerts/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-peak"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cache header is set on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(makeNpsResponse([])), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/park-alerts/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });
});
