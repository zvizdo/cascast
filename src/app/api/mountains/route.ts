import { NextResponse } from "next/server";
import { mountainsByName } from "@/lib/mountains-data";

// Catalog is static reference data — served from the in-memory constant (no
// Firestore reads). Firestore's `mountains` collection still backs the Python
// functions; the two are seeded from the same source file.
const CACHE = "public, max-age=300, stale-while-revalidate=600";

export async function GET() {
  return NextResponse.json(mountainsByName(), { headers: { "Cache-Control": CACHE } });
}
