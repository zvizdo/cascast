import { NextResponse } from "next/server";
import { readSatelliteImage } from "@/lib/storage";
import { mountainBySlug } from "@/lib/mountains-data";

const CACHE = "public, max-age=3600, stale-while-revalidate=86400";
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const image = await readSatelliteImage(slug);
  if (!image) return NextResponse.json({ error: "No scene image" }, { status: 404 });

  return new NextResponse(image.buffer as unknown as BodyInit, {
    status: 200,
    headers: { "Content-Type": image.contentType, "Cache-Control": CACHE },
  });
}
