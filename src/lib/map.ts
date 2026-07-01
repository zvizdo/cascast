import type { StyleSpecification } from "maplibre-gl";
import type { Mountain } from "@/lib/types";

export type BaseKind = "topo" | "satellite";

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Returns yesterday's date as YYYY-MM-DD (UTC) — MODIS daily product lags ~1 day. */
export function gibsSnowDate(now: Date = new Date()): string {
  const yesterday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  return `${yesterday.getUTCFullYear()}-${pad(yesterday.getUTCMonth() + 1)}-${pad(yesterday.getUTCDate())}`;
}

/** Returns the GIBS WMTS REST tile URL array for MapLibre. */
export function gibsSnowTiles(date: string): string[] {
  return [
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDSI_Snow_Cover_Daily/default/${date}/GoogleMapsCompatible/{z}/{y}/{x}.png`,
  ];
}

/** Builds a raster-only MapLibre style with the chosen base and optional GIBS snow layer. */
export function terrainMapStyle(opts: {
  base: BaseKind;
  snow: boolean;
  snowDate: string;
}): StyleSpecification {
  const { base, snow, snowDate } = opts;

  const sources: StyleSpecification["sources"] = {
    topo: {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 17,
      attribution: "© OpenStreetMap contributors, SRTM | map style © OpenTopoMap (CC-BY-SA)",
    },
    satellite: {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      attribution: "Esri, Maxar, Earthstar Geographics",
    },
  };

  const layers: StyleSpecification["layers"] = [
    { id: "base", type: "raster", source: base },
  ];

  if (snow) {
    sources["snow"] = {
      type: "raster",
      tiles: gibsSnowTiles(snowDate),
      tileSize: 256,
      attribution: "NASA EOSDIS GIBS — MODIS/Terra",
    };
    layers.push({
      id: "snow",
      type: "raster",
      source: "snow",
      paint: { "raster-opacity": 0.7 },
    });
  }

  return { version: 8, sources, layers };
}

/** Returns the map center and zoom for a given mountain. */
export function peakCenter(
  m: Pick<Mountain, "lat" | "lng" | "mapBbox">,
): { lng: number; lat: number; zoom: number } {
  if (m.mapBbox) {
    return {
      lng: (m.mapBbox.west + m.mapBbox.east) / 2,
      lat: (m.mapBbox.south + m.mapBbox.north) / 2,
      zoom: 11,
    };
  }
  return { lng: m.lng, lat: m.lat, zoom: 12 };
}
