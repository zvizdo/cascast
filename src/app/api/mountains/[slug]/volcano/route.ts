import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { fetchJson } from "@/lib/hazards/fetch";
import type { VolcanoStatus } from "@/lib/hazards/types";

// Volcano status changes rarely (alert level shifts are significant events).
// Use a 1h TTL with a 24h stale-while-revalidate so clients see updates promptly
// while avoiding hammering HANS on every page load.
const CACHE = "public, max-age=3600, stale-while-revalidate=86400";

const HANS_BASE = "https://volcanoes.usgs.gov/hans-public/api/volcano";

type Params = { params: Promise<{ slug: string }> };

interface HansVolcanoRecord {
  volcano_name: string;
  nvews_threat?: string | null;
  newest_notice_url?: string | null;
}

// Live shape of newestForVolcano/{id} — verified 2026-06-20.
// alertLevel and colorCode live here, NOT in getVolcano.
interface HansNewestNotice {
  noticeHighestAlertLevel?: string | null;
  noticeHighestColorCode?: string | null;
  noticeUrl?: string | null;
  [key: string]: unknown;
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });

  if (!mountain.hansVolcanoId) {
    return NextResponse.json({ error: "Not a monitored volcano" }, { status: 404 });
  }

  const id = mountain.hansVolcanoId;
  const record = await fetchJson<HansVolcanoRecord>(`${HANS_BASE}/getVolcano/${id}`);

  // Fetch alert level + color code from newestForVolcano (not present in getVolcano live response).
  // Default to background level (NORMAL/GREEN) if the call fails or the fields are missing.
  let alertLevel = "NORMAL";
  let colorCode = "GREEN";
  let noticeUrl: string | null = record.newest_notice_url ?? null;

  try {
    const notice = await fetchJson<HansNewestNotice>(`${HANS_BASE}/newestForVolcano/${id}`);
    if (typeof notice?.noticeHighestAlertLevel === "string") {
      alertLevel = notice.noticeHighestAlertLevel;
    }
    if (typeof notice?.noticeHighestColorCode === "string") {
      colorCode = notice.noticeHighestColorCode;
    }
    // Prefer notice URL from newestForVolcano; fall back to getVolcano value
    if (typeof notice?.noticeUrl === "string") {
      noticeUrl = notice.noticeUrl;
    }
  } catch {
    // Degrade gracefully — alertLevel/colorCode stay at defaults, noticeUrl from getVolcano
  }

  const body: VolcanoStatus = {
    name: record.volcano_name,
    colorCode,
    alertLevel,
    nvewsThreat: record.nvews_threat ?? null,
    noticeUrl,
    provenance: {
      source: "USGS HANS",
      observedAt: new Date().toISOString(),
    },
  };

  return NextResponse.json(body, { headers: { "Cache-Control": CACHE } });
}
