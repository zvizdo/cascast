/* SectionError — calm, section-level error state with a Retry. Matches the muted pending states. */
"use client";
import * as React from "react";
import { Icons } from "@/components/icons/icons";

export interface SectionErrorProps {
  /** What failed to load, e.g. "the daily outlook". */
  message: string;
  /** Revalidate the failed fetch (an SWR mutate call). */
  onRetry: () => void;
}

export function SectionError({ message, onRetry }: SectionErrorProps) {
  return (
    <div
      className="note-card"
      role="alert"
      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <Icons.alert size={15} /> {message}
      </span>
      <button type="button" className="drill-link" onClick={onRetry}>
        <Icons.refresh size={14} /> Retry
      </button>
    </div>
  );
}
