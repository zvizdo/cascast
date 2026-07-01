# P5 — Signature Views & Model Lab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task is test-first (write test → run → FAIL → implement → run → PASS → commit).

**Goal:** Recreate the Cirque signature views — the **static** Freezing-Level cross-section (range band + DayStrip + labeled band cards, **no scrubber**), the Confidence strip, the elevation Base/Mid/Summit selector that drives the calm layer, and the monospace **Model Lab** drill-down (multi-model charts with disagreement flags, forecast-evolution chart distinguishing live vs backfill points, MOS-style hourly grid) — all wired to the real types in contract §9, fed by `GET /api/projects/[id]/weather` and `GET /api/projects/[id]/snapshots`, and units-aware via `lib/units.ts`.

**Architecture:** Components live under `components/project/**` (calm-layer signature views) and `components/modellab/**` (drill-down). They are pure presentation: data is fetched via SWR in the page (`app/projects/[id]/page.tsx`, `app/projects/[id]/models/page.tsx`) from the P3 Route Handlers and passed down as props. Charts reuse P4's hand-built SVG primitives (`components/charts/LineChart.tsx`, `BarChart.tsx`, `AreaSpark.tsx` — **no Recharts**). Every measured quantity renders through `lib/units.ts` helpers (`convTemp`/`convWind`/`convDist`/`fmtTemp`/`fmtWind`/`fmtDist`); chart axes/ticks convert too. The elevation band is shared state across the calm layer via a small Zustand store (`lib/band.ts`). The freezing-level hero is **static** — it consumes the target-day hourly rows of the chosen model and encodes the day's range as a band, never a time control.

**Tech Stack:** Next.js 16.2.x (App Router, React 19.2), TypeScript, Tailwind, hand-built SVG charts, SWR, Zustand, Vitest + Testing Library, Playwright (desktop 1280×800 + mobile iPhone 12). Themes Glacier/Slate via `[data-theme]`; fonts Newsreader/Hanken Grotesk/IBM Plex Mono (loaded in P4). **Visual source of truth: the Cirque prototype** (`prototype-ui/prototype-design-review/project/`), recreated pixel-perfect.

**Next.js 16 conventions** (apply throughout): page/handler `params` is a `Promise` — `async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; }`. GET handlers uncached by default (P3 sets `Cache-Control`). Client components that fetch/use state declare `"use client"`.

**References:** spec `docs/superpowers/specs/2026-06-14-mountain-weather-poc-design.md` (§5 backfill/evolution, §7 P5); contract `docs/superpowers/specs/2026-06-14-interface-contract.md` (§0 Cirque overrides — STATIC freezing level/Model Lab structure; §7 API; §9 types; §11 components; §12a units; §12 tests). Prototype: `DESIGN.md` §10 (Freezing Level), §12 (Charts), §13 (Model Lab); `app/hero.jsx` (FreezingLevelHero, DayStrip); `app/modellab.jsx`; `app/detail.jsx` (ConfidenceStrip, target-model selection); `app/charts.jsx`; `app/data.js` (snapshot/evolution + bias/spread + tone). Section numbers below cite the **contract** unless prefixed `DESIGN.md` or `data.js`.

**Prerequisites:**
- **P3 complete** — Route Handlers `GET /api/projects/[id]/weather` (→ `CombinedForecastBlob`, §7/§9) and `GET /api/projects/[id]/snapshots` (→ `WeatherSnapshot[]`, last 10 fetchedAt desc, §7/§9) live and tested; emulator/seed harness loads a sample project + sample blob + sample snapshots.
- **P4 complete (ASSUMED — currently ABSENT; see Gaps).** P5 depends on P4 having delivered: (a) chart primitives `components/charts/{LineChart,BarChart,AreaSpark}.tsx` (ported from `app/charts.jsx`); (b) shared components `components/shared/{Segmented,DrillLink,PanelHead,SectionTitle,Stat,PrecipChip}.tsx` (§11); (c) `lib/units.ts` (`useUnits` store + `convTemp/convWind/convDist/fmtTemp/fmtWind/fmtDist`, §12a); (d) `components/icons/{icons,WeatherIcon}.tsx`; (e) Cirque tokens/themes/fonts in `app/globals.css` incl. the cross-section gradient tokens (`--snow-hi/-lo`, `--rock-hi/-lo`, `--rock-line`, `--ridge-stroke`, `--sky-hi/-lo`, `--below-fl`) and the `.hero`, `.band-card`, `.conf-strip`, `.lab`, `.grid-table`, `.cell-cold/-hot`, `.disagree`, `.modeltag` styles (port from `app/styles.css`); (f) the Project Detail page `app/projects/[id]/page.tsx` rendered the IA in order (Verdict → Daily Outlook → **FreezingLevelHero placeholder** → **ConfidenceStrip placeholder** → Avalanche → Snowpack → Satellite + Notes) and the **Model lab** link in the sub-header; (g) the units toggle in the Header. **If P4 is absent at execution time, its deliverables above are blocking and must be produced first** — this plan does not redefine them; it cites contract §11/§12a names and replaces the FreezingLevelHero/ConfidenceStrip placeholders P4 left.

**Exit criteria:**
- `npm run build`, `npm test`, `npm run test:e2e` pass.
- `npm run test:coverage` meets thresholds: lines ≥90, functions ≥90, branches ≥85 (contract §12) including all new `components/project/**` and `components/modellab/**`.
- The detail page renders the static Freezing-Level hero (range band, DayStrip, three band label cards, `FREEZING LEVEL · {dist}` tag) and the Confidence strip in IA order, replacing the P4 placeholders.
- `/projects/[id]/models` renders: monospace sub-header with toggleable HRRR/GFS/ECMWF chips; 4 multi-series LineCharts (temp, wind, freezing level, precip) with model color encoding + target-band highlight + inline disagreement flags; ForecastEvolutionChart distinguishing live vs backfill points with a variable selector and a <3-snapshot empty state; MOS-style HourlyGrid (target row shaded, cold/hot cells, model selector).
- All measured values + chart axes honor the units toggle (°F/°C, mph/km·h, ft/m).
- Playwright captures hero + Model Lab screenshots (desktop + mobile); `ux-reviewer` invoked and findings addressed.

---

## File structure created/modified in P5

| Path | Responsibility | New/Mod |
|---|---|---|
| `lib/band.ts` | Zustand store for the shared Base/Mid/Summit band selection | New |
| `lib/forecast-select.ts` | Pure helpers: target-day rows, model precedence, band temp pick, day spread, snapshot point extraction | New |
| `components/project/FreezingLevelHero.tsx` | Static SVG cross-section (snow/rock clip, range band, dashed FL line + tag, band guides, floating band cards, side rail wrapper) | New |
| `components/project/DayStrip.tsx` | Mini freezing-level-through-the-day line + plain-English takeaway | New |
| `components/project/ConfidenceStrip.tsx` | Model-agreement summary + per-model target-day value + spread + "Compare all models →" DrillLink | New |
| `components/project/ElevationBandSelector.tsx` | Base/Mid/Summit Segmented (default Summit) bound to `lib/band.ts` | New |
| `components/modellab/ModelLab.tsx` | Lab shell: monospace sub-header, model chips, layout (DESIGN.md §13) | New |
| `components/modellab/ModelCharts.tsx` | 4 multi-series LineCharts + disagreement flags | New |
| `components/modellab/ForecastEvolutionChart.tsx` | Evolution multi-line over snapshots, live/backfill distinction, variable selector, empty state | New |
| `components/modellab/HourlyGrid.tsx` | MOS-style monospace table, target row shaded, cold/hot cells, model selector | New |
| `app/projects/[id]/models/page.tsx` | Model Lab page: async params, SWR weather + snapshots, mounts `ModelLab` | New |
| `app/projects/[id]/page.tsx` | Replace FreezingLevelHero + ConfidenceStrip placeholders with the real components + ElevationBandSelector wiring | Mod |
| `lib/__tests__/**`, `components/**/__tests__/**` | Vitest specs | New |
| `tests/e2e/freezing-hero.spec.ts`, `tests/e2e/model-lab.spec.ts` | Playwright specs + screenshots | New |

