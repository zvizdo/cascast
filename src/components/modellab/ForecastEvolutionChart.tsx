/* ForecastEvolutionChart — are the models locking in for the target day? Two signals on one view:
   (1) three model lines = each model's target-day prediction across snapshots (its run-to-run
   DRIFT); (2) a faint cross-model spread band behind them = how far APART the models are at each
   snapshot (narrowing left→right ⇒ converging). A per-model stability chip in the legend
   quantifies how much each model moved over its last 3 runs (green = locked, amber = drifting).
   Sparse (<3 snapshots) → calm empty state. Self-contained SVG so per-point markers stay aligned. */
"use client";
import * as React from "react";
import { Segmented } from "@/components/shared/Segmented";
import { sx, linePath, niceMin, niceMax } from "@/components/charts/chart-utils";
import { useUnits, convTemp, convWind, convDist } from "@/lib/units";
import {
  evoPoints,
  evoEnvelope,
  modelStability,
  type ModelKey,
  type EvoVar,
  type EvoPoint,
} from "@/lib/forecast-select";
import type { WeatherSnapshot } from "@/lib/types";

export interface ForecastEvolutionChartProps {
  snapshots: WeatherSnapshot[];
  targetDate: string;
  active: Record<ModelKey, boolean>;
}

const MODELS: { key: ModelKey; label: string; color: string }[] = [
  { key: "hrrr", label: "HRRR", color: "var(--accent)" },
  { key: "gfs", label: "GFS", color: "var(--caution)" },
  { key: "ecmwf", label: "ECMWF", color: "var(--good)" },
];

const VAR_OPTIONS: { value: EvoVar; label: string }[] = [
  { value: "high", label: "Temp" },
  { value: "wind", label: "Wind" },
  { value: "freezing", label: "Freezing" },
  { value: "precip", label: "Precip" },
];

const W = 640;
const H = 230;
const PAD = { t: 14, r: 14, b: 26, l: 44 };

