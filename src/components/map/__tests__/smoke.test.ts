import { describe, it, expect, vi } from "vitest";

// maplibre-gl touches WebGL at module scope in some builds; mock it so the
// import graph loads in jsdom without a real GL context. The new maplibregl.Map
// lives inside useEffect and never runs at import time.
vi.mock("maplibre-gl", () => ({
  default: {
    Map: class {},
    NavigationControl: class {},
  },
}));

describe("TerrainMap smoke", () => {
  it("imports without throwing", async () => {
    const m = await import("@/components/map/TerrainMap");
    expect(m.TerrainMap).toBeTruthy();
  });
});
