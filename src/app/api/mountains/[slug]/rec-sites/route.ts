import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { readCachedGeo, writeCachedGeo } from "@/lib/storage";
import { edwQueryUrl, cacheFresh, EMPTY_FC } from "@/lib/geo";
import { fetchJson } from "@/lib/hazards/fetch";
import type { BBox } from "@/lib/geo";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
const TTL = 864e5; // 1 day

type Params = { params: Promise<{ slug: string }> };

/** Derive the closed flag defensively from EDW closure fields.
 * ArcGIS `f=geojson` returns lowercase field names; uppercase kept as fallback. */
function isClosed(props: Record<string, unknown>): boolean {
  // Truthy closure_reason → closed
  if (props.closure_reason ?? props.CLOSURE_REASON) return true;

  // unit_closure_end_date exists and is a future date → closed
  const endDate = props.unit_closure_end_date ?? props.UNIT_CLOSURE_END_DATE;
  if (endDate != null) {
    try {
      const parsed = Date.parse(String(endDate));
      if (!isNaN(parsed) && parsed > Date.now()) return true;
    } catch {
      // unparseable → not closed
    }
  }

  return false;
}

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

  const cached = await readCachedGeo(slug, "rec-sites");
  if (cached && cacheFresh(cached.cachedAt, TTL)) {
    return NextResponse.json(cached.data, { headers: { "Cache-Control": CACHE } });
  }

  try {
    const fc = await fetchJson<GeoJSON.FeatureCollection>(
      edwQueryUrl("EDW_InfraRecreationSites_01", 0, bbox)
    );

    const features: GeoJSON.Feature[] = (fc.features ?? []).map(
      (f: GeoJSON.Feature): GeoJSON.Feature => {
        const p = (f.properties ?? {}) as Record<string, unknown>;
        return {
          ...f,
          properties: {
            ...p,
            name:
              (p.public_site_name as string | undefined) ??
              (p.recarea_name as string | undefined) ??
              (p.site_name as string | undefined) ??
              (p.PUBLIC_SITE_NAME as string | undefined) ??
              (p.SITE_NAME as string | undefined) ??
              (p.UNIT_NAME as string | undefined) ??
              (p.NAME as string | undefined) ??
              "",
            closed: isClosed(p),
          },
        };
      }
    );

    const normalized: GeoJSON.FeatureCollection = { type: "FeatureCollection", features };
    await writeCachedGeo(slug, "rec-sites", normalized);
    return NextResponse.json(normalized, { headers: { "Cache-Control": CACHE } });
  } catch {
    return NextResponse.json(EMPTY_FC, { headers: { "Cache-Control": CACHE } });
  }
}
