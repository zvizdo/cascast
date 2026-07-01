export function formatDateInTz(iso: string, timeZone: string): string {
  // en-CA yields YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(iso));
}

export function formatTimeInTz(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, hour: "numeric", minute: "2-digit", hour12: true,
  }).format(new Date(iso));
}

export function formatDayLabel(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone, weekday: "short", month: "short", day: "numeric",
  }).format(new Date(iso));
}

export function formatNumber(value: number, precision = 0): string {
  return value.toFixed(precision);
}

export function formatTemp(value: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${Math.round(value)}°`;
}

/** Relative "time ago" for a refresh stamp, e.g. "just now", "14 min ago", "3 hr ago",
 *  "2 days ago". Future timestamps clamp to "just now". The optional `now` arg makes it
 *  testable with a fixed clock. */
export function formatTimeAgo(iso: string, now: number = Date.now()): string {
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  if (diffMs < 60_000) return "just now"; // <1 min (also clamps future)
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Target-window range label, e.g. "Jun 15 – Jun 16" (or a single weekday-qualified
 *  date when start === end). Ported from app/shared.jsx fmtRange. */
export function fmtRange(a: string, b: string): string {
  const da = new Date(`${a}T12:00:00`);
  const db = new Date(`${b}T12:00:00`);
  if (a === b) {
    return da.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  return `${da.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${db.toLocaleDateString(
    "en-US",
    { month: "short", day: "numeric" },
  )}`;
}
