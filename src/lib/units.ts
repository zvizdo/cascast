import { create } from "zustand";
import { persist } from "zustand/middleware";

export type TempUnit = "F" | "C";
export type WindUnit = "mph" | "kmh";
export type DistUnit = "ft" | "m";

export interface UnitPrefs {
  temp: TempUnit;
  wind: WindUnit;
  dist: DistUnit;
}

export const DEFAULT_UNITS: UnitPrefs = { temp: "F", wind: "mph", dist: "ft" };

const EM_DASH = "—";

// ---------- pure converters (canonical → target unit, numeric) ----------

/** Fahrenheit → F|C, rounded to nearest integer for display. */
export function convTemp(f: number, to: TempUnit): number {
  if (to === "F") return Math.round(f);
  return Math.round(((f - 32) * 5) / 9);
}

/** mph → mph|kmh, rounded to nearest integer for display. */
export function convWind(mph: number, to: WindUnit): number {
  if (to === "mph") return Math.round(mph);
  return Math.round(mph * 1.609344);
}

/** feet → ft|m, rounded to nearest integer for display. */
export function convDist(ft: number, to: DistUnit): number {
  if (to === "ft") return Math.round(ft);
  return Math.round(ft * 0.3048);
}

// ---------- formatters (canonical value + target unit → display string) ----------

export function fmtTemp(
  f: number | null | undefined,
  to: TempUnit,
  opts?: { withUnit?: boolean },
): string {
  if (f == null) return EM_DASH;
  const v = convTemp(f, to);
  const withUnit = opts?.withUnit ?? true;
  return withUnit ? `${v}°${to}` : `${v}`;
}

export function fmtWind(mph: number | null | undefined, to: WindUnit): string {
  if (mph == null) return EM_DASH;
  const v = convWind(mph, to);
  return to === "kmh" ? `${v} km/h` : `${v} mph`;
}

export function fmtDist(
  ft: number | null | undefined,
  to: DistUnit,
  opts?: { k?: boolean },
): string {
  if (ft == null) return EM_DASH;
  const v = convDist(ft, to);
  if (opts?.k) {
    return `${(v / 1000).toFixed(1)}k ${to}`;
  }
  return `${v.toLocaleString("en-US")} ${to}`;
}

// ---------- Zustand store (persisted to localStorage "cascast.units") ----------

interface UnitsStore extends UnitPrefs {
  setTemp: (temp: TempUnit) => void;
  setWind: (wind: WindUnit) => void;
  setDist: (dist: DistUnit) => void;
  set: (partial: Partial<UnitPrefs>) => void;
}

export const useUnits = create<UnitsStore>()(
  persist(
    (set) => ({
      ...DEFAULT_UNITS,
      setTemp: (temp) => set({ temp }),
      setWind: (wind) => set({ wind }),
      setDist: (dist) => set({ dist }),
      set: (partial) => set(partial),
    }),
    {
      name: "cascast.units",
      partialize: (s) => ({ temp: s.temp, wind: s.wind, dist: s.dist }),
    },
  ),
);
