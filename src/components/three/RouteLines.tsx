"use client";
/* A13 (revised): climbing-route polylines DRAPED onto the terrain surface.
   The authored route elevations are illustrative, so instead of trusting them we raycast
   straight down onto the loaded GLB at each point and snap the line to the real surface
   (with a small lift to avoid z-fighting). Segments are densified so the line follows the
   terrain smoothly and reaches the summit. Each route carries an in-scene name label. */
import * as React from "react";
import { Line } from "@react-three/drei";
import { llaToMesh, type TerrainMeta, type RouteLine } from "@/lib/terrain";
import { useSurfaceSampler } from "./useSurfaceSampler";
import { useTerrainMesh } from "./useTerrainMesh";
import { SceneLabel } from "./SceneLabel";

// Calm, distinct per-route palette (cycled if there are more routes than colours).
const ROUTE_COLORS = ["#5aa9e6", "#f2a154", "#7ec98f", "#c98fd6", "#e6c75a"];
const LIFT = 15; // mesh units above the sampled surface
const STEPS = 12; // densification per authored segment

/** Drape one authored route: densify in lng/lat, snap each point to the surface. */
function drapeRoute(
  meta: TerrainMeta,
  sampleY: (x: number, z: number) => number | null,
  pts: [number, number, number][],
): [number, number, number][] {
  const out: [number, number, number][] = [];
  const push = (lng: number, lat: number) => {
    const [x, , z] = llaToMesh(meta, lng, lat, meta.minElevM);
    const y = sampleY(x, z);
    if (y != null) out.push([x, y + LIFT, z]);
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const [aLng, aLat] = pts[i];
    const [bLng, bLat] = pts[i + 1];
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS;
      push(aLng + (bLng - aLng) * t, aLat + (bLat - aLat) * t);
    }
  }
  const last = pts[pts.length - 1];
  push(last[0], last[1]); // exact summit point
  return out;
}

export function RouteLines({
  meta,
  routes,
  modelUrl,
}: {
  meta: TerrainMeta;
  routes: RouteLine[];
  modelUrl: string;
}) {
  const sampleY = useSurfaceSampler(modelUrl);
  const terrain = useTerrainMesh(modelUrl);

  const draped = React.useMemo(
    () =>
      routes.map((r) => ({
        name: r.name,
        points: drapeRoute(meta, sampleY, r.points),
      })),
    [routes, meta, sampleY],
  );

  return (
    <>
      {draped.map((route, i) =>
        route.points.length >= 2 ? (
          <group key={`${route.name}-${i}`}>
            <Line
              points={route.points}
              color={ROUTE_COLORS[i % ROUTE_COLORS.length]}
              lineWidth={3}
              polygonOffset
              polygonOffsetFactor={-4}
            />
            <SceneLabel
              position={route.points[Math.floor(route.points.length / 2)]}
              terrain={terrain}
              center
              className="three-route-chip"
              style={{ borderColor: ROUTE_COLORS[i % ROUTE_COLORS.length] }}
            >
              {route.name}
            </SceneLabel>
          </group>
        ) : null,
      )}
    </>
  );
}
