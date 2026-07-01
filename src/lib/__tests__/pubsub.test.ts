// lib/__tests__/pubsub.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const publishMessage = vi.fn().mockResolvedValue("msg-123");
const topic = vi.fn((_path: string) => ({ publishMessage }));
vi.mock("@google-cloud/pubsub", () => ({
  PublisherClient: vi.fn(),
  PubSub: vi.fn(() => ({ topic })),
}));

describe("lib/pubsub", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    publishMessage.mockClear(); topic.mockClear();
    process.env.GCP_PROJECT = "mountain-weatherman-app";
    process.env.TOPIC_WEATHER_REFRESH = "projects/mountain-weatherman-app/topics/dev-weather-refresh";
    process.env.TOPIC_NWAC_REFRESH = "projects/mountain-weatherman-app/topics/dev-nwac-refresh";
    process.env.TOPIC_SNOTEL_REFRESH = "projects/mountain-weatherman-app/topics/dev-snotel-refresh";
    process.env.TOPIC_SATELLITE_REFRESH = "projects/mountain-weatherman-app/topics/dev-satellite-refresh";
  });

  it("publishes a JSON-encoded message to the resolved topic path", async () => {
    const { publish } = await import("@/lib/pubsub");
    const id = await publish("weather-refresh", { mountainId: "mt-rainier", reason: "on_create" });
    expect(id).toBe("msg-123");
    expect(topic).toHaveBeenCalledWith("projects/mountain-weatherman-app/topics/dev-weather-refresh");
    const arg = publishMessage.mock.calls[0][0];
    expect(JSON.parse(arg.data.toString("utf8"))).toEqual({ mountainId: "mt-rainier", reason: "on_create" });
  });

  it("maps each logical topic to its env var", async () => {
    const { publish } = await import("@/lib/pubsub");
    await publish("nwac-refresh", { mountainId: "mt-rainier" });
    await publish("snotel-refresh", { mountainId: "mt-rainier" });
    await publish("satellite-refresh", { mountainId: "mt-rainier" });
    expect(topic.mock.calls.map((c) => c[0])).toEqual([
      "projects/mountain-weatherman-app/topics/dev-nwac-refresh",
      "projects/mountain-weatherman-app/topics/dev-snotel-refresh",
      "projects/mountain-weatherman-app/topics/dev-satellite-refresh",
    ]);
  });

  it("reuses a single PubSub client across calls", async () => {
    const { PubSub } = await import("@google-cloud/pubsub");
    const { publish } = await import("@/lib/pubsub");
    await publish("weather-refresh", { mountainId: "a", reason: "manual" });
    await publish("weather-refresh", { mountainId: "b", reason: "manual" });
    expect((PubSub as unknown as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);
  });

  it("throws a descriptive error for an unmapped topic env var", async () => {
    delete process.env.TOPIC_WEATHER_REFRESH;
    const { publish } = await import("@/lib/pubsub");
    await expect(publish("weather-refresh", { mountainId: "x", reason: "manual" }))
      .rejects.toThrow(/Missing required env var: TOPIC_WEATHER_REFRESH/);
  });
});
