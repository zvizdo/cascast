/* CallChart — the convergence "call" chart for the mountain detail page. Answers one question:
   "can I trust my day's forecast yet?". Three model lines (each model's prediction for the
   target day across lead time, decreasing left→right toward 0 = now) braid together over a soft
   cross-model spread fill; as the lines merge and the band narrows toward now, the call is
   settling. A verdict chip (the only amber/green element) gives the read; a one-line caption
   teaches it. The expert all-models split lives in the Model Lab. Sparse (<3 snapshots, or
   <2 runs) → a calm empty state. Self-contained SVG so the band and lines stay aligned. */
"use client";
import * as React from "react";
import { Segmented } from "@/components/shared/Segmented";
import { sx, niceMin, niceMax } from "@/components/charts/chart-utils";
import { useUnits, convTemp, convWind, convDist } from "@/lib/units";
import {
  convergenceRuns,
  convergenceVerdict,
  modelLeadSeries,
  type EvoVar,
  type ConvergenceRun,
  type ModelKey,
} from "@/lib/forecast-select";
import type { WeatherSnapshot } from "@/lib/types";

export interface CallChartProps {
  snapshots: WeatherSnapshot[];
  targetDate: string;
}

const VAR_OPTIONS: { value: EvoVar; label: string }[] = [
  { value: "high", label: "Temp" },
  { value: "wind", label: "Wind" },
  { value: "freezing", label: "Freezing" },
  { value: "precip", label: "Precip" },
];

// Three calm, non-semantic hues so amber/green stay reserved for the verdict chip.
const MODELS: { key: ModelKey; label: string; color: string }[] = [
  { key: "hrrr", label: "HRRR", color: "var(--model-1)" },
  { key: "gfs", label: "GFS", color: "var(--model-2)" },
  { key: "ecmwf", label: "ECMWF", color: "var(--model-3)" },
];

const W = 640;
const H = 230;
const PAD = { t: 14, r: 14, b: 26, l: 44 };

