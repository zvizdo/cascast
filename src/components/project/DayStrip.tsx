/* DayStrip — labeled freezing-level-through-the-day chart over band reference lines.
   Ported from app/hero.jsx DayStrip. SVG geometry uses canonical feet; axis labels convert through
   the passed `dist` unit. Adds a labeled elevation Y-axis, a time X-axis, named band reference lines
   (summit/mid/base), and above/below-freezing shading (frozen above the curve, warm below). */
import * as React from "react";
import { fmtDist, type DistUnit } from "@/lib/units";
import type { HourRow } from "@/lib/forecast-select";

export interface DayStripProps {
  rows: HourRow[]; // target-day rows (chosen model)
  dist: DistUnit; // active distance unit for axis labels
  valleyFt: number; // baseline elevation for the Y scale
  topFt: number; // top of Y scale (summit + headroom)
  summitFt: number;
  bandsFt: { base: number; mid: number; summit: number };
  bandNames?: { base: string; mid: string; summit: string };
  summitOffsetText: string; // takeaway clause (computed in the hero; unused inside the SVG)
}

const W = 300;
const H = 132; // extra headroom vs. the original 116 for the axis labels
const PAD_L = 48; // left gutter — wide enough for the compact "16.2k ft" Y-axis labels (full "16,210 ft" clips)
const PAD_B = 14; // bottom gutter for the X-axis labels
const DEFAULT_BAND_NAMES = { base: "Base", mid: "Mid", summit: "Summit" };

export function DayStrip({
  rows,
  dist,
  valleyFt,
  topFt,
  summitFt,
  bandsFt,
  bandNames = DEFAULT_BAND_NAMES,
}: DayStripProps) {
  const flRows = rows.filter((r) => r.fl != null);
  if (!flRows.length) return null;

  const Y = (e: number) => H - PAD_B - 4 - ((e - valleyFt) / (topFt - valleyFt)) * (H - PAD_B - 12);
  const X = (i: number) =>
    flRows.length === 1
      ? (PAD_L + W) / 2
      : PAD_L + (i / (flRows.length - 1)) * (W - PAD_L - 4);

  let p = `M ${X(0)} ${Y(flRows[0].fl as number)}`;
  flRows.forEach((r, i) => {
    if (i) p += ` L ${X(i)} ${Y(r.fl as number)}`;
  });
  // above the FL curve = frozen; below = warm. Close each region to the top / bottom edge.
  const frozenArea = `${p} L ${X(flRows.length - 1)} 0 L ${X(0)} 0 Z`;
  const warmArea = `${p} L ${X(flRows.length - 1)} ${H - PAD_B} L ${X(0)} ${H - PAD_B} Z`;

  const bandLines: [keyof typeof bandNames, string, number][] = [
    ["summit", bandNames.summit, summitFt],
    ["mid", bandNames.mid, bandsFt.mid],
    ["base", bandNames.base, bandsFt.base],
  ];
  // labeled Y-axis ticks: valley / midpoint / top (units-aware)
  const yTicks = [valleyFt, (valleyFt + topFt) / 2, topFt].map((e) => Math.round(e));
  const hrLabel = (h: number) => (h === 0 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      style={{ display: "block" }}
      role="img"
      aria-label="Freezing level through the day relative to the route's elevation bands"
    >
      {/* above/below-freezing shading */}
      <path d={frozenArea} fill="var(--wx-snow)" opacity="0.14" />
      <path d={warmArea} fill="var(--below-fl)" opacity="0.4" />

      {/* labeled Y-axis ticks */}
      {yTicks.map((e) => (
        <text
          key={e}
          className="hero-axis-label"
          x={PAD_L - 4}
          y={Y(e) + 3}
          textAnchor="end"
          fontSize="8"
          fontFamily="var(--mono)"
          fill="var(--muted)"
        >
          {fmtDist(e, dist, { k: true })}
        </text>
      ))}

      {/* named band reference lines */}
      {bandLines.map(([k, name, e]) => (
        <g key={k}>
          <line x1={PAD_L} x2={W} y1={Y(e)} y2={Y(e)} stroke="var(--line)" strokeWidth="1" />
          <text
            className="hero-axis-label"
            x={W - 2}
            y={Y(e) - 2}
            textAnchor="end"
            fontSize="7.5"
            fontFamily="var(--mono)"
            fill="var(--muted)"
            opacity="0.85"
          >
            {name}
          </text>
        </g>
      ))}

      {/* freezing-level curve */}
      <path
        d={p}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="2"
        vectorEffect="non-scaling-stroke"
      />

      {/* time X-axis */}
      {[0, 6, 12, 18].map((h) => {
        const i = flRows.findIndex((r) => r.hour === h);
        return i >= 0 ? (
          <text
            key={h}
            x={X(i)}
            y={H - 1}
            textAnchor="middle"
            fontSize="8.5"
            fontFamily="var(--mono)"
            fill="var(--muted)"
          >
            {hrLabel(h)}
          </text>
        ) : null;
      })}
    </svg>
  );
}
