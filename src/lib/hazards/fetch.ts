import "server-only";

export async function fetchJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return (await res.json()) as T;
}

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.7613; // earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}
