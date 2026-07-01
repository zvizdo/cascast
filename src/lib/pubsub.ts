import "server-only";
import { PubSub } from "@google-cloud/pubsub";
import { requireEnv } from "@/lib/env";

export type LogicalTopic = "weather-refresh" | "nwac-refresh" | "snotel-refresh" | "satellite-refresh";

const ENV_VAR: Record<LogicalTopic, string> = {
  "weather-refresh": "TOPIC_WEATHER_REFRESH",
  "nwac-refresh": "TOPIC_NWAC_REFRESH",
  "snotel-refresh": "TOPIC_SNOTEL_REFRESH",
  "satellite-refresh": "TOPIC_SATELLITE_REFRESH",
};

export interface WeatherRefreshMessage { mountainId: string; reason: "scheduled" | "on_create" | "manual" }
export interface NwacRefreshMessage { mountainId: string }
export interface SnotelRefreshMessage { mountainId: string }

let client: PubSub | undefined;
function getClient(): PubSub {
  if (!client) client = new PubSub({ projectId: requireEnv("GCP_PROJECT") });
  return client;
}

export async function publish(logicalTopic: LogicalTopic, message: object): Promise<string> {
  const topicPath = requireEnv(ENV_VAR[logicalTopic]);
  const data = Buffer.from(JSON.stringify(message), "utf8");
  return getClient().topic(topicPath).publishMessage({ data });
}
