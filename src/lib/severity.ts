// src/lib/severity.ts
/* Shared severity color language for the Forecast tab. Wind + precip map to the avalanche
   danger ramp (--d1 green … --d4 red) so wind speaks the same color as avy danger.
   NOTE: --d5 (near-black "Extreme") is intentionally never produced — weather tops out at red. */
export type SevLevel = 1 | 2 | 3 | 4;

/** Sustained summit wind (mph): <12 green · 12–25 yellow · 25–40 orange · 40+ red. */
export function windSeverity(mph: number): SevLevel {
  if (mph >= 40) return 4;
  if (mph >= 25) return 3;
  if (mph >= 12) return 2;
  return 1;
}

/** Precip from a cell: heavy (snow≥6in or precip≥0.5in) → 4; active (snow≥0.2 or precip≥0.05) → 3;
    chance (pop≥40) → 2; dry → 1. Thresholds mirror lib/derive.ts precipFor(). */
export function precipSeverity(c: { precip: number; snow: number; pop: number }): SevLevel {
  if (c.snow >= 6 || c.precip >= 0.5) return 4;
  if (c.snow >= 0.2 || c.precip >= 0.05) return 3;
  if (c.pop >= 40) return 2;
  return 1;
}

/** Tile severity = worst of wind and precip (freezing-vs-route deferred — see plan §Decisions). */
export function tileSeverity(c: { wind: number; precip: number; snow: number; pop: number }): SevLevel {
  return Math.max(windSeverity(c.wind), precipSeverity(c)) as SevLevel;
}

export function sevToken(level: SevLevel): string {
  return `--d${level}`;
}
