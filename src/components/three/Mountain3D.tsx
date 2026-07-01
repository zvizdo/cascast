"use client";
/* A9: core 3D viewer — GLB terrain + orbit + framed camera, with toggleable overlays.
   All math lives in lib/terrain.ts (tested); this file is logic-light visual glue. */
import * as React from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import { Mesh, MeshStandardMaterial } from "three";
import { cameraFraming, type TerrainMeta, type RouteLine } from "@/lib/terrain";
import { FreezingPlane } from "./FreezingPlane";
import { SummitMarker } from "./SummitMarker";
import { SlopeShading } from "./SlopeShading";
import { RouteLines } from "./RouteLines";
import { SatelliteDrape } from "./SatelliteDrape";
import { FeatureMarkers } from "./FeatureMarkers";
import type { PlaceMarker } from "@/lib/terrain";

export interface Mountain3DProps {
  slug: string;
  meta: TerrainMeta;
  modelUrl: string;
  freezingFt?: number | null;
  routes?: RouteLine[];
  markers?: PlaceMarker[];
  show: {
    freezing: boolean;
    routes: boolean;
    slope: boolean;
    labels: boolean;
    satellite: boolean;
    places: boolean;
  };
  compact?: boolean;
  /** Display name + ft elevations for the summit label; falls back to meta when absent. */
  mountain?: { name: string; elevations: { base: number; mid: number; summit: number } };
  /** Satellite scene image URL; when show.satellite is on it's draped over the terrain. */
  satelliteUrl?: string;
  /** Side-view "cross-section" mode: lock the polar angle so it only spins on its vertical
   *  axis (no panning, can't tip over the top). */
  lockView?: boolean;
  /** Slowly auto-orbit (used by the stylized cross-section card). */
  autoRotate?: boolean;
}

const SIDE_MIN = (74 * Math.PI) / 180;
const SIDE_MAX = (84 * Math.PI) / 180;

/** Loads + renders the baked terrain GLB. trimesh exports a glTF material with the glTF
 *  default metalness=1 (renders near-black with no env map), so we replace each mesh's
 *  material with a matte, vertex-coloured one so the baked hypsometric relief actually shows. */
function Terrain({ modelUrl }: { modelUrl: string }) {
  const { scene } = useGLTF(modelUrl);
  React.useMemo(() => {
    scene.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh) return;
      const hasColor = !!m.geometry.getAttribute("color");
      m.material = new MeshStandardMaterial({
        vertexColors: hasColor,
        color: hasColor ? 0xffffff : 0x9aa0a6,
        metalness: 0,
        roughness: 0.95,
        flatShading: false,
      });
    });
  }, [scene]);
  return <primitive object={scene} />;
}

/** Calm fallback when the GLB / WebGL fails so the page never crashes. */
class GLErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// Visible DOM fallback for any 3D failure (WebGL unsupported / context lost / GLB
// load error). It MUST live OUTSIDE the <Canvas> — a plain <div> rendered inside the
// R3F reconciler throws "Div is not part of the THREE namespace". So the inner
// Suspense/boundary fallbacks stay R3F-safe (null) and errors bubble to the outer
// boundary below, which renders this message in the normal DOM tree.
const Unavailable = (
  <div className="three-fallback" role="alert">
    3D model couldn&apos;t load — try reloading the page.
  </div>
);

export default function Mountain3D({
  meta,
  modelUrl,
  freezingFt,
  routes,
  markers,
  show,
  compact,
  mountain,
  satelliteUrl,
  lockView,
  autoRotate,
}: Mountain3DProps) {
  const framing = cameraFraming(meta);
  const distance = compact ? framing.distance * 0.85 : framing.distance;
  // Side-on framing for the locked cross-section view; 3/4 aerial otherwise.
  const position: [number, number, number] = lockView
    ? [framing.target[0] + distance * 0.96, framing.target[1] + distance * 0.32, framing.target[2] + distance * 0.96]
    : [framing.target[0] + distance * 0.7, framing.target[1] + distance * 0.6, framing.target[2] + distance * 0.7];

  return (
    <GLErrorBoundary fallback={Unavailable}>
      <Canvas
        /* Cap the pixel ratio: on retina/mobile the per-fragment cost dominates spin FPS;
           1.75 keeps it crisp while roughly halving fragment work vs native dpr 2–3. */
        dpr={[1, 1.75]}
        camera={{ position, fov: 45, near: 1, far: distance * 8 }}
        style={{ width: "100%", height: "100%" }}
      >
        <ambientLight intensity={0.7} />
        {/* Sun: NW azimuth 315°, altitude 45°. */}
        <directionalLight position={[-distance, distance, distance]} intensity={1.1} />
        <React.Suspense fallback={null}>
          <Terrain modelUrl={modelUrl} />
          {show.satellite && satelliteUrl && (
            <SatelliteDrape modelUrl={modelUrl} meta={meta} imageUrl={satelliteUrl} />
          )}
          {show.slope && <SlopeShading modelUrl={modelUrl} />}
          {show.freezing && freezingFt != null && (
            <FreezingPlane meta={meta} freezingFt={freezingFt} />
          )}
          {show.labels && (
            <SummitMarker
              meta={meta}
              modelUrl={modelUrl}
              mountain={
                mountain ?? {
                  name: meta.slug,
                  elevations: { base: meta.minElevM, mid: 0, summit: meta.summit.elevM },
                }
              }
            />
          )}
          {show.routes && routes && routes.length > 0 && (
            <RouteLines meta={meta} routes={routes} modelUrl={modelUrl} />
          )}
          {show.places && markers && markers.length > 0 && (
            <FeatureMarkers meta={meta} markers={markers} modelUrl={modelUrl} />
          )}
        </React.Suspense>
        <OrbitControls
          enableDamping
          target={framing.target}
          enablePan={!lockView}
          autoRotate={autoRotate}
          autoRotateSpeed={0.5}
          minPolarAngle={lockView ? SIDE_MIN : 0}
          maxPolarAngle={lockView ? SIDE_MAX : Math.PI}
        />
      </Canvas>
    </GLErrorBoundary>
  );
}
