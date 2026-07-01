import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { readTerrainModel } from "@/lib/storage";

// Cacheable but revalidated daily so a re-bake (palette/geometry change) propagates — NOT
// immutable, which would pin stale terrain on clients forever.
const CACHE = "public, max-age=3600, stale-while-revalidate=86400";
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  if (!mountainBySlug(slug)) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const model = await readTerrainModel(slug);
  if (!model) return NextResponse.json({ error: "No terrain model" }, { status: 404 });
  return new NextResponse(model.buffer as unknown as BodyInit, {
    status: 200,
    headers: { "Content-Type": model.contentType, "Cache-Control": CACHE },
  });
}
