/* Chart helpers — linear scale + smooth bezier path. Ported from app/charts.jsx. */

/** Linear scale: maps domain [d0,d1] → range [r0,r1]. Guards a zero-width domain. */
export function sx(d0: number, d1: number, r0: number, r1: number): (v: number) => number {
  return (v) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

export const niceMin = (v: number): number => Math.floor(v / 5) * 5;
export const niceMax = (v: number): number => Math.ceil(v / 5) * 5;

export interface Point {
  x: number;
  y: number;
}

/** Smooth path through points using midpoint control points. */
export function linePath(pts: Point[]): string {
  if (!pts.length) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const p0 = pts[i - 1];
    const p1 = pts[i];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}
