"use client";
/* TerrainMap: thin MapLibre GL lifecycle wrapper.
   All map logic (style, GIBS, peakCenter) lives in lib/map.ts (tested).
   Coverage-excluded — WebGL un-mountable in jsdom. Imported only via
   next/dynamic(ssr:false) from the terrain tab content. */
import * as React from "react";
import maplibregl from "maplibre-gl";
import { terrainMapStyle, peakCenter, gibsSnowDate, type BaseKind } from "@/lib/map";
import type { Mountain } from "@/lib/types";

export type LayerKey = "trails" | "roads" | "wilderness" | "trailheads" | "earthquakes";

// Stable layer/source ids (prefixed so they never collide with the base/snow raster).
const SRC = (k: LayerKey) => `geo-${k}-src`;
const LYR = (k: LayerKey) => `geo-${k}-lyr`;
const OUTLINE = (k: LayerKey) => `geo-${k}-outline`;

// Maps a layer key to its route sub-path (earthquakes is a passed-in FC, no URL).
const ROUTE: Record<Exclude<LayerKey, "earthquakes">, string> = {
  trails: "trails",
  roads: "roads",
  wilderness: "wilderness",
  trailheads: "rec-sites",
};

const ALL_LAYERS: LayerKey[] = ["trails", "roads", "wilderness", "trailheads", "earthquakes"];

/** Resolves a CSS custom property at apply time for theme-awareness; falls back to a hex literal. */
function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function TerrainMap({
  mountain,
  base,
  snow,
  enabledLayers = new Set<LayerKey>(),
  quakeFc,
}: {
  mountain: Mountain;
  base: BaseKind;
  snow: boolean;
  enabledLayers?: Set<LayerKey>;
  quakeFc?: GeoJSON.FeatureCollection;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const snowDate = React.useMemo(() => gibsSnowDate(), []);
  const slug = mountain.slug;

  // Keep the latest enabled-set + quake FC in refs so the stable applyGeoLayers
  // (bound to the map's style.load handler for the map's lifetime) always reads current state.
  const enabledRef = React.useRef(enabledLayers);
  const quakeRef = React.useRef(quakeFc);
  enabledRef.current = enabledLayers;
  quakeRef.current = quakeFc;

  // Adds the currently-enabled geo sources/layers and removes the disabled ones.
  // Stable (deps via refs) so it can be registered once on `style.load`.
  const applyGeoLayers = React.useCallback(
    (map: maplibregl.Map) => {
      const accent = token("--accent", "#2c6d8f");
      const red = token("--d4", "#df3a2f");
      const neutral = token("--muted", "#7a8794");
      const enabled = enabledRef.current;

      for (const key of ALL_LAYERS) {
        const on = enabled.has(key);
        if (!on) {
          // Remove layers first, then the source.
          if (map.getLayer(OUTLINE(key))) map.removeLayer(OUTLINE(key));
          if (map.getLayer(LYR(key))) map.removeLayer(LYR(key));
          if (map.getSource(SRC(key))) map.removeSource(SRC(key));
          continue;
        }

        // Add the source if absent.
        if (!map.getSource(SRC(key))) {
          const data =
            key === "earthquakes"
              ? (quakeRef.current ?? { type: "FeatureCollection", features: [] })
              : `/api/mountains/${slug}/${ROUTE[key]}`;
          map.addSource(SRC(key), { type: "geojson", data } as maplibregl.SourceSpecification);
        } else if (key === "earthquakes") {
          // Earthquake data comes from a prop; refresh it on re-apply.
          const src = map.getSource(SRC(key)) as maplibregl.GeoJSONSource;
          src.setData(quakeRef.current ?? { type: "FeatureCollection", features: [] });
        }

        // Add the layer(s) if absent.
        if (!map.getLayer(LYR(key))) {
          if (key === "trails") {
            map.addLayer({
              id: LYR(key),
              type: "line",
              source: SRC(key),
              paint: { "line-color": accent, "line-width": 2 },
            });
          } else if (key === "roads") {
            map.addLayer({
              id: LYR(key),
              type: "line",
              source: SRC(key),
              paint: {
                "line-color": ["case", ["==", ["get", "closed"], true], red, neutral],
                "line-width": 1.5,
              },
            });
          } else if (key === "wilderness") {
            map.addLayer({
              id: LYR(key),
              type: "fill",
              source: SRC(key),
              paint: { "fill-color": "#2f7d4f", "fill-opacity": 0.18 },
            });
            map.addLayer({
              id: OUTLINE(key),
              type: "line",
              source: SRC(key),
              paint: { "line-color": "#2f7d4f", "line-width": 1 },
            });
          } else if (key === "trailheads") {
            map.addLayer({
              id: LYR(key),
              type: "circle",
              source: SRC(key),
              paint: {
                "circle-radius": 4,
                "circle-color": ["case", ["==", ["get", "closed"], true], red, accent],
                "circle-stroke-width": 1,
                "circle-stroke-color": "#ffffff",
              },
            });
          } else if (key === "earthquakes") {
            map.addLayer({
              id: LYR(key),
              type: "circle",
              source: SRC(key),
              paint: {
                "circle-radius": ["interpolate", ["linear"], ["get", "mag"], 0, 3, 5, 12],
                "circle-color": red,
                "circle-opacity": 0.55,
                "circle-stroke-width": 1,
                "circle-stroke-color": red,
              },
            });
          }
        }
      }
    },
    [slug],
  );

  // Track the last style key used so the setStyle effect only fires on actual changes.
  const lastStyleKeyRef = React.useRef<string | null>(null);

  // Create the map once per mountain slug; clean up on unmount.
  React.useEffect(() => {
    if (!ref.current) return;
    const { lng, lat, zoom } = peakCenter(mountain);
    const initialStyle = terrainMapStyle({ base, snow, snowDate });
    // Record the initial style key so the setStyle effect skips the very first render.
    lastStyleKeyRef.current = `${base}:${String(snow)}:${snowDate}`;
    const map = new maplibregl.Map({
      container: ref.current,
      style: initialStyle,
      center: [lng, lat],
      zoom,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    mapRef.current = map;

    // D1: after the map tiles have settled, resize to the actual container dimensions
    // (the container may have been zero-sized when the Map constructor ran).
    map.on("load", () => {
      map.resize();
      applyGeoLayers(map);
    });
    // setStyle (base/snow swap) wipes imperatively-added sources/layers, so re-add on every style.load.
    map.on("style.load", () => applyGeoLayers(map));

    // D1: observe future container size changes (e.g. tab reveal after first mount).
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- map created once; base/snow/layers handled below
  }, [slug]);

  // D2: Swap raster style only when base/snow actually changed from the value used at construction.
  React.useEffect(() => {
    const key = `${base}:${String(snow)}:${snowDate}`;
    if (lastStyleKeyRef.current === key) return; // no real change
    lastStyleKeyRef.current = key;
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(terrainMapStyle({ base, snow, snowDate }));
    // D2: if the style is already loaded (fast toggle), re-apply geo layers immediately
    // in addition to the style.load handler that fires asynchronously.
    if (map.isStyleLoaded()) applyGeoLayers(map);
  }, [base, snow, snowDate, applyGeoLayers]);

  // Re-run when the enabled set or earthquake data changes (only if the style is already loaded).
  React.useEffect(() => {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) applyGeoLayers(map);
  }, [enabledLayers, quakeFc, applyGeoLayers]);

  return (
    <div
      ref={ref}
      className="terrain-map"
      role="application"
      aria-label={`Terrain map of ${mountain.name}`}
    />
  );
}

export default TerrainMap;
