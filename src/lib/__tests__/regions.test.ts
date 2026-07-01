import { describe, it, expect } from "vitest";
import { browseGroups } from "@/lib/regions";
import { MOUNTAINS } from "@/lib/mountains-data";
import type { Mountain } from "@/lib/types";

describe("browseGroups", () => {
  it("returns the three top-level groups in WA → Oregon → Beyond order", () => {
    const g = browseGroups();
    expect(g.map((x) => x.id)).toEqual(["washington", "oregon", "beyond"]);
    expect(g[0].title).toBe("Washington");
    expect(g[2].title).toBe("Beyond the Northwest");
  });

  it("Washington has the four sub-labels in order", () => {
    const wa = browseGroups().find((x) => x.id === "washington")!;
    expect(wa.subgroups.map((s) => s.label)).toEqual([
      "North Cascades",
      "Central Cascades · Enchantments",
      "South Cascades",
      "Olympics",
    ]);
  });

  it("sorts peaks within a subgroup by summit elevation, descending", () => {
    const wa = browseGroups().find((x) => x.id === "washington")!;
    const south = wa.subgroups.find((s) => s.label === "South Cascades")!;
    const elevs = south.mountains.map((m) => m.elevations.summit);
    expect(elevs[0]).toBe(Math.max(...elevs)); // Rainier (14,410) leads
    expect([...elevs]).toEqual([...elevs].sort((a, b) => b - a));
  });

  it("Oregon is a single unlabelled subgroup led by Mount Hood", () => {
    const or = browseGroups().find((x) => x.id === "oregon")!;
    expect(or.subgroups).toHaveLength(1);
    expect(or.subgroups[0].label).toBeNull();
    expect(or.subgroups[0].mountains[0].name).toBe("Mount Hood");
  });

  it("Beyond contains Mount Whitney", () => {
    const b = browseGroups().find((x) => x.id === "beyond")!;
    const names = b.subgroups.flatMap((s) => s.mountains.map((m) => m.name));
    expect(names).toContain("Mount Whitney");
  });

  it("places an unknown region in Beyond under 'Other peaks' rather than dropping it", () => {
    const odd = { ...MOUNTAINS[0], slug: "test-odd", name: "Test Odd", region: "mars" } as Mountain;
    const b = browseGroups([...MOUNTAINS, odd]).find((x) => x.id === "beyond")!;
    const other = b.subgroups.find((s) => s.label === "Other peaks");
    expect(other?.mountains.some((m) => m.slug === "test-odd")).toBe(true);
  });

  it("every catalog mountain appears exactly once", () => {
    const slugs = browseGroups().flatMap((g) => g.subgroups.flatMap((s) => s.mountains.map((m) => m.slug)));
    expect(new Set(slugs).size).toBe(MOUNTAINS.length);
    expect(slugs).toHaveLength(MOUNTAINS.length);
  });
});
