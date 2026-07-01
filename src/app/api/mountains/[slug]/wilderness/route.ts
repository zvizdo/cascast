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

  const cached = await readCachedGeo(slug, "wilderness");
  if (cached && cacheFresh(cached.cachedAt, TTL)) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": CACHE } });
  }

  try {
    const fc = await fetchJson<GeoJSON.FeatureCollection>(
      edwQueryUrl("EDW_Wilderness_01", 0, bbox)
    );

    const features: GeoJSON.Feature[] = (fc.features ?? []).map(
      (f: GeoJSON.Feature): GeoJSON.Feature => ({
        ...f,
        properties: {
          ...f.properties,
          name:
            (f.properties?.WILDERNESSNAME as string | undefined) ??
            (f.properties?.wildernessname as string | undefined) ??
            (f.properties?.NAME as string | undefined) ??
            "",
        },
      })
    );

    const normalized: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    await writeCachedGeo(slug, "wilderness", normalized);
    return NextResponse.json(normalized, { headers: { "Cache-Control": CACHE } });
  } catch {
    return NextResponse.json(EMPTY_FC, { headers: { "Cache-Control": CACHE } });
  }
}