**Mapping the prototype's mock shape → real types.** The prototype's `data.js` rows carry `{ t, fl, wind, gust, precip, pop, snowfall, code, bands:{base,mid,summit:{temp,feels}} }`. The real data is `CombinedForecastBlob` (§9): per model a `ModelSeries` with parallel arrays (`time[]`, `temperature_2m[]`, `wind_speed_10m[]`, `wind_gusts_10m[]`, `precipitation[]`, `precipitation_probability[]`, `snowfall[]`, `freezing_level_height[]` (**already feet**, §9), `weather_code[]`, and band temps `temp_base_f[]`/`temp_mid_f[]`/`temp_summit_f[]`). `lib/forecast-select.ts` adapts arrays → row-like objects so the SVG construction ports cleanly. `apparent_temperature` ("feels") is in `ModelSeries` (§8) but **omitted from the TS `ModelSeries` in §9** — see Gaps; the hero band cards use `temperature_2m`-derived band temps and treat feels-like as optional.

---

## Task 1: `lib/band.ts` — shared elevation-band store (TDD)

**Files:** Create `lib/band.ts`, `lib/__tests__/band.test.ts`.

**Data consumed:** none (UI state only). **Type:** `type Band = 'base' | 'mid' | 'summit'`.

**Acceptance criteria:**
- Zustand store `useBand` with `{ band: Band; setBand(b: Band): void }`, **default `'summit'`** (contract §0 / spec §2 #13 / DESIGN.md §11).
- Not persisted (band is per-session, unlike units); a fresh store starts at `'summit'`.

- [ ] **Step 1: Write the failing test**

```ts
// lib/__tests__/band.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { useBand } from "@/lib/band";

describe("useBand store", () => {
  beforeEach(() => useBand.setState({ band: "summit" }));
  it("defaults to summit", () => {
    expect(useBand.getState().band).toBe("summit");
  });
  it("updates the band", () => {
    useBand.getState().setBand("base");
    expect(useBand.getState().band).toBe("base");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module '@/lib/band'`).
Run: `npm test -- lib/__tests__/band.test.ts`

- [ ] **Step 3: Implement `lib/band.ts`**

```ts
import { create } from "zustand";
export type Band = "base" | "mid" | "summit";
interface BandState { band: Band; setBand: (b: Band) => void }
export const useBand = create<BandState>((set) => ({
  band: "summit",
  setBand: (band) => set({ band }),
}));
```

- [ ] **Step 4: Run — expect PASS** (2 passed).
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): shared elevation-band store (default Summit)"`

---

## Task 2: `lib/forecast-select.ts` — pure forecast selectors (TDD)

**Files:** Create `lib/forecast-select.ts`, `lib/__tests__/forecast-select.test.ts`.

These pure functions adapt `CombinedForecastBlob` / `WeatherSnapshot[]` into the row/point shapes the SVG components need, and centralize the prototype's selection logic (model precedence from `detail.jsx` `chooseTargetModel`, day spread from `modellab.jsx` `spread`, evolution point extraction from `modellab.jsx` `EvolutionChart`).

**Type signatures (exact):**

```ts
import type { CombinedForecastBlob, ModelSeries, WeatherSnapshot } from "@/lib/types";
import type { Band } from "@/lib/band";

export type ModelKey = "hrrr" | "gfs" | "ecmwf";

/** A single hour adapted from ModelSeries parallel arrays at index i. fl is feet (§9). */
export interface HourRow {
  t: string;                  // ISO local stamp from ModelSeries.time[i]
  hour: number;               // local hour 0-23 from t
  date: string;               // t.slice(0,10)
  fl: number | null;          // freezing_level_height[i] (feet)
  tempF: number;              // temperature_2m[i] (°F, canonical)
  windMph: number;            // wind_speed_10m[i] (mph, canonical)
  gustMph: number;            // wind_gusts_10m[i]
  precipIn: number;           // precipitation[i]
  pop: number;                // precipitation_probability[i]
  snowIn: number;             // snowfall[i]
  code: number | null;        // weather_code[i]
  bandTempF: Record<Band, number | null>; // {base: temp_base_f[i], mid: temp_mid_f[i], summit: temp_summit_f[i]}
}

/** Adapt one model's ModelSeries into HourRow[] (nulls dropped only where time is absent). */
export function rowsFor(series: ModelSeries | null): HourRow[];

/** Rows for one model filtered to a target ISO date (YYYY-MM-DD). */
export function targetRows(series: ModelSeries | null, targetDate: string): HourRow[];

/** Model precedence for the calm-layer hero/strip: HRRR if it has rows for targetDate, else GFS, else ECMWF. */
export function chooseTargetModel(blob: CombinedForecastBlob, targetDate: string): ModelKey;

/** Human label, e.g. "HRRR · 3 km", "GFS · 25 km", "ECMWF · 9 km". */
export function modelLabel(key: ModelKey): string;

/** Noon row for a target day (hour===12) else the middle row; null if no rows. */
export function noonRow(rows: HourRow[]): HourRow | null;

/** Per-model target-day summit-high in °F (max temp_summit_f over the day); null if model unavailable. */
export function targetDayHigh(blob: CombinedForecastBlob, targetDate: string, key: ModelKey): number | null;

/** Max−min across available models of a target-day metric. extractor maps blob+key→number|null. */
export function modelSpread(blob: CombinedForecastBlob, targetDate: string,
  extractor: (b: CombinedForecastBlob, k: ModelKey, d: string) => number | null): number;

/** Evolution points for a model+variable from snapshots (oldest→newest); carries source for live/backfill split. */
export interface EvoPoint { x: number; y: number; source: "live" | "backfill" }
export type EvoVar = "high" | "wind" | "freezing" | "precip";
export function evoPoints(snaps: WeatherSnapshot[], key: ModelKey, variable: EvoVar): EvoPoint[];
```

**Implementation notes (port from prototype):**
- `chooseTargetModel`: `targetRows(blob.hrrr, d).length ? "hrrr" : targetRows(blob.gfs,d).length ? "gfs" : "ecmwf"` (mirrors `detail.jsx` lines 8–11, generalized to 3 models).
- `targetDayHigh`: from the model's target rows, `Math.max(...bandTempF.summit non-null)`; if no rows or `series.available===false` → `null`.
- `modelSpread`: collect `extractor` over the three keys, drop nulls, `>1 ? max−min : 0` (mirrors `modellab.jsx` `spread`, lines 106–109).
- `evoPoints`: map `WeatherSnapshot[]` (oldest→newest — note §7 returns **fetchedAt desc**, so reverse before plotting) to `{x:i, y, source}` where `y` reads the model's `ModelDaySummary` field per `variable` mapping `{high:summitHighF, wind:summitMaxWindMph, freezing:freezingLevelFtNoon, precip:summitPrecipIn}` and drops points where `models[key].available===false`. `source` = `snapshot.source` (mirrors `modellab.jsx` `EvolutionChart`, lines 125–137, plus the §9 `source` field).

**Acceptance criteria:** all functions pure (no fetch/DOM); freezing level treated as feet throughout (§9); empty/short series handled (no NaN; `modelSpread` returns 0 with <2 models).

- [ ] **Step 1: Write the failing test** (use a small inline `CombinedForecastBlob` fixture and a 4-snapshot `WeatherSnapshot[]` mixing `source:"live"`/`"backfill"`).

