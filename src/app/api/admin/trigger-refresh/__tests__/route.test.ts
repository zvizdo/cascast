import { describe, it, expect, vi, beforeEach } from "vitest";
import { makePublish } from "@/app/api/__tests__/test-helpers";

const { publish, calls } = makePublish();
vi.mock("@/lib/pubsub", () => ({ publish }));
beforeEach(() => { calls.length = 0; publish.mockClear(); });

describe("POST /api/admin/trigger-refresh", () => {
  it("defaults to weather-refresh for the given mountainId", async () => {
    const { POST } = await import("@/app/api/admin/trigger-refresh/route");
    const res = await POST(new Request("http://t/api/admin/trigger-refresh?mountainId=mt-rainier", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(calls).toEqual([{ topic: "weather-refresh", message: { mountainId: "mt-rainier" } }]);
  });

  it("routes to the topic for the given type", async () => {
    const { POST } = await import("@/app/api/admin/trigger-refresh/route");
    await POST(new Request("http://t/api/admin/trigger-refresh?mountainId=mt-baker&type=satellite", { method: "POST" }));
    expect(calls).toEqual([{ topic: "satellite-refresh", message: { mountainId: "mt-baker" } }]);
  });

  it("returns 400 for an invalid type", async () => {
    const { POST } = await import("@/app/api/admin/trigger-refresh/route");
    const res = await POST(new Request("http://t/api/admin/trigger-refresh?mountainId=mt-baker&type=bogus", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });

  it("returns 400 when mountainId is missing", async () => {
    const { POST } = await import("@/app/api/admin/trigger-refresh/route");
    const res = await POST(new Request("http://t/api/admin/trigger-refresh", { method: "POST" }));
    expect(res.status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});
