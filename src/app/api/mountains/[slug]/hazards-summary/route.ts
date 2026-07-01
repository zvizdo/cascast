import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { requireEnv } from "@/lib/env";
import { airNowCurrent, stormAlerts } from "@/lib/hazards/sources";
import type { HazardsSummary } from "@/lib/hazards/types";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });

  const { lat, lng } = mountain;
  const key = requireEnv("AIRNOW_API_KEY");

  // Both halves degrade independently — a failure in either leaves the other intact.
  const [aqiResult, stormResult] = await Promise.allSettled([
    airNowCurrent(lat, lng, key),
    stormAlerts(lat, lng),
  ]);

  const aqiData =
    aqiResult.status === "fulfilled" && aqiResult.value !== null
      ? { value: aqiResult.value.aqi, category: aqiResult.value.categoryName }
      : null;

  let stormData: { active: boolean; label: string } | null = null;
  if (stormResult.status === "fulfilled") {
    const sa = stormResult.value;
    // Label priority: SPC label2 → worst NWS event → "No active storm"
    const label = sa.spc?.label2 ?? sa.nws[0]?.event ?? "No active storm";
    stormData = { active: sa.stormActive, label };
  }

  const body: HazardsSummary = {
    aqi: aqiData,
    storm: stormData,
    provenance: {
      source: "AirNow + NWS/SPC",
      observedAt: new Date().toISOString(),
    },
  };

  return NextResponse.json(body, { headers: { "Cache-Control": CACHE } });
}
