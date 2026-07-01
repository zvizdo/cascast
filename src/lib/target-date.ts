function pad(n: number): string { return String(n).padStart(2, "0"); }

export function todayISO(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return todayISO(dt);
}
export function defaultTargetISO(now: Date = new Date()): string {
  return addDaysISO(todayISO(now), 1);
}
export function isInRange(dayKeys: string[], target: string): boolean {
  return dayKeys.includes(target);
}

export interface StripDay { date: string; label: string; dow: string; inRange: boolean; isToday: boolean; }

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function dayStripDays(
  dayKeys: string[], target: string, now: Date = new Date(), count = 8,
): StripDay[] {
  const today = todayISO(now);
  const out: StripDay[] = [];
  for (let i = 0; i < count; i++) {
    const date = addDaysISO(today, i);
    const [y, m, d] = date.split("-").map(Number);
    const dow = DOW[new Date(y, m - 1, d).getDay()];
    const label = i === 0 ? "Today" : i === 1 ? "Tomorrow" : String(d);
    out.push({ date, label, dow, inRange: dayKeys.includes(date), isToday: i === 0 });
  }
  return out;
}
