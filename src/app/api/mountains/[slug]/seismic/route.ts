import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { fetchJson } from "@/lib/hazards/fetch";
import type { SeismicSummary, QuakeEvent } from "@/lib/hazards/types";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
const EVENTS_CAP = 15;

type Params = { params: Promise<{ slug: string }> };

interface ComCatProperties {
  mag: number;
  place: string;
  time: number; // epoch ms
  type: string;
  status: string;
}
interface ComCatFeature {
  properties: ComCatProperties;
  geometry: { coordinates: [number, number, number] }; // [lng, lat, depthKm]
}
interface ComCatCollection {
  features: ComCatFeature[];
  metadata: { count: number };
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });

  const { lat, lng } = mountain;
  const now = new Date();
  const starttime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const url =
    `https://earthquake.usgs.gov/fdsnws/event/1/query` +
    `?format=geojson&latitude=${lat}&longitude=${lng}` +
    `&maxradiuskm=30&minmagnitude=0&starttime=${starttime}&orderby=time`;

  const data = await fetchJson<ComCatCollection>(url);
  const features = data.features ?? [];

  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const allEvents: QuakeEvent[] = features.map((f) => ({
    mag: f.properties.mag,
    place: f.properties.place,
    time: new Date(f.properties.time).toISOString(),
    depthKm: f.geometry.coordinates[2],
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    type: f.properties.type,
    status: f.properties.status,
  }));

  const count30d = allEvents.length;
  const count7d = features.filter((f) => f.properties.time >= sevenDaysAgoMs).length;
  const largestMag = count30d > 0 ? Math.max(...features.map((f) => f.properties.mag)) : null;
  const swarm = count7d > (count30d / 30) * 7 * 2;

  // USGS orderby=time returns most-recent first; cap to EVENTS_CAP
  const events = allEvents.slice(0, EVENTS_CAP);

  const truncated = count30d > EVENTS_CAP;
  const note = truncated ? `showing ${EVENTS_CAP} of ${count30d} events` : undefined;

  const body: SeismicSummary = {
    count30d,
    count7d,
    largestMag,
    swarm,
    events,
    provenance: {
      source: "USGS ComCat",
      observedAt: now.toISOString(),
      ...(note ? { note } : {}),
    },
  };

  return NextResponse.json(body, { headers: { "Cache-Control": CACHE } });
}
