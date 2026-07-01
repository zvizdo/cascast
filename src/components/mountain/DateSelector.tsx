// src/components/mountain/DateSelector.tsx
"use client";
import * as React from "react";
import { fmtRange } from "@/lib/format";
import type { StripDay } from "@/lib/target-date";

export interface DateSelectorProps {
  days: StripDay[];
  target: string;
  pinned: boolean;
  onPick: (date: string) => void;
}

export function DateSelector({ days, target, pinned, onPick }: DateSelectorProps) {
  const sel = days.find((d) => d.date === target);
  const inRange = sel?.inRange ?? false;
  const labelWord = sel ? (sel.isToday ? "Today" : sel.label === "Tomorrow" ? "Tomorrow" : "") : "";
  // Constrain the native date pickers to the available forecast window so picks stay in range.
  // (If a target is pinned beyond the window, `value` intentionally exceeds `max` — the headline
  // already flags "beyond forecast"; clamping the shown value would misrepresent the target.)
  const ranged = days.filter((d) => d.inRange);
  const minDate = days[0]?.date;
  const maxDate = (ranged.length ? ranged[ranged.length - 1] : days[days.length - 1])?.date;
  return (
    <div className="ds">
      <div className="ds-headline">
        Planning for{" "}
        <b>{labelWord ? `${labelWord} · ` : ""}{fmtRange(target, target)}</b>{" "}
        · {inRange ? "in range" : "beyond forecast"} · {pinned ? "pinned" : "not pinned"}
      </div>
      <div className="ds-strip only-desktop">
        {days.map((d) => (
          <button
            key={d.date}
            type="button"
            className={`ds-day${d.date === target ? " on" : ""}${d.inRange ? "" : " oor"}`}
            aria-pressed={d.date === target}
            onClick={() => onPick(d.date)}
          >
            <span className="ds-dow">{d.dow}</span>
            <span className="ds-n">{d.label}</span>
          </button>
        ))}
        <label className="ds-cal" aria-label="Pick a specific date">
          📅
          <input
            type="date"
            value={target}
            min={minDate}
            max={maxDate}
            onChange={(e) => e.target.value && onPick(e.target.value)}
          />
        </label>
      </div>
      <div className="ds-stepper only-mobile">
        <button
          type="button"
          className="ds-arrow"
          aria-label="Previous day"
          onClick={() => {
            const i = days.findIndex((d) => d.date === target);
            if (i > 0) onPick(days[i - 1].date);
          }}
        >
          ◀
        </button>
        <input
          type="date"
          className="ds-mobile-date"
          value={target}
          min={minDate}
          max={maxDate}
          onChange={(e) => e.target.value && onPick(e.target.value)}
        />
        <button
          type="button"
          className="ds-arrow"
          aria-label="Next day"
          onClick={() => {
            const i = days.findIndex((d) => d.date === target);
            if (i >= 0 && i < days.length - 1) onPick(days[i + 1].date);
          }}
        >
          ▶
        </button>
      </div>
    </div>
  );
}
