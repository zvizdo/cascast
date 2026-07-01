# Forecast Convergence Charts Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the two "is the forecast settling?" charts intuitive — the consumer chart (Forecast tab) draws three named model lines braiding over a soft spread band ("can I trust it yet?"), and the expert chart (Model Lab) pulls *agreement* (a spread band) and *stability* (per-model "moved ±X / N runs" chips) apart.

**Architecture:** Both charts stay hand-built SVG consuming `WeatherSnapshot[]` + `targetDate`, sharing pure selectors in `src/lib/forecast-select.ts`. Three new pure selectors are added (TDD), then the two chart components are reworked to consume them. No pipeline, type, or fetch changes.

**Tech Stack:** Next.js 16 App Router, React client components, TypeScript, hand-built SVG charts (NOT Recharts), Vitest + Testing Library + vitest-axe, Zustand units store.

**Spec:** `docs/superpowers/specs/2026-06-29-forecast-convergence-charts-redesign-design.md`

## Design fidelity (read before ANY UI task)

**Every subagent implementing a task that touches the UI (Tasks 1, 5, 6 especially) MUST, before writing component/CSS code:**
1. Invoke the **`/frontend-design:frontend-design`** skill and apply its aesthetic discipline (distinctive, production-grade, no generic AI-slop defaults; deliberate typography, color, spacing, motion).
2. Read **`docs/prototype-ui/prototype-design-review/project/DESIGN.md`** — the canonical Cirque design system — and match its tokens, type scale, spacing, chart conventions, and alpine aesthetic. The charts are hand-built SVG recreated pixel-faithfully to this prototype (NOT Recharts).
3. Also consult the project's `design-tokens` skill for the exact color/typography/chart token names.

The code blocks in this plan are correct and complete for behavior; treat them as the functional contract, but ensure the resulting visuals honor DESIGN.md (token usage, hierarchy, calm alpine feel) rather than diverging from it.

## Global Constraints

- Coverage gate is hard: **90/90/85** lines/functions/branches (`npm test`). TDD — failing test first, then implement.
- Run a single test file with the config flag: `npm test -- --run <path>` (bare `npx vitest run` breaks the `@/` alias; config lives at `config/vitest.config.ts`).
- Charts are hand-built SVG. Do NOT introduce Recharts or any chart lib.
- Existing a11y assertions (vitest-axe, `role="img"` + `aria-label` on SVGs) must stay green.
- Color discipline (consumer chart): the 3 model lines use **3 calm, non-semantic hues** (`--model-1/2/3`); amber (`--caution`) / green (`--good`) are reserved for the verdict chip only. The band fill is one calm accent.
- Color (expert chart): keep the existing model palette (`--accent`/`--caution`/`--good`); the spread band is a faint neutral; stability chips are green/amber.
- Stability window is the **newest 3 snapshots**. Per-variable "settled" thresholds (canonical units): Temp range ≤ 4 °F, Wind ≤ 10 mph, Freezing ≤ 1000 ft, Precip ≤ 0.2 in.
- Snapshots arrive `fetchedAt` **descending** (newest first); selectors that plot oldest→newest must `reverse()`.

---

### Task 1: Add model-line color tokens

**Files:**
- Modify: `src/app/globals.css` (light `:root` block near line 68; dark theme block near line 90)

**Interfaces:**
- Produces: CSS variables `--model-1`, `--model-2`, `--model-3` (consumed by `CallChart` in Task 4).

These are calm, distinct, non-semantic hues (blue / slate / teal) so amber/green stay reserved for the verdict chip.

> **Design fidelity:** confirm these hues fit the Cirque palette in `docs/prototype-ui/prototype-design-review/project/DESIGN.md` (and the `design-tokens` skill) for both light and Slate/dark themes before committing; adjust the hex values to harmonize if needed.

- [ ] **Step 1: Add the light-theme tokens**

In `src/app/globals.css`, find the light-theme line `  --alert: #c5503f;` and add three lines immediately after it:

```css
  --alert: #c5503f;
  --model-1: #2c6d8f; /* HRRR — accent blue */
  --model-2: #6b7f8c; /* GFS — calm slate */
  --model-3: #3f9a93; /* ECMWF — muted teal */
```

- [ ] **Step 2: Add the dark-theme overrides**

Find the dark-theme line `  --accent-soft: #16303f;` and add three lines immediately after it:

```css
  --accent-soft: #16303f;
  --model-1: #5cabd8; /* HRRR — accent blue */
  --model-2: #93a8b6; /* GFS — calm slate */
  --model-3: #5cc0b6; /* ECMWF — muted teal */
```

- [ ] **Step 3: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds (CSS is static; this only adds variables).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(charts): add calm model-line color tokens (--model-1/2/3)"
```

---

### Task 2: `modelStability` selector (expert stability chips)

**Files:**
- Modify: `src/lib/forecast-select.ts` (append after `convergenceVerdict`, end of file)
- Test: `src/lib/__tests__/forecast-select.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: existing `EVO_FIELD`, `EvoVar`, `ModelKey`, `WeatherSnapshot`.
- Produces:
  - `export const STABILITY_MAX_RANGE: Record<EvoVar, number>`
  - `export interface ModelStability { min: number | null; max: number | null; range: number | null; settled: boolean; count: number; }`
  - `export function modelStability(snaps: WeatherSnapshot[], key: ModelKey, variable: EvoVar, targetDate: string): ModelStability`
  - (Task 5 consumes `modelStability`; `min`/`max` let the component compute the displayed delta in any unit without affine-offset bugs.)

- [ ] **Step 1: Write the failing test**

Append to `src/lib/__tests__/forecast-select.test.ts`. Add `modelStability`, `STABILITY_MAX_RANGE` to the existing import from `@/lib/forecast-select`, then add:

