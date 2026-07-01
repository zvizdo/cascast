"use client";
/* SWR data hooks for the client UI. One shared fetcher; one hook per API route. */
import useSWR from "swr";
import type {
  Mountain,
  MountainConditions,
  CombinedForecastBlob,
  NwacForecast,
  SnotelData,
  SatelliteCache,
  WeatherSnapshot,
} from "@/lib/types";
import type { AirQuality, StormAlerts, VolcanoStatus, SeismicSummary, ParkAlerts, HazardsSummary } from "@/lib/hazards/types";
import { parseRoutes, parseMarkers, type TerrainMeta, type RouteLine, type PlaceMarker } from "@/lib/terrain";

/** Error carrying the HTTP status so callers can distinguish 404 from transient failures. */
export class FetchError extends Error {
  status: number;
  constructor(status: number, statusText: string) {
    super(statusText || `Request failed (${status})`);
    this.status = status;
    this.name = "FetchError";
  }
}

export const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new FetchError(r.status, r.statusText);
    return r.json();
  });

export function useMountains(): {
  mountains: Mountain[] | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useSWR<Mountain[]>("/api/mountains", fetcher);
  return { mountains: data, isLoading, error };
}

export interface MountainBrowseResponse {
  mountain: Mountain;
  conditions: MountainConditions | null;
  satellite?: SatelliteCache | null;
  weather: CombinedForecastBlob | null;
  nwac: NwacForecast | null;
  snotel: SnotelData | null;
  stale?: boolean;
}

export function useMountain(slug: string): {
  data: MountainBrowseResponse | undefined;
  isLoading: boolean;
  isValidating: boolean;
  error: unknown;
} {
  const { data, error, isLoading, isValidating } = useSWR<MountainBrowseResponse>(
    slug ? `/api/mountains/${slug}` : null,
    fetcher,
  );
  return { data, isLoading, isValidating, error };
}

// --- Mountain-scoped per-feed hooks (mirror the project hooks; one route each). ----

export function useMountainWeather(slug: string): {
  blob: CombinedForecastBlob | undefined;
  isLoading: boolean;
  isValidating: boolean;
  error: unknown;
  mutate: () => void;
} {
  const { data, error, isLoading, isValidating, mutate } = useSWR<CombinedForecastBlob>(
    slug ? `/api/mountains/${slug}/weather` : null,
    fetcher,
  );
  return { blob: data, isLoading, isValidating, error, mutate };
}

export function useMountainSnapshots(slug: string): {
  snapshots: WeatherSnapshot[] | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useSWR<WeatherSnapshot[]>(
    slug ? `/api/mountains/${slug}/snapshots` : null,
    fetcher,
  );
  return { snapshots: data, isLoading, error };
}

export function useMountainSnotel(slug: string): {
  snotel: SnotelData | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useSWR<SnotelData>(
    slug ? `/api/mountains/${slug}/snotel` : null,
    fetcher,
  );
  return { snotel: data, isLoading, error };
}

export function useMountainNwac(slug: string): {
  nwac: NwacForecast | { season: "summer" } | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useSWR<NwacForecast | { season: "summer" }>(
    slug ? `/api/mountains/${slug}/nwac` : null,
    fetcher,
  );
  return { nwac: data, isLoading, error };
}

export function useMountainSatellite(slug: string): {
  sat: SatelliteCache | null | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useSWR<SatelliteCache | null>(
    slug ? `/api/mountains/${slug}/satellite` : null,
    fetcher,
  );
  return { sat: data, isLoading, error };
}

// --- Safety / hazard hooks (one hook per route; each returns mutate for PanelError retry). ----

export function useMountainAirQuality(slug: string): { airQuality: AirQuality | undefined; isLoading: boolean; error: unknown; mutate: () => void } {
  const { data, error, isLoading, mutate } = useSWR<AirQuality>(slug ? `/api/mountains/${slug}/air-quality` : null, fetcher);
  return { airQuality: data, isLoading, error, mutate };
}

export function useMountainAlerts(slug: string): { alerts: StormAlerts | undefined; isLoading: boolean; error: unknown; mutate: () => void } {
  const { data, error, isLoading, mutate } = useSWR<StormAlerts>(slug ? `/api/mountains/${slug}/alerts` : null, fetcher);
  return { alerts: data, isLoading, error, mutate };
}

export function useMountainVolcano(slug: string): { volcano: VolcanoStatus | undefined; isLoading: boolean; error: unknown; mutate: () => void } {
  const { data, error, isLoading, mutate } = useSWR<VolcanoStatus>(slug ? `/api/mountains/${slug}/volcano` : null, fetcher);
  return { volcano: data, isLoading, error, mutate };
}