```ts
// lib/__tests__/forecast-select.test.ts
import { describe, it, expect } from "vitest";
import {
  rowsFor, targetRows, chooseTargetModel, modelLabel, noonRow,
  targetDayHigh, modelSpread, evoPoints,
} from "@/lib/forecast-select";
import type { CombinedForecastBlob, ModelSeries, WeatherSnapshot } from "@/lib/types";

function series(over: Partial<ModelSeries> = {}): ModelSeries {
  // 3 hours on 2026-02-14 at 00/12/13 local
  return {
    available: true,
    time: ["2026-02-14T00:00", "2026-02-14T12:00", "2026-02-14T13:00"],
    temperature_2m: [10, 18, 17], wind_speed_10m: [20, 24, 22], wind_gusts_10m: [30, 36, 34],
    precipitation: [0, 0.02, 0], precipitation_probability: [10, 40, 30], snowfall: [0, 0.2, 0],
    freezing_level_height: [5000, 5800, 5600], cloud_cover: [10, 20, 30], weather_code: [1, 71, 2],
    temp_base_f: [28, 33, 32], temp_mid_f: [18, 22, 21], temp_summit_f: [8, 12, 11],
    ...over,
  };
}
const blob: CombinedForecastBlob = {
  mountainId: "mt-rainier", timezone: "America/Los_Angeles", fetchedAt: "2026-02-12T14:00:00Z",
  hrrr: null,                                   // HRRR absent for target → precedence falls through
  gfs: series(),
  ecmwf: series({ temp_summit_f: [20, 28, 27] }), // warmer → drives spread
};

describe("rowsFor / targetRows / noonRow", () => {
  it("adapts ModelSeries arrays into HourRow[]", () => {
    const rows = rowsFor(blob.gfs);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatchObject({ hour: 12, date: "2026-02-14", fl: 5800, tempF: 18 });
    expect(rows[1].bandTempF).toEqual({ base: 33, mid: 22, summit: 12 });
  });
  it("returns null rows for an absent model", () => expect(rowsFor(null)).toEqual([]));
  it("filters to the target date and finds noon", () => {
    const rows = targetRows(blob.gfs, "2026-02-14");
    expect(rows).toHaveLength(3);
    expect(noonRow(rows)?.hour).toBe(12);
  });
});

describe("model selection + spread", () => {
  it("falls back from missing HRRR to GFS", () =>
    expect(chooseTargetModel(blob, "2026-02-14")).toBe("gfs"));
  it("labels models with resolution", () => {
    expect(modelLabel("hrrr")).toMatch(/HRRR/); expect(modelLabel("gfs")).toMatch(/25 km/);
  });
  it("computes target-day summit high per model", () => {
    expect(targetDayHigh(blob, "2026-02-14", "gfs")).toBe(12);
    expect(targetDayHigh(blob, "2026-02-14", "ecmwf")).toBe(28);
    expect(targetDayHigh(blob, "2026-02-14", "hrrr")).toBeNull();
  });
  it("computes spread across available models (ecmwf 28 − gfs 12 = 16)", () => {
    const s = modelSpread(blob, "2026-02-14", (b, k, d) => targetDayHigh(b, k, d));
    expect(Math.round(s)).toBe(16);
  });
});

describe("evoPoints", () => {
  const snaps: WeatherSnapshot[] = [
    // §7 returns fetchedAt DESC; evoPoints must reverse to oldest→newest
    { id: "s4", fetchedAt: "2026-02-12T12:00:00Z", targetDate: "2026-02-14", source: "live",
      models: { hrrr: m(12), gfs: m(13), ecmwf: m(14) } },
    { id: "s3", fetchedAt: "2026-02-11T12:00:00Z", targetDate: "2026-02-14", source: "live",
      models: { hrrr: na(), gfs: m(16), ecmwf: m(17) } },
    { id: "s2", fetchedAt: "2026-02-06T12:00:00Z", targetDate: "2026-02-14", source: "backfill",
      models: { hrrr: na(), gfs: m(20), ecmwf: m(22) } },
    { id: "s1", fetchedAt: "2026-02-05T12:00:00Z", targetDate: "2026-02-14", source: "backfill",
      models: { hrrr: na(), gfs: m(24), ecmwf: m(26) } },
  ];
  function m(high: number) {
    return { available: true, summitHighF: high, summitLowF: high - 8, summitMaxWindMph: 30,
      summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 };
  }
  function na() {
    return { available: false, summitHighF: null, summitLowF: null, summitMaxWindMph: null,
      summitPrecipIn: null, freezingLevelFtNoon: null, snowfallIn: null };
  }
  it("returns oldest→newest points carrying source", () => {
    const pts = evoPoints(snaps, "gfs", "high");
    expect(pts.map((p) => p.y)).toEqual([24, 20, 16, 13]);
    expect(pts[0].source).toBe("backfill");
    expect(pts[3].source).toBe("live");
  });
  it("drops unavailable model points (HRRR present only in newest)", () => {
    const pts = evoPoints(snaps, "hrrr", "high");
    expect(pts).toHaveLength(1);
    expect(pts[0].y).toBe(12);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (module missing).
- [ ] **Step 3: Implement `lib/forecast-select.ts`** per the signatures + notes above. Derive `hour` via `new Date(t).getHours()` against the local stamp (timestamps are local per data.js §19 / Open-Meteo `timezone` request); `date = t.slice(0,10)`.
- [ ] **Step 4: Run — expect PASS** (all cases). Cover the `<2 models` spread branch and the all-null evo branch for branch coverage.
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): pure forecast selectors (target rows, precedence, spread, evolution points)"`

---

## Task 3: `components/project/DayStrip.tsx` (TDD)

**Files:** Create `components/project/DayStrip.tsx`, `components/project/__tests__/DayStrip.test.tsx`.

**Props interface:**

```ts
import type { HourRow } from "@/lib/forecast-select";
export interface DayStripProps {
  rows: HourRow[];                  // target-day rows (chosen model)
  valleyFt: number;                 // baseline elevation for the Y scale (e.g. 2200)
  topFt: number;                    // top of Y scale (summit + headroom)
  summitFt: number;
  bandsFt: { base: number; mid: number; summit: number };
  summitOffsetText: string;         // takeaway clause, e.g. "8,596 ft below the summit"
}
```

**Data consumed:** the chosen model's target-day `HourRow[]` (freezing level series). **Render the takeaway sentence** as a sibling (the hero composes it) OR include a `summitOffsetText` slot — keep DayStrip focused on the SVG line + hour ticks; the plain-English takeaway lives in the hero's `.hero-note` (Task 4) which calls a shared helper. (Decision: DayStrip = SVG only; takeaway computed in the hero. Tested separately.)

**Acceptance criteria (port `app/hero.jsx` `DayStrip`, lines 152–173):**
- SVG `viewBox 0 0 300 116`; Y maps `valleyFt..topFt` → bottom..top; X spreads rows across width.
- Three faint reference lines at base/mid/summit (`stroke var(--line)`).
- Freezing-level line: `var(--accent)` stroke width 2, with a translucent area fill (opacity 0.10).
- Hour ticks at 0/6/12/18 labeled `12a/6a/12p/6p` in `var(--mono)`, `var(--muted)`.
- **All elevation values plotted in feet (canonical)** — the DayStrip plots positions, not displayed numbers, so no unit conversion is needed inside the SVG; the readout text in the hero (Task 4) converts. (Note: the strip is positional; the only displayed numbers are hour labels.)
- Handles a short series (`rows.length===1`) without dividing by zero.

- [ ] **Step 1: Write the failing test**

```tsx
// components/project/__tests__/DayStrip.test.tsx
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { DayStrip } from "@/components/project/DayStrip";
import type { HourRow } from "@/lib/forecast-select";

const rows: HourRow[] = [0, 6, 12, 18].map((h) => ({
  t: `2026-02-14T${String(h).padStart(2, "0")}:00`, hour: h, date: "2026-02-14",
  fl: 5000 + h * 50, tempF: 20, windMph: 20, gustMph: 30, precipIn: 0, pop: 10, snowIn: 0,
  code: 1, bandTempF: { base: 30, mid: 20, summit: 10 },
}));

describe("DayStrip", () => {
  const props = { rows, valleyFt: 2200, topFt: 16000, summitFt: 14410,
    bandsFt: { base: 5400, mid: 10000, summit: 14410 }, summitOffsetText: "x" };
  it("renders an svg with the freezing-level path and hour ticks", () => {
    const { container } = render(<DayStrip {...props} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
    // 3 band lines + at least the FL line + area
    expect(container.querySelectorAll("path").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll("text").length).toBe(4); // 12a 6a 12p 6p
  });
  it("does not throw on a single-row series", () => {
    expect(() => render(<DayStrip {...props} rows={[rows[2]]} />)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `DayStrip.tsx`** (`"use client"` not required — pure SVG; mark client only if it reads a store, which it does not). Port the SVG math from `hero.jsx` lines 152–173. Guard `X(i)` denominator when `rows.length===1`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): DayStrip freezing-level mini line"`

