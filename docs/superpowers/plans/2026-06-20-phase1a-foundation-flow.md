# Phase 1A — Foundation & Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the mountain page onto the always-targeted flow + 3-tab IA, add the first-class provenance pattern, fix the 3D units bug, and remove the standalone pin form — without yet restyling any chart (that is Phase 1B).

**Architecture:** New pure-logic libs (`provenance.ts`, `target-date.ts`) are TDD'd in isolation. New presentational components (`Provenance`, `DateSelector`, `HazardChips`, `MountainTabs`) take props and are tested with Vitest + Testing Library. The mountain page is rewired so the target date always exists (defaults to tomorrow, client-clock), the header carries the date selector + hazard chips, pinning becomes a localStorage bookmark of the current target, and notes are inline. The existing Forecast panels (DailyOutlook, FreezingLevelHero, ConfidenceStrip, ForecastEvolutionChart, Snowpack, Satellite) are moved unchanged into a Forecast tab; the Avalanche panel moves into a Safety tab.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, SWR, Zustand (`useUnits`), Vitest + @testing-library/react + vitest-axe, hand-built SVG, CSS custom properties in `globals.css`.

## Global Constraints

- Coverage gate: **90% lines / 90% functions / 85% branches** (Vitest). TDD: failing test first, then implement.
- `src/components/three/**` is **excluded from coverage** (WebGL un-mountable in jsdom) — verify 3D via the import smoke test + a route-mocked e2e.
- Quality gates that must stay green: `npm run build` · `npm test` · `npm run test:e2e` (desktop 1280×800 + iPhone 12) · `tsc`.
- Distance/elevation values are **canonical feet** in data; every displayed elevation/distance must honor `useUnits().dist` via `fmtDist`.
- Mobile parity required: every new surface has a defined ≤680px treatment (reuse `.only-mobile`/`.only-desktop` + `src/components/shared/Select.tsx`).
- Pins are **client-side only** (`src/lib/pins.ts`, localStorage). No server pin state.
- Match existing style: hand-built SVG (not Recharts), CSS variables for all colors (no hardcoded hex in components), `Icons` from `src/components/icons/icons.tsx`.
- Design source of truth for visuals: the approved mockups in `.superpowers/brainstorm/42711-1781980940/content/` (`date-selector.html`, `safety-tab.html`, `provenance.html`) and the spec `docs/superpowers/specs/2026-06-20-data-integrations-and-ux-redesign-design.md`.

---

## File Structure

**New files**
- `src/lib/provenance.ts` — provenance types + `weatherProvenance()` helper.
- `src/lib/target-date.ts` — default-target, day-strip, in-range helpers.
- `src/components/shared/Provenance.tsx` — the reusable tag + popover.
- `src/components/mountain/DateSelector.tsx` — headline + day-strip / mobile stepper (presentational).
- `src/components/mountain/HazardChips.tsx` — header hazard chip row (presentational).
- `src/components/mountain/MountainTabs.tsx` — tab shell (manages active tab).
- `src/components/mountain/PinNotes.tsx` — inline notes (extracted from MountainDetail).
- `src/app/sources/page.tsx` — "Models & sources" explainer page.
- Test files mirroring each under `src/lib/__tests__/` and `src/components/**/__tests__/`.
- `tests/e2e/phase1a-flow.spec.ts` — route-mocked flow + 3D units e2e.

**Modified files**
- `src/app/mountains/[slug]/page.tsx` — pass `target` through unchanged (default handled client-side).
- `src/components/mountain/MountainHeader.tsx` — render DateSelector + HazardChips; pin=bookmark button; drop pin-form link.
- `src/components/mountain/MountainDetail.tsx` — always-targeted; render MountainTabs (Forecast + Safety); remove browse/focused branch; use PinNotes.
- `src/components/three/FreezingPlane.tsx` — units-aware label.
- `src/components/three/SummitMarker.tsx` — units-aware label.

**Removed files**
- `src/app/mountains/[slug]/pin/page.tsx`
- `src/components/pin/PinForm.tsx`

---

## Task 1: Provenance lib

**Files:**
- Create: `src/lib/provenance.ts`
- Test: `src/lib/__tests__/provenance.test.ts`

**Interfaces:**
- Consumes: `CombinedForecastBlob`, `ModelSeries` from `src/lib/types.ts`; `dayKeys` from `src/lib/forecast-select.ts`.
- Produces:
  - `type ModelId = "hrrr" | "gfs" | "ecmwf"`
  - `interface WeatherProvenance { kind: "model"; model: ModelId; label: string; reason: string; blend?: { model: ModelId; fromHour: number }[] }`
  - `interface SourceProvenance { kind: "source"; label: string; observedAt?: string; distanceMi?: number; note?: string }`
  - `type Provenance = WeatherProvenance | SourceProvenance`
  - `function weatherProvenance(blob: CombinedForecastBlob, model: ModelId, opts?: { variable?: "freezing" }): WeatherProvenance`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/provenance.test.ts
