/* PanelError — inline per-panel fallback for an SWR fetch failure (P6 Task 4).
   "Couldn't load {label} · Retry"; the retry calls back to SWR mutate(). The rest of
   the page stays usable. Presentational sibling of SectionError, with the plan's
   label/onRetry API. */
"use client";
import * as React from "react";
import { Icons } from "@/components/icons/icons";

export interface PanelErrorProps {
  /** the thing that failed to load, e.g. "the avalanche forecast" */
  label: string;
  onRetry: () => void;
}

export function PanelError({ label, onRetry }: PanelErrorProps) {
  return (
    <div
      className="note-card"
      role="alert"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Icons.alert size={15} /> Couldn&rsquo;t load {label}
      </span>
      <button type="button" className="drill-link" onClick={onRetry} aria-label={`Retry loading ${label}`}>
        <Icons.refresh size={14} /> Retry
      </button>
    </div>
  );
}
