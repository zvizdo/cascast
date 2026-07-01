import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { serializeTimestamps } from "@/lib/serialize";
import { mountainBySlug } from "@/lib/mountains-data";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const snap = await getDb()
    .collection("mountains").doc(slug).collection("snapshots")
    .orderBy("fetchedAt", "desc").limit(240).get();
  const items = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) }));
  return NextResponse.json(serializeTimestamps(items), { headers: { "Cache-Control": "no-store" } });
}
