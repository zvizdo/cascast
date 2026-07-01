"use client";
/* A11: summit cone + a chip labelling name + summit elevation (ft), hidden when the peak is
   between it and the camera (SceneLabel occlusion). */
import { llaToMesh, type TerrainMeta } from "@/lib/terrain";
import { useUnits, fmtDist } from "@/lib/units";
import { useTerrainMesh } from "./useTerrainMesh";
import { SceneLabel } from "./SceneLabel";

export interface SummitMarkerProps {
  meta: TerrainMeta;
  mountain: { name: string; elevations: { base: number; mid: number; summit: number } };
  modelUrl: string;
}

export function SummitMarker({ meta, mountain, modelUrl }: SummitMarkerProps) {
  const pos = llaToMesh(meta, meta.summit.lng, meta.summit.lat, meta.summit.elevM);
  const { dist } = useUnits();
  const terrain = useTerrainMesh(modelUrl);
  const labelPos: [number, number, number] = [pos[0], pos[1] + 160, pos[2]];

  return (
    <>
      <mesh position={[pos[0], pos[1] + 60, pos[2]]}>
        <coneGeometry args={[40, 120, 12]} />
        <meshStandardMaterial color="#e8eef2" />
      </mesh>
      <SceneLabel position={labelPos} terrain={terrain} center className="three-summit-chip">
        <span className="three-summit-name">{mountain.name}</span>
        <span className="three-summit-elev">{fmtDist(mountain.elevations.summit, dist)}</span>
      </SceneLabel>
    </>
  );
}
