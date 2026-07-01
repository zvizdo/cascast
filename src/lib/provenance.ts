import type { CombinedForecastBlob } from "@/lib/types";
import type { ProvenanceData } from "@/components/shared/Provenance";
import { formatTimeAgo } from "@/lib/format";
import type { SourceMeta } from "@/lib/hazards/types";

export type ModelId = "hrrr" | "gfs" | "ecmwf";

export interface WeatherProvenance {
  kind: "model";
  model: ModelId;
  label: string;
  reason: string;
  blend?: { model: ModelId; fromHour: number }[];
}
export interface SourceProvenance {
  kind: "source";
  label: string;
  observedAt?: string;
  distanceMi?: number;
  note?: string;
}
export type Provenance = WeatherProvenance | SourceProvenance;

const LABELS: Record<ModelId, string> = { hrrr: "HRRR", gfs: "GFS", ecmwf: "ECMWF" };

export function weatherProvenance(
  blob: CombinedForecastBlob,
  model: ModelId,
  opts: { variable?: "freezing" } = {},
): WeatherProvenance {
  const hasHrrr = !!blob.hrrr?.available;
  const hasGfs = !!blob.gfs?.available;
  let reason: string;
  if (opts.variable === "freezing") {
    reason =
      model === "gfs"
        ? "GFS is the only model with a freezing-level field at this range (HRRR ends ~48 h, ECMWF has no freezing-level field)."
        : `${LABELS[model]} provides the freezing level at this range.`;
  } else if (model === "hrrr") {
    reason = "HRRR is the highest-resolution model for the near term (~48 h).";
  } else if (model === "gfs") {
    reason = hasHrrr ? "Beyond HRRR's ~48 h horizon, GFS carries the forecast." : "GFS global model.";
  } else {
    reason = "ECMWF global model.";
  }
  const blend =
    model === "hrrr" && hasGfs
      ? [{ model: "hrrr" as ModelId, fromHour: 0 }, { model: "gfs" as ModelId, fromHour: 48 }]
      : undefined;
  return { kind: "model", model, label: LABELS[model], reason, blend };
}

export function sourceProvenance(meta: SourceMeta, opts: { reason?: string; href?: string } = {}): ProvenanceData {
  const parts: string[] = [];
  if (meta.distanceMi != null) parts.push(`${Math.round(meta.distanceMi)} mi`);
  if (meta.observedAt) parts.push(formatTimeAgo(meta.observedAt));
  return {
    label: meta.source,
    reason: opts.reason ?? meta.note ?? `Live reading from ${meta.source}.`,
    meta: parts.join(" · ") || undefined,
    href: opts.href ?? "/sources",
  };
}

export function toProvenanceData(p: WeatherProvenance, opts: { meta?: string } = {}): ProvenanceData {
  const label = p.blend ? `${LABELS[p.blend[0].model]}→${LABELS[p.blend[1].model]}` : p.label;
  return { label, reason: p.reason, meta: opts.meta, href: "/sources" };
}
