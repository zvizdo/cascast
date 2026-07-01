import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { readCachedGeo, writeCachedGeo } from "@/lib/storage";
import { edwQueryUrl, cacheFresh, EMPTY_FC } from "@/lib/geo";
import { fetchJson } from "@/lib/hazards/fetch";
import type { BBox } from "@/lib/geo";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
const TTL = 864e5; // 1 day

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });

  const bbox: BBox = mountain.mapBbox ?? {
    west: mountain.lng - 0.08,
    south: mountain.lat - 0.08,
    east: mountain.lng + 0.08,
    north: mountain.lat + 0.08,
  };

  const cached = await readCachedGeo(slug, "roads");
  if (cached && cacheFresh(cached.cachedAt, TTL)) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": CACHE } });
  }

  try {
    const [fc0, fc1] = await Promise.all([
      fetchJson<GeoJSON.FeatureCollection>(edwQueryUrl("EDW_RoadBasic_01", 0, bbox)),
      fetchJson<GeoJSON.FeatureCollection>(edwQueryUrl("EDW_RoadBasic_01", 1, bbox)),
    ]);

    const normalizeFeature = (
      f: GeoJSON.Feature,
      closed: boolean,
    ): GeoJSON.Feature => ({
      ...f,
      properties: {
        ...f.properties,
        name:
          (f.properties?.NAME as string | undefined) ??
          (f.properties?.name as string | undefined) ??
          "",
        closed,
      },
    });

    const features: GeoJSON.Feature[] = [
      ...(fc0.features ?? []).map((f) => normalizeFeature(f, false)),
      ...(fc1.features ?? []).map((f) => normalizeFeature(f, true)),
    ];

    const merged: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    await writeCachedGeo(slug, "roads", merged);
    return NextResponse.json(merged, { headers: { "Cache-Control": CACHE } });
  } catch {
    return NextResponse.json(EMPTY_FC, { headers: { "Cache-Control": CACHE } });
  }
}
