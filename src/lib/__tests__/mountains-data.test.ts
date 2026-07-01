import { describe, it, expect } from "vitest";
import { MOUNTAINS, mountainBySlug, mountainsByName } from "@/lib/mountains-data";

const NWAC_ZONE_IDS = new Set(["1645","1646","1647","1648","1649","1653","1654","1655","1656","1657"]);
// Peaks outside NWAC coverage area: no nwacZoneId.
// OR Cascades south of NWAC boundary + Mt Whitney (CA).
const NO_NWAC = new Set(["mt-whitney", "mt-jefferson", "south-sister", "middle-sister", "north-sister", "mt-thielsen"]);
// Peaks with no SNOTEL station within ~12 mi: WA remotes + Mt Whitney (no OR SNOTEL either).
// OR Cascades peaks (Jefferson/Sisters/Thielsen) DO have nearby SNOTEL stations, so they are NOT in this set.
const NO_SNOTEL = new Set(["mt-whitney", "jack-mountain", "dome-peak", "sloan-peak"]);

describe("seed mountains dataset", () => {
  it("has exactly 39 peaks", () => { expect(MOUNTAINS).toHaveLength(39); });

  it("has unique slugs", () => {
    const slugs = MOUNTAINS.map((m) => m.slug);
    expect(new Set(slugs).size).toBe(39);
  });

  it("each peak has valid coords, elevations, zone id, and IANA timezone", () => {
    for (const m of MOUNTAINS) {
      expect(m.lat).toBeGreaterThan(36); expect(m.lat).toBeLessThan(49.5);
      expect(m.lng).toBeLessThan(-118); expect(m.lng).toBeGreaterThan(-124.5);
      expect(m.elevations.summit).toBeGreaterThan(m.elevations.mid);
      expect(m.elevations.mid).toBeGreaterThan(m.elevations.base);
      // NWAC zone check (independent of SNOTEL)
      if (NO_NWAC.has(m.slug)) {
        expect(m.nwacZoneId).toBe("");
      } else {
        expect(NWAC_ZONE_IDS.has(m.nwacZoneId)).toBe(true);
      }
      // SNOTEL check (independent of NWAC)
      if (NO_SNOTEL.has(m.slug)) {
        expect(m.snotelStationTriplet).toBe("");
      } else {
        expect(m.snotelStationTriplet).toMatch(/^\d+:(WA|OR):SNTL$/);
      }
      expect(m.timezone).toBe("America/Los_Angeles");
    }
  });

  it("Mount Whitney is an out-of-NWAC-region peak with no avalanche/snow station", () => {
    const w = MOUNTAINS.find((m) => m.slug === "mt-whitney");
    expect(w).toBeDefined();
    expect(w!.region).toBe("sierra-nevada");
    expect(w!.nwacZone).toBe(""); expect(w!.nwacZoneId).toBe("");
    expect(w!.snotelStationId).toBe(""); expect(w!.snotelStationTriplet).toBe(""); expect(w!.snotelStationName).toBe("");
  });

  it("Oregon volcanoes have region 'oregon' and no NWAC zone", () => {
    const oregonVolcanoes = ["mt-jefferson", "south-sister", "middle-sister", "north-sister", "mt-thielsen"];
    for (const slug of oregonVolcanoes) {
      const m = MOUNTAINS.find((p) => p.slug === slug);
      expect(m).toBeDefined();
      expect(m!.region).toBe("oregon");
      expect(m!.nwacZone).toBe("");
      expect(m!.nwacZoneId).toBe("");
    }
  });
});

describe("Phase 2 hazard catalog fields", () => {
  it("tags the five Cascade volcanoes with their HANS id", () => {
    expect(mountainBySlug("mt-rainier")?.hansVolcanoId).toBe("wa6");
    expect(mountainBySlug("mt-baker")?.hansVolcanoId).toBe("wa2");
    expect(mountainBySlug("glacier-peak")?.hansVolcanoId).toBe("wa3");
    expect(mountainBySlug("mt-adams")?.hansVolcanoId).toBe("wa1");
    expect(mountainBySlug("mt-st-helens")?.hansVolcanoId).toBe("wa4");
  });
  it("leaves non-volcano peaks without a HANS id", () => {
    expect(mountainBySlug("mt-shuksan")?.hansVolcanoId ?? "").toBe("");
    expect(mountainBySlug("colchuck-peak")?.hansVolcanoId ?? "").toBe("");
  });
  it("tags Rainier with its NPS park code", () => {
    expect(mountainBySlug("mt-rainier")?.npsParkCode).toBe("mora");
  });
});

describe("Phase 3 terrain catalog fields", () => {
  it("gives Rainier a mapBbox around its summit", () => {
    const b = mountainBySlug("mt-rainier")?.mapBbox;
    expect(b).toBeTruthy();
    expect(b!.west).toBeLessThan(b!.east);
    expect(b!.south).toBeLessThan(b!.north);
  });
  it("carries at least one permit deep-link for Rainier", () => {
    expect((mountainBySlug("mt-rainier")?.permits ?? []).length).toBeGreaterThan(0);
  });
  it("tags USFS peaks with the correct forest name", () => {
    expect(mountainBySlug("mt-baker")?.usfsForestName).toBe("Mt. Baker-Snoqualmie National Forest");
    expect(mountainBySlug("mt-shuksan")?.usfsForestName).toBe("Mt. Baker-Snoqualmie National Forest");
    expect(mountainBySlug("glacier-peak")?.usfsForestName).toBe("Mt. Baker-Snoqualmie National Forest");
    expect(mountainBySlug("mt-adams")?.usfsForestName).toBe("Gifford Pinchot National Forest");
    expect(mountainBySlug("mt-st-helens")?.usfsForestName).toBe("Gifford Pinchot National Forest");
    expect(mountainBySlug("mt-hood")?.usfsForestName).toBe("Mount Hood National Forest");
    expect(mountainBySlug("colchuck-peak")?.usfsForestName).toBe("Okanogan-Wenatchee National Forest");
    expect(mountainBySlug("liberty-bell")?.usfsForestName).toBe("Okanogan-Wenatchee National Forest");
  });
  it("leaves NP-only and out-of-region peaks without a USFS forest name", () => {
    expect(mountainBySlug("mt-rainier")?.usfsForestName).toBeUndefined();
    expect(mountainBySlug("mt-olympus")?.usfsForestName).toBeUndefined();
    expect(mountainBySlug("mt-whitney")?.usfsForestName).toBeUndefined();
  });
});

describe("catalog helpers", () => {
  it("mountainBySlug returns the matching mountain or undefined", () => {
    expect(mountainBySlug("mt-rainier")?.name).toBe("Mount Rainier");
    expect(mountainBySlug("does-not-exist")).toBeUndefined();
  });
  it("mountainsByName returns all peaks sorted by name ascending", () => {
    const names = mountainsByName().map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(mountainsByName()).toHaveLength(MOUNTAINS.length);
  });
});