---

## Task 4: `components/project/FreezingLevelHero.tsx` (TDD)

**Files:** Create `components/project/FreezingLevelHero.tsx`, `components/project/__tests__/FreezingLevelHero.test.tsx`.

**Props interface:**

```ts
import type { Mountain } from "@/lib/types";
import type { HourRow, ModelKey } from "@/lib/forecast-select";
export interface FreezingLevelHeroProps {
  mountain: Pick<Mountain, "name" | "elevations">;  // elevations in FEET (§3)
  dayRows: HourRow[];                                // target-day rows of the chosen model
  modelLabel: string;                               // e.g. "HRRR · 3 km"
  bandNames?: { base: string; mid: string; summit: string }; // optional display names; default Base/Mid/Summit
}
```

**Data consumed:** `GET /api/projects/[id]/weather` → `CombinedForecastBlob`; the page picks the model via `chooseTargetModel`, computes `dayRows = targetRows(blob[key], targetDate)`, and passes `modelLabel(key)`. Freezing level + band temps come from `dayRows`. **All displayed elevation/height values via `convDist`/`fmtDist`; band temps via `fmtTemp`** (§12a). The SVG geometry uses canonical feet for positioning; only the **labels** convert.

**Static — NO scrubber** (contract §0, DESIGN.md §10): the day's min–max freezing range is encoded as a translucent band; the DayStrip provides the temporal read; there is no time control.

**Construction (port `app/hero.jsx` FreezingLevelHero, lines 8–149) — structural/SVG notes:**
- Outer `.hero` grid (figure | 340px side rail; collapses to one column ≤900px per `styles.css` line 414).
- `.hero-figure` holds the SVG (`viewBox 0 0 860 440`). Y scale: `valley=2200`, `top=summit+1800`, `Y(e)=H-40-((e-valley)/(top-valley))*(H-80)`.
- `noon = noonRow(dayRows)`; `flNoon=noon.fl`; `flMin=min(rows.fl)`, `flMax=max(rows.fl)` (guard nulls — filter non-null FL).
- Stylized ridge: the fixed control-point list from `hero.jsx` lines 20–24 with `[0.64]` reaching `mountain.elevations.summit`; build a smooth bezier `ridgePath`; `fillPath = ridgePath + "L W H L 0 H Z"`.
- `<defs>`: `linearGradient#snowG` (`--snow-hi`→`--snow-lo`), `#rockG` (`--rock-hi`→`--rock-lo`), `#skyG` (`--sky-hi`→`--sky-lo`), `clipPath#mtnClip` = `fillPath`. **Give the gradient/clip ids a unique suffix** (e.g. `useId()`) so multiple instances don't collide.
- Sky split at FL: sky rect above `Y(flNoon)` (`#skyG` opacity 0.7), `--below-fl` rect below (opacity 0.5).
- Mountain `clipPath="url(#mtnClip)"`: snow rect above `Y(flNoon)` (`#snowG`), rock rect below (`#rockG`), ridgeline texture strokes (`--rock-line`).
- Ridge outline path (`--ridge-stroke`, width 1.75).
- **Freezing-level range band**: `rect` from `Y(flMax)` to `Y(flMin)`, `fill var(--accent)` opacity 0.10.
- **Dashed FL line**: `line` at `Y(flNoon)`, `var(--accent)`, width 2, `strokeDasharray "2 5"`.
- **Tag**: `rect` (rounded, `--accent`) + `text` `FREEZING LEVEL · {fmtDist(flNoon)}` (mono 12, white). The displayed number/units come from `fmtDist` (ft↔m).
- Elevation axis ticks at 4000/8000/12000 ft → labels via `fmtDist` (right-aligned, mono, muted).
- Three band guides (summit/mid/base) at their `Y(e)`: dashed `--ink` line + a `circle` marker (`--surface` fill, `--ink` stroke).
- **Floating HTML band cards** (`.band-card`, positioned `top: calc(${(Y(e)/H)*100}% - 26px)`): band name, `fmtDist(e)`, band temp `fmtTemp(noon.bandTempF[band])` (+ optional `feels` if present), and a precip-type row computed by `precipFor(e)` = `mixed` if `|e-flNoon|<600`, else `e>flNoon?"snow":"rain"` → PrecipChip-style label ("All snow" / "Mixed / near freezing" / "Rain / melt") with the corresponding icon.
- **Side rail** (`.hero-side`): `.hero-readout` (kicker "Target · noon", `.hero-fl` big serif `fmtDist(flNoon)`, sub "Freezing level — {modelLabel}"), `.hero-daystrip` (label "Freezing level through the day" + `{fmtDist(flMin)}–{fmtDist(flMax)}`, then `<DayStrip>`), `.hero-note` (eye icon + takeaway "Line sits **{takeaway}** — precip falls as snow above it" where `takeaway` = `flNoon<base?"below the trailhead":flNoon>summit?"above the summit":"{fmtDist(summit-flNoon)} below the summit"`).

**Acceptance criteria:**
- Renders the SVG cross-section with snow/rock clip split at noon FL, the range band, the dashed FL line, and the `FREEZING LEVEL · …` tag (matches DESIGN.md §10 / `hero.jsx`).
- Three band cards present with name + elevation + temp + precip-type.
- Side rail shows the noon readout, the DayStrip, and the takeaway sentence.
- Toggling units re-renders all labels (ft↔m, °F↔°C) — verified by re-render with a different `useUnits` state.
- Uses theme gradient tokens only (no literals) so Glacier/Slate both work.
- No scrubber / time-input control rendered.

- [ ] **Step 1: Write the failing test**

```tsx
// components/project/__tests__/FreezingLevelHero.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { FreezingLevelHero } from "@/components/project/FreezingLevelHero";
import { useUnits } from "@/lib/units";
import type { HourRow } from "@/lib/forecast-select";

const mountain = { name: "Mount Rainier", elevations: { base: 5400, mid: 10000, summit: 14410 } };
const dayRows: HourRow[] = [0, 6, 12, 18].map((h) => ({
  t: `2026-02-14T${String(h).padStart(2, "0")}:00`, hour: h, date: "2026-02-14",
  fl: h === 12 ? 5800 : 5000 + h * 40, tempF: 20, windMph: 20, gustMph: 30, precipIn: 0,
  pop: 10, snowIn: 0, code: 1, bandTempF: { base: 33, mid: 22, summit: 12 },
}));
const props = { mountain, dayRows, modelLabel: "HRRR · 3 km" };

describe("FreezingLevelHero", () => {
  beforeEach(() => useUnits.setState({ temp: "F", wind: "mph", dist: "ft" }));

  it("renders the freezing-level tag with imperial units at noon FL", () => {
    render(<FreezingLevelHero {...props} />);
    expect(screen.getByText(/FREEZING LEVEL/i)).toHaveTextContent(/5,800\s*ft/);
  });
  it("renders three band cards with names and temps", () => {
    render(<FreezingLevelHero {...props} />);
    expect(screen.getByText(/Summit/i)).toBeInTheDocument();
    expect(screen.getByText(/12°/)).toBeInTheDocument(); // summit band temp °F
  });
  it("renders the side-rail takeaway sentence", () => {
    render(<FreezingLevelHero {...props} />);
    expect(screen.getByText(/below the summit/i)).toBeInTheDocument();
  });
  it("does NOT render any time scrubber/range input", () => {
    const { container } = render(<FreezingLevelHero {...props} />);
    expect(container.querySelector('input[type="range"]')).toBeNull();
  });
  it("honors the units toggle (ft → m, °F → °C)", () => {
    useUnits.setState({ temp: "C", wind: "mph", dist: "m" });
    render(<FreezingLevelHero {...props} />);
    expect(screen.getByText(/FREEZING LEVEL/i)).toHaveTextContent(/1,7\d{2}\s*m/); // 5800 ft ≈ 1768 m
    expect(screen.getByText(/-11°/)).toBeInTheDocument();                          // 12°F ≈ -11°C
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement `FreezingLevelHero.tsx`** (`"use client"` — uses `useUnits`, `useId`). Compose `<DayStrip>`. Filter null FL before min/max. Use `useId()` for gradient/clip ids.
- [ ] **Step 4: Run — expect PASS** (5 cases).
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): static FreezingLevelHero cross-section (range band, band cards, side rail)"`

