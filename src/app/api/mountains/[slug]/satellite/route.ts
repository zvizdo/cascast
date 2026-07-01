import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { serializeTimestamps } from "@/lib/serialize";
import type { SatelliteCache } from "@/lib/types";
import { mountainBySlug } from "@/lib/mountains-data";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const cache = await getDb().collection("satelliteCache").doc(slug).get();
  const data = (cache.exists ? (cache.data() as SatelliteCache) : null);
  return NextResponse.json(serializeTimestamps(data), { headers: { "Cache-Control": CACHE } });
}
