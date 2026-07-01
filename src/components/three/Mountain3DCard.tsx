/* A15 (revised): flip ONLY the cross-section graphic (the host keeps its panel header). Front =
   the existing 2D hero (children); back = a stylized 3D cross-section locked to a side view that
   spins on its vertical axis only (can't tip over the top) and slowly auto-orbits. The flip
   button overlays the graphic. Only shown when a baked terrain model exists AND WebGL works. */
"use client";
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Icons } from "@/components/icons/icons";
import { useTerrainMeta } from "@/lib/hooks";
import { terrainModelUrl } from "@/lib/terrain";

const Mountain3D = dynamic(() => import("@/components/three/Mountain3D"), { ssr: false });

export interface Mountain3DCardProps {
  slug: string;
  target?: string;
  mountain: { name: string; elevations: { base: number; mid: number; summit: number } };
  freezingFt?: number | null;
  children: React.ReactNode;
}

/** One-time WebGL feature detection (jsdom/SSR safe). */
function webglSupported(): boolean {
  if (typeof window === "undefined" || !window.WebGLRenderingContext) return false;
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl") || c.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function Mountain3DCard({ slug, target, mountain, freezingFt, children }: Mountain3DCardProps) {
  const { available, meta } = useTerrainMeta(slug);
  const [flipped, setFlipped] = React.useState(false);
  const [webgl, setWebgl] = React.useState(false);
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    setWebgl(webglSupported());
    setReduced(prefersReducedMotion());
  }, []);

  const canFlip = available && webgl;
  if (!canFlip) return <>{children}</>;

  const explore3dHref = `/mountains/${slug}/3d${target ? `?target=${target}` : ""}`;

  return (
    <div className={`xflip${flipped ? " flipped" : ""}`}>
      {/* Toggle lives ABOVE the graphic (not overlaying it) so it never covers the summit
          temperature on mobile. */}
      <div className="xflip-bar">
        <button
          type="button"
          className="xflip-toggle"
          data-testid="flip3d-toggle"
          aria-pressed={flipped}
          aria-label={flipped ? "Show 2D cross-section" : "View in 3D"}
          onClick={() => setFlipped((f) => !f)}
        >
          <Icons.eye size={14} /> {flipped ? "2D cross-section" : "View in 3D"}
        </button>
      </div>

      <div className={`xflip-inner${flipped ? " is-flipped" : ""}`}>
        <div className="xflip-face xflip-front">{children}</div>
        <div className="xflip-face xflip-back" aria-hidden={!flipped}>
          <div data-testid="mountain3d-card-canvas" className="xflip-stage">
            {flipped && meta && (
              <Mountain3D
                slug={slug}
                meta={meta}
                modelUrl={terrainModelUrl(slug)}
                freezingFt={freezingFt}
                compact
                lockView
                autoRotate={!reduced}
                show={{ satellite: true, freezing: freezingFt != null, routes: false, places: false, slope: false, labels: true }}
                satelliteUrl={`/api/mountains/${slug}/satellite/image`}
                mountain={mountain}
              />
            )}
          </div>
          <Link href={explore3dHref} className="xflip-explore">
            <Icons.compass size={14} /> Explore in 3D →
          </Link>
        </div>
      </div>
    </div>
  );
}
