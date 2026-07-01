// lib/__tests__/storage.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const download = vi.fn();
const exists = vi.fn();
const save = vi.fn();
const getMetadata = vi.fn();
const file = vi.fn(() => ({ download, exists, save, getMetadata }));
const bucket = vi.fn(() => ({ file }));
vi.mock("@google-cloud/storage", () => ({ Storage: vi.fn(() => ({ bucket })) }));

describe("lib/storage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    download.mockReset(); exists.mockReset(); save.mockReset(); getMetadata.mockReset();
    file.mockClear(); bucket.mockClear();
    process.env.GCP_PROJECT = "mountain-weatherman-app";
    process.env.GCS_BUCKET_WEATHER = "mountain-weatherman-app-weather-data";
    process.env.GCS_BUCKET_TERRAIN = "mountain-weatherman-app-terrain";
    process.env.GCS_BUCKET_GEO = "mountain-weatherman-app-geo";
  });

  it("downloads and parses the combined blob from the weather bucket", async () => {
    const blob = { mountainId: "mt-rainier", timezone: "America/Los_Angeles", fetchedAt: "2026-08-01T00:00:00Z", hrrr: null, gfs: null, ecmwf: null };
    exists.mockResolvedValue([true]);
    download.mockResolvedValue([Buffer.from(JSON.stringify(blob), "utf8")]);
    const { readCombinedBlob } = await import("@/lib/storage");
    const result = await readCombinedBlob("forecasts/mt-rainier/2026-08-01/0000-combined.json");
    expect(bucket).toHaveBeenCalledWith("mountain-weatherman-app-weather-data");
    expect(file).toHaveBeenCalledWith("forecasts/mt-rainier/2026-08-01/0000-combined.json");
    expect(result).toEqual(blob);
  });

  it("returns null when the object does not exist", async () => {
    exists.mockResolvedValue([false]);
    const { readCombinedBlob } = await import("@/lib/storage");
    expect(await readCombinedBlob("forecasts/missing.json")).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it("reuses a single Storage client", async () => {
    const { Storage } = await import("@google-cloud/storage");
    exists.mockResolvedValue([true]);
    download.mockResolvedValue([Buffer.from("{}", "utf8")]);
    const { readCombinedBlob } = await import("@/lib/storage");
    await readCombinedBlob("a.json"); await readCombinedBlob("b.json");
    expect((Storage as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("reads the terrain GLB from the terrain bucket with the right content type", async () => {
    exists.mockResolvedValue([true]);
    download.mockResolvedValue([Buffer.from("glb-bytes")]);
    const { readTerrainModel } = await import("@/lib/storage");
    const result = await readTerrainModel("mt-rainier");
    expect(bucket).toHaveBeenCalledWith("mountain-weatherman-app-terrain");
    expect(file).toHaveBeenCalledWith("mt-rainier/terrain.glb");
    expect(result).toEqual({ buffer: Buffer.from("glb-bytes"), contentType: "model/gltf-binary" });
  });

  it("returns null when the terrain GLB is absent", async () => {
    exists.mockResolvedValue([false]);
    const { readTerrainModel } = await import("@/lib/storage");
    expect(await readTerrainModel("mt-rainier")).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it("reads and parses the terrain metadata JSON", async () => {
    const meta = { slug: "mt-rainier", exaggeration: 1.6 };
    exists.mockResolvedValue([true]);
    download.mockResolvedValue([Buffer.from(JSON.stringify(meta), "utf8")]);
    const { readTerrainMeta } = await import("@/lib/storage");
    const result = await readTerrainMeta("mt-rainier");
    expect(file).toHaveBeenCalledWith("mt-rainier/metadata.json");
    expect(result).toEqual(meta);
  });

  it("returns null when the terrain metadata is absent", async () => {
    exists.mockResolvedValue([false]);
    const { readTerrainMeta } = await import("@/lib/storage");
    expect(await readTerrainMeta("mt-rainier")).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });

  it("writeCachedGeo saves to the geo bucket with the correct path and cachedAt metadata", async () => {
    save.mockResolvedValue(undefined);
    const { writeCachedGeo } = await import("@/lib/storage");
    const fc = { type: "FeatureCollection", features: [] };
    await writeCachedGeo("mt-rainier", "trails", fc);
    expect(bucket).toHaveBeenCalledWith("mountain-weatherman-app-geo");
    expect(file).toHaveBeenCalledWith("mt-rainier/trails.geojson");
    expect(save).toHaveBeenCalledTimes(1);
    const [body, opts] = save.mock.calls[0];
    expect(body).toBe(JSON.stringify(fc));
    expect(opts.contentType).toBe("application/json");
    expect(opts.metadata?.metadata?.cachedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("readCachedGeo returns parsed data and cachedAt when the object exists", async () => {
    const fc = { type: "FeatureCollection", features: [{ id: 1 }] };
    exists.mockResolvedValue([true]);
    getMetadata.mockResolvedValue([{ metadata: { cachedAt: "2026-06-20T12:00:00.000Z" }, updated: "2026-06-20T11:00:00.000Z" }]);
    download.mockResolvedValue([Buffer.from(JSON.stringify(fc), "utf8")]);
    const { readCachedGeo } = await import("@/lib/storage");
    const result = await readCachedGeo("mt-rainier", "trails");
    expect(bucket).toHaveBeenCalledWith("mountain-weatherman-app-geo");
    expect(file).toHaveBeenCalledWith("mt-rainier/trails.geojson");
    expect(result).toEqual({ data: fc, cachedAt: "2026-06-20T12:00:00.000Z" });
  });

  it("readCachedGeo falls back to meta.updated when cachedAt custom metadata is absent", async () => {
    const fc = { type: "FeatureCollection", features: [] };
    exists.mockResolvedValue([true]);
    getMetadata.mockResolvedValue([{ updated: "2026-06-20T11:00:00.000Z" }]);
    download.mockResolvedValue([Buffer.from(JSON.stringify(fc), "utf8")]);
    const { readCachedGeo } = await import("@/lib/storage");
    const result = await readCachedGeo("mt-rainier", "trails");
    expect(result).toEqual({ data: fc, cachedAt: "2026-06-20T11:00:00.000Z" });
  });

  it("readCachedGeo returns null when the geo object does not exist", async () => {
    exists.mockResolvedValue([false]);
    const { readCachedGeo } = await import("@/lib/storage");
    expect(await readCachedGeo("mt-rainier", "trails")).toBeNull();
    expect(download).not.toHaveBeenCalled();
    expect(getMetadata).not.toHaveBeenCalled();
  });
});
