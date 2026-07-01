import { NextResponse } from "next/server";
import { mountainBySlug } from "@/lib/mountains-data";
import { requireEnv } from "@/lib/env";
import { fetchJson } from "@/lib/hazards/fetch";
import { airNowCurrent } from "@/lib/hazards/sources";
import type { AirQuality } from "@/lib/hazards/types";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
type Params = { params: Promise<{ slug: string }> };

interface AirNowRecord {
  DateObserved: string;
  HourObserved: number;
  ReportingArea: string;
  Latitude: number;
  Longitude: number;
  ParameterName: string;
  AQI: number;
  Category: { Number: number; Name: string };
}

function pickHighest(records: AirNowRecord[]): AirNowRecord | undefined {
  if (!records.length) return undefined;
  return records.reduce((best, r) => (r.AQI > best.AQI ? r : best));
}

function historicalUrl(lat: number, lng: number, key: string, date: string): string {
  // AirNow historical endpoint ignores the hour for daily records; noon is a stable sentinel
  return (
    `https://www.airnowapi.org/aq/observation/latLong/historical/` +
    `?format=application/json&latitude=${lat}&longitude=${lng}` +
    `&date=${date}T12-0000&distance=50&API_KEY=${key}`
  );
}

function dateMinusDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });

  const key = requireEnv("AIRNOW_API_KEY");
  const { lat, lng } = mountain;

  // Fetch current observations via shared helper
  const current = await airNowCurrent(lat, lng, key);

  if (!current) {
    return NextResponse.json({ error: "No air-quality data" }, { status: 404 });
  }

  // Build a 7-day daily trend (AirNow historical has no hourly granularity —
  // for any requested hour it returns a single daily record with HourObserved:0).
  // We fetch the prior 7 calendar days at noon and append today from the current record.
  const obsDate = (current.provenance.observedAt ?? "").slice(0, 10) || new Date().toISOString().slice(0, 10);

  const dayOffsets = [7, 6, 5, 4, 3, 2, 1] as const;
  const historicalEntries = dayOffsets.map((offset) => ({
    date: dateMinusDays(obsDate, offset),
    promise: null as Promise<AirNowRecord[]> | null,
  }));

  // Kick off all 7 requests
  for (const entry of historicalEntries) {
    entry.promise = fetchJson<AirNowRecord[]>(historicalUrl(lat, lng, key, entry.date));
  }

  const settled = await Promise.allSettled(historicalEntries.map((e) => e.promise!));

  const trend: { date: string; aqi: number }[] = [];

  settled.forEach((result, i) => {
    if (result.status === "fulfilled" && result.value.length) {
      const top = pickHighest(result.value)!;
      trend.push({ date: historicalEntries[i].date, aqi: top.AQI });
    }
  });

  // Append the current observation's date as the final (most recent) point
  trend.push({ date: obsDate, aqi: current.aqi });

  // Sort ascending by date (oldest → newest); the current-day entry is already last
  // but sort defensively in case dates overlap
  trend.sort((a, b) => a.date.localeCompare(b.date));

  const body: AirQuality = {
    ...current,
    trend,
  };

  return NextResponse.json(body, { headers: { "Cache-Control": CACHE } });
}
