import { Timestamp } from "firebase-admin/firestore";

/** A value that quacks like a Firestore Timestamp. */
function toIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.toDate === "function") {
    return (v.toDate() as Date).toISOString();
  }
  const seconds = typeof v._seconds === "number" ? v._seconds : v.seconds;
  const nanos = typeof v._nanoseconds === "number" ? v._nanoseconds : v.nanoseconds;
  if (typeof seconds === "number" && typeof nanos === "number") {
    return new Date(seconds * 1000 + Math.floor(nanos / 1e6)).toISOString();
  }
  return null;
}

/**
 * Recursively walk objects/arrays and convert any Firestore Timestamp
 * (real instance, `toDate()`-bearing object, or plain `{_seconds,_nanoseconds}` /
 * `{seconds,nanoseconds}` shape) to an ISO string. Everything else is left untouched.
 * Pure — no I/O, no mutation of the input.
 */
export function serializeTimestamps<T>(data: T): T {
  if (data === null || typeof data !== "object") return data;

  const iso = toIso(data);
  if (iso !== null) return iso as unknown as T;

  if (Array.isArray(data)) {
    return data.map((item) => serializeTimestamps(item)) as unknown as T;
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    out[key] = serializeTimestamps(value);
  }
  return out as T;
}
