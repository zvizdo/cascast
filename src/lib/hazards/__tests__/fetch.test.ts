import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson, haversineMiles } from "@/lib/hazards/fetch";

afterEach(() => vi.unstubAllGlobals());

describe("haversineMiles", () => {
  it("computes a known distance (Sea-Tac ~ Rainier ≈ 44 mi)", () => {
    const d = haversineMiles(47.4502, -122.3088, 46.8517, -121.7603);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(50);
  });
  it("is zero for the same point", () => {
    expect(haversineMiles(46.85, -121.76, 46.85, -121.76)).toBe(0);
  });
});

describe("fetchJson", () => {
  it("parses JSON on 200 and forwards headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchJson<{ ok: number }>("http://x", { headers: { "User-Agent": "UA" } });
    expect(out.ok).toBe(1);
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toBe("UA");
  });
  it("throws on a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    await expect(fetchJson("http://x")).rejects.toThrow(/Upstream 503/);
  });
});