---

## Task 5: `components/project/ElevationBandSelector.tsx` (TDD)

**Files:** Create `components/project/ElevationBandSelector.tsx`, `components/project/__tests__/ElevationBandSelector.test.tsx`.

**Props interface:** `export interface ElevationBandSelectorProps { className?: string }` — it is self-contained, reading/writing `useBand` (Task 1). Renders P4's `Segmented` (`role="tablist"`, sliding active state, §11) with options Base/Mid/Summit.

**Data consumed:** none (drives `lib/band.ts`). The calm-layer panels (Daily Outlook from P4, and any band-dependent reads) subscribe to `useBand`.

**Acceptance criteria:**
- Three tabs Base/Mid/Summit; **Summit active by default** (from the store default).
- Clicking a tab updates `useBand` (other subscribers re-render).
- `role="tablist"`/`tab` semantics (a11y, DESIGN.md §16) — inherited from `Segmented`.

- [ ] **Step 1: Write the failing test**

```tsx
// components/project/__tests__/ElevationBandSelector.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ElevationBandSelector } from "@/components/project/ElevationBandSelector";
import { useBand } from "@/lib/band";

describe("ElevationBandSelector", () => {
  beforeEach(() => useBand.setState({ band: "summit" }));
  it("defaults to Summit selected", () => {
    render(<ElevationBandSelector />);
    expect(screen.getByRole("tab", { name: /summit/i })).toHaveAttribute("aria-selected", "true");
  });
  it("updates the shared store on click", async () => {
    render(<ElevationBandSelector />);
    await userEvent.click(screen.getByRole("tab", { name: /base/i }));
    expect(useBand.getState().band).toBe("base");
  });
});
```

> Requires `@testing-library/user-event` (add to devDeps if P4 did not). If `Segmented` does not emit `aria-selected`, assert active via its sliding-active class instead (cite P4's `Segmented` test for the exact attribute).

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** (`"use client"`): `const { band, setBand } = useBand(); return <Segmented value={band} onChange={setBand} options={[{value:"base",label:"Base"},{value:"mid",label:"Mid"},{value:"summit",label:"Summit"}]} />`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): ElevationBandSelector bound to shared band store"`

---

## Task 6: `components/project/ConfidenceStrip.tsx` (TDD)

**Files:** Create `components/project/ConfidenceStrip.tsx`, `components/project/__tests__/ConfidenceStrip.test.tsx`.

**Props interface:**

```ts
import type { CombinedForecastBlob } from "@/lib/types";
export interface ConfidenceStripProps {
  blob: CombinedForecastBlob;
  targetDate: string;       // project.targetDateStart
  projectId: string;        // for the Model Lab DrillLink href
}
```

**Data consumed:** `GET /api/projects/[id]/weather` (per-model target-day highs). The current call's model values come from the blob; spec note says "+ /snapshots for current call" — **the current target-day highs are derived from the live weather blob, not snapshots** (snapshots are historical evolution). See Gaps re: the "/snapshots for current call" phrasing.

**Acceptance criteria (port `detail.jsx` ConfidenceStrip, lines 297–326):**
- Compute `highs = [hrrr,gfs,ecmwf].map(k => targetDayHigh(blob,targetDate,k)).filter(non-null)`; `spread = max−min`.
- Agreement bucket: `spread<=6 → "High"` (good), `<=14 → "Moderate"` (caution), else `"Low"` (alert); tone dot colored accordingly.
- Lead text: kicker "Forecast confidence", serif "{conf} agreement", sub "Models sit within {fmtTemp-delta}° on the target-day summit high. {Low?'Treat the forecast as a range.':'Solid enough to plan around.'}" — the **spread number converts with the temp axis** (a delta in °F → °C uses the scale factor, no offset; e.g. 6°F spread ≈ 3.3°C). Use a `convTempDelta` helper or `convTemp(x)−convTemp(0)`.
- Per-model column: `modeltag` (HRRR=`--accent`, GFS=`--caution`, ECMWF=`--good` — DESIGN.md §12) + value `fmtTemp(targetDayHigh)` or "n/a" when null.
- A "Compare all models →" `DrillLink` to `/projects/${projectId}/models` (DESIGN.md §9, §11).
- Renders the spread phrase "6° spread" style as required by P5 scope (include a `{spread}° spread` chip or in the sub-line).

- [ ] **Step 1: Write the failing test**

```tsx
// components/project/__tests__/ConfidenceStrip.test.tsx
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConfidenceStrip } from "@/components/project/ConfidenceStrip";
import { useUnits } from "@/lib/units";
import type { CombinedForecastBlob, ModelSeries } from "@/lib/types";

function s(summit: number[]): ModelSeries {
  return { available: true, time: ["2026-02-14T12:00"], temperature_2m: [summit[0]],
    wind_speed_10m: [20], wind_gusts_10m: [30], precipitation: [0], precipitation_probability: [10],
    snowfall: [0], freezing_level_height: [5800], cloud_cover: [10], weather_code: [1],
    temp_base_f: [33], temp_mid_f: [22], temp_summit_f: summit };
}
const blob: CombinedForecastBlob = { mountainId: "mt-rainier", timezone: "America/Los_Angeles",
  fetchedAt: "2026-02-12T14:00:00Z", hrrr: s([12]), gfs: s([15]), ecmwf: s([18]) };

describe("ConfidenceStrip", () => {
  beforeEach(() => useUnits.setState({ temp: "F", wind: "mph", dist: "ft" }));
  it("renders moderate agreement for a 6° spread", () => {
    render(<ConfidenceStrip blob={blob} targetDate="2026-02-14" projectId="p1" />);
    // spread 18-12 = 6 → High
    expect(screen.getByText(/High agreement/i)).toBeInTheDocument();
    expect(screen.getByText(/6°/)).toBeInTheDocument();
  });
  it("shows each model target-day high with model tags", () => {
    render(<ConfidenceStrip blob={blob} targetDate="2026-02-14" projectId="p1" />);
    ["HRRR", "GFS", "ECMWF"].forEach((m) => expect(screen.getByText(m)).toBeInTheDocument());
    expect(screen.getByText(/15°/)).toBeInTheDocument();
  });
  it("links to the Model Lab", () => {
    render(<ConfidenceStrip blob={blob} targetDate="2026-02-14" projectId="p1" />);
    expect(screen.getByRole("link", { name: /compare all models/i }))
      .toHaveAttribute("href", "/projects/p1/models");
  });
  it("renders n/a for an unavailable model", () => {
    render(<ConfidenceStrip blob={{ ...blob, hrrr: null }} targetDate="2026-02-14" projectId="p1" />);
    expect(screen.getByText(/n\/a/i)).toBeInTheDocument();
  });
});
```

> If P4's `DrillLink` renders a `<button>` with router push rather than an `<a>`, assert the navigation target via the click handler / mocked router instead of `href`. Confirm `DrillLink`'s contract from P4.

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** (`"use client"` — uses `useUnits`). Reuse `targetDayHigh`/`modelSpread` from Task 2.
- [ ] **Step 4: Run — expect PASS** (4 cases; include the null-model branch).
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): ConfidenceStrip model-agreement summary"`

