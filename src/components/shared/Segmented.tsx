/* Segmented — radiogroup pill control (value picker, no panels). Ported from app/shared.jsx. */
"use client";
import * as React from "react";

export interface SegOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedProps<T extends string> {
  options: SegOption<T>[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedProps<T>) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const move = (idx: number) => {
    const o = options[idx];
    if (!o) return;
    onChange(o.value);
    refs.current[idx]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (i - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next >= 0) {
      e.preventDefault();
      move(next);
    }
  };

  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((o, i) => {
        const selected = value === o.value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={"seg" + (selected ? " is-active" : "")}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
