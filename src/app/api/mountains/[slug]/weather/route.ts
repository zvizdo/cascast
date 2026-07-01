import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { readCombinedBlob } from "@/lib/storage";
import { mountainBySlug } from "@/lib/mountains-data";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const cond = await getDb().collection("mountainConditions").doc(slug).get();
  if (!cond.exists) return NextResponse.json({ error: "No forecast yet" }, { status: 404 });
  const { forecastBlobPath } = cond.data() as { forecastBlobPath: string };

  const blob = await readCombinedBlob(forecastBlobPath);
  if (!blob) return NextResponse.json({ error: "No forecast yet" }, { status: 404 });
  return NextResponse.json(blob, { headers: { "Cache-Control": CACHE } });
}
