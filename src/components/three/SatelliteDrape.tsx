"use client";
/* Drape the real Sentinel-2 true-color JPEG onto the terrain so actual snow cover shows on
   the model. The satellite scene is a ±0.08° peak-centred square (functions: copernicus_client
   BBOX_DELTA); the terrain bbox is the ±0.06° baked square. Both share the same centre, so we
   sample only the central crop of the image per terrain vertex. Texture loads defensively — a
   missing/forbidden image simply omits the drape (never blanks the viewer). */
import * as React from "react";
import {
  Mesh,
  MeshBasicMaterial,
  TextureLoader,
  SRGBColorSpace,
  Float32BufferAttribute,
  type BufferGeometry,
  type Texture,
} from "three";
import { useGLTF } from "@react-three/drei";
import type { TerrainMeta } from "@/lib/terrain";

const SAT_DELTA = 0.08; // satellite half-span (deg). Keep in sync with copernicus_client.BBOX_DELTA.

export function SatelliteDrape({
  modelUrl,
  meta,
  imageUrl,
}: {
  modelUrl: string;
  meta: TerrainMeta;
  imageUrl: string;
}) {
  const { scene } = useGLTF(modelUrl);
  const [texture, setTexture] = React.useState<Texture | null>(null);

  React.useEffect(() => {
    let alive = true;
    const loader = new TextureLoader();
    loader.load(
      imageUrl,
      (t) => {
        t.colorSpace = SRGBColorSpace;
        if (alive) setTexture(t);
        else t.dispose();
      },
      undefined,
      () => {
        /* missing scene image → no drape */
      },
    );
    return () => {
      alive = false;
    };
  }, [imageUrl]);

  // Clone the terrain geometry and give it planar UVs cropped to the satellite footprint.
  const geometry = React.useMemo<BufferGeometry | null>(() => {
    let src: BufferGeometry | null = null;
    scene.traverse((o) => {
      if (!src && (o as Mesh).isMesh) src = (o as Mesh).geometry as BufferGeometry;
    });
    if (!src) return null;
    const geo = (src as BufferGeometry).clone();
    const pos = geo.getAttribute("position");
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      // mesh xyz -> degrees-from-centre (inverse of llaToMesh)
      const dLng = x / meta.metersPerDegLng;
      const dLat = -z / meta.metersPerDegLat;
      // map into the satellite image (north = image top = v1; west = image left = u0)
      uv[i * 2] = (dLng + SAT_DELTA) / (2 * SAT_DELTA);
      uv[i * 2 + 1] = (dLat + SAT_DELTA) / (2 * SAT_DELTA);
    }
    geo.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    return geo;
  }, [scene, meta]);

  const material = React.useMemo(() => {
    if (!texture) return null;
    // Faint + transparent so the shaded relief underneath still reads through the imagery.
    return new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
  }, [texture]);

  if (!geometry || !material) return null;
  return <mesh geometry={geometry} material={material} />;
}
