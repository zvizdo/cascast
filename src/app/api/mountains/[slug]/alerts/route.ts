import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { stormAlerts } from "@/lib/hazards/sources";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });

  // ⚠️ LIVE-VERIFY NOTE: layer 1 of SPC_wx_outlks MapServer is asserted to be the Day-1
  // categorical outlook — confirm at:
  // https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer
  // NWS field names (event/severity/urgency/headline/onset/expires/areaDesc) are live-verified
  // during Task 10 deploy against real NWS GeoJSON responses.
  const body = await stormAlerts(mountain.lat, mountain.lng);

  return NextResponse.json(body, { headers: { "Cache-Control": CACHE } });
}
