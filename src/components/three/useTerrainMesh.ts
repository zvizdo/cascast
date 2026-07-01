"use client";
/* Shared accessor for the loaded terrain Mesh, with a BVH built on its geometry so the
   per-frame occlusion raycasts (drei <Html occlude={[terrain]}>) and surface sampling are
   cheap (O(log n) instead of testing all 130k triangles). Patches three's raycast globally
   once. The terrain mesh is passed as the ONLY occlude target so labels hide behind the
   mountain but NOT behind their own marker dots. */
import * as React from "react";
import { BufferGeometry, Mesh } from "three";
import { useGLTF } from "@react-three/drei";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";

// Patch once (idempotent — reassigning the same fns is harmless).
(BufferGeometry.prototype as unknown as { computeBoundsTree: typeof computeBoundsTree }).computeBoundsTree =
  computeBoundsTree;
(BufferGeometry.prototype as unknown as { disposeBoundsTree: typeof disposeBoundsTree }).disposeBoundsTree =
  disposeBoundsTree;
Mesh.prototype.raycast = acceleratedRaycast;

export function useTerrainMesh(modelUrl: string): Mesh | null {
  const { scene } = useGLTF(modelUrl);
  return React.useMemo(() => {
    let mesh: Mesh | null = null;
    scene.traverse((o) => {
      if (!mesh && (o as Mesh).isMesh) mesh = o as Mesh;
    });
    if (mesh) {
      const geo = (mesh as Mesh).geometry as BufferGeometry & { boundsTree?: unknown; computeBoundsTree?: () => void };
      if (!geo.boundsTree) {
        try {
          geo.computeBoundsTree?.();
        } catch {
          /* BVH is an optimization; fall back to default raycast on failure */
        }
      }
    }
    return mesh;
  }, [scene]);
}
