import { describe, it, expect, vi, beforeEach } from "vitest";

const readTerrainModel = vi.fn();
vi.mock("@/lib/storage", () => ({ readTerrainModel }));

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

beforeEach(() => { readTerrainModel.mockReset(); });

describe("GET /api/mountains/[slug]/terrain/model", () => {
  it("returns 404 for an unknown slug without touching storage", async () => {
    const { GET } = await import("@/app/api/mountains/[slug]/terrain/model/route");
    const res = await GET(new Request("http://t"), ctx("nope"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(readTerrainModel).not.toHaveBeenCalled();
  });

  it("streams the GLB bytes with the model content type when present", async () => {
    readTerrainModel.mockResolvedValue({ buffer: Buffer.from("glb"), contentType: "model/gltf-binary" });
    const { GET } = await import("@/app/api/mountains/[slug]/terrain/model/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("model/gltf-binary");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600, stale-while-revalidate=86400");
    expect(Buffer.from(await res.arrayBuffer()).toString()).toBe("glb");
  });

  it("returns 404 when the model asset is absent", async () => {
    readTerrainModel.mockResolvedValue(null);
    const { GET } = await import("@/app/api/mountains/[slug]/terrain/model/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "No terrain model" });
  });
});
