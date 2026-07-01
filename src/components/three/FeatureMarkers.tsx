"use client";
/* Named place markers. Glaciers render as text laid on the mountain side (GlacierLabels);
   camps & landmarks render as small pin dots + a chip label that hides behind the terrain
   (SceneLabel does the BVH-accelerated occlusion). */
import * as React from "react";
import { llaToMesh, type TerrainMeta, type PlaceMarker, type MarkerKind } from "@/lib/terrain";
import { useSurfaceSampler } from "./useSurfaceSampler";
import { useTerrainMesh } from "./useTerrainMesh";
import { SceneLabel } from "./SceneLabel";
import { GlacierLabels } from "./GlacierLabels";

const KIND_COLOR: Record<MarkerKind, string> = {
  camp: "#e0a33f", // amber — human places
  glacier: "#7fc6e6", // (handled by GlacierLabels)
  landmark: "#b07fd0", // violet — features
};
const KIND_GLYPH: Record<Exclude<MarkerKind, "glacier">, string> = { camp: "△", landmark: "◆" };
const LIFT = 10;

export function FeatureMarkers({
  meta,
  modelUrl,
  markers,
}: {
  meta: TerrainMeta;
  modelUrl: string;
  markers: PlaceMarker[];
}) {
  const sampleY = useSurfaceSampler(modelUrl);
  const terrain = useTerrainMesh(modelUrl);
  const [hover, setHover] = React.useState<string | null>(null);

  const glaciers = React.useMemo(() => markers.filter((m) => m.kind === "glacier"), [markers]);
  const pins = React.useMemo(
    () =>
      markers
        .filter((m) => m.kind !== "glacier")
        .map((m) => {
          const [x, , z] = llaToMesh(meta, m.lng, m.lat, meta.minElevM);
          const y = sampleY(x, z);
          return y == null ? null : { ...m, pos: [x, y + LIFT, z] as [number, number, number] };
        })
        .filter((m): m is PlaceMarker & { pos: [number, number, number] } => m != null),
    [markers, meta, sampleY],
  );

  return (
    <>
      <GlacierLabels meta={meta} modelUrl={modelUrl} glaciers={glaciers} />
      {pins.map((m) => {
        const color = KIND_COLOR[m.kind];
        const active = hover === m.name;
        return (
          <React.Fragment key={m.name}>
            <mesh position={m.pos}>
              <sphereGeometry args={[active ? 24 : 16, 12, 12]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <SceneLabel
              position={m.pos}
              terrain={terrain}
              center
              pointerEvents="auto"
              className={`three-place-chip${active ? " is-active" : ""}`}
              style={{ borderColor: color }}
            >
              <span
                onPointerEnter={() => setHover(m.name)}
                onPointerLeave={() => setHover((h) => (h === m.name ? null : h))}
                style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
              >
                <span className="three-place-glyph" style={{ color }}>
                  {KIND_GLYPH[m.kind as Exclude<MarkerKind, "glacier">]}
                </span>
                {m.name}
              </span>
            </SceneLabel>
          </React.Fragment>
        );
      })}
    </>
  );
}
