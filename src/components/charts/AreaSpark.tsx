/* AreaSpark — compact filled trend sparkline. Ported from app/charts.jsx. */
import * as React from "react";
import { sx, linePath } from "./chart-utils";

export interface AreaSparkProps {
  data: { v: number }[];
  w?: number;
  h?: number;
  color?: string;
  fill?: string;
  pad?: number;
  ariaLabel?: string;
}

export function AreaSpark({
  data,
  w = 280,
  h = 64,
  color = "var(--accent)",
  fill = "color-mix(in srgb, var(--accent) 14%, transparent)",
  pad = 4,
  ariaLabel,
}: AreaSparkProps) {
  const ys = data.map((d) => d.v);
  const min = Math.min(...ys);
  const max = Math.max(...ys);
  const X = sx(0, data.length - 1, pad, w - pad);
  const Y = sx(min - (max - min) * 0.1, max + (max - min) * 0.1, h - pad, pad);
  const pts = data.map((d, i) => ({ x: X(i), y: Y(d.v) }));
  const line = linePath(pts);
  const last = pts[pts.length - 1];
  const area = `${line} L ${last.x} ${h - pad} L ${pts[0].x} ${h - pad} Z`;
  const dir = ys[ys.length - 1] > ys[0] ? "rising" : ys[ys.length - 1] < ys[0] ? "falling" : "flat";
  const label =
    ariaLabel ?? `Trend sparkline, ${dir}, from ${Math.round(ys[0])} to ${Math.round(ys[ys.length - 1])}`;
  return (
    <svg
      width="100%"
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      style={{ display: "block" }}
      role="img"
      aria-label={label}
    >
      <path d={area} fill={fill} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <circle cx={last.x} cy={last.y} r="2.6" fill={color} />
    </svg>
  );
}
