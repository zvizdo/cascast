/* LineChart — multi-series with axes, optional band, dashed/faded series. Ported from app/charts.jsx.
   All series share one x-domain (the union of point indices) so a short series ends partway across
   instead of being stretched. `null` entries in a series' points render as line breaks (gaps are not
   interpolated across). */
import * as React from "react";
import { sx, linePath, niceMin, niceMax } from "./chart-utils";

export type SeriesPoint = { x: number; y: number } | null;

export interface Series {
  key: string;
  color: string;
  points: SeriesPoint[];
  dashed?: boolean;
  faded?: boolean;
  width?: number;
}

export interface LineChartProps {
  series: Series[];
  w?: number;
  h?: number;
  xLabels?: { i: number; t: string }[];
  yUnit?: string;
  yMin?: number;
  yMax?: number;
  band?: { x0: number; x1: number } | null;
  yTicks?: number;
  font?: number;
  grid?: string;
  ink?: string;
  ariaLabel?: string;
  /** Override the left padding (default 40) — widen when tick labels exceed ~4 chars (e.g. 5-digit freezing-level feet). */
  padLeft?: number;
}

const PAD = { t: 14, r: 14, b: 26, l: 40 };

/** Split a series' points into contiguous runs, breaking at each null so gaps aren't interpolated. */
function segmentsOf(points: SeriesPoint[]): { x: number; y: number }[][] {
  const segs: { x: number; y: number }[][] = [];
  let cur: { x: number; y: number }[] = [];
  for (const p of points) {
    if (p == null) {
      if (cur.length) segs.push(cur);
      cur = [];
    } else {
      cur.push(p);
    }
  }
  if (cur.length) segs.push(cur);
  return segs;
}

export function LineChart({
  series,
  w = 640,
  h = 240,
  xLabels = [],
  yUnit,
  yMin,
  yMax,
  band = null,
  yTicks = 4,
  font = 11,
  grid = "var(--line)",
  ink = "var(--muted)",
  ariaLabel,
  padLeft,
}: LineChartProps) {
  const allPoints = series.flatMap((s) => s.points.filter((p): p is { x: number; y: number } => p != null));
  const allY = allPoints.map((p) => p.y);
  // Guard empty / all-null series so ±Infinity never reaches the scales (→ NaN paths).
  const dataMin = allY.length ? Math.min(...allY) : 0;
  const dataMax = allY.length ? Math.max(...allY) : 0;
  const mn = yMin != null ? yMin : niceMin(dataMin);
  const mx = yMax != null ? yMax : niceMax(dataMax);
  // Shared x-domain: the union of point indices across every series (by value, not count).
  const maxX = allPoints.length ? Math.max(...allPoints.map((p) => p.x)) : 0;
  // E4: prop-driven left pad so 5-digit freezing-level labels don't clip
  const pl = padLeft ?? PAD.l;
  const X = sx(0, maxX, pl, w - PAD.r);
  const Y = sx(mn, mx, h - PAD.b, PAD.t);
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => mn + (i * (mx - mn)) / yTicks);
  const label =
    ariaLabel ??
    `Line chart with ${series.length} series, values ranging ${Math.round(dataMin)} to ${Math.round(dataMax)}`;
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
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={pl} x2={w - PAD.r} y1={Y(t)} y2={Y(t)} stroke={grid} strokeWidth="1" />
          <text
            x={pl - 8}
            y={Y(t) + font / 3}
            textAnchor="end"
            fontSize={font}
            fill={ink}
            fontFamily="var(--mono)"
          >
            {Math.round(t)}
          </text>
        </g>
      ))}
      {yUnit && (
        <text
          x={pl - 8}
          y={PAD.t - 4}
          textAnchor="end"
          fontSize={font}
          fill={ink}
          fontFamily="var(--mono)"
        >
          {yUnit}
        </text>
      )}
      {xLabels.map(
        (lb, i) =>
          lb && (
            <text
              key={i}
              x={X(lb.i)}
              y={h - PAD.b + 16}
              textAnchor="middle"
              fontSize={font}
              fill={ink}
              fontFamily="var(--mono)"
            >
              {lb.t}
            </text>
          ),
      )}
      {series.map((s) =>
        segmentsOf(s.points).map((seg, si) => (
          <path
            key={s.key + "-" + si}
            d={linePath(seg.map((p) => ({ x: X(p.x), y: Y(p.y) })))}
            fill="none"
            stroke={s.color}
            strokeWidth={s.width || 2}
            strokeDasharray={s.dashed ? "4 4" : undefined}
            opacity={s.faded ? 0.45 : 1}
            vectorEffect="non-scaling-stroke"
          />
        )),
      )}
      {series.map((s) => {
        const pts = s.points.filter((p): p is { x: number; y: number } => p != null);
        const last = pts[pts.length - 1];
        return last ? (
          <circle
            key={s.key + "d"}
            cx={X(last.x)}
            cy={Y(last.y)}
            r="3"
            fill={s.color}
            opacity={s.faded ? 0.45 : 1}
          />
        ) : null;
      })}
    </svg>
  );
}
