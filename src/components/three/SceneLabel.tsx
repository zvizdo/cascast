"use client";
/* A drei <Html> label that hides when the terrain is between it and the camera. We do the
   occlusion ourselves (instead of drei's `occlude`, which proved unreliable with a passed
   mesh ref): each frame, raycast camera→label against the terrain ONLY (BVH-accelerated, so
   it's cheap) and fade the label out when something is in front. Raycasting just the terrain
   means a label is never hidden by its own marker dot. */
import * as React from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { Raycaster, Vector3, type Mesh } from "three";

export function SceneLabel({
  position,
  terrain,
  center,
  className,
  style,
  children,
  pointerEvents = "none",
}: {
  position: [number, number, number];
  terrain: Mesh | null;
  center?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
  pointerEvents?: React.CSSProperties["pointerEvents"];
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const ray = React.useMemo(() => new Raycaster(), []);
  const camPos = React.useMemo(() => new Vector3(), []);
  const labelPos = React.useMemo(() => new Vector3(), []);
  const dir = React.useMemo(() => new Vector3(), []);

  useFrame(({ camera }) => {
    const el = ref.current;
    if (!el) return;
    if (!terrain) {
      el.style.opacity = "1";
      return;
    }
    camera.getWorldPosition(camPos);
    labelPos.set(position[0], position[1], position[2]);
    dir.copy(labelPos).sub(camPos);
    const dist = dir.length();
    dir.normalize();
    ray.set(camPos, dir);
    // Stop just short of the label so the surface it sits on doesn't self-occlude it.
    ray.far = Math.max(dist - 60, 0);
    (ray as Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true; // three-mesh-bvh fast path
    const occluded = ray.intersectObject(terrain, true).length > 0;
    el.style.opacity = occluded ? "0" : "1";
    el.style.pointerEvents = occluded ? "none" : (pointerEvents as string);
  });

  return (
    <Html position={position} center={center} style={{ pointerEvents: "none" }}>
      <div
        ref={ref}
        className={className}
        style={{ transition: "opacity .14s ease", pointerEvents, ...style }}
      >
        {children}
      </div>
    </Html>
  );
}
