/* LastUpdated — relative refresh stamp ("Updated 14 min ago"); null → pending state.
   The title attr carries the absolute local time for hover detail (spec §4). */
"use client";
import * as React from "react";
import { formatTimeAgo } from "@/lib/format";

export interface LastUpdatedProps {
  iso: string | null;
  /** default "Updated" */
  prefix?: string;
}

/** Absolute local time for the title attr, e.g. "Sat, Aug 2, 2:00 PM". */
function fmtAbsolute(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function LastUpdated({ iso, prefix = "Updated" }: LastUpdatedProps) {
  if (iso == null) {
    return <span className="last-updated">Pending first refresh</span>;
  }
  return (
    <span className="last-updated" title={fmtAbsolute(iso)}>
      {prefix} {formatTimeAgo(iso)}
    </span>
  );
}
