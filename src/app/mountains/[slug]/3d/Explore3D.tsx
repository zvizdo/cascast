/* Explore3D — client shell for the dedicated 3D exploration page. Loads the baked terrain
   (meta + GLB) and the illustrative routes, derives the live freezing level from ?target, and
   mounts <Mountain3D> (dynamic, ssr:false) with overlay toggles, a route legend, the mandatory
   "Illustrative — not for navigation" disclaimer, and data attribution. */
"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Icons } from "@/components/icons/icons";
import { useTerrainMeta, useRoutes, useMarkers, useMountainWeather, useMountainSatellite } from "@/lib/hooks";
import { terrainModelUrl } from "@/lib/terrain";
import { chooseFreezingModel, chooseTargetModel, targetRows, noonRow } from "@/lib/forecast-select";
import { dayKeys } from "@/lib/derive";
import type { Mountain } from "@/lib/types";

const Mountain3D = dynamic(() => import("@/components/three/Mountain3D"), { ssr: false });

export interface Explore3DProps {
  mountain: Mountain;
  /** ?target=YYYY-MM-DD; drives the freezing-level overlay when in range */
  target?: string;
}

type ToggleKey = "satellite" | "freezing" | "routes" | "places" | "slope" | "labels";

export function Explore3D({ mountain, target }: Explore3DProps) {
  const slug = mountain.slug;
  const { meta, status, isLoading, mutate: retryMeta } = useTerrainMeta(slug);
  const { routes } = useRoutes(slug);
  const { markers } = useMarkers(slug);
  const { blob } = useMountainWeather(slug);
  const { sat } = useMountainSatellite(slug);
  const satelliteUrl = `/api/mountains/${slug}/satellite/image`;
  const satAvailable = !!sat && !!(sat as { latestImageDate?: string }).latestImageDate;

  // Live freezing level (ft) for the target day, when the forecast carries it.
  const freezingFt = React.useMemo(() => {
    if (!target || !blob) return null;
    const series = blob.gfs ?? blob.hrrr ?? blob.ecmwf;
    if (!series || !dayKeys(series).includes(target)) return null;
    const key = chooseFreezingModel(blob, target) ?? chooseTargetModel(blob, target);
    const rows = targetRows(blob[key], target);
    const fl = noonRow(rows)?.fl ?? rows.map((r) => r.fl).find((v) => v != null) ?? null;
    return fl ?? null;
  }, [blob, target]);

  const [show, setShow] = React.useState<Record<ToggleKey, boolean>>({
    satellite: false,
    freezing: false,
    routes: true,
    places: true,
    slope: false,
    labels: true,
  });
  // Default the freezing overlay on once a value is available.
  React.useEffect(() => {
    setShow((s) => ({ ...s, freezing: freezingFt != null }));
  }, [freezingFt]);
  // Default the satellite drape on once a scene is available.
  React.useEffect(() => {
    setShow((s) => ({ ...s, satellite: satAvailable }));
  }, [satAvailable]);

  const toggle = (k: ToggleKey) => setShow((s) => ({ ...s, [k]: !s[k] }));

  const TOGGLES: { key: ToggleKey; label: string; disabled?: boolean; hint?: string }[] = [
    {
      key: "satellite",
      label: "Satellite",
      disabled: !satAvailable,
      hint: "No recent cloud-free scene for this peak",
    },
    {
      key: "freezing",
      label: "Freezing level",
      disabled: freezingFt == null,
      hint: "Pin a date in range to show the freezing level",
    },
    { key: "routes", label: "Routes" },
    { key: "places", label: "Places", disabled: markers.length === 0, hint: "No mapped places for this peak yet" },
    { key: "slope", label: "Slope 30–45°" },
    { key: "labels", label: "Labels" },
  ];

  return (
    <div className="lab-body">
      <div className="detail-head">
        <div className="detail-head-in">
          <div className="dh-left">
            <Link href={`/mountains/${slug}${target ? `?target=${target}` : ""}`} className="dh-back" aria-label="Back to detail">
              <Icons.arrowLeft size={18} />
            </Link>
            <div style={{ minWidth: 0 }}>
              <div className="dh-title">{mountain.name} · 3D</div>
              <div className="dh-meta">
                <span>
                  <Icons.compass size={13} style={{ verticalAlign: -2 }} /> Drag to orbit · scroll to zoom
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {!isLoading && status === "unavailable" ? (
        <div className="panel" role="status">
          <div className="kicker">3D model</div>
          <p style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "8px 0 0" }}>
            3D model not available yet.
          </p>
        </div>
      ) : !isLoading && status === "error" ? (
        <div className="panel" role="alert" style={{ flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
          <div className="kicker">3D model</div>
          <p style={{ fontFamily: "var(--serif)", fontSize: 18, margin: "8px 0 0" }}>
            Couldn&apos;t load the 3D model.
          </p>
          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: "4px 0 8px" }}>
            This may be a temporary issue.
          </p>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => retryMeta()}>
            Retry
          </button>
        </div>
      ) : (
        <>
          <div className="panel" style={{ flexDirection: "column", alignItems: "stretch", gap: 0 }}>
            {/* D8: 2-col grid so toggle chips have equal width and align on mobile */}
            <div
              className="three-controls"
              role="group"
              aria-label="3D overlay toggles"
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}
            >
              {TOGGLES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`btn btn-sm ${show[t.key] ? "btn-primary" : "btn-ghost"}`}
                  aria-pressed={show[t.key]}
                  disabled={t.disabled}
                  onClick={() => toggle(t.key)}
                  style={{ width: "100%" }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* D9: inline disabled-toggle reasons (title attr is desktop-only on touch) */}
            {TOGGLES.filter((t) => t.disabled && t.hint).length > 0 && (
              <ul
                style={{ margin: "0 0 8px", padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 2 }}
                aria-label="Disabled overlay notes"
              >
                {TOGGLES.filter((t) => t.disabled && t.hint).map((t) => (
                  <li key={t.key} style={{ fontSize: 11, color: "var(--ink-2)" }}>
                    <span style={{ fontWeight: 500 }}>{t.label}:</span> {t.hint}
                  </li>
                ))}
              </ul>
            )}

            {/* D7: compact disclaimer directly under the toggle bar */}
            <p
              className="three-disclaimer"
              style={{ fontSize: 11, color: "var(--ink-2)", fontStyle: "italic", margin: "0 0 10px" }}
            >
              Illustrative — not for navigation.
            </p>

            <div
              data-testid="mountain3d-canvas"
              className="three-stage"
              style={{ width: "100%", height: "min(70vh, 620px)", borderRadius: 12, overflow: "hidden", background: "var(--surface-2)" }}
            >
              {meta && (
                <Mountain3D
                  slug={slug}
                  meta={meta}
                  modelUrl={terrainModelUrl(slug)}
                  freezingFt={freezingFt}
                  routes={routes}
                  markers={markers}
                  show={show}
                  satelliteUrl={satelliteUrl}
                  mountain={{ name: mountain.name, elevations: mountain.elevations }}
                />
              )}
            </div>
          </div>

          <div className="detail-grid cols-2">
            <div className="panel" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div className="kicker">Routes</div>
              <h3 style={{ fontFamily: "var(--serif)", fontSize: 18, fontWeight: 500, margin: "4px 0 10px" }}>
                Illustrative summit routes
              </h3>
              {routes.length > 0 ? (
                <ul className="three-legend" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                  {routes.map((r) => (
                    <li key={r.name} style={{ display: "flex", flexDirection: "column" }}>
                      <span style={{ fontWeight: 500 }}>{r.name}</span>
                      {r.grade && <span className="mono-dim" style={{ fontSize: 12 }}>{r.grade}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mono-dim" style={{ fontSize: 13 }}>No mapped routes for this peak yet.</p>
              )}
              <p
                className="three-disclaimer"
                style={{ marginTop: 14, fontSize: 12, color: "var(--ink-2)", fontStyle: "italic" }}
              >
                Illustrative — not for navigation. Routes are approximate, drawn from public
                descriptions and topo, and must not be used for routefinding.
              </p>
            </div>

            <div className="panel" style={{ flexDirection: "column", alignItems: "stretch" }}>
              <div className="kicker">About</div>
              <p style={{ fontSize: 14, lineHeight: 1.6, color: "var(--ink-2)", margin: "6px 0 0" }}>
                Terrain is a baked elevation model with 1.6× vertical exaggeration so relief reads
                clearly. The freezing-level plane shows the live snow line for your pinned date; the
                slope-angle layer highlights 30–45° terrain.
              </p>
              <p className="mono-dim" style={{ fontSize: 12, marginTop: 14 }}>
                USGS 3DEP · USFS CC BY 4.0 · © OpenStreetMap contributors
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