---

## Task 7: Wire hero + ConfidenceStrip + band selector into the detail page (TDD)

**Files:** Modify `app/projects/[id]/page.tsx`; add `app/projects/[id]/__tests__/detail-signature.test.tsx` (or extend P4's detail test).

**Change:** Replace the P4 `FreezingLevelHero`/`ConfidenceStrip` **placeholders** with the real components, in the IA order (contract §0: ③ Freezing Level after Daily Outlook, ④ Confidence after Freezing Level). In the page (a server component that fetches, or a client wrapper using SWR per P4's pattern):
- Fetch `GET /api/projects/[id]/weather` → `blob` and the project (for `targetDateStart`, `mountain.elevations`/`name`).
- Compute `key = chooseTargetModel(blob, targetDate)`, `dayRows = targetRows(blob[key], targetDate)`, `label = modelLabel(key)`.
- Render a `PanelHead` ("Signature view" / "Freezing level cross-section") + `<FreezingLevelHero mountain={mountain} dayRows={dayRows} modelLabel={label} />` (DESIGN.md §10; `detail.jsx` lines 96–100).
- Render `<ConfidenceStrip blob={blob} targetDate={targetDate} projectId={id} />` (`detail.jsx` line 103).
- Ensure the Daily Outlook's band selector is `ElevationBandSelector` (shared store) — if P4 wired a local `useState` band, refactor to consume `useBand` so the selector and Daily Outlook stay in sync. (The hero itself shows all three bands; it is band-agnostic.)
- **Browse parity guard:** `/mountains/[slug]` must NOT render ConfidenceStrip (browse = current only; contract §0/§11). Confirm the browse page does not import it (it has no snapshots/evolution). The hero **is** allowed on browse (it is current-only). Leave a note: ConfidenceStrip is detail-only.

**Acceptance criteria:** the detail page renders the hero section and the confidence strip in order, fed by the weather endpoint; a smoke test asserts both sections appear.

- [ ] **Step 1: Write/extend the failing test** — mock `useSWR`/fetch to return a sample `blob` + project; assert `getByText(/freezing level cross-section/i)` and `getByText(/forecast confidence/i)` both render, and that the FreezingLevelHero `FREEZING LEVEL ·` tag is present.
- [ ] **Step 2: Run — expect FAIL** (placeholders still present).
- [ ] **Step 3: Implement** the wiring; remove the placeholders.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): wire hero + confidence strip into project detail (replace P4 placeholders)"`

---

## Task 8: `components/modellab/ModelCharts.tsx` (TDD)

**Files:** Create `components/modellab/ModelCharts.tsx`, `components/modellab/__tests__/ModelCharts.test.tsx`.

**Props interface:**

```ts
import type { CombinedForecastBlob } from "@/lib/types";
import type { ModelKey } from "@/lib/forecast-select";
export interface ModelChartsProps {
  blob: CombinedForecastBlob;
  targetDate: string;
  active: Record<ModelKey, boolean>;   // model chip toggles from ModelLab
}
```

**Data consumed:** `GET /api/projects/[id]/weather`. Builds 4 multi-series `LineChart`s (port `modellab.jsx` lines 64–77 + `ChartPanel`):
- **Summit temperature (°F→unit):** series per model from `temp_summit_f[]`; flag `Δ{spread}° at target` when target-day summit-temp spread > 15.
- **Summit wind (mph→unit):** from `wind_speed_10m[]`; `yMin=0`; flag `Δ{spread} {windUnit} at target` when wind spread > 20.
- **Freezing level (ft→unit):** from `freezing_level_height[]`.
- **Precipitation (in):** from `precipitation[]`; `yMin=0`. (Precip stays inches in POC, §12a; may use `LineChart` or `BarChart` — DESIGN.md §12 lists BarChart for precip. Decision: use `BarChart` for the precip panel to match DESIGN.md, others `LineChart`.)

**Construction notes:**
- Build x as numeric index over the full 7-day series; `xLabels` = day-start indices labeled weekday (port `dayStarts`, `modellab.jsx` line 27).
- `band={x0,x1}` = the target-day index range → `--target-band` highlight.
- Model color encoding: HRRR `--accent`, GFS `--caution`, ECMWF `--good` (DESIGN.md §12). Inactive models render faded (`faded:true`) not removed.
- **Axes/values convert with units**: pass a `yUnit` + a `convert` fn to `LineChart` so tick labels show converted values, OR convert the series `y` and the `yUnit` label before passing. Decision: convert series `y` + `yUnit` upstream (temp via `convTemp`, wind via `convWind`, freezing via `convDist`); precip stays inches. (If P4's `LineChart` already takes a `tickFormat`, use it; otherwise convert upstream.)
- Disagreement flag uses the **displayed** unit (e.g. `Δ16°F` or `Δ9°C` after conversion) — compute spread in canonical then convert the delta.

**Acceptance criteria:**
- Four chart panels with titles Summit temperature / Summit wind / Freezing level / Precipitation.
- Each shows 3 model series (faded when inactive); colors match the encoding.
- Disagreement flag appears only when the threshold is crossed, in the active unit.
- Target-day band highlight present.
- Units toggle changes axis labels + flag units.

- [ ] **Step 1: Write the failing test** — sample `blob` with a large ecmwf-vs-hrrr summit-temp gap on the target day (>15°F) to force the temp flag; assert all four titles render, the temp panel shows a `Δ…°F` flag, toggling `active.gfs=false` fades the GFS path (assert reduced opacity attr or a `faded` class), and switching units to °C changes the flag to `°C`.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** (`"use client"`). Reuse `rowsFor`/`modelSpread`; reuse P4 `LineChart`/`BarChart`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): ModelCharts 4 multi-model comparison charts with disagreement flags"`

---

## Task 9: `components/modellab/ForecastEvolutionChart.tsx` (TDD)

**Files:** Create `components/modellab/ForecastEvolutionChart.tsx`, `components/modellab/__tests__/ForecastEvolutionChart.test.tsx`.

**Props interface:**

```ts
import type { WeatherSnapshot } from "@/lib/types";
import type { ModelKey } from "@/lib/forecast-select";
export interface ForecastEvolutionChartProps {
  snapshots: WeatherSnapshot[];        // from GET /api/projects/[id]/snapshots (fetchedAt desc)
  targetDate: string;
  active: Record<ModelKey, boolean>;
}
```

**Data consumed:** `GET /api/projects/[id]/snapshots` → `WeatherSnapshot[]` (§7/§9). Each point = what a model predicted **for the target date** on a given snapshot day (spec §5; `modellab.jsx` lines 125–138).

**Construction notes:**
- A variable `Segmented` selector (state inside): Temp / Wind / Freezing / Precip → `EvoVar`.
- For each model build `evoPoints(snapshots, key, evoVar)` (Task 2, oldest→newest).
- Render a `LineChart` with `xLabels` = snapshot dates (month/day from `fetchedAt`).
- **Distinguish live vs backfill points** (spec §5, §6 — `source` field): backfill points rendered hollow / lighter / smaller markers and **labeled** (a legend item "● live  ○ backfill" and/or a divider/annotation where the series transitions from backfill to live). Decision: marker style by `source` + a legend caption; optionally a faint vertical rule at the first `live` snapshot index. The caption explains: "Backfilled (Previous Runs) before tracking began; live snapshots after."
- Units: y-axis converts per the selected variable (temp/wind/dist; precip inches).
- **Empty / <3-snapshot state** (DESIGN.md §20, spec §7 P6 mentions but evolution lives here): when `snapshots.length < 3` render a calm empty panel — "Tracking just started — the evolution chart fills in as new forecasts arrive (and from backfill). Check back as your date nears." (No chart.) This handles the on-create partial-backfill window.

**Acceptance criteria:**
- Variable selector switches the plotted metric.
- Live and backfill points are visually distinct AND labeled (legend/caption).
- 3+ snapshots → chart renders with per-model lines (faded when inactive).
- <3 snapshots → empty-state copy, no chart.
- Units toggle converts the y-axis.

- [ ] **Step 1: Write the failing test**

```tsx
// components/modellab/__tests__/ForecastEvolutionChart.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ForecastEvolutionChart } from "@/components/modellab/ForecastEvolutionChart";
import type { WeatherSnapshot } from "@/lib/types";

const mk = (id: string, day: string, src: "live" | "backfill", high: number): WeatherSnapshot => ({
  id, fetchedAt: `${day}T12:00:00Z`, targetDate: "2026-02-14", source: src,
  models: { hrrr: na(), gfs: dm(high), ecmwf: dm(high + 2) },
});
const dm = (h: number) => ({ available: true, summitHighF: h, summitLowF: h - 8, summitMaxWindMph: 30,
  summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 });
const na = () => ({ available: false, summitHighF: null, summitLowF: null, summitMaxWindMph: null,
  summitPrecipIn: null, freezingLevelFtNoon: null, snowfallIn: null });
const active = { hrrr: true, gfs: true, ecmwf: true };

describe("ForecastEvolutionChart", () => {
  it("renders an empty state with fewer than 3 snapshots", () => {
    render(<ForecastEvolutionChart snapshots={[mk("a","2026-02-12","live",12)]}
      targetDate="2026-02-14" active={active} />);
    expect(screen.getByText(/tracking just started/i)).toBeInTheDocument();
    expect(document.querySelector("svg")).toBeNull();
  });
  it("renders the chart and a live/backfill legend with 3+ snapshots", () => {
    const snaps = [
      mk("a", "2026-02-05", "backfill", 24), mk("b", "2026-02-06", "backfill", 20),
      mk("c", "2026-02-11", "live", 16),     mk("d", "2026-02-12", "live", 13),
    ];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate="2026-02-14" active={active} />);
    expect(document.querySelector("svg")).toBeInTheDocument();
    expect(screen.getByText(/backfill/i)).toBeInTheDocument();
    expect(screen.getByText(/live/i)).toBeInTheDocument();
  });
  it("switches the plotted variable", async () => {
    const snaps = [mk("a","2026-02-05","backfill",24), mk("b","2026-02-06","backfill",20),
      mk("c","2026-02-11","live",16)];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate="2026-02-14" active={active} />);
    await userEvent.click(screen.getByRole("tab", { name: /wind/i }));
    // y-axis/title reflects wind; assert via a unit label or tab aria-selected
    expect(screen.getByRole("tab", { name: /wind/i })).toHaveAttribute("aria-selected", "true");
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** (`"use client"`). Reuse `evoPoints`; mark backfill markers distinctly; render legend/caption.
- [ ] **Step 4: Run — expect PASS** (3 cases; include empty branch).
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): ForecastEvolutionChart with live/backfill distinction + empty state"`

---

## Task 10: `components/modellab/HourlyGrid.tsx` (TDD)

**Files:** Create `components/modellab/HourlyGrid.tsx`, `components/modellab/__tests__/HourlyGrid.test.tsx`.

**Props interface:**

```ts
import type { CombinedForecastBlob } from "@/lib/types";
import type { ModelKey } from "@/lib/forecast-select";
export interface HourlyGridProps {
  blob: CombinedForecastBlob;
  targetDate: string;
  bandNames?: { base: string; mid: string; summit: string };
}
```

**Data consumed:** `GET /api/projects/[id]/weather`. A model `Segmented` selector (state inside, default GFS — HRRR rarely reaches the target). Port `modellab.jsx` HourlyGrid (lines 140–169).

**Construction notes (MOS/aviation style):**
- `rows = targetRows(blob[model], targetDate)`; if empty → "HRRR does not extend to the target date (0–48 h only). Switch to GFS or ECMWF." (mono, muted).
- `<table className="grid-table">` inside `.grid-scroll`. Header row: "Hour" + each hour `HH` (00–23 padded).
- Rows (right-aligned, mono): Temp·Summit / Temp·Mid / Temp·Base (each cell `cell-cold` when ≤ cold threshold, `cell-hot` when ≥ hot threshold — port `tcell`), Feels (summit, faint — optional if `apparent_temperature` absent), Wind mph (`cell-hot` ≥45), Gust mph (`cell-hot` ≥60), Freezing ft, Precip in, POP %, Snow in.
- **Target row shaded** — the whole table is the target day, so apply `is-target` shading to the header/label column band per DESIGN.md §12 (or shade the temp-summit row as the primary read). Decision: since the entire table is the target date, render a `.grid-table` whose container carries a "Target · {date}" caption and shade the **summit temperature row** (the headline read) with `is-target`. (Matches "target row shaded" while the grid is already target-scoped.)
- **Units:** temp cells via `convTemp` (and the cold/hot thresholds compare in canonical °F before formatting); wind via `convWind`; freezing via `convDist`; precip/snow inches.

**Acceptance criteria:**
- Renders a monospace table with an Hour header and the variable rows.
- Cold cells get `cell-cold`, hot cells `cell-hot` (assert classes).
- Model selector switches the source model; selecting HRRR with no target rows shows the fallback message.
- Units toggle converts displayed temps/wind/freezing.
- Horizontal scroll container (`.grid-scroll`) present (no data reflow — DESIGN.md §15).

- [ ] **Step 1: Write the failing test** — sample `blob` with a target-day GFS series containing a very cold summit hour (e.g. 8°F → `cell-cold`) and a hot wind hour (50 mph → `cell-hot`); assert the table, the classes, switching to HRRR (null) shows the fallback, and °C toggle converts a known cell.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** (`"use client"`).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): MOS-style HourlyGrid with cold/hot cells + model selector"`

