import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { readCachedGeo, writeCachedGeo } from "@/lib/storage";
import { overpassTrailsQuery, osmToGeoJson, cacheFresh, EMPTY_FC } from "@/lib/geo";
import type { BBox } from "@/lib/geo";

const CACHE = "public, max-age=300, stale-while-revalidate=600";

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

  const cached = await readCachedGeo(slug, "trails");
  if (cached && cacheFresh(cached.cachedAt, 7 * 864e5)) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": CACHE } });
  }

  try {
    const query = overpassTrailsQuery(bbox);
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent":
          process.env.NWS_CONTACT ??
          "MountainWeatherman/1.0 (+https://github.com/mountain-weatherman)",
      },
      body: `data=${encodeURIComponent(query)}`,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const fc = osmToGeoJson(await res.json());
    await writeCachedGeo(slug, "trails", fc);
    return NextResponse.json(fc, { headers: { "Cache-Control": CACHE } });
  } catch {
    return NextResponse.json(EMPTY_FC, { headers: { "Cache-Control": CACHE } });
  }
}
