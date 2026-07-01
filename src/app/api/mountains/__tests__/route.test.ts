import { describe, it, expect } from "vitest";
import { MOUNTAINS } from "@/lib/mountains-data";

describe("GET /api/mountains", () => {
  it("returns all catalog mountains sorted by name, with cache header, from the constant", async () => {
    const { GET } = await import("@/app/api/mountains/route");
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600");
    const body = await res.json();
    expect(body).toHaveLength(MOUNTAINS.length);
    const names = body.map((m: { name: string }) => m.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
    expect(names[0]).toBe("Black Peak");
    expect(names[names.length - 1]).toBe("Whitehorse Mountain");
    expect(body.every((m: { slug?: string }) => typeof m.slug === "string" && m.slug.length > 0)).toBe(true);
  });
});
