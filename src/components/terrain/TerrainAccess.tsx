"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Segmented } from "@/components/shared/Segmented";
import { WebcamStrip } from "@/components/terrain/WebcamStrip";
import { AccessCards } from "@/components/terrain/AccessCards";
import { gibsSnowDate, type BaseKind } from "@/lib/map";
import { EMPTY_FC } from "@/lib/geo";
import { useMountainSeismic, useMountainRoads, useMountainTrails } from "@/lib/hooks";
import type { LayerKey } from "@/components/map/TerrainMap";
import type { Mountain } from "@/lib/types";

// Dynamic import at module scope so the map is never server-rendered.
const TerrainMap = dynamic(
  () => import("@/components/map/TerrainMap").then((m) => m.TerrainMap),
  { ssr: false, loading: () => <div className="terrain-map terrain-map-loading" aria-busy="true" /> },
);

const BASE_OPTIONS = [
  { value: "topo" as const, label: "Topo" },
  { value: "satellite" as const, label: "Satellite" },
];

// The five toggleable geo layers, with their legend label + swatch color.
const GEO_LAYERS: { key: LayerKey; label: string; swatch: string }[] = [
  { key: "trails", label: "Trails", swatch: "var(--accent)" },
  { key: "roads", label: "Roads", swatch: "var(--muted)" },
  { key: "wilderness", label: "Wilderness", swatch: "#2f7d4f" },
  { key: "trailheads", label: "Trailheads", swatch: "var(--accent)" },
  { key: "earthquakes", label: "Earthquakes", swatch: "var(--d4)" },
];

export function TerrainAccess({
  mountain,
  target,
}: {
  mountain: Mountain;
  target?: string;
}) {
  const [base, setBase] = React.useState<BaseKind>("topo");
  const [snow, setSnow] = React.useState(false);
  const [enabledLayers, setEnabledLayers] = React.useState<Set<LayerKey>>(new Set());
  const snowDate = React.useMemo(() => gibsSnowDate(), []);
  const explore3dHref = `/mountains/${mountain.slug}/3d${target ? `?target=${target}` : ""}`;

  const { seismic } = useMountainSeismic(mountain.slug);
  const { roads } = useMountainRoads(mountain.slug);
  const { trails } = useMountainTrails(mountain.slug);

  // Build the earthquake epicenter FeatureCollection from the seismic events.
  const quakeFc: GeoJSON.FeatureCollection = React.useMemo(() => {
    const events = seismic?.events ?? [];
    if (events.length === 0) return EMPTY_FC;
    return {
      type: "FeatureCollection",
      features: events.map((e) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [e.lng, e.lat] },
        properties: { mag: e.mag, place: e.place },
      })),
    };
  }, [seismic]);

  function toggleLayer(key: LayerKey, on: boolean) {
    setEnabledLayers((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  }

  const trailsOn = enabledLayers.has("trails");
  const visibleLegend = GEO_LAYERS.filter((l) => enabledLayers.has(l.key));

  return (
    <div className="terrain-body">
      {/* D13: map-controls cluster — Topo/Satellite toggle + layer pills as one widget */}
      <div className="map-controls-cluster">
        <div className="map-controls-kicker">Map controls</div>

        {/* Base-style toggle */}
        <Segmented
          options={BASE_OPTIONS}
          value={base}
          onChange={setBase}
          ariaLabel="Base map style"
        />

        {/* D5/D6: layer pills */}
        <div className="layer-panel">
          <label>
            <input
              type="checkbox"
              checked={snow}
              onChange={(e) => setSnow(e.target.checked)}
              aria-label="Snow cover (GIBS)"
            />
            {" Snow cover (GIBS)"}
          </label>
          {GEO_LAYERS.map(({ key, label }) => (
            <label key={key}>
              <input
                type="checkbox"
                checked={enabledLayers.has(key)}
                onChange={(e) => toggleLayer(key, e.target.checked)}
                aria-label={label}
              />
              {` ${label}`}
            </label>
          ))}
        </div>

        {mountain.npsParkCode && (
          <p className="layer-caption">
            Roads, trailheads &amp; wilderness come from US Forest Service (USFS) National Forest data and
            aren&apos;t available inside National Parks. Trails are shown from OpenStreetMap.
          </p>
        )}

        {/* D6: MODIS caption on its own line, outside the pill flex */}
        <p className="layer-caption">
          {`MODIS snow · ${snowDate} (cloud gaps possible)`}
        </p>
      </div>

      {/* Legend (visible layers only) */}
      {visibleLegend.length > 0 && (
        <ul className="map-legend" aria-label="Map layer legend">
          {visibleLegend.map(({ key, label, swatch }) => (
            <li key={key}>
              <span className="legend-swatch" style={{ background: swatch }} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      )}

      {/* Map */}
      <TerrainMap
        mountain={mountain}
        base={base}
        snow={snow}
        enabledLayers={enabledLayers}
        quakeFc={quakeFc}
      />

      {/* Attribution */}
      <p className="map-attribution mono-dim">
        © OpenStreetMap · OpenTopoMap (CC-BY-SA) · Esri/Maxar · NASA GIBS/MODIS
        {trailsOn ? " · © OpenStreetMap (ODbL)" : ""}
      </p>

      {/* Webcams */}
      <WebcamStrip webcams={mountain.webcams} />

      {/* Access */}
      <AccessCards permits={mountain.permits} roads={roads} trails={trails} />

      {/* Standalone 3D entry */}
      <div>
        <Link href={explore3dHref} className="btn btn-ghost">
          Explore in 3D →
        </Link>
        <span className="mono-dim"> Illustrative — not for navigation.</span>
      </div>
    </div>
  );
}
