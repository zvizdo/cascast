import { NextResponse } from "next/server";
import { publish, type LogicalTopic } from "@/lib/pubsub";

const TYPE_TOPIC: Record<string, LogicalTopic> = {
  weather: "weather-refresh",
  nwac: "nwac-refresh",
  snotel: "snotel-refresh",
  satellite: "satellite-refresh",
};

export async function POST(req: Request) {
  // POC: unguarded admin endpoint — add auth before any production/admin surface exists.
  const url = new URL(req.url);
  const mountainId = url.searchParams.get("mountainId");
  const type = url.searchParams.get("type") ?? "weather";
  if (!mountainId) return NextResponse.json({ error: "mountainId is required" }, { status: 400 });
  const topic = TYPE_TOPIC[type];
  if (!topic) return NextResponse.json({ error: `invalid type: ${type}` }, { status: 400 });
  await publish(topic, { mountainId });
  return NextResponse.json({ ok: true });
}
