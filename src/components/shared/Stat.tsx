/* Stat — label (mono kicker) + value (serif) + unit + optional sub. Ported from app/shared.jsx. */
import * as React from "react";

export interface StatProps {
  label: string;
  value: React.ReactNode;
  unit?: string;
  sub?: React.ReactNode;
  /** CSS color string applied to the value */
  accent?: string;
}

export function Stat({ label, value, unit, sub, accent }: StatProps) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value" style={accent ? { color: accent } : undefined}>
        {value}
        {unit && <span className="stat-unit">{unit}</span>}
      </div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}
