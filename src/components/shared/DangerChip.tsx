/* DangerChip — circular level number in danger color + label. Ported from app/shared.jsx,
   extended per contract §5.2 to handle no-rating (level <= 0). */
import * as React from "react";
import { DANGER } from "./constants";

export interface DangerChipProps {
  /** 1–5; -1/0 → "No rating" neutral chip */
  level: number;
  tomorrow?: boolean;
}

export function DangerChip({ level, tomorrow }: DangerChipProps) {
  if (level <= 0) {
    return (
      <span className="danger-chip" style={{ "--c": "var(--faint)" } as React.CSSProperties}>
        <span className="danger-lbl">No rating{tomorrow ? " →" : ""}</span>
      </span>
    );
  }
  const d = DANGER[level] ?? DANGER[1];
  return (
    <span
      className="danger-chip"
      style={{ "--c": `var(${d.varName})` } as React.CSSProperties}
    >
      <span className={`danger-num danger-num--d${level}`}>{level}</span>
      <span className="danger-lbl">
        {d.label}
        {tomorrow ? " →" : ""}
      </span>
    </span>
  );
}