import { describe, it, expect } from "vitest";
import { weatherProvenance } from "@/lib/provenance";
import type { CombinedForecastBlob, ModelSeries } from "@/lib/types";

function series(over: Partial<ModelSeries> = {}): ModelSeries {
  return {
    available: true, time: ["2026-06-21T00:00"], temperature_2m: [10], apparent_temperature: [9],
    wind_speed_10m: [5], wind_gusts_10m: [8], wind_direction_10m: [180], precipitation: [0],
    precipitation_probability: [0], snowfall: [0], freezing_level_height: [9000], cloud_cover: [0],
    visibility: [9999], weather_code: [1], temp_base_f: [40], temp_mid_f: [35], temp_summit_f: [30], ...over,
  };
}
const blob = (over: Partial<CombinedForecastBlob>): CombinedForecastBlob => ({
  mountainId: "m", timezone: "America/Los_Angeles", fetchedAt: "2026-06-20T00:00:00Z",
  hrrr: null, gfs: null, ecmwf: null, ...over,
});

describe("weatherProvenance", () => {
  it("labels a plain model choice", () => {
    const p = weatherProvenance(blob({ gfs: series() }), "gfs");
    expect(p.kind).toBe("model");
    expect(p.label).toBe("GFS");
    expect(p.reason).toBeTruthy();
  });

  it("explains the freezing choice when ECMWF lacks the field and HRRR is short-range", () => {
    const p = weatherProvenance(blob({ gfs: series() }), "gfs", { variable: "freezing" });
    expect(p.reason.toLowerCase()).toContain("freezing");
  });

  it("reports a HRRR→GFS blend when both are present", () => {
    const p = weatherProvenance(blob({ hrrr: series(), gfs: series() }), "hrrr");
    expect(p.blend?.[0]).toEqual({ model: "hrrr", fromHour: 0 });
    expect(p.blend?.[1]).toEqual({ model: "gfs", fromHour: 48 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/__tests__/provenance.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// src/lib/provenance.ts
import type { CombinedForecastBlob } from "@/lib/types";

export type ModelId = "hrrr" | "gfs" | "ecmwf";

export interface WeatherProvenance {
  kind: "model";
  model: ModelId;
  label: string;
  reason: string;
  blend?: { model: ModelId; fromHour: number }[];
}
export interface SourceProvenance {
  kind: "source";
  label: string;
  observedAt?: string;
  distanceMi?: number;
  note?: string;
}
export type Provenance = WeatherProvenance | SourceProvenance;

const LABELS: Record<ModelId, string> = { hrrr: "HRRR", gfs: "GFS", ecmwf: "ECMWF" };

export function weatherProvenance(
  blob: CombinedForecastBlob,
  model: ModelId,
  opts: { variable?: "freezing" } = {},
): WeatherProvenance {
  const hasHrrr = !!blob.hrrr?.available;
  const hasGfs = !!blob.gfs?.available;
  let reason: string;
  if (opts.variable === "freezing") {
    reason =
      model === "gfs"
        ? "GFS is the only model with a freezing-level field at this range (HRRR ends ~48 h, ECMWF has no freezing-level field)."
        : `${LABELS[model]} provides the freezing level at this range.`;
  } else if (model === "hrrr") {
    reason = "HRRR is the highest-resolution model for the near term (~48 h).";
  } else if (model === "gfs") {
    reason = hasHrrr ? "Beyond HRRR's ~48 h horizon, GFS carries the forecast." : "GFS global model.";
  } else {
    reason = "ECMWF global model.";
  }
  const blend =
    model === "hrrr" && hasGfs
      ? [{ model: "hrrr" as ModelId, fromHour: 0 }, { model: "gfs" as ModelId, fromHour: 48 }]
      : undefined;
  return { kind: "model", model, label: LABELS[model], reason, blend };
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/__tests__/provenance.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/provenance.ts src/lib/__tests__/provenance.test.ts && git commit -m "feat(provenance): weather provenance helper + types"`

---

## Task 2: `<Provenance>` component

**Files:**
- Create: `src/components/shared/Provenance.tsx`
- Test: `src/components/shared/__tests__/Provenance.test.tsx`
- Modify: `src/app/globals.css` (append `.prov-*` styles)

**Interfaces:**
- Consumes: `Provenance` type from Task 1.
- Produces: `function Provenance({ data, loud }: { data: ProvenanceData; loud?: boolean }): JSX.Element` where `ProvenanceData = { label: string; reason: string; meta?: string; href?: string }`. (Presentational — callers map a `Provenance` union to this shape so the component stays decoupled.)

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/shared/__tests__/Provenance.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import { Provenance } from "@/components/shared/Provenance";

describe("Provenance", () => {
  it("renders a compact tag with the source label", () => {
    render(<Provenance data={{ label: "GFS", reason: "only model with freezing at range" }} />);
    expect(screen.getByText("GFS")).toBeInTheDocument();
  });

  it("shows the reason inline when loud", () => {
    render(<Provenance loud data={{ label: "GFS", reason: "HRRR ends at 48h" }} />);
    expect(screen.getByText(/HRRR ends at 48h/)).toBeInTheDocument();
  });

  it("exposes the reason to assistive tech via the button title/aria when quiet", () => {
    render(<Provenance data={{ label: "AirNow", reason: "Enumclaw monitor, 22 mi" }} />);
    const btn = screen.getByRole("button", { name: /AirNow/ });
    expect(btn).toHaveAttribute("aria-label", expect.stringContaining("Enumclaw"));
  });

  it("has no a11y violations", async () => {
    const { container } = render(<Provenance data={{ label: "OSM", reason: "OpenStreetMap" }} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/shared/__tests__/Provenance.test.tsx` → FAIL.

- [ ] **Step 3: Implement the component**

```tsx
// src/components/shared/Provenance.tsx
"use client";
import * as React from "react";
import Link from "next/link";

export interface ProvenanceData {
  label: string;
  reason: string;
  meta?: string; // e.g. "22 mi · 18 min ago"
  href?: string; // defaults to /sources
}

export function Provenance({ data, loud = false }: { data: ProvenanceData; loud?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const aria = `${data.label} — ${data.reason}${data.meta ? ` (${data.meta})` : ""}`;
  return (
    <span className="prov">
      <button
        type="button"
        className="prov-tag"
        aria-label={aria}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setOpen(false)}
      >
        {data.label} <span aria-hidden className="prov-i">ⓘ</span>
      </button>
      {loud && <span className="prov-reason-inline">{data.reason}</span>}
      {open && (
        <span className="prov-pop" role="note">
          {data.reason}
          {data.meta ? <span className="prov-meta"> · {data.meta}</span> : null}{" "}
          <Link href={data.href ?? "/sources"} className="prov-link">Models &amp; sources →</Link>
        </span>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Add styles** to the end of `src/app/globals.css` (uses existing tokens):

```css
/* Provenance tag */
.prov { position: relative; display: inline-flex; align-items: center; gap: 6px; }
.prov-tag { font-family: var(--mono); font-size: 10px; padding: 1px 7px; border-radius: 9px;
  background: var(--accent-soft); color: var(--accent); border: 1px solid var(--line-strong); cursor: help; }
.prov-tag:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.prov-i { opacity: .7; }
.prov-reason-inline { font-size: 11px; color: var(--muted); }
.prov-pop { position: absolute; top: 100%; left: 0; z-index: 20; margin-top: 4px; max-width: 280px;
  font-size: 11px; line-height: 1.5; background: var(--surface); color: var(--ink-2);
  border: 1px solid var(--line-strong); border-radius: 6px; padding: 8px 10px; box-shadow: 0 6px 18px rgba(0,0,0,.18); }
.prov-meta { color: var(--muted); }
.prov-link { color: var(--accent); }
```

- [ ] **Step 5: Run test to verify it passes** — `npx vitest run src/components/shared/__tests__/Provenance.test.tsx` → PASS.

- [ ] **Step 6: Commit** — `git add src/components/shared/Provenance.tsx src/components/shared/__tests__/Provenance.test.tsx src/app/globals.css && git commit -m "feat(provenance): reusable Provenance tag component"`

---

## Task 3: Target-date helpers

**Files:**
- Create: `src/lib/target-date.ts`
- Test: `src/lib/__tests__/target-date.test.ts`

**Interfaces:**
- Produces:
  - `function todayISO(now?: Date): string` — local `YYYY-MM-DD`.
  - `function addDaysISO(iso: string, n: number): string`
  - `function defaultTargetISO(now?: Date): string` — tomorrow.
  - `function isInRange(dayKeys: string[], target: string): boolean`
  - `interface StripDay { date: string; label: string; dow: string; inRange: boolean; isToday: boolean }`
  - `function dayStripDays(dayKeys: string[], target: string, now?: Date, count?: number): StripDay[]`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/__tests__/target-date.test.ts
import { describe, it, expect } from "vitest";
import { todayISO, addDaysISO, defaultTargetISO, isInRange, dayStripDays } from "@/lib/target-date";

const NOW = new Date(2026, 5, 20, 9, 0, 0); // Sat Jun 20 2026 local

describe("target-date", () => {
  it("todayISO returns local YYYY-MM-DD", () => {
    expect(todayISO(NOW)).toBe("2026-06-20");
  });
  it("addDaysISO crosses month boundaries", () => {
    expect(addDaysISO("2026-06-30", 2)).toBe("2026-07-02");
  });
  it("defaultTargetISO is tomorrow", () => {
    expect(defaultTargetISO(NOW)).toBe("2026-06-21");
  });
  it("isInRange checks membership", () => {
    expect(isInRange(["2026-06-21", "2026-06-22"], "2026-06-21")).toBe(true);
    expect(isInRange(["2026-06-21"], "2026-07-01")).toBe(false);
  });
  it("dayStripDays labels Today/Tomorrow and flags range + target", () => {
    const days = dayStripDays(["2026-06-20", "2026-06-21"], "2026-06-21", NOW, 4);
    expect(days[0]).toMatchObject({ date: "2026-06-20", label: "Today", isToday: true, inRange: true });
    expect(days[1]).toMatchObject({ date: "2026-06-21", label: "Tomorrow", inRange: true });
    expect(days[2].inRange).toBe(false); // 2026-06-22 not in dayKeys
    expect(days[2].dow).toBe("Mon");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/__tests__/target-date.test.ts` → FAIL.

- [ ] **Step 3: Implement**

```ts
// src/lib/target-date.ts
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
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/__tests__/target-date.test.ts` → PASS.

- [ ] **Step 5: Commit** — `git add src/lib/target-date.ts src/lib/__tests__/target-date.test.ts && git commit -m "feat(flow): target-date helpers (default tomorrow, day strip, in-range)"`

---

## Task 4: DateSelector component (presentational)

**Files:**
- Create: `src/components/mountain/DateSelector.tsx`
- Test: `src/components/mountain/__tests__/DateSelector.test.tsx`
- Modify: `src/app/globals.css` (append `.ds-*` styles)

**Interfaces:**
- Consumes: `StripDay` from Task 3; `Pin` from `src/lib/pins.ts`; `fmtRange` from `src/lib/format.ts`.
- Produces: `function DateSelector({ days, target, pinned, onPick }: { days: StripDay[]; target: string; pinned: boolean; onPick: (date: string) => void }): JSX.Element`. Renders the "Planning for …" headline + the desktop day strip + a native `<input type="date">` for arbitrary dates + a mobile stepper. `onPick` is called with the chosen `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/mountain/__tests__/DateSelector.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DateSelector } from "@/components/mountain/DateSelector";
import type { StripDay } from "@/lib/target-date";

const days: StripDay[] = [
  { date: "2026-06-20", label: "Today", dow: "Sat", inRange: true, isToday: true },
  { date: "2026-06-21", label: "Tomorrow", dow: "Sun", inRange: true, isToday: false },
  { date: "2026-06-25", label: "25", dow: "Thu", inRange: false, isToday: false },
];

describe("DateSelector", () => {
  it("states the target in plain English", () => {
    render(<DateSelector days={days} target="2026-06-21" pinned={false} onPick={() => {}} />);
    expect(screen.getByText(/Planning for/i)).toBeInTheDocument();
    expect(screen.getByText(/not pinned/i)).toBeInTheDocument();
  });
  it("marks the selected day pressed and out-of-range days disabled-looking", () => {
    render(<DateSelector days={days} target="2026-06-21" pinned onPick={() => {}} />);
    const tomorrow = screen.getByRole("button", { name: /Tomorrow/ });
    expect(tomorrow).toHaveAttribute("aria-pressed", "true");
  });
  it("calls onPick when a day is clicked", () => {
    const onPick = vi.fn();
    render(<DateSelector days={days} target="2026-06-21" pinned={false} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: /Today/ }));
    expect(onPick).toHaveBeenCalledWith("2026-06-20");
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/mountain/__tests__/DateSelector.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

```tsx
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
            <span className="ds-n">{d.label === "Today" || d.label === "Tomorrow" ? d.label : d.label}</span>
          </button>
        ))}
        <label className="ds-cal" aria-label="Pick a specific date">
          📅
          <input type="date" value={target} onChange={(e) => e.target.value && onPick(e.target.value)} />
        </label>
      </div>
      <div className="ds-stepper only-mobile">
        <button type="button" className="ds-arrow" aria-label="Previous day"
          onClick={() => { const i = days.findIndex((d) => d.date === target); if (i > 0) onPick(days[i - 1].date); }}>◀</button>
        <input type="date" className="ds-mobile-date" value={target} onChange={(e) => e.target.value && onPick(e.target.value)} />
        <button type="button" className="ds-arrow" aria-label="Next day"
          onClick={() => { const i = days.findIndex((d) => d.date === target); if (i >= 0 && i < days.length - 1) onPick(days[i + 1].date); }}>▶</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Append styles** to `src/app/globals.css` (model the look on `date-selector.html` option C; reuse tokens). Include `.ds-headline b{color:var(--accent)}`, `.ds-strip{display:flex;gap:6px}`, `.ds-day{...}` selected `.on{background:var(--accent);color:#fff}`, `.ds-day.oor{opacity:.4}`, `.ds-cal input{display:none}` (icon opens native picker via label), and `.only-mobile/.only-desktop` already exist. Hide `.ds-strip` under 680px, show `.ds-stepper`.

- [ ] **Step 5: Run test to verify it passes** — `npx vitest run src/components/mountain/__tests__/DateSelector.test.tsx` → PASS.

- [ ] **Step 6: Commit** — `git add src/components/mountain/DateSelector.tsx src/components/mountain/__tests__/DateSelector.test.tsx src/app/globals.css && git commit -m "feat(flow): DateSelector (headline + day strip + mobile stepper)"`

---

## Task 5: HazardChips component (presentational, Avalanche only)

**Files:**
- Create: `src/components/mountain/HazardChips.tsx`
- Test: `src/components/mountain/__tests__/HazardChips.test.tsx`
- Modify: `src/app/globals.css` (append `.hz-*` styles)

**Interfaces:**
- Produces:
  - `interface HazardChip { key: string; label: string; tokenVar: string; onClick?: () => void }` (`tokenVar` is a CSS var name like `"--d2"`).
  - `function HazardChips({ chips }: { chips: HazardChip[] }): JSX.Element | null` — returns `null` when `chips` is empty.
  - `function avalancheChip(nwac: NwacForecast | { season: "summer" } | undefined, onClick?: () => void): HazardChip | null` — maps the highest of upper/middle/lower danger to a `--d1..--d5` token; returns `null` for summer/no data.

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/mountain/__tests__/HazardChips.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { HazardChips, avalancheChip } from "@/components/mountain/HazardChips";

describe("HazardChips", () => {
  it("renders nothing when empty", () => {
    const { container } = render(<HazardChips chips={[]} />);
    expect(container.firstChild).toBeNull();
  });
  it("renders a chip and fires onClick", () => {
    const onClick = vi.fn();
    render(<HazardChips chips={[{ key: "avy", label: "Avy Mod", tokenVar: "--d2", onClick }]} />);
    fireEvent.click(screen.getByText("Avy Mod"));
    expect(onClick).toHaveBeenCalled();
  });
  it("avalancheChip picks the worst band and a danger token", () => {
    const chip = avalancheChip({ season: "winter", danger: { current: { upper: 3, middle: 2, lower: 1 }, tomorrow: { upper: 1, middle: 1, lower: 1 } } } as never);
    expect(chip?.tokenVar).toBe("--d3");
    expect(chip?.label).toMatch(/Avy/);
  });
  it("avalancheChip returns null in summer", () => {
    expect(avalancheChip({ season: "summer" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/mountain/__tests__/HazardChips.test.tsx` → FAIL.

- [ ] **Step 3: Implement**

```tsx
// src/components/mountain/HazardChips.tsx
"use client";
import * as React from "react";
import type { NwacForecast } from "@/lib/types";

export interface HazardChip { key: string; label: string; tokenVar: string; onClick?: () => void; }

const DANGER_WORD = ["", "Low", "Mod", "Consid", "High", "Extreme"];

export function avalancheChip(
  nwac: NwacForecast | { season: "summer" } | undefined,
  onClick?: () => void,
): HazardChip | null {
  if (!nwac || (nwac as { season?: string }).season !== "winter") return null;
  const d = (nwac as NwacForecast).danger?.current;
  if (!d) return null;
  const worst = Math.max(d.upper, d.middle, d.lower);
  if (worst < 1) return null;
  return { key: "avy", label: `Avy ${DANGER_WORD[worst]}`, tokenVar: `--d${worst}`, onClick };
}

export function HazardChips({ chips }: { chips: HazardChip[] }) {
  if (chips.length === 0) return null;
  return (
    <div className="hz-row">
      {chips.map((c) => (
        <button key={c.key} type="button" className="hz-chip" style={{ background: `var(${c.tokenVar})` }} onClick={c.onClick}>
          {c.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Append styles** to `src/app/globals.css`: `.hz-row{display:flex;gap:6px;flex-wrap:wrap}` and `.hz-chip{border:none;border-radius:10px;padding:2px 9px;font-size:11px;font-weight:600;color:#111;cursor:pointer}` (+ focus-visible ring).

- [ ] **Step 5: Run test to verify it passes** — `npx vitest run src/components/mountain/__tests__/HazardChips.test.tsx` → PASS.

- [ ] **Step 6: Commit** — `git add src/components/mountain/HazardChips.tsx src/components/mountain/__tests__/HazardChips.test.tsx src/app/globals.css && git commit -m "feat(safety): HazardChips row + avalancheChip mapper"`

---

## Task 6: MountainTabs shell

**Files:**
- Create: `src/components/mountain/MountainTabs.tsx`
- Test: `src/components/mountain/__tests__/MountainTabs.test.tsx`
- Modify: `src/app/globals.css` (append `.mtab-*` styles)

**Interfaces:**
- Produces: `interface TabDef { key: string; label: string; content: React.ReactNode }` and `function MountainTabs({ tabs, initial }: { tabs: TabDef[]; initial?: string }): JSX.Element`. Uses a `role="tablist"`/`role="tab"`/`role="tabpanel"` pattern with roving focus; remembers the active tab in component state (default `initial ?? tabs[0].key`).

- [ ] **Step 1: Write the failing test**

```tsx
// src/components/mountain/__tests__/MountainTabs.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { MountainTabs } from "@/components/mountain/MountainTabs";

const tabs = [
  { key: "forecast", label: "Forecast", content: <div>FORECAST BODY</div> },
  { key: "safety", label: "Safety", content: <div>SAFETY BODY</div> },
];

describe("MountainTabs", () => {
  it("shows the first tab by default", () => {
    render(<MountainTabs tabs={tabs} />);
    expect(screen.getByText("FORECAST BODY")).toBeInTheDocument();
    expect(screen.queryByText("SAFETY BODY")).not.toBeInTheDocument();
  });
  it("switches tabs on click", () => {
    render(<MountainTabs tabs={tabs} />);
    fireEvent.click(screen.getByRole("tab", { name: "Safety" }));
    expect(screen.getByText("SAFETY BODY")).toBeInTheDocument();
  });
  it("marks the active tab aria-selected", () => {
    render(<MountainTabs tabs={tabs} />);
    expect(screen.getByRole("tab", { name: "Forecast" })).toHaveAttribute("aria-selected", "true");
  });
  it("has no a11y violations", async () => {
    const { container } = render(<MountainTabs tabs={tabs} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/components/mountain/__tests__/MountainTabs.test.tsx` → FAIL.

- [ ] **Step 3: Implement** a tablist with roving `tabIndex`, ArrowLeft/Right handlers, `aria-selected`, `aria-controls`/`id` wiring, and render only the active panel's `content`. Model the keyboard handling on the existing `src/components/shared/Segmented.tsx` (lines 32–43).

- [ ] **Step 4: Append `.mtab-*` styles** to `globals.css` (tab bar reusing `--surface-2`/`--accent`; active tab underline/fill; horizontal scroll on mobile).

- [ ] **Step 5: Run test to verify it passes** — `npx vitest run src/components/mountain/__tests__/MountainTabs.test.tsx` → PASS.

- [ ] **Step 6: Commit** — `git add src/components/mountain/MountainTabs.tsx src/components/mountain/__tests__/MountainTabs.test.tsx src/app/globals.css && git commit -m "feat(ia): MountainTabs accessible tab shell"`

---

## Task 7: Rewire the mountain page to always-targeted + tabs

**Files:**
- Modify: `src/app/mountains/[slug]/page.tsx`
- Modify: `src/components/mountain/MountainDetail.tsx`
- Create: `src/components/mountain/PinNotes.tsx` (extract from MountainDetail)
- Test: `src/components/mountain/__tests__/MountainDetail.test.tsx` (new), `src/components/mountain/__tests__/PinNotes.test.tsx` (new)

**Interfaces:**
- Consumes: `defaultTargetISO`, `dayStripDays`, `isInRange` (Task 3); `MountainTabs`/`TabDef` (Task 6); existing hooks from `src/lib/hooks.ts`; existing panels.
- Produces: `MountainDetail` now always computes `effectiveTarget = target ?? defaultTargetISO()` (client clock) and renders `<MountainTabs>` with a **Forecast** tab (DailyOutlook, FreezingLevelHero+ConfidenceStrip+ForecastEvolutionChart when `inRange`, Snowpack, Satellite, PinNotes, Model-Lab link) and a **Safety** tab (Avalanche panel). The browse/focused branch and the `focused` variable are removed.

- [ ] **Step 1: Extract PinNotes** — move the `PinNotes` sub-component (current `MountainDetail.tsx` lines 203–255) into `src/components/mountain/PinNotes.tsx` as `export function PinNotes({ slug, name }: { slug: string; name: string })`, keeping its `getPin`/`addPin`/`updatePin` behavior verbatim. Write `PinNotes.test.tsx` first asserting: (a) renders the saved note, (b) typing calls `updatePin`/`addPin` (mock `@/lib/pins`).

- [ ] **Step 2: Run PinNotes test → FAIL, then implement extraction, then PASS.**

- [ ] **Step 3: Write the failing MountainDetail test**

```tsx
// src/components/mountain/__tests__/MountainDetail.test.tsx (key cases)
// Mock all SWR hooks from "@/lib/hooks" and "@/lib/pins".
// 1. renders a tablist with Forecast and Safety tabs
// 2. defaults the target to tomorrow when no target prop is given (assert DailyOutlook receives a tomorrow targetStart — spy/mock DailyOutlook)
// 3. Avalanche panel renders under the Safety tab, not Forecast
// 4. out-of-range target still renders DailyOutlook but not the FreezingLevelHero
```

- [ ] **Step 4: Run it → FAIL.**

- [ ] **Step 5: Rewrite `MountainDetail`** — remove `focused`; compute `const effectiveTarget = target ?? defaultTargetISO();`, `const inRange = !!blob && isInRange(dayKeys(seriesForKeys), effectiveTarget);`. Build `tabs: TabDef[]`:
  - **Forecast**: the existing Daily Outlook (pass `targetStart`/`targetEnd = effectiveTarget`), then the `inRange &&` blocks for FreezingLevelHero (+ Mountain3DCard), ConfidenceStrip, ForecastEvolutionChart **unchanged**, then Snowpack, Satellite, `<PinNotes slug={mountain.slug} name={mountain.name} />`, and the Model-Lab link.
  - **Safety**: the Avalanche panel.
  Render `<MountainTabs tabs={tabs} />`. Delete the "Current conditions" vs "The window" headline branch (the DateSelector headline replaces it).

- [ ] **Step 6: Update `page.tsx`** — no logic change needed (still forwards `target?`), but add a comment that an absent `target` means "client defaults to tomorrow." Confirm `MountainHeader` + `MountainDetail` still receive `{ mountain, target }`.

- [ ] **Step 7: Run tests** — `npx vitest run src/components/mountain` → PASS. Then `npx tsc --noEmit`.

- [ ] **Step 8: Commit** — `git add src/app/mountains/\[slug\]/page.tsx src/components/mountain/MountainDetail.tsx src/components/mountain/PinNotes.tsx src/components/mountain/__tests__/ && git commit -m "feat(flow): always-targeted MountainDetail on tab shell; extract PinNotes"`

---

## Task 8: Pin = bookmark in the header; render DateSelector + HazardChips; remove the pin form

**Files:**
- Modify: `src/components/mountain/MountainHeader.tsx`
- Remove: `src/app/mountains/[slug]/pin/page.tsx`, `src/components/pin/PinForm.tsx`
- Test: `src/components/mountain/__tests__/MountainHeader.test.tsx` (new)

**Interfaces:**
- Consumes: `usePins`, `addPin`, `removePin`, `getPin` (`src/lib/pins.ts`); `useMountainWeather`, `useMountainNwac` (`src/lib/hooks.ts`); `dayStripDays`, `defaultTargetISO` (Task 3); `DateSelector` (Task 4); `HazardChips`, `avalancheChip` (Task 5); `dayKeys` (`src/lib/forecast-select.ts`).
- Produces: header that owns the target (computes `effectiveTarget = target ?? defaultTargetISO()`), renders `DateSelector` (whose `onPick` does `router.push(\`/mountains/${slug}?target=${date}\`)`), renders `HazardChips` (avalanche from `useMountainNwac`), and a Pin button (`addPin({ mountainId, name, targetDate: effectiveTarget, notes: getPin(slug)?.notes ?? "" })`) with `removePin` when pinned.

- [ ] **Step 1: Write the failing header test**

```tsx
// MountainHeader.test.tsx (key cases) — mock next/navigation useRouter, @/lib/pins, @/lib/hooks
// 1. clicking "Pin" calls addPin with the current target date
// 2. when pinned, shows "Pinned"/"Unpin" and clicking Unpin calls removePin
// 3. picking a day in the strip pushes /mountains/{slug}?target={date}
// 4. no link to /mountains/{slug}/pin exists anymore
```

- [ ] **Step 2: Run it → FAIL.**

- [ ] **Step 3: Rewrite `MountainHeader`** — keep the back-link + title + CopyLink + 3D + Model-Lab buttons. Replace the `Edit pin`/`Pin` Link (current lines 62–78) with a `<button>` that calls `addPin(...)` (pin) / `removePin(slug)` (unpin); button label: not pinned → "Pin", pinned & target===pin.targetDate → "Pinned ✓", pinned & differs → "Update pin". Below the title row, render `<DateSelector days={dayStripDays(keys, effectiveTarget)} target={effectiveTarget} pinned={!!pin} onPick={...}/>` and `<HazardChips chips={[avalancheChip(nwac, () => {/* scroll to Safety */})].filter(Boolean)} />`. The 3D/Model-Lab hrefs use `effectiveTarget`.

- [ ] **Step 4: Delete the pin route + form** — `git rm src/app/mountains/[slug]/pin/page.tsx src/components/pin/PinForm.tsx`. Grep for stragglers: `rg -n "/pin\"|PinForm|/pin\`" src` → fix any remaining references (e.g. none should remain after Task 7/8).

- [ ] **Step 5: Run tests + build** — `npx vitest run src/components/mountain && npx tsc --noEmit && npm run build` → all green.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(flow): pin=bookmark in header + DateSelector + HazardChips; remove pin form"`

---

## Task 9: 3D units fix (FreezingPlane + SummitMarker)

**Files:**
- Modify: `src/components/three/FreezingPlane.tsx:15`
- Modify: `src/components/three/SummitMarker.tsx:28`
- Test: `tests/e2e/phase1a-flow.spec.ts` (3D label assertion; `src/components/three/**` is coverage-excluded so this is verified via e2e, not unit)

**Interfaces:**
- Consumes: `useUnits`, `fmtDist` (`src/lib/units.ts`).
- Produces: both labels formatted via `fmtDist(value, dist)` instead of hardcoded `" ft"`.

- [ ] **Step 1: Edit FreezingPlane** — at top of the component add `const { dist } = useUnits();` (import from `@/lib/units`) and replace line 15:

```ts
// before: const label = `${Math.round(freezingFt).toLocaleString()} ft`;
const label = fmtDist(freezingFt, dist);
```

- [ ] **Step 2: Edit SummitMarker** — add `const { dist } = useUnits();` and replace line 28:

```tsx
// before: <span className="three-summit-elev">{summitFt} ft</span>
<span className="three-summit-elev">{fmtDist(summitFt, dist)}</span>
```

- [ ] **Step 3: Verify the smoke import still passes** — `npx vitest run src/components/three/__tests__/smoke.test.ts` → PASS.

- [ ] **Step 4: Add the e2e check** (in Task 10's spec or here) — on `/mountains/mount-rainier/3d?target=…`, with the units store set to metric, assert the summit label text contains `"m"` not `"ft"`. Use the existing route-mock harness; `drei`'s `<Html>` renders real DOM so Playwright can read it. Mark `test.describe` so it runs in the standard route-mocked suite.

- [ ] **Step 5: Commit** — `git add src/components/three/FreezingPlane.tsx src/components/three/SummitMarker.tsx tests/e2e/phase1a-flow.spec.ts && git commit -m "fix(3d): honor units toggle in FreezingPlane + SummitMarker labels"`

---

## Task 10: "Models & sources" explainer page

**Files:**
- Create: `src/app/sources/page.tsx`
- Test: `src/app/__tests__/sources.test.tsx` (or co-located) 
- Modify: `src/components/layout/Header.tsx` (add a footer/nav link to `/sources`) — optional small link
- Modify: `tests/e2e/phase1a-flow.spec.ts` (navigate to `/sources`, assert headings)

**Interfaces:**
- Produces: a static, server-rendered explainer page describing the weather models (HRRR/GFS/ECMWF — resolution, range, why blends, why ECMWF has no freezing level) and the external data sources + attribution, matching the provenance reasons used by `weatherProvenance` (Task 1). This is the `href` target of every `<Provenance>` popover.

- [ ] **Step 1: Write the failing test** — render `Sources` page; assert it contains headings "Weather models" and "Data sources", and the strings "HRRR", "GFS", "ECMWF", "freezing level", and "OpenStreetMap".

- [ ] **Step 2: Run it → FAIL.**

- [ ] **Step 3: Implement** `src/app/sources/page.tsx` as a static page (plain content, existing `.page`/`.page-title`/`.page-sub` classes). Cover: what each model is + range + resolution; the HRRR→GFS blend rule (0–48 h / beyond); ECMWF has no freezing-level field; and a sources/attribution list (Open-Meteo, NWAC, NRCS SNOTEL, Copernicus/Sentinel-2; and the Phase-2/3 sources AirNow, NWS/SPC, USGS ComCat/HANS, NPS, USFS, NASA GIBS, OSM). Keep copy concise and accurate.

- [ ] **Step 4: Run test → PASS.**

- [ ] **Step 5: Add a quiet link** to `/sources` from the layout footer (or `Header.tsx`).

- [ ] **Step 6: Run full gates** — `npm test && npx tsc --noEmit && npm run build && npm run test:e2e` → all green.

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(provenance): Models & sources explainer page + link"`

---

## Self-Review (completed)

**Spec coverage (Phase-1A slice of the spec):**
- §3.1 provenance pipeline+component → Tasks 1, 2, 10 (1B wires loud reasons into the freezing hero & Daily Outlook). ✓
- §4 IA: 3-tab shell + header chips → Tasks 5, 6, 7, 8 (Terrain tab intentionally deferred to Phase 3; 1A ships Forecast + Safety). ✓
- §5 flow: always-targeted, default tomorrow, Today selectable, pin=bookmark, inline notes, remove `/pin` form/branching → Tasks 3, 4, 7, 8. ✓
- §6.2 3D units fix → Task 9. ✓
- §3.3 units honored / §3.4 mobile parity / §11 gates → enforced per task (Global Constraints).
- **Deferred to Phase 1B (documented, not gaps):** Daily Outlook tile-tint/wind (§6.1), freezing chart redesign + dawn toggle (§6.2), convergence call chart (§6.3), Model Lab cleanup (§6.5). 1A leaves those components rendering unchanged inside the new tabs.

**Placeholder scan:** No "TBD/TODO". Large component bodies (MountainTabs keyboard handling, DateSelector CSS, Sources copy, MountainHeader/MountainDetail rewrites) reference a concrete existing pattern (`Segmented.tsx`) or the approved mockup and specify exact behavior/classes — no logic left unspecified.

**Type consistency:** `ModelId` (Task 1) vs the existing `ModelKey` in `forecast-select.ts` — Task 1 deliberately introduces `ModelId` as the provenance-local alias (same `"hrrr"|"gfs"|"ecmwf"` union); callers pass the existing key value, so they are assignment-compatible. `StripDay` (Task 3) is consumed unchanged by `DateSelector` (Task 4) and `MountainHeader` (Task 8). `TabDef` (Task 6) consumed by `MountainDetail` (Task 7). `ProvenanceData` (Task 2) is the presentational shape; `weatherProvenance` (Task 1) returns the `WeatherProvenance` union that 1B maps into `ProvenanceData`. Consistent.
