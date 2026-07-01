import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { serializeTimestamps } from "@/lib/serialize";
import { mountainBySlug } from "@/lib/mountains-data";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const { nwacZoneId } = mountain;
  // Out-of-NWAC-region peaks (e.g. Mount Whitney) have no zone — report off-season.
  if (!nwacZoneId) return NextResponse.json({ season: "summer", zoneId: "" }, { headers: { "Cache-Control": CACHE } });

  const db = getDb();
  const fc = await db.collection("nwacForecasts").doc(nwacZoneId).get();
  if (!fc.exists) return NextResponse.json({ season: "summer", zoneId: nwacZoneId }, { headers: { "Cache-Control": CACHE } });
  const data = fc.data() as { season?: string };
  if (data.season === "summer") return NextResponse.json(serializeTimestamps({ ...data, season: "summer" }), { headers: { "Cache-Control": CACHE } });
  return NextResponse.json(serializeTimestamps(data), { headers: { "Cache-Control": CACHE } });
}
