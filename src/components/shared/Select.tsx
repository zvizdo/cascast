/* Select — styled native <select> value-picker. Mobile counterpart to Segmented. */
"use client";
import * as React from "react";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: SelectOption<T>[];
  ariaLabel?: string;
}

export function Select<T extends string>({ value, onChange, options, ariaLabel }: SelectProps<T>) {
  return (
    <select
      className="m-select"
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
