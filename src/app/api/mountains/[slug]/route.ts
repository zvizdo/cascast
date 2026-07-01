import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { readCombinedBlob } from "@/lib/storage";
import { serializeTimestamps } from "@/lib/serialize";
import { mountainBySlug } from "@/lib/mountains-data";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
const STALE_MS = 3 * 60 * 60 * 1000; // ~3h (spec §4)
type Params = { params: Promise<{ slug: string }> };

function toMillis(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return isNaN(t) ? null : t;
  }
  if (typeof v === "object") {
    const o = v as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof o.toDate === "function") return o.toDate().getTime();
    const s = o._seconds ?? o.seconds;
    if (typeof s === "number") return s * 1000;
  }
  return null;
}

// Accepts an ISO string OR a raw Firestore Timestamp ({_seconds}/{toDate}) since
// this runs on doc data before response serialization.
function isStale(updatedAt: unknown): boolean {
  const ms = toMillis(updatedAt);
  if (ms === null) return true;
  return Date.now() - ms > STALE_MS;
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const db = getDb();

  const condDoc = await db.collection("mountainConditions").doc(slug).get();
  const conditions = condDoc.exists
    ? (condDoc.data() as { updatedAt?: unknown; forecastBlobPath?: string })
    : null;

  const satDoc = await db.collection("satelliteCache").doc(slug).get();
  const satellite = satDoc.exists ? satDoc.data() : null;

  // Calm-layer feeds for the browse current view (contract §7).
  const weather = conditions?.forecastBlobPath
    ? await readCombinedBlob(conditions.forecastBlobPath)
    : null;

  const nwacDoc = mountain.nwacZoneId
    ? await db.collection("nwacForecasts").doc(mountain.nwacZoneId).get()
    : null;
  const nwac = nwacDoc?.exists ? nwacDoc.data() : null;

  const snotelDoc = await db.collection("snotelData").doc(slug).get();
  const snotel = snotelDoc.exists ? snotelDoc.data() : null;

  const stale = isStale(conditions?.updatedAt);

  return NextResponse.json(
    serializeTimestamps({ mountain, conditions, satellite, weather, nwac, snotel, stale }),
    { headers: { "Cache-Control": CACHE } },
  );
}