export function useMountainSeismic(slug: string): { seismic: SeismicSummary | undefined; isLoading: boolean; error: unknown; mutate: () => void } {
  const { data, error, isLoading, mutate } = useSWR<SeismicSummary>(slug ? `/api/mountains/${slug}/seismic` : null, fetcher);
  return { seismic: data, isLoading, error, mutate };
}

export function useMountainParkAlerts(slug: string): { parkAlerts: ParkAlerts | undefined; isLoading: boolean; error: unknown; mutate: () => void } {
  const { data, error, isLoading, mutate } = useSWR<ParkAlerts>(slug ? `/api/mountains/${slug}/park-alerts` : null, fetcher);
  return { parkAlerts: data, isLoading, error, mutate };
}

export function useMountainHazardsSummary(slug: string): { summary: HazardsSummary | undefined; isLoading: boolean; error: unknown; mutate: () => void } {
  const { data, error, isLoading, mutate } = useSWR<HazardsSummary>(slug ? `/api/mountains/${slug}/hazards-summary` : null, fetcher);
  return { summary: data, isLoading, error, mutate };
}

// --- Geospatial layer hooks (cached GeoJSON routes; feed the access cards in Task 9). ----

export function useMountainTrails(slug: string): {
  trails: GeoJSON.FeatureCollection | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useSWR<GeoJSON.FeatureCollection>(
    slug ? `/api/mountains/${slug}/trails` : null,
    fetcher,
  );
  return { trails: data, isLoading, error };
}

export function useMountainRoads(slug: string): {
  roads: GeoJSON.FeatureCollection | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useSWR<GeoJSON.FeatureCollection>(
    slug ? `/api/mountains/${slug}/roads` : null,
    fetcher,
  );
  return { roads: data, isLoading, error };
}

export function useMountainWilderness(slug: string): {
  wilderness: GeoJSON.FeatureCollection | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useSWR<GeoJSON.FeatureCollection>(
    slug ? `/api/mountains/${slug}/wilderness` : null,
    fetcher,
  );
  return { wilderness: data, isLoading, error };
}

export function useMountainRecSites(slug: string): {
  recSites: GeoJSON.FeatureCollection | undefined;
  isLoading: boolean;
  error: unknown;
} {
  const { data, error, isLoading } = useSWR<GeoJSON.FeatureCollection>(
    slug ? `/api/mountains/${slug}/rec-sites` : null,
    fetcher,
  );
  return { recSites: data, isLoading, error };
}

// --- 3D terrain hooks (overlays consume meta + routes; the GLB loads in-component). ----

/** Maps the SWR result to a 3-state terrain status:
 *  - "available": data loaded (or still loading — no error yet)
 *  - "unavailable": 404 — terrain not baked for this peak
 *  - "error": transient failure (5xx / network) — user can retry */
export function deriveTerrainState({
  error,
  data,
}: {
  error: unknown;
  data: TerrainMeta | undefined;
}): "available" | "unavailable" | "error" {
  if (error instanceof FetchError && error.status === 404) return "unavailable";
  if (error) return "error";
  return "available";
}

/** TerrainMeta for a mountain; exposes a 3-state `status` so callers can distinguish
 *  a true "not baked" 404 from a transient failure that warrants a Retry button. */
export function useTerrainMeta(slug: string): {
  meta: TerrainMeta | undefined;
  /** Kept for backwards compat: true when status === "available" with data present,
   *  or still loading. False only when unavailable (404). */
  available: boolean;
  status: "available" | "unavailable" | "error";
  isLoading: boolean;
  mutate: () => void;
} {
  const { data, error, isLoading, mutate } = useSWR<TerrainMeta>(
    slug ? `/api/mountains/${slug}/terrain/meta` : null,
    fetcher,
  );
  const status = deriveTerrainState({ error, data });
  const available = status !== "unavailable";
  return { meta: data, available, status, isLoading, mutate };
}

/** Climbing routes from the static GeoJSON asset; `[]` when none is published (404). */
export function useRoutes(slug: string): { routes: RouteLine[]; isLoading: boolean } {
  const { data, isLoading } = useSWR<RouteLine[]>(
    slug ? `/routes/${slug}.geojson` : null,
    async (url: string) => {
      const r = await fetch(url);
      if (r.status === 404) return [];
      if (!r.ok) throw new FetchError(r.status, r.statusText);
      return parseRoutes(await r.json());
    },
  );
  return { routes: data ?? [], isLoading };
}

export function useMarkers(slug: string): { markers: PlaceMarker[]; isLoading: boolean } {
  const { data, isLoading } = useSWR<PlaceMarker[]>(
    slug ? `/markers/${slug}.geojson` : null,
    async (url: string) => {
      const r = await fetch(url);
      if (r.status === 404) return [];
      if (!r.ok) throw new FetchError(r.status, r.statusText);
      return parseMarkers(await r.json());
    },
  );
  return { markers: data ?? [], isLoading };
}
