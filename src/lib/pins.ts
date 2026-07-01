import { useSyncExternalStore } from "react";

export type Pin = {
  mountainId: string;
  name: string;
  targetDate: string; // YYYY-MM-DD
  notes: string;
  createdAt: string; // ISO timestamp
};

const KEY = "cascast.pins";
const isBrowser = () => typeof window !== "undefined";
const listeners = new Set<() => void>();

export function readPins(): Pin[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Pin[]) : [];
  } catch {
    return [];
  }
}

function write(pins: Pin[]): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, JSON.stringify(pins));
  listeners.forEach((l) => l());
}

export function getPin(mountainId: string): Pin | undefined {
  return readPins().find((p) => p.mountainId === mountainId);
}

export function addPin(p: Omit<Pin, "createdAt">): void {
  const pins = readPins().filter((x) => x.mountainId !== p.mountainId);
  pins.push({ ...p, createdAt: new Date().toISOString() });
  write(pins);
}

export function updatePin(
  mountainId: string,
  patch: Partial<Omit<Pin, "mountainId" | "createdAt">>,
): void {
  write(readPins().map((p) => (p.mountainId === mountainId ? { ...p, ...patch } : p)));
}

export function removePin(mountainId: string): void {
  write(readPins().filter((p) => p.mountainId !== mountainId));
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  if (isBrowser()) window.addEventListener("storage", fn); // cross-tab sync
  return () => {
    listeners.delete(fn);
    if (isBrowser()) window.removeEventListener("storage", fn);
  };
}

// Referentially-stable snapshot: only changes identity when the stored string changes.
const EMPTY: Pin[] = [];
let cacheRaw = "";
let cacheVal: Pin[] = EMPTY;
function snapshot(): Pin[] {
  if (!isBrowser()) return EMPTY;
  const raw = window.localStorage.getItem(KEY) ?? "[]";
  if (raw !== cacheRaw) {
    cacheRaw = raw;
    try {
      cacheVal = JSON.parse(raw) as Pin[];
    } catch {
      cacheVal = EMPTY;
    }
  }
  return cacheVal;
}

export function usePins(): Pin[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}