---

## Task 11: `components/modellab/ModelLab.tsx` (TDD)

**Files:** Create `components/modellab/ModelLab.tsx`, `components/modellab/__tests__/ModelLab.test.tsx`.

**Props interface:**

```ts
import type { CombinedForecastBlob, WeatherSnapshot, Mountain, Project } from "@/lib/types";
export interface ModelLabProps {
  project: Pick<Project, "id" | "name" | "targetDateStart">;
  mountain: Pick<Mountain, "name" | "lat" | "lng">;
  blob: CombinedForecastBlob;
  snapshots: WeatherSnapshot[];
}
```

**Data consumed:** both `GET /api/projects/[id]/weather` (charts + grid) and `GET /api/projects/[id]/snapshots` (evolution). Port `modellab.jsx` `ModelLab` shell (lines 19–104) + layout DESIGN.md §13.

**Construction notes:**
- Sticky monospace sub-header (`.lab-head`): back button to `/projects/[id]`, `LAB-TITLE` "Model Lab — {mountain.name}", and **toggleable model chips** HRRR/GFS/ECMWF (`.modeltag`, colored per encoding; toggling sets `active[key]`, faded when off). Default all active.
- Mono intro line: "RAW MULTI-MODEL COMPARISON · {lat},{lng} · TZ AMERICA/LOS_ANGELES · TARGET {targetDate} HIGHLIGHTED. Convergence ⇒ confidence; divergence ⇒ uncertainty." (`modellab.jsx` lines 59–61).
- `.lab-grid` (2-col, 1-col ≤900px) → `<ModelCharts blob targetDate active />`.
- `.lab-panel` → "Forecast evolution — how the target-day call has shifted" + `<ForecastEvolutionChart snapshots targetDate active />`.
- `.lab-panel` → "Hourly grid — {targetDate}" + `<HourlyGrid blob targetDate />`.
- Shared `active` chip state lives here (Zustand not needed; `useState` in the shell, passed to ModelCharts + EvolutionChart).

**Acceptance criteria:**
- Renders the monospace sub-header with three model chips, the intro line, and the three sub-sections (charts grid, evolution, hourly grid).
- Toggling a model chip fades that series in ModelCharts + EvolutionChart.
- Wider max-width (1320px, DESIGN.md §7) — assert the `.lab` / `.lab-body` containers render.

