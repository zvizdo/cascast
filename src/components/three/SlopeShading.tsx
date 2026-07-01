"use client";
/* A12 (revised): avalanche slope-angle band (30–45°). Overlays the terrain geometry with a
   ShaderMaterial that derives the TRUE geometric normal from screen-space derivatives of the
   world position (so it works regardless of whether the GLB ships vertex normals — trimesh
   often doesn't), then discards fragments outside the band and tints the rest orange→red. */
import * as React from "react";
import { ShaderMaterial, Mesh, DoubleSide, type BufferGeometry } from "three";
import { useGLTF } from "@react-three/drei";

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorld;
  void main() {
    vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    float slope = degrees(acos(clamp(abs(n.y), 0.0, 1.0)));
    if (slope < 30.0 || slope > 45.0) discard;
    // 30–38° amber, 38–45° red (the most avalanche-prone band).
    vec3 col = mix(vec3(0.98, 0.62, 0.16), vec3(0.85, 0.13, 0.10), smoothstep(30.0, 45.0, slope));
    gl_FragColor = vec4(col, 0.62);
  }
`;

export function SlopeShading({ modelUrl }: { modelUrl: string }) {
  const { scene } = useGLTF(modelUrl);

  const geometry = React.useMemo<BufferGeometry | null>(() => {
    let geo: BufferGeometry | null = null;
    scene.traverse((o) => {
      if (!geo && (o as Mesh).isMesh) geo = (o as Mesh).geometry as BufferGeometry;
    });
    return geo;
  }, [scene]);

  const material = React.useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    [],
  );

  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} />;
}
