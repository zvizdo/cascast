"use client";
/* Shared terrain surface sampler: raycasts straight down onto the loaded GLB so overlays
   (routes, place markers) can snap to the real surface regardless of authored elevations. */
import * as React from "react";
import { Raycaster, Vector3, Box3, Mesh } from "three";
import { useGLTF } from "@react-three/drei";

export function useSurfaceSampler(modelUrl: string) {
  const { scene } = useGLTF(modelUrl);
  return React.useMemo(() => {
    scene.updateMatrixWorld(true);
    const meshes: Mesh[] = [];
    scene.traverse((o) => {
      if ((o as Mesh).isMesh) meshes.push(o as Mesh);
    });
    const box = new Box3().setFromObject(scene);
    const top = box.max.y + 5000;
    const ray = new Raycaster();
    const down = new Vector3(0, -1, 0);
    const origin = new Vector3();
    return (x: number, z: number): number | null => {
      origin.set(x, top, z);
      ray.set(origin, down);
      const hits = ray.intersectObjects(meshes, true);
      return hits.length ? hits[0].point.y : null;
    };
  }, [scene]);
}