/** Straight-segment polyline (band edges + model lines must align exactly, so no bezier). */
function poly(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function CallChart({ snapshots, targetDate }: CallChartProps) {
  const { temp, wind, dist } = useUnits();
  const [evoVar, setEvoVar] = React.useState<EvoVar>("high");

  // Convert a raw evo value to the active display unit (precip stays inches).
  const conv = (y: number): number => {
    if (evoVar === "high") return convTemp(y, temp);
    if (evoVar === "wind") return convWind(y, wind);
    if (evoVar === "freezing") return convDist(y, dist);
    return y;
  };

  const runs: Array<Pick<ConvergenceRun, "lead" | "min" | "max">> = convergenceRuns(
    snapshots,
    evoVar,
    targetDate,
  ).map((r) => ({
    lead: r.lead,
    min: conv(r.min),
    max: conv(r.max),
  }));

  if (snapshots.length < 3 || runs.length < 2) {
    return (
      <div>
        <Heading evoVar={evoVar} onVar={setEvoVar} />
        <p className="mono-dim" style={{ fontSize: 12, lineHeight: 1.6, margin: "10px 0 0" }}>
          Tracking just started — the convergence band fills in as new forecasts arrive. Check back
          as your date nears.
        </p>
      </div>
    );
  }

  const yUnit =
    evoVar === "high"
      ? `°${temp}`
      : evoVar === "wind"
        ? wind === "kmh"
          ? "km/h"
          : "mph"
        : evoVar === "freezing"
          ? dist
          : "in";

  const verdict = convergenceVerdict(
    convergenceRuns(snapshots, evoVar, targetDate), // raw spread comparison is unit-agnostic
  );
  const firming = verdict.firming;
  const chipColor = firming ? "var(--good)" : "var(--caution)";
  const chipLabel = firming ? "Settling — models agree" : "Still shifting";

  // X = lead time (days before target). Plot decreasing left→right so 0 (now) sits on the right.
  const leads = runs.map((r) => r.lead);
  const leadMax = Math.max(...leads);
  const leadMin = Math.min(...leads);

  const allY = runs.flatMap((r) => [r.min, r.max]);
  const mn = evoVar === "precip" ? 0 : niceMin(Math.min(...allY));
  const mx = niceMax(Math.max(...allY));
  // Larger lead → further left; lead 0 (now) → right edge.
  const X = sx(leadMax, leadMin, PAD.l, W - PAD.r);
  const Y = sx(mn, mx, H - PAD.b, PAD.t);
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => mn + (i * (mx - mn)) / yTicks);

  const maxPts = runs.map((r) => ({ x: X(r.lead), y: Y(r.max) }));
  const minPts = runs.map((r) => ({ x: X(r.lead), y: Y(r.min) }));
  // Band = max polyline + reversed min polyline, closed.
  const bandPath = `${poly(maxPts)} ${poly([...minPts].reverse()).replace(/^M/, "L")} Z`;

  // Per-model lines (each model's target-day call across lead time), within the band.
  const modelLines = MODELS.map((m) => ({
    ...m,
    pts: modelLeadSeries(snapshots, m.key, evoVar, targetDate).map((p) => ({
      x: X(p.lead),
      y: Y(conv(p.value)),
    })),
  })).filter((s) => s.pts.length > 0);

  return (
    <div>
      <Heading evoVar={evoVar} onVar={setEvoVar} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <span
          className="chip"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 999,
            fontFamily: "var(--mono)",
            fontSize: 13,
            fontWeight: 700,
            color: chipColor,
            background: `color-mix(in srgb, ${chipColor} 14%, var(--surface))`,
          }}
        >
          <span aria-hidden className="tone-dot" style={{ background: chipColor }} />
          {chipLabel}
        </span>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible", marginTop: 10 }}
        role="img"
        aria-label={`Forecast convergence for ${targetDate}: ${chipLabel}`}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} stroke="var(--line)" strokeWidth="1" />
            <text
              x={PAD.l - 8}
              y={Y(t) + 11 / 3}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
              fontFamily="var(--mono)"
            >
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text
          x={PAD.l - 8}
          y={PAD.t - 6}
          textAnchor="end"
          fontSize={10}
          fill="var(--faint)"
          fontFamily="var(--mono)"
        >
          {yUnit}
        </text>
        {/* convergence band — soft spread fill, one calm accent */}
        <path d={bandPath} fill="var(--accent)" fillOpacity={0.13} stroke="none" />
        {/* per-model lines on top */}
        {modelLines.map((s) => (
          <path
            key={s.key}
            d={poly(s.pts)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* point markers — make single-point series (e.g. HRRR near 48h boundary) visible */}
        {modelLines.map((s) =>
          s.pts.map((p, i) => (
            <circle key={`${s.key}-${i}`} cx={p.x} cy={p.y} r="3.2" fill={s.color} />
          )),
        )}
        {/* x labels: lead days, decreasing toward now */}
        {runs.map((r, i) => (
          <text
            key={i}
            x={X(r.lead)}
            y={H - PAD.b + 16}
            textAnchor="middle"
            fontSize={11}
            fill="var(--muted)"
            fontFamily="var(--mono)"
          >
            {r.lead === 0 ? "now" : `−${r.lead}d`}
          </text>
        ))}
      </svg>

      <div className="chart-legend">
        {modelLines.map((m) => (
          <span className="legend-item" key={m.key}>
            <svg width="16" height="6" aria-hidden style={{ overflow: "visible" }}>
              <line x1="0" y1="3" x2="16" y2="3" stroke={m.color} strokeWidth="2.5" />
            </svg>
            {m.label}
          </span>
        ))}
      </div>

      <p className="mono-dim" style={{ fontSize: 11, margin: "10px 0 0", lineHeight: 1.6 }}>
        Three models, converging toward your day.
      </p>
    </div>
  );
}

function Heading({ evoVar, onVar }: { evoVar: EvoVar; onVar: (v: EvoVar) => void }) {
  return (
    <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: 0 }}>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 12,
          textTransform: "uppercase",
          color: "var(--muted)",
          letterSpacing: "0.05em",
        }}
      >
        The call
      </span>
      <Segmented value={evoVar} onChange={onVar} options={VAR_OPTIONS} ariaLabel="Call variable" />
    </h3>
  );
}
