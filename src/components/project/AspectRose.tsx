/* AspectRose — 8-sector × 3-ring aspect/elevation rose. Ported from app/hero.jsx AspectRose.
   Maps real NwacProblem.aspects keys (upper/middle/lower) to rings (high/mid/low).
   role="img" + aria-label summarising affected aspects (a11y; not color-only). */
import * as React from "react";

export interface AspectRoseProps {
  aspects: Record<"upper" | "middle" | "lower", Record<string, boolean>>;
  size?: number;
  color?: string;
}

const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
// real band → ring radii [inner, outer] (fraction of R)
const RINGS: [keyof AspectRoseProps["aspects"], [number, number]][] = [
  ["lower", [0.18, 0.42]],
  ["middle", [0.42, 0.66]],
  ["upper", [0.66, 0.92]],
];
const BAND_LABEL: Record<string, string> = { upper: "upper", middle: "middle", lower: "lower" };

function summarize(aspects: AspectRoseProps["aspects"]): string {
  const parts: string[] = [];
  (Object.keys(aspects) as (keyof AspectRoseProps["aspects"])[]).forEach((band) => {
    const dirs = DIRS.filter((d) => aspects[band]?.[d]);
    if (dirs.length) parts.push(`${BAND_LABEL[band]}: ${dirs.join(", ")}`);
  });
  return parts.length
    ? `Avalanche problem aspects — ${parts.join("; ")}`
    : "Avalanche problem aspects — none affected";
}

export function AspectRose({ aspects, size = 108, color = "var(--accent)" }: AspectRoseProps) {
  const cx = size / 2;
  const cy = size / 2;
  const R = size / 2;

  const sector = (r0: number, r1: number, idx: number): string => {
    const a0 = ((idx * 45 - 90 - 22.5) * Math.PI) / 180;
    const a1 = (((idx + 1) * 45 - 90 - 22.5) * Math.PI) / 180;
    const p = (a: number, r: number): [number, number] => [
      cx + Math.cos(a) * r * R,
      cy + Math.sin(a) * r * R,
    ];
    const [x0, y0] = p(a0, r0);
    const [x1, y1] = p(a1, r0);
    const [x2, y2] = p(a1, r1);
    const [x3, y3] = p(a0, r1);
    return `M ${x0} ${y0} A ${r0 * R} ${r0 * R} 0 0 1 ${x1} ${y1} L ${x2} ${y2} A ${r1 * R} ${r1 * R} 0 0 0 ${x3} ${y3} Z`;
  };

  const bandOpacity = (band: string, on: boolean): number =>
    on ? (band === "upper" ? 0.95 : band === "middle" ? 0.7 : 0.45) : 0.5;

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="aspect-rose-svg"
      role="img"
      aria-label={summarize(aspects)}
    >
      {RINGS.map(([band, [r0, r1]]) =>
        DIRS.map((d, i) => {
          const on = !!aspects[band]?.[d];
          return (
            <path
              key={band + d}
              d={sector(r0, r1, i)}
              fill={on ? color : "var(--line)"}
              fillOpacity={bandOpacity(band, on)}
              stroke="var(--surface)"
              strokeWidth="1.4"
            />
          );
        }),
      )}
      {DIRS.map((d, i) => {
        const a = ((i * 45 - 90) * Math.PI) / 180;
        return (
          <text
            key={d}
            x={cx + Math.cos(a) * R}
            y={cy + Math.sin(a) * R + 3}
            textAnchor="middle"
            fontSize="10"
            fontFamily="var(--mono)"
            fill="var(--muted)"
            aria-hidden="true"
          >
            {d}
          </text>
        );
      })}
    </svg>
  );
}
