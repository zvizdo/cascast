import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  useMountains,
  useMountain,
  useMountainWeather,
  useMountainSnapshots,
  useMountainNwac,
  useMountainSnotel,
  useMountainSatellite,
  useTerrainMeta,
  useRoutes,
  useMarkers,
  deriveTerrainState,
  FetchError,
} from "@/lib/hooks";
import { SWRConfig } from "swr";
import * as React from "react";

// Each test gets a fresh SWR cache so requests aren't deduped across tests.
function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(SWRConfig, { value: { provider: () => new Map() } }, children);
}

const okFetch = (body: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, statusText: "OK", json: async () => body });

describe("lib/hooks fetchers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("useMountainWeather fetches /api/mountains/{slug}/weather", async () => {
    global.fetch = okFetch({ mountainId: "m" }) as unknown as typeof fetch;
    const { result } = renderHook(() => useMountainWeather("mt-rainier"), { wrapper });
    await waitFor(() => expect(result.current.blob).toEqual({ mountainId: "m" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/mountains/mt-rainier/weather");
  });

  it("useMountainSnapshots fetches /api/mountains/{slug}/snapshots", async () => {
    global.fetch = okFetch([{ id: "s1" }]) as unknown as typeof fetch;
    const { result } = renderHook(() => useMountainSnapshots("mt-rainier"), { wrapper });
    await waitFor(() => expect(result.current.snapshots).toEqual([{ id: "s1" }]));
    expect(global.fetch).toHaveBeenCalledWith("/api/mountains/mt-rainier/snapshots");
  });

  it("useMountainNwac fetches /api/mountains/{slug}/nwac", async () => {
    global.fetch = okFetch({ season: "summer" }) as unknown as typeof fetch;
    const { result } = renderHook(() => useMountainNwac("mt-rainier"), { wrapper });
    await waitFor(() => expect(result.current.nwac).toEqual({ season: "summer" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/mountains/mt-rainier/nwac");
  });

  it("useMountainSnotel fetches /api/mountains/{slug}/snotel", async () => {
    global.fetch = okFetch({ stationId: "x" }) as unknown as typeof fetch;
    const { result } = renderHook(() => useMountainSnotel("mt-rainier"), { wrapper });
    await waitFor(() => expect(result.current.snotel).toEqual({ stationId: "x" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/mountains/mt-rainier/snotel");
  });

  it("useMountainSatellite fetches /api/mountains/{slug}/satellite", async () => {
    global.fetch = okFetch({ mountainId: "m" }) as unknown as typeof fetch;
    const { result } = renderHook(() => useMountainSatellite("mt-rainier"), { wrapper });
    await waitFor(() => expect(result.current.sat).toEqual({ mountainId: "m" }));
    expect(global.fetch).toHaveBeenCalledWith("/api/mountains/mt-rainier/satellite");
  });

  it("useMountains fetches /api/mountains", async () => {
    global.fetch = okFetch([{ slug: "mt-rainier" }]) as unknown as typeof fetch;
    const { result } = renderHook(() => useMountains(), { wrapper });
    await waitFor(() => expect(result.current.mountains).toEqual([{ slug: "mt-rainier" }]));
    expect(global.fetch).toHaveBeenCalledWith("/api/mountains");
  });

  it("useMountain fetches /api/mountains/{slug}", async () => {
    global.fetch = okFetch({ mountain: { slug: "mt-baker" } }) as unknown as typeof fetch;
    const { result } = renderHook(() => useMountain("mt-baker"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual({ mountain: { slug: "mt-baker" } }));
    expect(global.fetch).toHaveBeenCalledWith("/api/mountains/mt-baker");
  });

  it("does not fetch when id/slug is empty (null SWR key)", () => {
    global.fetch = okFetch({}) as unknown as typeof fetch;
    renderHook(
      () => {
        useMountainWeather("");
        useMountainSnapshots("");
        useMountainNwac("");
        useMountainSnotel("");
        useMountain("");
      },
      { wrapper },
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("useTerrainMeta returns meta + available=true on 200", async () => {
    global.fetch = okFetch({ slug: "mt-rainier" }) as unknown as typeof fetch;
    const { result } = renderHook(() => useTerrainMeta("mt-rainier"), { wrapper });
    await waitFor(() => expect(result.current.meta).toEqual({ slug: "mt-rainier" }));
    expect(result.current.available).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith("/api/mountains/mt-rainier/terrain/meta");
  });

  it("useTerrainMeta sets available=false on 404", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, statusText: "Not Found", json: async () => ({}) }) as unknown as typeof fetch;
    const { result } = renderHook(() => useTerrainMeta("nope"), { wrapper });
    await waitFor(() => expect(result.current.available).toBe(false));
    expect(result.current.meta).toBeUndefined();
  });

  describe("deriveTerrainState", () => {
    const META = { slug: "mt-rainier" } as Parameters<typeof deriveTerrainState>[0]["data"];

    it("distinguishes 404 (unavailable) from transient error (retryable)", () => {
      expect(deriveTerrainState({ error: new FetchError(404, "Not Found"), data: undefined })).toBe("unavailable");
      expect(deriveTerrainState({ error: new FetchError(503, "Service Unavailable"), data: undefined })).toBe("error");
      expect(deriveTerrainState({ error: undefined, data: META })).toBe("available");
    });

    it("returns available on success data", () => {
      expect(deriveTerrainState({ error: undefined, data: META })).toBe("available");
    });

    it("returns error for network/non-404 errors", () => {
      expect(deriveTerrainState({ error: new FetchError(500, "Internal Error"), data: undefined })).toBe("error");
      expect(deriveTerrainState({ error: new Error("Network error"), data: undefined })).toBe("error");
    });

    it("returns available (loading/idle) when no error and no data yet", () => {
      expect(deriveTerrainState({ error: undefined, data: undefined })).toBe("available");
    });
  });

  it("useRoutes parses the GeoJSON asset on 200", async () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { name: "DC" },
          geometry: { type: "LineString", coordinates: [[-121.76, 46.8, 1600]] },
        },
      ],
    };
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => fc }) as unknown as typeof fetch;
    const { result } = renderHook(() => useRoutes("mt-rainier"), { wrapper });
    await waitFor(() => expect(result.current.routes).toHaveLength(1));
    expect(result.current.routes[0].name).toBe("DC");
    expect(global.fetch).toHaveBeenCalledWith("/routes/mt-rainier.geojson");
  });

  it("useRoutes returns [] on 404", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" }) as unknown as typeof fetch;
    const { result } = renderHook(() => useRoutes("nope"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.routes).toEqual([]);
  });

  it("useMarkers parses the place GeoJSON asset on 200", async () => {
    const fc = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", properties: { name: "Camp Muir", kind: "camp" }, geometry: { type: "Point", coordinates: [-121.73, 46.83] } },
      ],
    };
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => fc }) as unknown as typeof fetch;
    const { result } = renderHook(() => useMarkers("mt-rainier"), { wrapper });
    await waitFor(() => expect(result.current.markers).toHaveLength(1));
    expect(result.current.markers[0].name).toBe("Camp Muir");
    expect(global.fetch).toHaveBeenCalledWith("/markers/mt-rainier.geojson");
  });

  it("useMarkers returns [] on 404", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 404, statusText: "Not Found" }) as unknown as typeof fetch;
    const { result } = renderHook(() => useMarkers("nope"), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.markers).toEqual([]);
  });

  it("surfaces error when fetch is not ok", async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, statusText: "Internal Error", json: async () => ({}) }) as unknown as typeof fetch;
    const { result } = renderHook(() => useMountains(), { wrapper });
    await waitFor(() => expect(result.current.error).toBeInstanceOf(Error));
  });
});
