/* Shared constants — ported from app/shared.jsx DANGER + TONE_LABEL. */

export const DANGER: Record<number, { label: string; varName: string }> = {
  1: { label: "Low", varName: "--d1" },
  2: { label: "Moderate", varName: "--d2" },
  3: { label: "Considerable", varName: "--d3" },
  4: { label: "High", varName: "--d4" },
  5: { label: "Extreme", varName: "--d5" },
};

export const TONE_LABEL = {
  good: "Favorable",
  caution: "Marginal",
  alert: "Hazardous",
} as const;

export type Tone = keyof typeof TONE_LABEL;
