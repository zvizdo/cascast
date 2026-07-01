/* BarChart — precip-style bar series. Ported from app/charts.jsx. */
import * as React from "react";
import { sx } from "./chart-utils";

export interface BarDatum {
  v: number;
  color?: string;
  faded?: boolean;
}

export interface BarChartProps {
  data: BarDatum[];
  w?: number;
  h?: number;
  color?: string;
  unit?: string;
  xLabels?: { i: number; t: string }[];
  band?: { x0: number; x1: number } | null;
  ariaLabel?: string;
}

const PAD = { t: 10, r: 14, b: 22, l: 40 };

export function BarChart({
  data,
  w = 640,
  h = 120,
  color = "var(--accent)",
  unit = "",
  xLabels = [],
  band = null,
  ariaLabel,
}: BarChartProps) {
  const mx = Math.max(0.05, ...data.map((d) => d.v)) * 1.15;
  const X = sx(0, data.length, PAD.l, w - PAD.r);
  const Y = sx(0, mx, h - PAD.b, PAD.t);
  const bw = ((w - PAD.r - PAD.l) / data.length) * 0.6;
  const peak = Math.max(0, ...data.map((d) => d.v));
  const label =
    ariaLabel ?? `Bar chart${unit ? ` in ${unit}` : ""}, peak value ${peak.toFixed(2).replace(/\.?0+$/, "")}`;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      style={{ display: "block", overflow: "visible" }}
      role="img"
      aria-label={label}
    >
      {band && (
        <rect
          x={X(band.x0)}
          y={PAD.t}
          width={X(band.x1) - X(band.x0)}
          height={h - PAD.b - PAD.t}
          fill="var(--target-band)"
        />
      )}
      <line x1={PAD.l} x2={w - PAD.r} y1={Y(0)} y2={Y(0)} stroke="var(--line)" />
      {data.map(
        (d, i) =>
          d.v > 0 && (
            <rect
              key={i}
              x={X(i + 0.5) - bw / 2}
              y={Y(d.v)}
              width={bw}
              height={Y(0) - Y(d.v)}
              rx="1.5"
              fill={d.color || color}
              opacity={d.faded ? 0.4 : 0.9}
            />
          ),
      )}
      {xLabels.map(
        (lb, i) =>
          lb && (
            <text
              key={i}
              x={X(lb.i + 0.5)}
              y={h - PAD.b + 15}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted)"
              fontFamily="var(--mono)"
            >
              {lb.t}
            </text>
          ),
      )}
      {unit && (
        <text
          x={PAD.l - 8}
          y={PAD.t + 4}
          textAnchor="end"
          fontSize="10"
          fill="var(--muted)"
          fontFamily="var(--mono)"
        >
          {unit}
        </text>
      )}
    </svg>
  );
}
