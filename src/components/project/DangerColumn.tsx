/* DangerColumn — three band rows (Upper/Middle/Lower), each a 5-segment meter + number·label tag.
   Ported from app/shared.jsx DangerColumn. Accessible: number + label + meter (not color-only).
   -1/0 → empty meter + "No rating". */
import * as React from "react";
import { DANGER } from "@/components/shared/constants";
import type { NwacDanger } from "@/lib/types";

export interface DangerColumnProps {
  danger: NwacDanger;
  compact?: boolean;
}

const BANDS: [keyof NwacDanger, string][] = [
  ["upper", "Upper"],
  ["middle", "Middle"],
  ["lower", "Lower"],
];

function DangerRow({ label, level }: { label: string; level: number }) {
  const rated = level >= 1 && level <= 5;
  const d = rated ? DANGER[level] : null;
  return (
    <div className="danger-row">
      <span style={{ fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-2)" }}>
        {label}
      </span>
      <span className="danger-meter" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((seg) => (
          <span
            key={seg}
            className="danger-seg"
            style={{
              background: rated && seg <= level ? `var(${DANGER[level].varName})` : "var(--line)",
            }}
          />
        ))}
      </span>
      <span className="danger-tag">{rated && d ? `${level} · ${d.label}` : "No rating"}</span>
    </div>
  );
}

export function DangerColumn({ danger, compact }: DangerColumnProps) {
  return (
    <div className={"danger-col" + (compact ? " compact" : "")}>
      {BANDS.map(([key, label]) => (
        <DangerRow key={key} label={label} level={danger[key]} />
      ))}
    </div>
  );
}