```ts
describe("modelStability", () => {
  const TARGET = "2026-02-20";
  function m(high: number) {
    return { available: true, summitHighF: high, summitLowF: high - 8, summitMaxWindMph: 30,
      summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 };
  }
  // newest-first (fetchedAt desc). Newest 3 GFS highs: 25, 24, 22 → range 3 (≤4 ⇒ settled).
  const snaps: WeatherSnapshot[] = [
    { id: "s4", fetchedAt: "2026-02-18T12:00:00Z",
      models: { hrrr: { [TARGET]: m(24) }, gfs: { [TARGET]: m(25) }, ecmwf: { [TARGET]: m(26) } } },
    { id: "s3", fetchedAt: "2026-02-15T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
    { id: "s2", fetchedAt: "2026-02-10T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: m(22) }, ecmwf: { [TARGET]: m(34) } } },
    { id: "s1", fetchedAt: "2026-02-09T12:00:00Z",
      models: { hrrr: {}, gfs: { [TARGET]: m(10) }, ecmwf: { [TARGET]: m(38) } } },
  ];

  it("ranges over the newest 3 snapshots only (ignores the 4th)", () => {
    const s = modelStability(snaps, "gfs", "high", TARGET);
    expect(s).toMatchObject({ min: 22, max: 25, range: 3, count: 3, settled: true });
  });

  it("marks a model unsettled when its range exceeds the threshold", () => {
    const s = modelStability(snaps, "ecmwf", "high", TARGET); // 26,28,34 → range 8 > 4
    expect(s.range).toBe(8);
    expect(s.settled).toBe(false);
  });

  it("returns null range / not-settled with fewer than 2 values in the window", () => {
    const s = modelStability(snaps, "hrrr", "high", TARGET); // only newest has HRRR
    expect(s).toMatchObject({ min: null, max: null, range: null, settled: false, count: 1 });
  });

  it("uses the per-variable field and threshold (freezing range 600 ≤ 1000 ⇒ settled)", () => {
    const fl = (ft: number) => ({ available: true, summitHighF: 20, summitLowF: 12,
      summitMaxWindMph: 30, summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1,
      freezingLevelFtNoon: ft, snowfallIn: 0.3 });
    const flSnaps: WeatherSnapshot[] = [
      { id: "a", fetchedAt: "2026-02-18T12:00:00Z", models: { hrrr: {}, gfs: { [TARGET]: fl(5800) }, ecmwf: {} } },
      { id: "b", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: {}, gfs: { [TARGET]: fl(5400) }, ecmwf: {} } },
      { id: "c", fetchedAt: "2026-02-10T12:00:00Z", models: { hrrr: {}, gfs: { [TARGET]: fl(5200) }, ecmwf: {} } },
    ];
    const s = modelStability(flSnaps, "gfs", "freezing", TARGET);
    expect(s.range).toBe(600);
    expect(s.settled).toBe(true);
  });

  it("exposes tunable per-variable thresholds", () => {
    expect(STABILITY_MAX_RANGE).toEqual({ high: 4, wind: 10, freezing: 1000, precip: 0.2 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/__tests__/forecast-select.test.ts`
Expected: FAIL — `modelStability is not a function` / `STABILITY_MAX_RANGE` undefined.

- [ ] **Step 3: Write the implementation**

Append to the end of `src/lib/forecast-select.ts`:

```ts
/** Max range (canonical units) within which a model counts as "settled" per variable.
 *  Tunable in one place. Temp ±2°F, Wind ±5mph, Freezing ±500ft, Precip ±0.1in. */
export const STABILITY_MAX_RANGE: Record<EvoVar, number> = {
  high: 4,
  wind: 10,
  freezing: 1000,
  precip: 0.2,
};

export interface ModelStability {
  min: number | null;
  max: number | null;
  range: number | null; // max−min in canonical units; null with <2 values in the window
  settled: boolean;
  count: number;
}

/** How much one model's target-day prediction has moved over the last 3 snapshots.
 *  snaps are fetchedAt desc (§7), so the window is the newest 3 (`slice(0, 3)`). Among those,
 *  the available, non-null target-day values are collected; range = max−min. With <2 values the
 *  result is "insufficient history" (range null, not settled). Callers convert min/max for
 *  display so the shown delta is unit-correct without affine-offset bugs. */
export function modelStability(
  snaps: WeatherSnapshot[],
  key: ModelKey,
  variable: EvoVar,
  targetDate: string,
): ModelStability {
  const field = EVO_FIELD[variable];
  const vals: number[] = [];
  for (const s of snaps.slice(0, 3)) {
    const day = s.models[key]?.[targetDate];
    if (!day || !day.available) continue;
    const v = day[field] as number | null;
    if (v == null) continue;
    vals.push(v);
  }
  if (vals.length < 2) {
    return { min: null, max: null, range: null, settled: false, count: vals.length };
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min;
  return { min, max, range, settled: range <= STABILITY_MAX_RANGE[variable], count: vals.length };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/__tests__/forecast-select.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast-select.ts src/lib/__tests__/forecast-select.test.ts
git commit -m "feat(forecast-select): add modelStability selector + thresholds"
```

---

### Task 3: `evoEnvelope` selector (expert agreement band)

