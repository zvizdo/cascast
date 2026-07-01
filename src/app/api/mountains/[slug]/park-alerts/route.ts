import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { requireEnv } from "@/lib/env";
import { fetchJson } from "@/lib/hazards/fetch";
import type { ParkAlert, ParkAlerts } from "@/lib/hazards/types";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
type Params = { params: Promise<{ slug: string }> };

interface NpsAlertRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  url: string;
  parkCode: string;
  lastIndexedDate: string;
}

interface NpsAlertsResponse {
  data: NpsAlertRecord[];
  total: number;
  limit: number;
  start: number;
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });

  if (!mountain.npsParkCode) {
    return NextResponse.json({ error: "No park alerts" }, { status: 404 });
  }

  const key = requireEnv("NPS_API_KEY");
  const code = mountain.npsParkCode;

  const response = await fetchJson<NpsAlertsResponse>(
    `https://developer.nps.gov/api/v1/alerts?parkCode=${code}&limit=50`,
    { headers: { "X-Api-Key": key } },
  );

  const alerts: ParkAlert[] = response.data.map((r) => ({
    category: r.category,
    title: r.title,
    description: r.description,
    url: r.url,
    parkCode: r.parkCode,
    lastIndexedDate: r.lastIndexedDate,
  }));

  const body: ParkAlerts = {
    alerts,
    provenance: {
      source: "NPS",
      observedAt: new Date().toISOString(),
    },
  };

  return NextResponse.json(body, { headers: { "Cache-Control": CACHE } });
}
