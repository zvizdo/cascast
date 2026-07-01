/* StaleNotice — overlay for imagery/conditions older than the freshness threshold
   (DESIGN.md §20). "Imagery from {date} · {n} days old". Calm caution-tinted pill. */
import * as React from "react";
import { Icons } from "@/components/icons/icons";

export interface StaleNoticeProps {
  /** human-readable scene date, e.g. "Jul 13, 2026" */
  dateLabel: string;
  ageDays: number;
  /** noun for the stale thing; default "Imagery" */
  noun?: string;
}

export function StaleNotice({ dateLabel, ageDays, noun = "Imagery" }: StaleNoticeProps) {
  return (
    <div
      className="note-card"
      role="status"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        color: "var(--caution)",
        borderColor: "color-mix(in srgb, var(--caution) 30%, var(--line))",
        background: "color-mix(in srgb, var(--caution) 9%, var(--surface))",
      }}
    >
      <Icons.alert size={14} /> {noun} from {dateLabel} · {ageDays} day{ageDays === 1 ? "" : "s"} old
    </div>
  );
}
