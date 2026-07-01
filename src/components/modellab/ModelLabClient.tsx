/* ModelLabClient — SWR data wrapper for the /mountains/[slug]/models route. Fetches the
   combined weather blob + snapshot history for a mountain, then mounts <ModelLab>. Mirrors the
   MountainDetail pattern (mountain-scoped SWR hooks + calm loading / SectionError fallbacks). */
"use client";
import * as React from "react";
import { ModelLab } from "./ModelLab";
import { SectionError } from "@/components/shared/SectionError";
import { Skeleton } from "@/components/shared/Skeleton";
import { useMountainWeather, useMountainSnapshots } from "@/lib/hooks";
import type { Mountain } from "@/lib/types";

export interface ModelLabClientProps {
  mountain: Pick<Mountain, "slug" | "name" | "lat" | "lng">;
  /** ?target=YYYY-MM-DD; absent ⇒ no forecast-evolution chart */
  target?: string;
}

export function ModelLabClient({ mountain, target }: ModelLabClientProps) {
  const slug = mountain.slug;
  const { blob, isLoading, isValidating, error: weatherError, mutate } = useMountainWeather(slug);
  const { snapshots } = useMountainSnapshots(slug);

  if (weatherError && !blob) {
    return (
      <div className="lab-body">
        <SectionError message="Couldn't load the model data." onRetry={() => mutate()} />
      </div>
    );
  }
  if (isLoading || !blob) {
    return (
      <div className="lab-body" data-testid="modellab-loading">
        <div className="lab-grid">
          <Skeleton variant="chart" name="model-temp" />
          <Skeleton variant="chart" name="model-wind" />
        </div>
        <Skeleton variant="panel" name="evolution" />
      </div>
    );
  }

  return (
    <ModelLab
      mountain={mountain}
      blob={blob}
      snapshots={snapshots ?? []}
      target={target}
      updating={isValidating}
    />
  );
}