/** Straight-segment polyline (band edges must align exactly, so no bezier). */
function poly(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function ForecastEvolutionChart({
  snapshots,
  targetDate,
  active,
}: ForecastEvolutionChartProps) {
  const { temp, wind, dist } = useUnits();
  const [evoVar, setEvoVar] = React.useState<EvoVar>("high");

  if (snapshots.length < 3) {
    return (
      <div>
        <Heading evoVar={evoVar} onVar={setEvoVar} />
        <p className="mono-dim" style={{ fontSize: 12, lineHeight: 1.6, margin: "10px 0 0" }}>
          Tracking just started — the evolution chart fills in as new forecasts arrive. Check back
          as your date nears.
        </p>
      </div>
    );
  }

  // Convert evo y-values to the active display unit (precip stays inches).
  const conv = (y: number): number => {
    if (evoVar === "high") return convTemp(y, temp);
    if (evoVar === "wind") return convWind(y, wind);
    if (evoVar === "freezing") return convDist(y, dist);
    return y;
  };
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

  // oldest→newest snapshot date labels (matching evoPoints' reversed order).
  const ordered = [...snapshots].reverse();
  const xLabels = ordered.map((s, i) => ({
    i,
    t: new Date(s.fetchedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
  }));

  const seriesRaw = MODELS.map((m) => ({
    ...m,
    faded: !active[m.key],
    points: evoPoints(snapshots, m.key, evoVar, targetDate).map((p) => ({ ...p, y: conv(p.y) })),
  })).filter((s) => s.points.length > 0);

  // agreement band: cross-model min..max per snapshot, x-aligned with the model lines.
  // Intentionally spans the FULL model ensemble regardless of the `active` toggle — agreement
  // is a property of all models, not just the ones currently highlighted.
  const envRaw = evoEnvelope(snapshots, evoVar, targetDate);
  const env = envRaw.map((p) => ({ x: p.x, min: conv(p.min), max: conv(p.max) }));

  const allY = [
    ...seriesRaw.flatMap((s) => s.points.map((p) => p.y)),
    ...env.flatMap((p) => [p.min, p.max]),
  ];
  const mn = evoVar === "precip" ? 0 : niceMin(Math.min(...allY));
  const mx = niceMax(Math.max(...allY));
  const n = ordered.length - 1;
  const X = sx(0, n, PAD.l, W - PAD.r);
  const Y = sx(mn, mx, H - PAD.b, PAD.t);
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => mn + (i * (mx - mn)) / yTicks);

  const bandPath =
    env.length > 0
      ? `${poly(env.map((p) => ({ x: X(p.x), y: Y(p.max) })))} ${poly(
          [...env].reverse().map((p) => ({ x: X(p.x), y: Y(p.min) })),
        ).replace(/^M/, "L")} Z`
      : "";

  // Per-model stability chip text + color (displayed delta from converted min/max).
  const fmtHalf = (half: number): string =>
    evoVar === "precip" ? half.toFixed(2) : String(Math.round(half));
  const stabilityOf = (key: ModelKey): { text: string; color: string } => {
    const s = modelStability(snapshots, key, evoVar, targetDate);
    if (s.range == null || s.min == null || s.max == null) {
      return { text: "—", color: "var(--faint)" };
    }
    const half = Math.abs(conv(s.max) - conv(s.min)) / 2;
    return {
      text: `±${fmtHalf(half)} ${yUnit} / ${s.count} runs`,
      color: s.settled ? "var(--good)" : "var(--caution)",
    };
  };

  return (
    <div>
      <Heading evoVar={evoVar} onVar={setEvoVar} />
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible", marginTop: 12 }}
        role="img"
        aria-label={`Forecast evolution for ${targetDate}`}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={Y(t)}
              y2={Y(t)}
              stroke="var(--line)"
              strokeWidth="1"
            />
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
          y={PAD.t - 2}
          textAnchor="end"
          fontSize={10}
          fill="var(--faint)"
          fontFamily="var(--mono)"
        >
          {yUnit}
        </text>
        {/* agreement band — faint neutral cross-model spread, behind the lines */}
        {bandPath && <path d={bandPath} fill="var(--muted)" fillOpacity={0.12} stroke="none" />}
        {xLabels.map((lb) => (
          <text
            key={lb.i}
            x={X(lb.i)}
            y={H - PAD.b + 16}
            textAnchor="middle"
            fontSize={11}
            fill="var(--muted)"
            fontFamily="var(--mono)"
          >
            {lb.t}
          </text>
        ))}
        {seriesRaw.map((s) => {
          // E11: faded opacity 0.45 keeps ≥3:1 contrast on glacier light gridlines.
          const op = s.faded ? 0.45 : 1;
          return (
            <g key={s.key}>
              {s.points.length > 1 && (
                <path
                  d={linePath(s.points.map((p) => ({ x: X(p.x), y: Y(p.y) })))}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  opacity={op}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
        {seriesRaw.map((s) =>
          s.points.map((p: EvoPoint) => (
            <circle
              key={`${s.key}-${p.x}`}
              cx={X(p.x)}
              cy={Y(p.y)}
              r="3.2"
              fill={s.color}
              opacity={s.faded ? 0.45 : 1}
            />
          )),
        )}
      </svg>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", marginTop: 12 }}>
        <div>
          <div className="legend-group-label">Models</div>
          <div className="chart-legend" style={{ marginTop: 6 }}>
            {MODELS.map((m) => {
              const st = stabilityOf(m.key);
              return (
                <span className="legend-item" key={m.key}>
                  <svg width="16" height="6" aria-hidden style={{ overflow: "visible" }}>
                    <line x1="0" y1="3" x2="16" y2="3" stroke={m.color} strokeWidth="2.5" />
                  </svg>
                  {m.label}
                  <span style={{ marginLeft: 6, fontFamily: "var(--mono)", fontSize: 11, color: st.color }}>
                    {st.text}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mono-dim" style={{ fontSize: 11, margin: "10px 0 0", lineHeight: 1.6 }}>
        Lines = each model&apos;s drift. Band = how far apart they are. Chips = how settled each
        model is.
      </p>
    </div>
  );
}

function Heading({ evoVar, onVar }: { evoVar: EvoVar; onVar: (v: EvoVar) => void }) {
  return (
    <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: 0 }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.05em" }}>
        Target-day call
      </span>
      <Segmented value={evoVar} onChange={onVar} options={VAR_OPTIONS} ariaLabel="Evolution variable" />
    </h3>
  );
}
