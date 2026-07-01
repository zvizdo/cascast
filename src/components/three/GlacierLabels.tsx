"use client";
/* Glacier names PROJECTED onto the mountain as decals — the whole word is rendered to a
   texture and wrapped onto the terrain surface via DecalGeometry, so it reads like a label
   painted on the slope, conforming continuously to the relief (not letter-by-letter). Being
   real surface geometry it depth-occludes behind the peak naturally. */
import * as React from "react";
import {
  Raycaster,
  Vector3,
  Euler,
  Matrix4,
  Quaternion,
  CanvasTexture,
  SRGBColorSpace,
  type Texture,
  type BufferGeometry,
} from "three";
import { DecalGeometry } from "three/examples/jsm/geometries/DecalGeometry.js";
import { llaToMesh, type TerrainMeta, type PlaceMarker } from "@/lib/terrain";
import { useTerrainMesh } from "./useTerrainMesh";

const UP = new Vector3(0, 1, 0);
const EAST = new Vector3(1, 0, 0);

/** Render a glacier name to a transparent texture (white fill + dark outline). */
function makeLabelTexture(text: string): { tex: Texture; aspect: number } | null {
  const FONT = 128;
  const probe = document.createElement("canvas").getContext("2d");
  if (!probe) return null;
  const fontSpec = `600 ${FONT}px ui-sans-serif, system-ui, sans-serif`;
  probe.font = fontSpec;
  const textW = probe.measureText(text).width;
  const padX = FONT * 0.5;
  const padY = FONT * 0.45;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(textW + padX * 2);
  canvas.height = Math.ceil(FONT + padY * 2);
  const ctx = canvas.getContext("2d")!;
  ctx.font = fontSpec;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = FONT * 0.16;
  ctx.strokeStyle = "rgba(18,46,58,0.92)";
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = "#f3fafe";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, aspect: canvas.width / canvas.height };
}

export function GlacierLabels({
  meta,
  modelUrl,
  glaciers,
}: {
  meta: TerrainMeta;
  modelUrl: string;
  glaciers: PlaceMarker[];
}) {
  const terrain = useTerrainMesh(modelUrl);
  // Text band height in world units (small — sits over the glacier).
  const height = ((meta.bbox.east - meta.bbox.west) * meta.metersPerDegLng) / 48;

  const decals = React.useMemo(() => {
    if (!terrain) return [];
    const ray = new Raycaster();
    (ray as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
    const down = new Vector3(0, -1, 0);
    const top = (meta.maxElevM - meta.minElevM) * meta.exaggeration + 6000;
    const out: { geom: BufferGeometry; tex: Texture }[] = [];
    for (const g of glaciers) {
      const made = makeLabelTexture(g.name);
      if (!made) continue;
      const [cx, , cz] = llaToMesh(meta, g.lng, g.lat, meta.minElevM);
      ray.set(new Vector3(cx, top, cz), down);
      const hit = ray.intersectObject(terrain, true);
      if (!hit.length) continue;
      const p = hit[0].point.clone();
      const n = hit[0].face ? hit[0].face.normal.clone() : UP.clone();
      if (n.y < 0) n.negate();
      n.normalize();
      // Basis: X = world-east projected onto the slope (baseline), Z = surface normal.
      const right = EAST.clone().sub(n.clone().multiplyScalar(EAST.dot(n)));
      if (right.lengthSq() < 1e-6) right.set(0, 0, 1);
      right.normalize();
      const up = new Vector3().crossVectors(n, right).normalize();
      const orientation = new Euler().setFromRotationMatrix(new Matrix4().makeBasis(right, up, n));
      const size = new Vector3(height * made.aspect, height, height * 4); // depth captures relief
      try {
        const geom = new DecalGeometry(terrain, p, orientation, size);
        out.push({ geom, tex: made.tex });
      } catch {
        /* skip a glacier whose projection fails */
      }
    }
    return out;
  }, [terrain, meta, glaciers, height]);

  return (
    <>
      {decals.map((d, i) => (
        <mesh key={i} geometry={d.geom} renderOrder={3}>
          <meshBasicMaterial
            map={d.tex}
            transparent
            depthWrite={false}
            polygonOffset
            polygonOffsetFactor={-24}
            polygonOffsetUnits={-24}
            toneMapped={false}
          />
        </mesh>
      ))}
    </>
  );
}
