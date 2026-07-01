/* UpdatingPill — small accent-soft "Updating…" pill shown during background revalidation
   (SWR isValidating) or when the Browse get-or-refresh path returned stale conditions
   (spec §4). The animated dot is disabled under prefers-reduced-motion (CSS). */
"use client";
import * as React from "react";

export interface UpdatingPillProps {
  /** when false the pill renders nothing */
  show: boolean;
  label?: string;
}

export function UpdatingPill({ show, label = "Updating…" }: UpdatingPillProps) {
  if (!show) return null;
  return (
    <span className="updating-pill" role="status" aria-live="polite">
      <span className="updating-dot" aria-hidden />
      {label}
    </span>
  );
}