**Files:**
- Modify: `src/lib/forecast-select.ts` (append after `modelStability`)
- Test: `src/lib/__tests__/forecast-select.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: existing `EVO_FIELD`, `ALL_MODELS`, `EvoVar`, `WeatherSnapshot`.
- Produces:
  - `export interface EvoEnvelopePoint { x: number; min: number; max: number; }`
  - `export function evoEnvelope(snaps: WeatherSnapshot[], variable: EvoVar, targetDate: string): EvoEnvelopePoint[]`
  - `x` is the **reversed (oldest→newest) snapshot index** — the SAME index `evoPoints` uses — so the band aligns with the per-model lines in Task 5.

- [ ] **Step 1: Write the failing test**

Add `evoEnvelope` to the import, then append to `src/lib/__tests__/forecast-select.test.ts`:

```ts
describe("evoEnvelope", () => {
  const TARGET = "2026-02-20";
  function m(high: number) {
    return { available: true, summitHighF: high, summitLowF: high - 8, summitMaxWindMph: 30,
      summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 };
  }
  // newest-first; oldest→newest after reverse: s1(10..38), s2(14..34), s3(20..28)
  const snaps: WeatherSnapshot[] = [
    { id: "s3", fetchedAt: "2026-02-15T12:00:00Z",
      models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(28) } } },
    { id: "s2", fetchedAt: "2026-02-10T12:00:00Z",
      models: { hrrr: { [TARGET]: m(14) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(34) } } },
    { id: "s1", fetchedAt: "2026-02-09T12:00:00Z",
      models: { hrrr: { [TARGET]: m(10) }, gfs: { [TARGET]: m(24) }, ecmwf: { [TARGET]: m(38) } } },
  ];

  it("builds a cross-model min..max band per snapshot, oldest→newest, x-aligned with evoPoints", () => {
    const env = evoEnvelope(snaps, "high", TARGET);
    expect(env).toEqual([
      { x: 0, min: 10, max: 38 },
      { x: 1, min: 14, max: 34 },
      { x: 2, min: 20, max: 28 },
    ]);
  });

  it("skips snapshots with no available model value (preserving the absolute index)", () => {
    const withGap: WeatherSnapshot[] = [
      { id: "g", fetchedAt: "2026-02-16T12:00:00Z", models: { hrrr: {}, gfs: {}, ecmwf: {} } },
      ...snaps,
    ];
    // reversed order: s1(x0), s2(x1), s3(x2), gap(x3 skipped)
    const env = evoEnvelope(withGap, "high", TARGET);
    expect(env.map((p) => p.x)).toEqual([0, 1, 2]);
  });

  it("returns a degenerate (min==max) point when only one model has a value", () => {
    const one: WeatherSnapshot[] = [
      { id: "o", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: {}, gfs: { [TARGET]: m(24) }, ecmwf: {} } },
    ];
    expect(evoEnvelope(one, "high", TARGET)).toEqual([{ x: 0, min: 24, max: 24 }]);
  });

  it("returns [] when no snapshot carries the target date", () => {
    expect(evoEnvelope(snaps, "high", "2026-03-01")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/__tests__/forecast-select.test.ts`
Expected: FAIL — `evoEnvelope is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/forecast-select.ts`:

```ts
export interface EvoEnvelopePoint {
  x: number; // reversed (oldest→newest) snapshot index — aligns with evoPoints' x
  min: number;
  max: number;
}

/** Cross-model min..max envelope for the target date at each snapshot, oldest→newest.
 *  x is the absolute index in the reversed snapshot order (the same index evoPoints emits),
 *  so the band aligns with the per-model lines. Snapshots with no available model value are
 *  skipped. A band narrowing left→right means the models are converging. */
export function evoEnvelope(
  snaps: WeatherSnapshot[],
  variable: EvoVar,
  targetDate: string,
): EvoEnvelopePoint[] {
  const field = EVO_FIELD[variable];
  const ordered = [...snaps].reverse(); // §7 fetchedAt desc → oldest→newest
  const pts: EvoEnvelopePoint[] = [];
  ordered.forEach((s, i) => {
    const vals: number[] = [];
    for (const key of ALL_MODELS) {
      const day = s.models[key]?.[targetDate];
      if (!day || !day.available) continue;
      const v = day[field] as number | null;
      if (v == null) continue;
      vals.push(v);
    }
    if (vals.length === 0) return;
    pts.push({ x: i, min: Math.min(...vals), max: Math.max(...vals) });
  });
  return pts;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/__tests__/forecast-select.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast-select.ts src/lib/__tests__/forecast-select.test.ts
git commit -m "feat(forecast-select): add evoEnvelope cross-model band selector"
```

---

### Task 4: `modelLeadSeries` selector (consumer model lines)

**Files:**
- Modify: `src/lib/forecast-select.ts` (append after `evoEnvelope`)
- Test: `src/lib/__tests__/forecast-select.test.ts` (append a new `describe`)

**Interfaces:**
- Consumes: existing `EVO_FIELD`, `leadDays`, `EvoVar`, `ModelKey`, `WeatherSnapshot`.
- Produces:
  - `export interface ModelLeadPoint { lead: number; value: number; }`
  - `export function modelLeadSeries(snaps: WeatherSnapshot[], key: ModelKey, variable: EvoVar, targetDate: string): ModelLeadPoint[]`
  - One point per distinct lead day (newest issuance per lead), sorted largest lead → 0 — mirrors `convergenceRuns` collapsing so the consumer lines align under the convergence band. (Task 5/`CallChart` consumes this.)

- [ ] **Step 1: Write the failing test**

Add `modelLeadSeries` to the import, then append to `src/lib/__tests__/forecast-select.test.ts`:

```ts
describe("modelLeadSeries", () => {
  const TARGET = "2026-02-20";
  function m(high: number) {
    return { available: true, summitHighF: high, summitLowF: high - 8, summitMaxWindMph: 30,
      summitMaxSustainedWindMph: 24, summitPrecipIn: 0.1, freezingLevelFtNoon: 5800, snowfallIn: 0.3 };
  }
  const snaps: WeatherSnapshot[] = [
    { id: "s3", fetchedAt: "2026-02-18T12:00:00Z", models: { hrrr: { [TARGET]: m(25) }, gfs: { [TARGET]: m(24) }, ecmwf: {} } },
    { id: "s2", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: { [TARGET]: m(20) }, gfs: { [TARGET]: m(22) }, ecmwf: {} } },
    { id: "s1", fetchedAt: "2026-02-10T12:00:00Z", models: { hrrr: { [TARGET]: m(14) }, gfs: { [TARGET]: m(21) }, ecmwf: {} } },
  ];

  it("returns one point per lead day, largest lead → 0 (now on the right)", () => {
    const pts = modelLeadSeries(snaps, "hrrr", "high", TARGET);
    expect(pts).toEqual([
      { lead: 10, value: 14 }, // 02-10 → target 02-20
      { lead: 5, value: 20 },  // 02-15
      { lead: 2, value: 25 },  // 02-18
    ]);
  });

  it("collapses same-lead hourly snapshots, keeping the newest issuance", () => {
    const sameLead: WeatherSnapshot[] = [
      { id: "late", fetchedAt: "2026-02-18T18:00:00Z", models: { hrrr: { [TARGET]: m(25) }, gfs: {}, ecmwf: {} } },
      { id: "early", fetchedAt: "2026-02-18T06:00:00Z", models: { hrrr: { [TARGET]: m(11) }, gfs: {}, ecmwf: {} } },
      { id: "old", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: { [TARGET]: m(20) }, gfs: {}, ecmwf: {} } },
    ];
    const pts = modelLeadSeries(sameLead, "hrrr", "high", TARGET);
    expect(pts.map((p) => p.lead)).toEqual([5, 2]);
    expect(pts.find((p) => p.lead === 2)?.value).toBe(25); // 18:00 wins over 06:00
  });

  it("omits unavailable / null-valued / missing snapshots for the model", () => {
    expect(modelLeadSeries(snaps, "ecmwf", "high", TARGET)).toEqual([]);
    const nulled: WeatherSnapshot[] = [
      { id: "n", fetchedAt: "2026-02-15T12:00:00Z", models: { hrrr: { [TARGET]: { ...m(20), summitHighF: null } }, gfs: {}, ecmwf: {} } },
    ];
    expect(modelLeadSeries(nulled, "hrrr", "high", TARGET)).toEqual([]);
  });

  it("maps the chosen variable to its field", () => {
    expect(modelLeadSeries(snaps, "gfs", "wind", TARGET).every((p) => p.value === 30)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/__tests__/forecast-select.test.ts`
Expected: FAIL — `modelLeadSeries is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/forecast-select.ts`:

```ts
export interface ModelLeadPoint {
  lead: number;
  value: number;
}

/** One model's target-day prediction per distinct lead day, oldest→newest (largest lead → 0).
 *  Mirrors convergenceRuns' collapsing: snapshots are hourly, so we keep the NEWEST issuance per
 *  integer lead. Used to draw the per-model lines under the consumer convergence band. */
export function modelLeadSeries(
  snaps: WeatherSnapshot[],
  key: ModelKey,
  variable: EvoVar,
  targetDate: string,
): ModelLeadPoint[] {
  const field = EVO_FIELD[variable];
  const ordered = [...snaps].reverse(); // oldest→newest so the last write per lead is the newest
  const byLead = new Map<number, ModelLeadPoint>();
  for (const s of ordered) {
    const day = s.models[key]?.[targetDate];
    if (!day || !day.available) continue;
    const v = day[field] as number | null;
    if (v == null) continue;
    const lead = leadDays(s.fetchedAt, targetDate);
    byLead.set(lead, { lead, value: v });
  }
  return [...byLead.values()].sort((a, b) => b.lead - a.lead);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/__tests__/forecast-select.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/forecast-select.ts src/lib/__tests__/forecast-select.test.ts
git commit -m "feat(forecast-select): add modelLeadSeries per-model lead series"
```

---

### Task 5: Rework `CallChart` (consumer "can I trust it yet?")

**Files:**
- Modify (full rewrite): `src/components/project/CallChart.tsx`
- Test: `src/components/project/__tests__/CallChart.test.tsx`

**Interfaces:**
- Consumes: `modelLeadSeries`, `convergenceRuns`, `convergenceVerdict`, `ModelKey`, `EvoVar`, `ConvergenceRun` from `@/lib/forecast-select`; `--model-1/2/3` tokens from Task 1.
- Produces: unchanged `CallChart` public props (`{ snapshots, targetDate }`).

Replaces the single mid line with three calm-hued model lines + legend, rewords the verdict chip, trims the caption. Band fill stays one calm accent.

> **Design fidelity:** before editing, invoke `/frontend-design:frontend-design`, read `docs/prototype-ui/prototype-design-review/project/DESIGN.md`, and use the `design-tokens` skill — match the Cirque tokens, type scale, and calm alpine chart conventions.

- [ ] **Step 1: Update the tests first (red)**

In `src/components/project/__tests__/CallChart.test.tsx`, replace the three assertion bodies that reference the old wording and add line/legend checks. Change:

```ts
  it("renders the 'Settling' verdict chip for a narrowing band", () => {
    render(<CallChart snapshots={narrowing()} targetDate={TARGET} />);
    expect(screen.getByText(/settling/i)).toBeInTheDocument();
  });

  it("renders the 'Still shifting' verdict chip for a widening band", () => {
    render(<CallChart snapshots={widening()} targetDate={TARGET} />);
    expect(screen.getByText(/still shifting/i)).toBeInTheDocument();
  });

  it("shows the trimmed convergence caption", () => {
    render(<CallChart snapshots={narrowing()} targetDate={TARGET} />);
    expect(screen.getByText(/converging toward your day/i)).toBeInTheDocument();
  });

  it("labels all three models in a legend", () => {
    render(<CallChart snapshots={narrowing()} targetDate={TARGET} />);
    expect(screen.getByText("HRRR")).toBeInTheDocument();
    expect(screen.getByText("GFS")).toBeInTheDocument();
    expect(screen.getByText("ECMWF")).toBeInTheDocument();
  });
```

(Keep the existing radiogroup/NaN-path test and any a11y test unchanged.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/project/__tests__/CallChart.test.tsx`
Expected: FAIL — old text "firming up" / caption gone; legend labels not found.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/components/project/CallChart.tsx` with:

```tsx
/* CallChart — the convergence "call" chart for the mountain detail page. Answers one question:
   "can I trust my day's forecast yet?". Three model lines (each model's prediction for the
   target day across lead time, decreasing left→right toward 0 = now) braid together over a soft
   cross-model spread fill; as the lines merge and the band narrows toward now, the call is
   settling. A verdict chip (the only amber/green element) gives the read; a one-line caption
   teaches it. The expert all-models split lives in the Model Lab. Sparse (<3 snapshots, or
   <2 runs) → a calm empty state. Self-contained SVG so the band and lines stay aligned. */
"use client";
import * as React from "react";
import { Segmented } from "@/components/shared/Segmented";
import { sx, niceMin, niceMax } from "@/components/charts/chart-utils";
import { useUnits, convTemp, convWind, convDist } from "@/lib/units";
import {
  convergenceRuns,
  convergenceVerdict,
  modelLeadSeries,
  type EvoVar,
  type ConvergenceRun,
  type ModelKey,
} from "@/lib/forecast-select";
import type { WeatherSnapshot } from "@/lib/types";

export interface CallChartProps {
  snapshots: WeatherSnapshot[];
  targetDate: string;
}

const VAR_OPTIONS: { value: EvoVar; label: string }[] = [
  { value: "high", label: "Temp" },
  { value: "wind", label: "Wind" },
  { value: "freezing", label: "Freezing" },
  { value: "precip", label: "Precip" },
];

// Three calm, non-semantic hues so amber/green stay reserved for the verdict chip.
const MODELS: { key: ModelKey; label: string; color: string }[] = [
  { key: "hrrr", label: "HRRR", color: "var(--model-1)" },
  { key: "gfs", label: "GFS", color: "var(--model-2)" },
  { key: "ecmwf", label: "ECMWF", color: "var(--model-3)" },
];

const W = 640;
const H = 230;
const PAD = { t: 14, r: 14, b: 26, l: 44 };

/** Straight-segment polyline (band edges + model lines must align exactly, so no bezier). */
function poly(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function CallChart({ snapshots, targetDate }: CallChartProps) {
  const { temp, wind, dist } = useUnits();
  const [evoVar, setEvoVar] = React.useState<EvoVar>("high");

  // Convert a raw evo value to the active display unit (precip stays inches).
  const conv = (y: number): number => {
    if (evoVar === "high") return convTemp(y, temp);
    if (evoVar === "wind") return convWind(y, wind);
    if (evoVar === "freezing") return convDist(y, dist);
    return y;
  };

  const runs: ConvergenceRun[] = convergenceRuns(snapshots, evoVar, targetDate).map((r) => ({
    lead: r.lead,
    min: conv(r.min),
    max: conv(r.max),
    mid: conv(r.mid),
  }));

  if (snapshots.length < 3 || runs.length < 2) {
    return (
      <div>
        <Heading evoVar={evoVar} onVar={setEvoVar} />
        <p className="mono-dim" style={{ fontSize: 12, lineHeight: 1.6, margin: "10px 0 0" }}>
          Tracking just started — the convergence band fills in as new forecasts arrive. Check back
          as your date nears.
        </p>
      </div>
    );
  }

  const yUnit =
    evoVar === "high"
      ? `°${temp}`
      : evoVar === "wind"
        ? wind === "kmh"
          ? "km/h"
          : "mph"
        : evoVar === "freezing"
          ? dist
          : "in";

  const verdict = convergenceVerdict(
    convergenceRuns(snapshots, evoVar, targetDate), // raw spread comparison is unit-agnostic
  );
  const firming = verdict.firming;
  const chipColor = firming ? "var(--good)" : "var(--caution)";
  const chipLabel = firming ? "Settling — models agree" : "Still shifting";

  // X = lead time (days before target). Plot decreasing left→right so 0 (now) sits on the right.
  const leads = runs.map((r) => r.lead);
  const leadMax = Math.max(...leads);
  const leadMin = Math.min(...leads);

  const allY = runs.flatMap((r) => [r.min, r.max]);
  const mn = evoVar === "precip" ? 0 : niceMin(Math.min(...allY));
  const mx = niceMax(Math.max(...allY));
  // Larger lead → further left; lead 0 (now) → right edge.
  const X = sx(leadMax, leadMin, PAD.l, W - PAD.r);
  const Y = sx(mn, mx, H - PAD.b, PAD.t);
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => mn + (i * (mx - mn)) / yTicks);

  const maxPts = runs.map((r) => ({ x: X(r.lead), y: Y(r.max) }));
  const minPts = runs.map((r) => ({ x: X(r.lead), y: Y(r.min) }));
  // Band = max polyline + reversed min polyline, closed.
  const bandPath = `${poly(maxPts)} ${poly([...minPts].reverse()).replace(/^M/, "L")} Z`;

  // Per-model lines (each model's target-day call across lead time), within the band.
  const modelLines = MODELS.map((m) => ({
    ...m,
    pts: modelLeadSeries(snapshots, m.key, evoVar, targetDate).map((p) => ({
      x: X(p.lead),
      y: Y(conv(p.value)),
    })),
  })).filter((s) => s.pts.length > 0);

  return (
    <div>
      <Heading evoVar={evoVar} onVar={setEvoVar} />
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
        <span
          className="chip"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "4px 12px",
            borderRadius: 999,
            fontFamily: "var(--mono)",
            fontSize: 13,
            fontWeight: 700,
            color: chipColor,
            background: `color-mix(in srgb, ${chipColor} 14%, var(--surface))`,
          }}
        >
          <span aria-hidden className="tone-dot" style={{ background: chipColor }} />
          {chipLabel}
        </span>
      </div>
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible", marginTop: 10 }}
        role="img"
        aria-label={`Forecast convergence for ${targetDate}: ${chipLabel}`}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={Y(t)} y2={Y(t)} stroke="var(--line)" strokeWidth="1" />
            <text
              x={PAD.l - 8}
              y={Y(t) + 11 / 3}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
              fontFamily="var(--mono)"
            >
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text
          x={PAD.l - 8}
          y={PAD.t - 6}
          textAnchor="end"
          fontSize={10}
          fill="var(--faint)"
          fontFamily="var(--mono)"
        >
          {yUnit}
        </text>
        {/* convergence band — soft spread fill, one calm accent */}
        <path d={bandPath} fill="var(--accent)" fillOpacity={0.13} stroke="none" />
        {/* per-model lines on top */}
        {modelLines.map((s) => (
          <path
            key={s.key}
            d={poly(s.pts)}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* x labels: lead days, decreasing toward now */}
        {runs.map((r, i) => (
          <text
            key={i}
            x={X(r.lead)}
            y={H - PAD.b + 16}
            textAnchor="middle"
            fontSize={11}
            fill="var(--muted)"
            fontFamily="var(--mono)"
          >
            {r.lead === 0 ? "now" : `−${r.lead}d`}
          </text>
        ))}
      </svg>

      <div className="chart-legend" style={{ marginTop: 12 }}>
        {MODELS.map((m) => (
          <span className="legend-item" key={m.key}>
            <svg width="16" height="6" aria-hidden style={{ overflow: "visible" }}>
              <line x1="0" y1="3" x2="16" y2="3" stroke={m.color} strokeWidth="2.5" />
            </svg>
            {m.label}
          </span>
        ))}
      </div>

      <p className="mono-dim" style={{ fontSize: 11, margin: "10px 0 0", lineHeight: 1.6 }}>
        Three models, converging toward your day.
      </p>
    </div>
  );
}

function Heading({ evoVar, onVar }: { evoVar: EvoVar; onVar: (v: EvoVar) => void }) {
  return (
    <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: 0 }}>
      <span
        style={{
          fontFamily: "var(--mono)",
          fontSize: 12,
          textTransform: "uppercase",
          color: "var(--muted)",
          letterSpacing: "0.05em",
        }}
      >
        The call
      </span>
      <Segmented value={evoVar} onChange={onVar} options={VAR_OPTIONS} ariaLabel="Call variable" />
    </h3>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- --run src/components/project/__tests__/CallChart.test.tsx`
Expected: PASS (verdict wording, caption, legend, radiogroup/NaN, a11y).

- [ ] **Step 5: Commit**

```bash
git add src/components/project/CallChart.tsx src/components/project/__tests__/CallChart.test.tsx
git commit -m "feat(call-chart): three model lines + spread band, trust-framed verdict"
```

---

### Task 6: Rework `ForecastEvolutionChart` (expert agreement + stability)

**Files:**
- Modify (full rewrite): `src/components/modellab/ForecastEvolutionChart.tsx`
- Modify: `src/components/modellab/ModelLab.tsx:129` (panel title text)
- Test: `src/components/modellab/__tests__/ForecastEvolutionChart.test.tsx`

**Interfaces:**
- Consumes: `evoPoints`, `evoEnvelope`, `modelStability`, `ModelKey`, `EvoVar`, `EvoPoint` from `@/lib/forecast-select`.
- Produces: unchanged `ForecastEvolutionChart` props (`{ snapshots, targetDate, active }`).

Adds a faint cross-model spread band behind the existing lines (agreement) and a per-model stability chip in the legend (stability). Model line colors unchanged (`--accent`/`--caution`/`--good`). The displayed stability delta is computed from converted min/max (`|conv(max) − conv(min)| / 2`) so it is unit-correct without affine-offset bugs.

> **Design fidelity:** before editing, invoke `/frontend-design:frontend-design`, read `docs/prototype-ui/prototype-design-review/project/DESIGN.md`, and use the `design-tokens` skill — match the Cirque tokens, type scale, and calm alpine chart conventions.

- [ ] **Step 1: Update the tests first (red)**

In `src/components/modellab/__tests__/ForecastEvolutionChart.test.tsx`:
- Replace any assertion on the OLD caption ("Each point = what a model predicted...") with the new caption.
- Add stability-chip + band assertions. Note `mk(id, day, high)` builds gfs=high, ecmwf=high+2 (no hrrr).

Add these tests inside the existing `describe`:

```ts
  it("shows the new two-signal caption", () => {
    const snaps = [mk("a", "2026-02-05", 24), mk("b", "2026-02-06", 20), mk("c", "2026-02-11", 16)];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate={TARGET} active={active} />);
    expect(screen.getByText(/how settled each model is/i)).toBeInTheDocument();
  });

  it("renders a per-model stability chip (settled green when a model holds steady)", () => {
    // newest-first: gfs highs over newest 3 = 22, 21, 20 → range 2 ≤ 4 ⇒ settled.
    const snaps = [
      mk("c", "2026-02-11", 22),
      mk("b", "2026-02-06", 21),
      mk("a", "2026-02-05", 20),
    ];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate={TARGET} active={active} />);
    // chip text format: "±N °F / 3 runs"
    expect(screen.getByText(/\/\s*3\s*runs/i)).toBeInTheDocument();
  });

  it("shows '—' stability for a model with no target-day data (HRRR absent)", () => {
    const snaps = [mk("a", "2026-02-05", 24), mk("b", "2026-02-06", 20), mk("c", "2026-02-11", 16)];
    render(<ForecastEvolutionChart snapshots={snaps} targetDate={TARGET} active={active} />);
    expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run src/components/modellab/__tests__/ForecastEvolutionChart.test.tsx`
Expected: FAIL — new caption / chip text not present.

- [ ] **Step 3: Rewrite the component**

Replace the entire contents of `src/components/modellab/ForecastEvolutionChart.tsx` with:

```tsx
/* ForecastEvolutionChart — are the models locking in for the target day? Two signals on one view:
   (1) three model lines = each model's target-day prediction across snapshots (its run-to-run
   DRIFT); (2) a faint cross-model spread band behind them = how far APART the models are at each
   snapshot (narrowing left→right ⇒ converging). A per-model stability chip in the legend
   quantifies how much each model moved over its last 3 runs (green = locked, amber = drifting).
   Sparse (<3 snapshots) → calm empty state. Self-contained SVG so per-point markers stay aligned. */
"use client";
import * as React from "react";
import { Segmented } from "@/components/shared/Segmented";
import { sx, linePath, niceMin, niceMax } from "@/components/charts/chart-utils";
import { useUnits, convTemp, convWind, convDist } from "@/lib/units";
import {
  evoPoints,
  evoEnvelope,
  modelStability,
  type ModelKey,
  type EvoVar,
  type EvoPoint,
} from "@/lib/forecast-select";
import type { WeatherSnapshot } from "@/lib/types";

export interface ForecastEvolutionChartProps {
  snapshots: WeatherSnapshot[];
  targetDate: string;
  active: Record<ModelKey, boolean>;
}

const MODELS: { key: ModelKey; label: string; color: string }[] = [
  { key: "hrrr", label: "HRRR", color: "var(--accent)" },
  { key: "gfs", label: "GFS", color: "var(--caution)" },
  { key: "ecmwf", label: "ECMWF", color: "var(--good)" },
];

const VAR_OPTIONS: { value: EvoVar; label: string }[] = [
  { value: "high", label: "Temp" },
  { value: "wind", label: "Wind" },
  { value: "freezing", label: "Freezing" },
  { value: "precip", label: "Precip" },
];

const W = 640;
const H = 230;
const PAD = { t: 14, r: 14, b: 26, l: 44 };

/** Straight-segment polyline (band edges must align exactly, so no bezier). */
function poly(pts: { x: number; y: number }[]): string {
  if (!pts.length) return "";
  return pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
}

export function ForecastEvolutionChart({
  snapshots,
  targetDate,
  active,
}: ForecastEvolutionChartProps) {
  const { temp, wind, dist } = useUnits();
  const [evoVar, setEvoVar] = React.useState<EvoVar>("high");

  if (snapshots.length < 3) {
    return (
      <div>
        <Heading evoVar={evoVar} onVar={setEvoVar} />
        <p className="mono-dim" style={{ fontSize: 12, lineHeight: 1.6, margin: "10px 0 0" }}>
          Tracking just started — the evolution chart fills in as new forecasts arrive. Check back
          as your date nears.
        </p>
      </div>
    );
  }

  // Convert evo y-values to the active display unit (precip stays inches).
  const conv = (y: number): number => {
    if (evoVar === "high") return convTemp(y, temp);
    if (evoVar === "wind") return convWind(y, wind);
    if (evoVar === "freezing") return convDist(y, dist);
    return y;
  };
  const yUnit =
    evoVar === "high"
      ? `°${temp}`
      : evoVar === "wind"
        ? wind === "kmh"
          ? "km/h"
          : "mph"
        : evoVar === "freezing"
          ? dist
          : "in";

  // oldest→newest snapshot date labels (matching evoPoints' reversed order).
  const ordered = [...snapshots].reverse();
  const xLabels = ordered.map((s, i) => ({
    i,
    t: new Date(s.fetchedAt).toLocaleDateString("en-US", { month: "numeric", day: "numeric" }),
  }));

  const seriesRaw = MODELS.map((m) => ({
    ...m,
    faded: !active[m.key],
    points: evoPoints(snapshots, m.key, evoVar, targetDate).map((p) => ({ ...p, y: conv(p.y) })),
  })).filter((s) => s.points.length > 0);

  // agreement band: cross-model min..max per snapshot, x-aligned with the model lines.
  const envRaw = evoEnvelope(snapshots, evoVar, targetDate);
  const env = envRaw.map((p) => ({ x: p.x, min: conv(p.min), max: conv(p.max) }));

  const allY = [
    ...seriesRaw.flatMap((s) => s.points.map((p) => p.y)),
    ...env.flatMap((p) => [p.min, p.max]),
  ];
  const mn = evoVar === "precip" ? 0 : niceMin(Math.min(...allY));
  const mx = niceMax(Math.max(...allY));
  const n = ordered.length - 1;
  const X = sx(0, n, PAD.l, W - PAD.r);
  const Y = sx(mn, mx, H - PAD.b, PAD.t);
  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => mn + (i * (mx - mn)) / yTicks);

  const bandPath =
    env.length > 0
      ? `${poly(env.map((p) => ({ x: X(p.x), y: Y(p.max) })))} ${poly(
          [...env].reverse().map((p) => ({ x: X(p.x), y: Y(p.min) })),
        ).replace(/^M/, "L")} Z`
      : "";

  // Per-model stability chip text + color (displayed delta from converted min/max).
  const fmtHalf = (half: number): string =>
    evoVar === "precip" ? half.toFixed(2) : String(Math.round(half));
  const stabilityOf = (key: ModelKey): { text: string; color: string } => {
    const s = modelStability(snapshots, key, evoVar, targetDate);
    if (s.range == null || s.min == null || s.max == null) {
      return { text: "—", color: "var(--faint)" };
    }
    const half = Math.abs(conv(s.max) - conv(s.min)) / 2;
    return {
      text: `±${fmtHalf(half)} ${yUnit} / ${s.count} runs`,
      color: s.settled ? "var(--good)" : "var(--caution)",
    };
  };

  return (
    <div>
      <Heading evoVar={evoVar} onVar={setEvoVar} />
      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ display: "block", overflow: "visible", marginTop: 12 }}
        role="img"
        aria-label={`Forecast evolution for ${targetDate}`}
      >
        {ticks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.l}
              x2={W - PAD.r}
              y1={Y(t)}
              y2={Y(t)}
              stroke="var(--line)"
              strokeWidth="1"
            />
            <text
              x={PAD.l - 8}
              y={Y(t) + 11 / 3}
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
              fontFamily="var(--mono)"
            >
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text
          x={PAD.l - 8}
          y={PAD.t - 2}
          textAnchor="end"
          fontSize={10}
          fill="var(--faint)"
          fontFamily="var(--mono)"
        >
          {yUnit}
        </text>
        {/* agreement band — faint neutral cross-model spread, behind the lines */}
        {bandPath && <path d={bandPath} fill="var(--muted)" fillOpacity={0.12} stroke="none" />}
        {xLabels.map((lb) => (
          <text
            key={lb.i}
            x={X(lb.i)}
            y={H - PAD.b + 16}
            textAnchor="middle"
            fontSize={11}
            fill="var(--muted)"
            fontFamily="var(--mono)"
          >
            {lb.t}
          </text>
        ))}
        {seriesRaw.map((s) => {
          // E11: faded opacity 0.45 keeps ≥3:1 contrast on glacier light gridlines.
          const op = s.faded ? 0.45 : 1;
          return (
            <g key={s.key}>
              {s.points.length > 1 && (
                <path
                  d={linePath(s.points.map((p) => ({ x: X(p.x), y: Y(p.y) })))}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  opacity={op}
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
        {seriesRaw.map((s) =>
          s.points.map((p: EvoPoint) => (
            <circle
              key={`${s.key}-${p.x}`}
              cx={X(p.x)}
              cy={Y(p.y)}
              r="3.2"
              fill={s.color}
              opacity={s.faded ? 0.45 : 1}
            />
          )),
        )}
      </svg>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 28px", marginTop: 12 }}>
        <div>
          <div className="legend-group-label">Models</div>
          <div className="chart-legend" style={{ marginTop: 6 }}>
            {MODELS.map((m) => {
              const st = stabilityOf(m.key);
              return (
                <span className="legend-item" key={m.key}>
                  <svg width="16" height="6" aria-hidden style={{ overflow: "visible" }}>
                    <line x1="0" y1="3" x2="16" y2="3" stroke={m.color} strokeWidth="2.5" />
                  </svg>
                  {m.label}
                  <span style={{ marginLeft: 6, fontFamily: "var(--mono)", fontSize: 11, color: st.color }}>
                    {st.text}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mono-dim" style={{ fontSize: 11, margin: "10px 0 0", lineHeight: 1.6 }}>
        Lines = each model&apos;s drift. Band = how far apart they are. Chips = how settled each
        model is.
      </p>
    </div>
  );
}

function Heading({ evoVar, onVar }: { evoVar: EvoVar; onVar: (v: EvoVar) => void }) {
  return (
    <h3 style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: 0 }}>
      <span style={{ fontFamily: "var(--mono)", fontSize: 12, textTransform: "uppercase", color: "var(--muted)", letterSpacing: "0.05em" }}>
        Target-day call
      </span>
      <Segmented value={evoVar} onChange={onVar} options={VAR_OPTIONS} ariaLabel="Evolution variable" />
    </h3>
  );
}
```

- [ ] **Step 4: Retune the Model Lab panel title**

In `src/components/modellab/ModelLab.tsx:129`, change the panel title text:

```tsx
            Forecast evolution — are the models locking in?
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- --run src/components/modellab/__tests__/ForecastEvolutionChart.test.tsx`
Expected: PASS (caption, stability chips, "—" empty, existing svg/circles/legend).

Also run the Model Lab test in case it asserts the old panel title:

Run: `npm test -- --run src/components/modellab/__tests__/ModelLab.test.tsx`
Expected: PASS — if it asserts the old "how the target-day call has shifted" string, update that assertion to the new title.

- [ ] **Step 6: Commit**

```bash
git add src/components/modellab/ForecastEvolutionChart.tsx src/components/modellab/ModelLab.tsx src/components/modellab/__tests__/ForecastEvolutionChart.test.tsx
git commit -m "feat(evolution-chart): agreement band + per-model stability chips"
```

---

### Task 7: Full gate + visual verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full unit suite with coverage**

Run: `npm test`
Expected: all green; coverage ≥ 90/90/85. If a `forecast-select` branch is uncovered (e.g. the degenerate single-model envelope or `count` paths), add a targeted test in `forecast-select.test.ts` and re-run.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: success, no type errors.

- [ ] **Step 3: Visual check (both themes, desktop + mobile)**

Per the project's Playwright QA convention, eyeball the two charts:
- Forecast tab (`/mountains/[slug]?target=YYYY-MM-DD`): three labeled model lines braid over the soft band; verdict chip green ("Settling — models agree") / amber ("Still shifting"); legend shows HRRR/GFS/ECMWF in calm blue/slate/teal; no amber/green lines.
- Model Lab (`/mountains/[slug]/models`): faint spread band behind the three colored lines; each legend model shows a "±X / N runs" chip (green/amber) or "—"; new panel title.
- Check the 390px mobile width and the Slate (dark) theme for the new tokens.

- [ ] **Step 4: Commit any coverage top-up tests**

```bash
git add -A
git commit -m "test(forecast-select): cover convergence-chart selector branches"
```

---

## Self-Review

**Spec coverage:**
- Consumer "trust" chart: 3 model lines + soft fill (Task 5), one calm accent + verdict-only color (Tasks 1, 5), labeled models (Tasks 1, 5), reworded chip + trimmed caption (Task 5). ✓
- Expert split: agreement envelope (Task 3 + 6), per-model stability chips with thresholds (Task 2 + 6), retuned heading/caption (Task 6). ✓
- Stability window 3 + per-variable thresholds: `STABILITY_MAX_RANGE` (Task 2). ✓
- Early/empty states unchanged: preserved in both rewrites (Tasks 5, 6). ✓
- Data prep in `forecast-select.ts`, hand-built SVG, no Recharts: Tasks 2–4 are pure selectors; components stay SVG. ✓

**Placeholder scan:** none — every step has concrete code/commands.

**Type consistency:** `modelStability` returns `{ min, max, range, settled, count }` (Task 2) and is consumed exactly so in Task 6 (`s.range`, `s.min`, `s.max`, `s.count`, `s.settled`). `evoEnvelope` returns `{ x, min, max }` (Task 3), consumed as `p.x/p.min/p.max` in Task 6. `modelLeadSeries` returns `{ lead, value }` (Task 4), consumed as `p.lead/p.value` in Task 5. `STABILITY_MAX_RANGE` keys match `EvoVar` (`high|wind|freezing|precip`). Tokens `--model-1/2/3` defined in Task 1, used in Task 5. ✓

**Delta-conversion correctness:** stability display uses `|conv(max) − conv(min)| / 2` (affine offsets cancel) rather than converting `range` directly — avoids the °F→°C offset bug. ✓
