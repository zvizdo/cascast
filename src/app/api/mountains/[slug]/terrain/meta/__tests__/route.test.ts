import { describe, it, expect, vi, beforeEach } from "vitest";

const readTerrainMeta = vi.fn();
vi.mock("@/lib/storage", () => ({ readTerrainMeta }));

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

beforeEach(() => { readTerrainMeta.mockReset(); });

describe("GET /api/mountains/[slug]/terrain/meta", () => {
  it("returns 404 for an unknown slug without touching storage", async () => {
    const { GET } = await import("@/app/api/mountains/[slug]/terrain/meta/route");
    const res = await GET(new Request("http://t"), ctx("nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(readTerrainMeta).not.toHaveBeenCalled();
  });

  it("returns the metadata JSON when present", async () => {
    const meta = { slug: "mt-rainier", exaggeration: 1.6 };
    readTerrainMeta.mockResolvedValue(meta);
    const { GET } = await import("@/app/api/mountains/[slug]/terrain/meta/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
    expect(await res.json()).toEqual(meta);
  });

  it("returns 404 when the metadata asset is absent", async () => {
    readTerrainMeta.mockResolvedValue(null);
    const { GET } = await import("@/app/api/mountains/[slug]/terrain/meta/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No terrain metadata" });
  });
});
