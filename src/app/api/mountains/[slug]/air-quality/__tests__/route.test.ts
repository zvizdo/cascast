import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/lib/env", () => ({ requireEnv: () => "test-key" }));

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

// AirNow shapes
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

function makeRecord(overrides: Partial<AirNowRecord> = {}): AirNowRecord {
  return {
    DateObserved: "2026-06-20 ",
    HourObserved: 0,
    ReportingArea: "Seattle-Tacoma",
    // ~40 mi from mt-rainier (46.8517, -121.7603)
    Latitude: 47.4502,
    Longitude: -122.3088,
    ParameterName: "PM2.5",
    AQI: 42,
    Category: { Number: 1, Name: "Good" },
    ...overrides,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/mountains/[slug]/air-quality", () => {
  it("(a) returns normalized AirQuality for a current record with 7-day date trend", async () => {
    const currentRecord = makeRecord({ DateObserved: "2026-06-20 " });
    // Historical records: AirNow always returns HourObserved:0 (daily granularity)
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/current/")) {
        return Promise.resolve(
          new Response(JSON.stringify([currentRecord]), { status: 200 })
        );
      }
      // Historical returns a daily record (HourObserved:0 regardless of requested hour)
      return Promise.resolve(
        new Response(JSON.stringify([makeRecord({ HourObserved: 0, AQI: 30 })]), { status: 200 })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/air-quality/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.aqi).toBe(42);
    expect(body.categoryName).toBe("Good");
    expect(body.reportingArea).toBe("Seattle-Tacoma");
    expect(body.parameter).toBe("PM2.5");
    expect(body.provenance.source).toBe("AirNow");
    expect(body.provenance.distanceMi).toBeGreaterThan(0);
    // API key must never appear in the response body
    expect(JSON.stringify(body)).not.toContain("test-key");

    // Assert the current URL contains API_KEY + mountain coords
    const currentUrl: string = (fetchMock.mock.calls as string[][]).find((args) =>
      args[0].includes("/current/")
    )![0];
    expect(currentUrl).toContain("API_KEY=test-key");
    expect(currentUrl).toContain("latitude=46.8517");
    expect(currentUrl).toContain("longitude=-121.7603");

    // Trend items use date (not hour)
    expect(body.trend.length).toBeGreaterThan(0);
    expect(body.trend[0]).toHaveProperty("date");
    expect(body.trend[0]).toHaveProperty("aqi");
    expect(body.trend[0]).not.toHaveProperty("hour");
  });

  it("(b) trend is 7 prior days + today, sorted ascending by date, no duplicates", async () => {
    // Current observation is on 2026-06-20
    const currentRecord = makeRecord({ DateObserved: "2026-06-20 ", AQI: 42 });

    // Historical: return different AQI per date so we can verify ordering
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/current/")) {
        return Promise.resolve(
          new Response(JSON.stringify([currentRecord]), { status: 200 })
        );
      }
      // Extract date from URL (format: &date=YYYY-MM-DDT12-0000)
      const match = /date=(\d{4}-\d{2}-\d{2})T/.exec(url);
      const dateStr = match ? match[1] : "2026-06-01";
      const dayOfMonth = parseInt(dateStr.slice(8), 10);
      return Promise.resolve(
        new Response(JSON.stringify([makeRecord({ DateObserved: `${dateStr} `, AQI: dayOfMonth })]), { status: 200 })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/air-quality/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    const body = await res.json();

    // trend should be ≤ 8 (7 prior days + current day)
    expect(body.trend.length).toBeLessThanOrEqual(8);
    // Must have at least a few entries (7 historical + today)
    expect(body.trend.length).toBeGreaterThanOrEqual(7);

    // Each item has { date, aqi } shape
    for (const item of body.trend) {
      expect(item).toHaveProperty("date");
      expect(item).toHaveProperty("aqi");
      expect(typeof item.date).toBe("string");
      expect(typeof item.aqi).toBe("number");
      // date format YYYY-MM-DD
      expect(item.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    // Sorted ascending by date (oldest first)
    const dates = body.trend.map((p: { date: string }) => p.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);

    // All dates are distinct
    const unique = new Set(dates);
    expect(unique.size).toBe(dates.length);

    // Last entry's date matches current observation's DateObserved (trimmed)
    const lastDate = dates[dates.length - 1];
    expect(lastDate).toBe("2026-06-20");

    // Historical requests use noon (T12-0000) as the stable representative time
    const historicalUrls = (fetchMock.mock.calls as string[][])
      .filter((args) => args[0].includes("/historical/"))
      .map((args) => args[0]);
    expect(historicalUrls.length).toBe(7);
    expect(historicalUrls.every((u) => u.includes("T12-0000"))).toBe(true);
    expect(historicalUrls[0]).toContain("API_KEY=test-key");
  });

  it("(c) one failed historical day is skipped (allSettled), rest still included", async () => {
    const currentRecord = makeRecord({ DateObserved: "2026-06-20 ", AQI: 50 });

    let failCount = 0;
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/current/")) {
        return Promise.resolve(
          new Response(JSON.stringify([currentRecord]), { status: 200 })
        );
      }
      // Fail the first two historical requests (day 7 and day 6 ago)
      if (failCount < 2) {
        failCount++;
        return Promise.reject(new Error("network error"));
      }
      const match = /date=(\d{4}-\d{2}-\d{2})T/.exec(url);
      const dateStr = match ? match[1] : "2026-06-01";
      return Promise.resolve(
        new Response(JSON.stringify([makeRecord({ DateObserved: `${dateStr} `, AQI: 25 })]), { status: 200 })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/air-quality/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    // Route must NOT fail — allSettled absorbs individual failures
    expect(res.status).toBe(200);

    const body = await res.json();
    // 2 failed + 5 succeeded = 5 prior days + today = 6 total
    expect(body.trend.length).toBe(6);
    // The current day is always appended
    const lastDate = body.trend[body.trend.length - 1].date;
    expect(lastDate).toBe("2026-06-20");
  });

  it("(d) unknown slug → 404 Mountain not found", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/air-quality/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-peak"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("(e) empty current array → 404 No air-quality data", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/air-quality/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No air-quality data" });
  });

  it("cache header is set on success", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/current/")) {
        return Promise.resolve(
          new Response(JSON.stringify([makeRecord()]), { status: 200 })
        );
      }
      return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const { GET } = await import("@/app/api/mountains/[slug]/air-quality/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=300, stale-while-revalidate=600"
    );
  });
});
