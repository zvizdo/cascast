import { describe, it, expect, vi } from "vitest";

const readSatelliteImage = vi.fn();
vi.mock("@/lib/storage", () => ({ readSatelliteImage: (...args: unknown[]) => readSatelliteImage(...args) }));

function ctx(slug: string) { return { params: Promise.resolve({ slug }) }; }

describe("GET /api/mountains/[slug]/satellite/image", () => {
  it("returns 404 when no scene image exists", async () => {
    readSatelliteImage.mockReset();
    readSatelliteImage.mockResolvedValue(null);
    const { GET } = await import("@/app/api/mountains/[slug]/satellite/image/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(404);
    expect(readSatelliteImage).toHaveBeenCalledWith("mt-rainier");
  });

  it("streams the JPEG with image/jpeg + cache headers", async () => {
    readSatelliteImage.mockReset();
    readSatelliteImage.mockResolvedValue({ buffer: Buffer.from([0xff, 0xd8]), contentType: "image/jpeg" });
    const { GET } = await import("@/app/api/mountains/[slug]/satellite/image/route");
    const res = await GET(new Request("http://t"), ctx("mt-rainier"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
    expect(res.headers.get("Cache-Control")).toContain("max-age");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body[0]).toBe(0xff);
  });

  it("returns 404 Mountain not found for an unknown slug", async () => {
    readSatelliteImage.mockReset();
    const { GET } = await import("@/app/api/mountains/[slug]/satellite/image/route");
    const res = await GET(new Request("http://t"), ctx("not-a-real-mountain"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Mountain not found" });
    expect(readSatelliteImage).not.toHaveBeenCalled();
  });
});
