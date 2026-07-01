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
  const station = await getDb().collection("snotelData").doc(slug).get();
  if (!station.exists) return NextResponse.json({ error: "No SNOTEL data yet" }, { status: 404 });
  return NextResponse.json(serializeTimestamps(station.data()), { headers: { "Cache-Control": CACHE } });
}
