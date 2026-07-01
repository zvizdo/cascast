import "server-only";
import { Storage } from "@google-cloud/storage";
import { requireEnv } from "@/lib/env";
import type { CombinedForecastBlob } from "@/lib/types";

let storage: Storage | undefined;
function getStorage(): Storage {
  if (!storage) storage = new Storage({ projectId: requireEnv("GCP_PROJECT") });
  return storage;
}

export async function readCombinedBlob(blobPath: string): Promise<CombinedForecastBlob | null> {
  const f = getStorage().bucket(requireEnv("GCS_BUCKET_WEATHER")).file(blobPath);
  const [present] = await f.exists();
  if (!present) return null;
  const [contents] = await f.download();
  return JSON.parse(contents.toString("utf8")) as CombinedForecastBlob;
}

export async function readSatelliteImage(
  mountainId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const f = getStorage().bucket(requireEnv("GCS_BUCKET_SATELLITE")).file(`${mountainId}/scene.jpg`);
  const [present] = await f.exists();
  if (!present) return null;
  const [contents] = await f.download();
  return { buffer: contents, contentType: "image/jpeg" };
}

export async function readTerrainModel(
  mountainId: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const f = getStorage().bucket(requireEnv("GCS_BUCKET_TERRAIN")).file(`${mountainId}/terrain.glb`);
  const [present] = await f.exists();
  if (!present) return null;
  const [contents] = await f.download();
  return { buffer: contents, contentType: "model/gltf-binary" };
}

export async function readTerrainMeta(mountainId: string): Promise<unknown | null> {
  const f = getStorage().bucket(requireEnv("GCS_BUCKET_TERRAIN")).file(`${mountainId}/metadata.json`);
  const [present] = await f.exists();
  if (!present) return null;
  const [contents] = await f.download();
  return JSON.parse(contents.toString("utf8"));
}

export async function writeCachedGeo(slug: string, layer: string, fc: unknown): Promise<void> {
  const f = getStorage().bucket(requireEnv("GCS_BUCKET_GEO")).file(`${slug}/${layer}.geojson`);
  await f.save(JSON.stringify(fc), {
    contentType: "application/json",
    metadata: { metadata: { cachedAt: new Date().toISOString() } },
  });
}

export async function readCachedGeo(
  slug: string,
  layer: string,
): Promise<{ data: unknown; cachedAt: string } | null> {
  const f = getStorage().bucket(requireEnv("GCS_BUCKET_GEO")).file(`${slug}/${layer}.geojson`);
  const [present] = await f.exists();
  if (!present) return null;
  const [meta] = await f.getMetadata();
  const [contents] = await f.download();
  return {
    data: JSON.parse(contents.toString("utf8")),
    cachedAt: (meta.metadata?.cachedAt as string) ?? meta.updated,
  };
}
