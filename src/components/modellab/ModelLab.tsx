/* ModelLab — the data-heavy, aviation-style drill-down shell. Ported from app/modellab.jsx
   ModelLab (lines 19–104) + DESIGN.md §13. Holds the shared model-chip `active` state and
   composes ModelCharts + ForecastEvolutionChart + HourlyGrid. Mountains-first: scoped to a
   mountain (slug) with an optional ?target date — when no target, the forecast-evolution chart
   is replaced by a "pin a date" prompt and the charts/grid default to the first forecast day. */
"use client";
import * as React from "react";
import Link from "next/link";
import { Icons } from "@/components/icons/icons";
import { LastUpdated } from "@/components/shared/LastUpdated";
import { UpdatingPill } from "@/components/shared/UpdatingPill";
import { CopyLinkButton } from "@/components/shared/CopyLinkButton";
import { ModelCharts } from "./ModelCharts";
import { ForecastEvolutionChart } from "./ForecastEvolutionChart";
import { HourlyGrid } from "./HourlyGrid";
import { ModelInfo } from "./ModelInfo";
import { dayKeys } from "@/lib/derive";
import type { ModelKey } from "@/lib/forecast-select";
import type { CombinedForecastBlob, WeatherSnapshot, Mountain } from "@/lib/types";

export interface ModelLabProps {
  mountain: Pick<Mountain, "slug" | "name" | "lat" | "lng">;
  blob: CombinedForecastBlob;
  snapshots: WeatherSnapshot[];
  /** ?target=YYYY-MM-DD; absent ⇒ no forecast-evolution chart (a "pin a date" prompt instead). */
  target?: string;
  /** SWR background revalidation in progress → shows the "Updating…" pill */
  updating?: boolean;
}

const MODELS: { key: ModelKey; label: string; color: string; res: string }[] = [
  { key: "hrrr", label: "HRRR", color: "var(--accent)", res: "3 km · 0–48 h" },
  { key: "gfs", label: "GFS", color: "var(--caution)", res: "25 km · 16 d" },
  { key: "ecmwf", label: "ECMWF", color: "var(--good)", res: "9 km · 15 d" },
];

export function ModelLab({ mountain, blob, snapshots, target, updating = false }: ModelLabProps) {
  const [active, setActive] = React.useState<Record<ModelKey, boolean>>({
    hrrr: true,
    gfs: true,
    ecmwf: true,
  });

  // The day the charts + hourly grid focus on: the target when set, else the first forecast day.
  const series = blob.gfs ?? blob.hrrr ?? blob.ecmwf;
  const days = series ? dayKeys(series) : [];
  const focusDate = target ?? days[0] ?? "";

  return (
    <div className="lab">
      <div className="lab-head">
        <div className="lab-head-in">
          <Link
            href={target ? `/mountains/${mountain.slug}?target=${target}` : `/mountains/${mountain.slug}`}
            className="dh-back"
            aria-label="Back"
          >
            <Icons.arrowLeft size={18} />
          </Link>
          <div className="lab-title">Model Lab — {mountain.name}</div>
          <span className="mono-dim" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
            <LastUpdated iso={blob.fetchedAt} />
            <UpdatingPill show={updating} />
          </span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto", flexWrap: "wrap", alignItems: "center" }}>
            <CopyLinkButton />
            {MODELS.map((m) => (
              <button
                key={m.key}
                type="button"
                className="modeltag"
                aria-pressed={active[m.key]}
                onClick={() => setActive((a) => ({ ...a, [m.key]: !a[m.key] }))}
                style={{
                  background: active[m.key]
                    ? `color-mix(in srgb, ${m.color} 15%, var(--surface))`
                    : "var(--surface-2)",
                  color: active[m.key] ? m.color : "var(--faint)",
                  border: `1px solid ${
                    active[m.key] ? `color-mix(in srgb, ${m.color} 35%, transparent)` : "var(--line)"
                  }`,
                  cursor: "pointer",
                  opacity: active[m.key] ? 1 : 0.6,
                }}
              >
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: m.color,
                    display: "inline-block",
                  }}
                />{" "}
                {m.label}
                {/* E5: hide res sub-label on mobile so chips don't wrap into a tall block */}
                <span className="only-desktop" style={{ fontSize: 9, opacity: 0.7 }}>{m.res}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="lab-body">
        {/* E10: lab-intro class so ≤480 CSS can tone this block (smaller/secondary) */}
        <p
          className="lab-intro"
          style={{
            fontFamily: "var(--mono)",
            color: "var(--muted)",
            margin: 0,
            maxWidth: "60ch",
            lineHeight: 1.6,
          }}
        >
          RAW MULTI-MODEL COMPARISON · {mountain.lat.toFixed(4)}, {mountain.lng.toFixed(4)} · TZ
          AMERICA/LOS_ANGELES · {target ? `TARGET ${target} HIGHLIGHTED` : "NO TARGET PINNED"}.
          Convergence ⇒ confidence; divergence ⇒ uncertainty.
        </p>

        <ModelInfo />

        <div className="lab-grid">
          <ModelCharts blob={blob} targetDate={focusDate} active={active} />
        </div>

        <div className="lab-panel">
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.05em", marginBottom: 12 }}>
            Forecast evolution — are the models locking in?
          </div>
          {target ? (
            <ForecastEvolutionChart snapshots={snapshots} targetDate={target} active={active} />
          ) : (
            <p
              className="mono-dim"
              data-testid="evolution-prompt"
              style={{ margin: 0, fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}
            >
              Pin a date to see how the forecast for that day has shifted across model runs.
            </p>
          )}
        </div>

        <div className="lab-panel">
          <div style={{ fontFamily: "var(--mono)", fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.05em", marginBottom: 12 }}>
            Hourly grid — {focusDate}
          </div>
          <HourlyGrid blob={blob} targetDate={focusDate} />
        </div>
      </div>
    </div>
  );
}
