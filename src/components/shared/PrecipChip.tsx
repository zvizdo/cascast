/* PrecipChip — precip type icon + colored word. Ported from app/shared.jsx. */
import * as React from "react";
import { Icons, type IconComponent } from "@/components/icons/icons";

export interface PrecipChipProps {
  type: "snow" | "rain" | "mixed" | "chance" | "none";
}

const MAP: Record<PrecipChipProps["type"], { icon: IconComponent; label: string; c: string }> = {
  snow: { icon: Icons.flake, label: "Snow", c: "var(--accent)" },
  rain: { icon: Icons.drop, label: "Rain", c: "var(--d3)" },
  mixed: { icon: Icons.drop, label: "Mixed", c: "var(--d3)" },
  chance: { icon: Icons.cloud, label: "Chance", c: "var(--muted)" },
  none: { icon: Icons.sun, label: "Dry", c: "var(--muted)" },
};

export function PrecipChip({ type }: PrecipChipProps) {
  const p = MAP[type] ?? MAP.none;
  const I = p.icon;
  return (
    <span className="precip-chip" style={{ color: p.c }}>
      <I size={14} /> {p.label}
    </span>
  );
}
