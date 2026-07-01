// src/components/mountain/HazardChips.tsx
"use client";
import * as React from "react";
import type { NwacForecast } from "@/lib/types";
import type { HazardsSummary } from "@/lib/hazards/types";

export interface HazardChip { key: string; label: string; tokenVar: string; onClick?: () => void; }

const DANGER_WORD = ["", "Low", "Mod", "Consid", "High", "Extreme"];

export function avalancheChip(
  nwac: NwacForecast | { season: "summer" } | undefined,
  onClick?: () => void,
): HazardChip | null {
  if (!nwac || (nwac as { season?: string }).season !== "winter") return null;
  const d = (nwac as NwacForecast).danger?.current;
  if (!d) return null;
  const worst = Math.max(d.upper, d.middle, d.lower);
  if (worst < 1) return null;
  return { key: "avy", label: `Avy ${DANGER_WORD[worst]}`, tokenVar: `--d${worst}`, onClick };
}

function aqiCatToken(category: string): string {
  const c = category.toLowerCase();
  if (c.includes("hazardous")) return "--d5";
  if (c.includes("very unhealthy")) return "--d4";
  if (c.includes("unhealthy")) return c.includes("sensitive") ? "--d3" : "--d4";
  if (c.includes("moderate")) return "--d2";
  return "--d1"; // Good
}

export function airQualityChip(summary: HazardsSummary | undefined, onClick?: () => void): HazardChip | null {
  if (!summary?.aqi) return null;
  return { key: "aqi", label: `AQI ${summary.aqi.value}`, tokenVar: aqiCatToken(summary.aqi.category), onClick };
}

export function stormChip(summary: HazardsSummary | undefined, onClick?: () => void): HazardChip | null {
  if (!summary?.storm?.active) return null;
  return { key: "storm", label: "Storm", tokenVar: "--d4", onClick };
}

export function HazardChips({ chips }: { chips: HazardChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="hz-row">
      {chips.map((c) => (
        <button key={c.key} type="button" className="hz-chip" onClick={c.onClick}>
          <span className="hz-dot" style={{ background: `var(${c.tokenVar})` }} aria-hidden="true" />
          {c.label}
        </button>
      ))}
    </div>
  );
}
