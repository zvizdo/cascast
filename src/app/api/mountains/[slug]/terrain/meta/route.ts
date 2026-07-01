import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { readTerrainMeta } from "@/lib/storage";

const CACHE = "public, max-age=3600, stale-while-revalidate=86400";
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  if (!mountainBySlug(slug)) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const meta = await readTerrainMeta(slug);
  if (!meta) return NextResponse.json({ error: "No terrain metadata" }, { status: 404 });
  return NextResponse.json(meta, { headers: { "Cache-Control": CACHE } });
}
