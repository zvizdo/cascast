"use client";
/* A10 (stylized): the freezing-level / snow-line. A soft translucent cool plane at the
   freezing elevation, with a brighter rim outline so the snow line reads cleanly where it
   meets the terrain. */
import { DoubleSide, Vector3 } from "three";
import { Line, Html } from "@react-three/drei";
import { freezingPlaneY, type TerrainMeta } from "@/lib/terrain";
import { useUnits, fmtDist } from "@/lib/units";

export function FreezingPlane({ meta, freezingFt }: { meta: TerrainMeta; freezingFt: number }) {
  const { dist } = useUnits();
  const width = (meta.bbox.east - meta.bbox.west) * meta.metersPerDegLng;
  const depth = (meta.bbox.north - meta.bbox.south) * meta.metersPerDegLat;
  const y = freezingPlaneY(meta, freezingFt);
  const hw = width / 2;
  const hd = depth / 2;
  const label = fmtDist(freezingFt, dist);

  // Perimeter outline (a brighter "snow line" frame at the plane edge).
  const rim: [number, number, number][] = [
    [-hw, y, -hd],
    [hw, y, -hd],
    [hw, y, hd],
    [-hw, y, hd],
    [-hw, y, -hd],
  ];

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, y, 0]} renderOrder={2}>
        <planeGeometry args={[width, depth]} />
        <meshBasicMaterial
          color="#bfe6f5"
          transparent
          opacity={0.18}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <Line points={rim.map((p) => new Vector3(...p))} color="#9fd9ee" lineWidth={1.5} transparent opacity={0.8} />
      <Html position={[hw, y, 0]} center style={{ pointerEvents: "none" }}>
        <div className="three-freezing-chip">
          <span className="three-freezing-kicker">Freezing level</span>
          <span className="three-freezing-val">{label}</span>
        </div>
      </Html>
    </group>
  );
}