- [ ] **Step 1: Write the failing test** — render `ModelLab` with sample props; assert "Model Lab — Mount Rainier", the three chips, "RAW MULTI-MODEL COMPARISON", "Forecast evolution", "Hourly grid" all present; click the GFS chip and assert it toggles inactive (class/opacity).
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** (`"use client"`). Compose ModelCharts + ForecastEvolutionChart + HourlyGrid.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): ModelLab shell (model chips, layout)"`

---

## Task 12: `app/projects/[id]/models/page.tsx` — Model Lab route (TDD)

**Files:** Create `app/projects/[id]/models/page.tsx`; add `app/projects/[id]/models/__tests__/page.test.tsx`.

**Construction notes:**
- Next 16 async params: `export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; … }`.
- Fetch in a client wrapper via SWR (consistent with P4's detail pattern): `GET /api/projects/[id]` (project + mountain), `GET /api/projects/[id]/weather` (blob), `GET /api/projects/[id]/snapshots` (snaps). Handle loading/error/empty (P4 LoadingSpinner/ErrorBoundary; full state polish is P6 but render at least a spinner + error fallback here).
- Mount `<ModelLab project mountain blob snapshots />`.
- `targetDate = project.targetDateStart`.

**Acceptance criteria:**
- Route renders the ModelLab when data resolves; shows a loading state while pending and an error fallback on fetch failure.
- The page is the drill-down target of the detail page's "Model lab" action and ConfidenceStrip's "Compare all models →".

- [ ] **Step 1: Write the failing test** — mock SWR/fetch for the three endpoints; assert "Model Lab —" header renders; assert a loading indicator when data is undefined.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** the page + client wrapper.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(p5): /projects/[id]/models Model Lab page"`

---

## Task 13: Playwright interaction + screenshot specs (desktop + mobile)

**Files:** Create `tests/e2e/freezing-hero.spec.ts`, `tests/e2e/model-lab.spec.ts`. App served against emulator-seeded data (`scripts/seed-emulator.ts` must include a sample project with a weather blob + ≥3 snapshots mixing live/backfill — extend it if P3 seeded fewer; note as a seed dependency).

**`freezing-hero.spec.ts`:**
- Navigate to the seeded project detail (`/projects/<seeded-id>`).
- Assert the `FREEZING LEVEL ·` tag, three band cards, and the side-rail takeaway are visible.
- Assert **no** `input[type=range]` in the hero (static).
- Toggle units in the Header (ft→m) and assert the tag text changes to `m`.
- Toggle the elevation Base/Mid/Summit selector and assert the Daily Outlook responds (band-dependent value changes).
- `await page.locator('.hero').screenshot({ path: testInfo.outputPath('freezing-hero.png') })` (runs in both desktop + mobile projects per `playwright.config.ts`).

**`model-lab.spec.ts`:**
- Navigate via the detail "Model lab" action (assert routing) → `/projects/<id>/models`.
- Assert the monospace sub-header, three model chips, "RAW MULTI-MODEL COMPARISON", the four chart titles, "Forecast evolution", and "Hourly grid".
- Toggle the GFS chip off and assert its series fades (opacity / class).
- Switch the evolution variable selector (Temp→Wind) and the hourly-grid model selector (GFS→ECMWF) and assert content updates.
- Assert the evolution legend shows live + backfill.
- Full-page screenshot `model-lab.png` (desktop + mobile).

**Acceptance criteria:** both specs pass in desktop (1280×800) and mobile (iPhone 12) projects; screenshots written to `test-results/`; mobile screenshots show the single-column hero (≤900px) and single-column lab grid (DESIGN.md §15).

- [ ] **Step 1: Extend `scripts/seed-emulator.ts`** if needed: ensure the sample project has a combined blob (3 models, target-day rows) + ≥3 snapshots (mixing `source`). Commit separately if changed.
- [ ] **Step 2: Write `freezing-hero.spec.ts`** and run — iterate to green.
Run: `npm run test:e2e -- freezing-hero`
- [ ] **Step 3: Write `model-lab.spec.ts`** and run — iterate to green.
Run: `npm run test:e2e -- model-lab`
- [ ] **Step 4: Run the full e2e suite** (desktop + mobile).
Run: `npm run test:e2e`
Expected: all specs pass on both projects; screenshots present.
- [ ] **Step 5: Commit** — `git commit -m "test(p5): playwright specs + screenshots for hero + model lab (desktop+mobile)"`

---

## Task 14: Verification gate

- [ ] **Step 1: Build.** Run: `npm run build` — Expected: compiled successfully; `/projects/[id]/models` in the route table.
- [ ] **Step 2: Unit + coverage.** Run: `npm run test:coverage` — Expected: all pass; lines ≥90, functions ≥90, branches ≥85 (contract §12), including `lib/{band,forecast-select}.ts`, `components/project/**`, `components/modellab/**`.
- [ ] **Step 3: E2E.** Run: `npm run test:e2e` — Expected: green on desktop + mobile; hero + Model Lab screenshots in `test-results/`.
- [ ] **Step 4: Compare against Cirque.** Open `test-results/` screenshots beside the prototype (`prototype-ui/.../app/hero.jsx` render, `modellab.jsx`): verify the static cross-section (snow/rock split, range band, FL tag, band cards, side rail), the model color encoding (HRRR blue / GFS amber / ECMWF green), disagreement flags, live/backfill distinction, and the MOS grid shading. Note any deviations.
- [ ] **Step 5: Invoke `ux-reviewer`** on the P5 components (hero readability, chart legibility, mobile responsiveness, loading/error/empty states, alpine design consistency, a11y — color-not-sole-signal for model series + tone dot). Address findings; re-run gates.
- [ ] **Step 6: Confirm exit criteria** (check each box in the header). Note deviations in the PR description.
- [ ] **Step 7: Final commit / merge** — `git commit -m "chore(p5): signature views + model lab complete"`

---

## Verification gate (P5 done when all true)
- `npm run build` ✓ · `npm run test:coverage` ✓ (≥90/90/85) · `npm run test:e2e` ✓ (desktop+mobile screenshots of hero + Model Lab)
- Detail page renders the static FreezingLevelHero (range band, DayStrip, 3 band cards, FL tag) + ConfidenceStrip in IA order, replacing P4 placeholders ✓
- `/projects/[id]/models` renders model chips, 4 comparison charts + disagreement flags, evolution chart with live/backfill distinction + <3-snapshot empty state, MOS HourlyGrid ✓
- ElevationBandSelector defaults to Summit and drives the calm layer via the shared store ✓
- All measured values + chart axes honor the units toggle ✓ · no scrubber on the hero ✓
- Screenshots compared against Cirque; `ux-reviewer` invoked and findings addressed ✓

## Rollback / notes
- All work is additive components + one page + the detail-page wiring edit; revert the P5 commits to restore P4's placeholders.
- **Open risks / dependencies:** (a) **P4 is currently absent** — its chart primitives, shared components, `lib/units.ts`, fonts/tokens, and the detail-page placeholders are hard prerequisites (see Prerequisites + Gaps). (b) `apparent_temperature`/"feels" is in the Pydantic `ModelSeries` (§8) but not the TS `ModelSeries` (§9) — band cards + grid treat feels-like as optional. (c) The "+ /snapshots for the current call" in the P5 scope for ConfidenceStrip is interpreted as: current per-model target-day highs come from the **weather blob**; snapshots feed the evolution chart, not the confidence strip. (d) Cold/hot cell thresholds and disagreement-flag thresholds are ported from the prototype (`≤15`/`≥40` °F for cells; `>15°` temp / `>20` wind for flags) and applied in canonical °F before unit conversion — confirm with `ux-reviewer`. (e) If P4's `DrillLink`/`Segmented` expose different attributes than assumed (`href` vs router push; `aria-selected` vs active class), adjust the test assertions to match P4's established contract.
