# Phase 1B — Forecast Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Forecast tab *legible at a glance* — per-day severity tile-tint + a wind color scale on the Daily Outlook, a redesigned freezing-level chart (labeled units axis, reference lines, dawn/midday/PM toggle), a "convergence band" call chart that replaces the spaghetti evolution chart on the detail page, and the `<Provenance>` tags wired into the freezing hero + Daily Outlook — without changing any data pipeline or adding new sources.

**Architecture:** A new pure-logic `lib/severity.ts` (TDD'd in isolation) defines the shared color language (wind/precip → `--d1..--d4` danger-ramp levels) consumed by both the Daily Outlook and Model Lab so wind speaks the same color as avalanche danger. The existing hand-built-SVG panels (`DailyOutlook`, `FreezingLevelHero`, `ConfidenceStrip`) are restyled in place; the forecast-evolution chart is **moved** off the detail page into a new `CallChart` convergence component while the detailed all-models `ForecastEvolutionChart` stays in Model Lab. Provenance is wired by mapping Phase-1A's `weatherProvenance()` into the Phase-1A `<Provenance>` component via a small `toProvenanceData()` adapter. No backend/derive-pipeline change — provenance is computed at the UI boundary from the blob (the spec's "pipeline provenance" requirement is satisfied functionally by `weatherProvenance`, already built in 1A).

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, SWR, Zustand (`useUnits`), Vitest + @testing-library/react + vitest-axe, hand-built SVG (NOT Recharts), CSS custom properties in `globals.css`.

## Global Constraints

- **Base branch:** this plan builds **on top of Phase 1A** (branch `feature/phase1a-foundation-flow`, unmerged). Branch from it (e.g. `feature/phase1b-forecast-polish`), NOT from `main` — it depends on `lib/provenance.ts`, `src/components/shared/Provenance.tsx`, the tab shell, and the always-targeted `MountainDetail`/`MountainHeader` that 1A introduced.
- Coverage gate: **90% lines / 90% functions / 85% branches** (Vitest). TDD: failing test first, then implement. Run focused tests with `npm test -- <path>` (the `@/` alias resolves only via `config/vitest.config.ts`, which `npm test` uses).
- `src/components/three/**` is **excluded from coverage** (WebGL un-mountable in jsdom). The 3D units fix (§6.2 bug) was ALREADY completed in Phase 1A (Task 9) — do NOT re-do it.
- Gates that must stay green: `npm test` · `npx tsc --noEmit` · `npm run build` · `npm run test:e2e` (desktop 1280×800 + iPhone 12 + narrow 600px).
- **Color language:** wind/precip/severity reuse the avalanche ramp tokens `--d1`(green) `--d2`(yellow) `--d3`(orange) `--d4`(red). NEVER use `--d5` (near-black `#1d1d1d`/`#050505` = avy "Extreme") for weather — weather severity tops out at 4 (red). Tints are faint washes via `color-mix(in srgb, var(--dN) <pct>%, transparent)`. No hardcoded hex in components.
- Distance/elevation values are **canonical feet** in data; every displayed elevation/distance honors `useUnits().dist` via `fmtDist`. Temp via `convTemp`/`fmtTemp`, wind via `convWind`/`fmtWind`.
- Charts are **hand-built SVG** matching the existing panels. Mobile parity required (reuse `.only-mobile`/`.only-desktop` + `Select`/`Segmented`); every restyled panel keeps a defined ≤680px treatment.
- `<Provenance>` (1A) consumes `ProvenanceData = { label: string; reason: string; meta?: string; href?: string }` and is **loud** (inline reason) only where the model choice changes a decision (the freezing hero); a quiet tag elsewhere (Daily Outlook blend, Confidence strip).
- Design source of truth: the approved spec `docs/superpowers/specs/2026-06-20-data-integrations-and-ux-redesign-design.md` §6.1–§6.5, and the mockups in `.superpowers/brainstorm/42711-1781980940/content/` (`daily-outlook.html`, `freezing-hero.html`, `call-chart.html`).

## Decisions locked for this plan (resolve spec ambiguities up front)

- **Tile-tint severity = worst-of {wind, precip}** for v1. `Cell` (in `lib/derive.ts`) carries `wind`/`gust`/`precip`/`snow`/`pop` but **NOT** freezing level, so the spec's third dimension ("freezing-level-vs-route") is intentionally deferred — adding `fl` to `Cell`/`aggregate` is a derive-layer change out of proportion to the goal, and the dedicated freezing hero already covers that dimension. Spec open-question #13 sanctions "start simple (worst-of), tune later." Document this in the Daily Outlook legend copy (tint reflects wind + precip).
- **Provenance is computed at the UI boundary** via 1A's `weatherProvenance(blob, model, opts)`, not by re-plumbing `lib/derive.ts` to carry a provenance object per value. This satisfies the user-facing requirement (the `<Provenance>` tags) with far less churn (YAGNI). A `toProvenanceData()` adapter bridges the two 1A types.
- **The freezing hero owns its Dawn/Midday/PM toggle as local state.** The Mountain3DCard freezing plane (`MountainDetail` `heroFreezingFt`) stays on the **noon** value (the 3D overlay is a single snapshot); the toggle re-points only the hero chart + featured number. Note this so a reviewer doesn't flag the 3D/hero mismatch as a bug.
- **ConfidenceStrip stays on the Forecast tab** next to the new CallChart and gets a quiet provenance tag; it is NOT replaced by the convergence chart (they are complementary: snapshot-agreement vs run-over-run stability).

---

## File Structure

**New files**
- `src/lib/severity.ts` — wind/precip → severity-level (`1..4`) + token helpers (pure logic).
- `src/lib/__tests__/severity.test.ts`
- `src/components/project/CallChart.tsx` — the convergence-band "is my day's call settling?" chart (replaces the evolution chart on the detail page).
- `src/components/project/__tests__/CallChart.test.tsx`

**Modified files**
- `src/lib/provenance.ts` — add `toProvenanceData()` adapter.
- `src/lib/__tests__/provenance.test.ts` — cover the adapter.
- `src/lib/forecast-select.ts` — add `representativeRow()` (dawn/midday/pm) + `convergenceRuns()`/`convergenceVerdict()`.
- `src/lib/__tests__/forecast-select.test.ts` — cover the new helpers (create if absent).
- `src/components/project/DailyOutlook.tsx` — severity tile-tint, wind color pill, weather-icon tints, blend legend + provenance tag.
- `src/components/project/FreezingLevelHero.tsx` — labeled units Y-axis, reference lines, above/below-freezing shading, Dawn/Midday/PM toggle, featured "X at dawn · ≈N below summit", loud provenance.
- `src/components/project/ConfidenceStrip.tsx` — quiet provenance tag (restyle to convention).
- `src/components/mountain/MountainDetail.tsx` — swap the `ForecastEvolutionChart` block for `<CallChart>`; pass the blob/provenance into the hero + confidence strip.
- `src/components/modellab/HourlyGrid.tsx` + `src/components/modellab/ModelCharts.tsx` — adopt the shared wind color scale; mobile pass.
- `src/app/globals.css` — `.sev-*`, `.wind-pill`, `.dt-ico` tint, freezing-axis, call-chart styles.
- Component icon tinting via `src/components/icons/WeatherIcon.tsx` (accept/forward a tint).

**Unchanged (explicitly):** `src/components/modellab/ForecastEvolutionChart.tsx` stays as the detailed all-models view in Model Lab. `three/FreezingPlane.tsx` + `three/SummitMarker.tsx` (units already fixed in 1A).

---

## Task 1: Foundation — severity/wind-scale lib + provenance adapter

**Files:**
- Create: `src/lib/severity.ts`, `src/lib/__tests__/severity.test.ts`
- Modify: `src/lib/provenance.ts`, `src/lib/__tests__/provenance.test.ts`

**Interfaces:**
- Produces:
  - `type SevLevel = 1 | 2 | 3 | 4`
  - `function windSeverity(mph: number): SevLevel` — `<12→1, 12–25→2, 25–40→3, 40+→4`.
  - `function precipSeverity(c: { precip: number; snow: number; pop: number }): SevLevel`
  - `function tileSeverity(c: { wind: number; precip: number; snow: number; pop: number }): SevLevel` — `max(windSeverity, precipSeverity)`.
  - `function sevToken(level: SevLevel): string` — `` `--d${level}` ``.
  - `function toProvenanceData(p: WeatherProvenance, opts?: { meta?: string }): ProvenanceData` (added to `provenance.ts`).
- Consumes: `WeatherProvenance` (existing, `provenance.ts`); `ProvenanceData` (existing, `Provenance.tsx` — re-export the type or import it). To avoid a component→lib import cycle, **define `ProvenanceData` import via `import type`** from `@/components/shared/Provenance`.

- [ ] **Step 1: Write the failing severity test**

```ts
// src/lib/__tests__/severity.test.ts
import { describe, it, expect } from "vitest";
import { windSeverity, precipSeverity, tileSeverity, sevToken } from "@/lib/severity";

describe("severity", () => {
  it("windSeverity buckets sustained mph per the summit scale", () => {
    expect(windSeverity(5)).toBe(1);
    expect(windSeverity(12)).toBe(2);
    expect(windSeverity(25)).toBe(3);
    expect(windSeverity(40)).toBe(4);
    expect(windSeverity(80)).toBe(4);
  });
  it("precipSeverity: dry < chance < active < heavy", () => {
    expect(precipSeverity({ precip: 0, snow: 0, pop: 5 })).toBe(1);
    expect(precipSeverity({ precip: 0, snow: 0, pop: 50 })).toBe(2);
    expect(precipSeverity({ precip: 0.1, snow: 0, pop: 80 })).toBe(3);
    expect(precipSeverity({ precip: 0, snow: 8, pop: 100 })).toBe(4);
  });
  it("tileSeverity is the worst of wind and precip", () => {
    expect(tileSeverity({ wind: 5, precip: 0, snow: 0, pop: 0 })).toBe(1);
    expect(tileSeverity({ wind: 30, precip: 0, snow: 0, pop: 0 })).toBe(3); // wind dominates
    expect(tileSeverity({ wind: 5, precip: 0.6, snow: 0, pop: 100 })).toBe(4); // precip dominates
  });
  it("sevToken maps to the avalanche ramp (never --d5)", () => {
    expect(sevToken(1)).toBe("--d1");
    expect(sevToken(4)).toBe("--d4");
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npm test -- src/lib/__tests__/severity.test.ts` (module not found).

- [ ] **Step 3: Implement `src/lib/severity.ts`**

```ts
// src/lib/severity.ts
/* Shared severity color language for the Forecast tab. Wind + precip map to the avalanche
   danger ramp (--d1 green … --d4 red) so wind speaks the same color as avy danger.
   NOTE: --d5 (near-black "Extreme") is intentionally never produced — weather tops out at red. */
export type SevLevel = 1 | 2 | 3 | 4;

/** Sustained summit wind (mph): <12 green · 12–25 yellow · 25–40 orange · 40+ red. */
export function windSeverity(mph: number): SevLevel {
  if (mph >= 40) return 4;
  if (mph >= 25) return 3;
  if (mph >= 12) return 2;
  return 1;
}

/** Precip from a cell: heavy (snow≥6in or precip≥0.5in) → 4; active (snow≥0.2 or precip≥0.05) → 3;
    chance (pop≥40) → 2; dry → 1. Thresholds mirror lib/derive.ts precipFor(). */
export function precipSeverity(c: { precip: number; snow: number; pop: number }): SevLevel {
  if (c.snow >= 6 || c.precip >= 0.5) return 4;
  if (c.snow >= 0.2 || c.precip >= 0.05) return 3;
  if (c.pop >= 40) return 2;
  return 1;
}

/** Tile severity = worst of wind and precip (freezing-vs-route deferred — see plan §Decisions). */
export function tileSeverity(c: { wind: number; precip: number; snow: number; pop: number }): SevLevel {
  return Math.max(windSeverity(c.wind), precipSeverity(c)) as SevLevel;
}

export function sevToken(level: SevLevel): string {
  return `--d${level}`;
}
```

- [ ] **Step 4: Run → PASS** — `npm test -- src/lib/__tests__/severity.test.ts`.

- [ ] **Step 5: Write the failing provenance-adapter test** — append to `src/lib/__tests__/provenance.test.ts`:

```ts
import { weatherProvenance, toProvenanceData } from "@/lib/provenance";
// ... reuse the existing blob()/series() helpers in that file ...

describe("toProvenanceData", () => {
  it("labels a plain model and carries the reason", () => {
    const wp = weatherProvenance(blob({ gfs: series() }), "gfs", { variable: "freezing" });
    const d = toProvenanceData(wp);
    expect(d.label).toBe("GFS");
    expect(d.reason.toLowerCase()).toContain("freezing");
    expect(d.href).toBe("/sources");
  });
  it("labels a blend as HRRR→GFS", () => {
    const wp = weatherProvenance(blob({ hrrr: series(), gfs: series() }), "hrrr");
    expect(toProvenanceData(wp).label).toBe("HRRR→GFS");
  });
  it("passes meta through", () => {
    const wp = weatherProvenance(blob({ gfs: series() }), "gfs");
    expect(toProvenanceData(wp, { meta: "updated 12m ago" }).meta).toBe("updated 12m ago");
  });
});
```

- [ ] **Step 6: Run → FAIL**, then add `toProvenanceData` to `src/lib/provenance.ts`:

```ts
import type { ProvenanceData } from "@/components/shared/Provenance";

export function toProvenanceData(p: WeatherProvenance, opts: { meta?: string } = {}): ProvenanceData {
  const label = p.blend ? `${LABELS[p.blend[0].model]}→${LABELS[p.blend[1].model]}` : p.label;
  return { label, reason: p.reason, meta: opts.meta, href: "/sources" };
}
```

(`LABELS` already exists in `provenance.ts`. Ensure `ProvenanceData` is exported from `Provenance.tsx` — it already is.)

- [ ] **Step 7: Run → PASS** — `npm test -- src/lib/__tests__/provenance.test.ts src/lib/__tests__/severity.test.ts`; then `npx tsc --noEmit`.

- [ ] **Step 8: Commit** — `git add src/lib/severity.ts src/lib/__tests__/severity.test.ts src/lib/provenance.ts src/lib/__tests__/provenance.test.ts && git commit -m "feat(forecast): severity/wind-scale lib + provenance→ProvenanceData adapter"`

---

## Task 2: Daily Outlook — severity tile-tint, wind color pill, icon tints, blend provenance

**Files:**
- Modify: `src/components/project/DailyOutlook.tsx`, `src/components/icons/WeatherIcon.tsx`, `src/app/globals.css`
- Test: `src/components/project/__tests__/DailyOutlook.test.tsx` (exists — extend)

**Interfaces:**
- Consumes: `tileSeverity`, `windSeverity`, `sevToken` (Task 1); `toProvenanceData` (Task 1) + `weatherProvenance` (1A) + `<Provenance>` (1A); existing `Cell` fields (`wind`, `gust`, `precip`, `snow`, `pop`, `windDir`, `code`, `src`, `isTarget`); existing `WindArrow`, `precipFor`.
- Produces: tinted tiles (`.day-tile.sev-{1..4}`), a wind pill (`.wind-pill` colored by `windSeverity`), tinted weather icons, and a blend legend + `HRRR→GFS ⓘ` `<Provenance>` tag in the footer legend.

Design facts (from current code): tiles render at `DailyOutlook.tsx` ~lines 384–433; the wind row is `.dt-wind` (currently `WindArrow` + `Icons.wind` + `convWind(c.wind)` + faint gust); icon is `<WeatherIcon code={c.code} />` inside `.dt-ico { color: var(--accent) }`; the footer legend is ~lines 449–477. `--d1..--d4` exist. Reuse `color-mix` for faint backgrounds.

- [ ] **Step 1: Write failing tests** (add to `DailyOutlook.test.tsx`; mock units default). Cover:

```tsx
// 1) a calm day tile (low wind, dry) gets sev-1; a stormy tile (40+ wind) gets sev-4
it("tints each day tile by worst-of wind/precip severity", () => {
  // build a blob where the target day is calm and a later day is stormy (wind 45, snow 8)
  // render; assert the calm tile has class /sev-1/ and the stormy tile has /sev-4/
});
// 2) the sustained-wind pill carries a severity class matching windSeverity
it("renders a color-scaled sustained wind pill", () => {
  // a 30 mph day → the .wind-pill exists with class /sev-3/
});
// 3) the footer shows a blend legend + an HRRR→GFS provenance tag
it("shows the HRRR→GFS blend provenance tag in the legend", () => {
  // assert getByRole("button", { name: /HRRR→GFS/ }) is present (the <Provenance> tag)
  // and the legend text mentions "HRRR" and "GFS"
});
```

Write concrete fixtures using the test file's existing blob builders (mirror `MountainDetail.test.tsx`'s `makeSeries` pattern: set `wind_speed_10m`/`snowfall` per day to drive severity).

- [ ] **Step 2: Run → FAIL** — `npm test -- src/components/project/__tests__/DailyOutlook.test.tsx`.

- [ ] **Step 3: Implement the tile tint** — in the `.day-tile` render, compute `const sev = tileSeverity(c);` and add `` `sev-${sev}` `` to the tile className (alongside `is-target`/`compact`). Severity is computed from the **cell** so the tint carries into AM/Mid/PM and hourly cells automatically (they are all `Cell`s).

- [ ] **Step 4: Implement the wind pill** — replace the bare `convWind(c.wind, wind)` in `.dt-wind` with a `<span className={\`wind-pill sev-${windSeverity(c.wind)}\`}>{convWind(c.wind, wind)}</span>`, keeping the `WindArrow` (direction, no compass letters — already the case) before it and the gust line (`g{convWind(c.gust)}`) after it for non-hourly cells. Keep `Icons.wind` or drop it for space — match the mockup `daily-outlook.html`.

- [ ] **Step 5: Tint the weather icon** — in `src/components/icons/WeatherIcon.tsx`, map the WMO `code` to a tint CSS var and pass it as the icon color: sun→`--wx-sun`, partly→`--wx-sun`, cloud/fog→`--wx-cloud`, rain→`--wx-rain`, snow→`--wx-snow`. Add the `--wx-*` tokens to `globals.css` (sun gold, snow pale-cyan, rain blue, cloud grey — both themes). Apply via `style={{ color: \`var(${tint})\` }}` on the rendered SVG (the `WeatherIcon` already spreads props to the SVG). Keep `.dt-ico` as a fallback color.

- [ ] **Step 6: Add the blend legend + provenance tag** — in the footer legend, render a small blend key `● HRRR hrs 0–48  ● GFS beyond` and a `<Provenance data={toProvenanceData(weatherProvenance(blob, "hrrr"))} />` quiet tag (it yields the `HRRR→GFS` blend label when both models are present; falls back to a single-model label otherwise). Add the copy "Tint = wind + precip severity" to the legend so the tint's meaning is explicit (per plan §Decisions).

- [ ] **Step 7: Add CSS** to `globals.css`:

```css
/* Daily Outlook severity tint (avy ramp, faint) — never --d5 */
.day-tile.sev-1 { background: color-mix(in srgb, var(--d1) 8%, transparent); }
.day-tile.sev-2 { background: color-mix(in srgb, var(--d2) 14%, transparent); }
.day-tile.sev-3 { background: color-mix(in srgb, var(--d3) 16%, transparent); }
.day-tile.sev-4 { background: color-mix(in srgb, var(--d4) 18%, transparent); }
/* target tint wins over severity so the target stays legible */
.day-tile.is-target { background: var(--target-band); }
/* wind pill */
.wind-pill { font-weight: 700; padding: 0 5px; border-radius: 7px; color: var(--ink); }
.wind-pill.sev-1 { background: color-mix(in srgb, var(--d1) 22%, transparent); }
.wind-pill.sev-2 { background: color-mix(in srgb, var(--d2) 30%, transparent); }
.wind-pill.sev-3 { background: color-mix(in srgb, var(--d3) 30%, transparent); color: var(--ink); }
.wind-pill.sev-4 { background: color-mix(in srgb, var(--d4) 34%, transparent); }
/* weather icon tints */
:root { --wx-sun:#d9a531; --wx-cloud:#8b97a3; --wx-rain:#3f7fb0; --wx-snow:#7fc4d6; }
[data-theme="slate"] { --wx-sun:#e6b94e; --wx-cloud:#9aa6b2; --wx-rain:#5cabd8; --wx-snow:#8fd3e6; }
```

(Confirm `.day-tile.is-target` already exists — keep the existing rule; this re-statement documents precedence. Place the severity rules BEFORE the `.is-target` rule so the target rule wins by source order.)

- [ ] **Step 8: Run tests → PASS**, then `npx tsc --noEmit`. Confirm pristine output.

- [ ] **Step 9: Commit** — `git add src/components/project/DailyOutlook.tsx src/components/icons/WeatherIcon.tsx src/app/globals.css src/components/project/__tests__/DailyOutlook.test.tsx && git commit -m "feat(forecast): Daily Outlook severity tile-tint + wind color pill + icon tints + blend provenance"`

---

## Task 3: Freezing-level hero — labeled chart, reference lines, Dawn/Midday/PM toggle, loud provenance

**Files:**
- Modify: `src/lib/forecast-select.ts`, `src/components/project/FreezingLevelHero.tsx`, `src/components/mountain/MountainDetail.tsx`, `src/app/globals.css`
- Test: `src/lib/__tests__/forecast-select.test.ts` (create if absent), `src/components/project/__tests__/FreezingLevelHero.test.tsx` (exists — extend)

**Interfaces:**
- Consumes: `HourRow` (existing); `fmtDist`/`useUnits` (existing); `weatherProvenance`+`toProvenanceData`+`<Provenance>` (1A/Task 1); `mountain.elevations` (`{base,mid,summit}` ft).
- Produces:
  - `type TimeOfDay = "dawn" | "midday" | "pm"` and `function representativeRow(rows: HourRow[], tod: TimeOfDay): HourRow | null` in `forecast-select.ts` (nearest available hour to dawn=6 / midday=12 / pm=17).
  - `FreezingLevelHero` now takes an added prop `prov?: ProvenanceData` (loud provenance) and renders a Dawn/Midday/PM `<Segmented>` that re-points the featured number + dashed featured line; a labeled units Y-axis with `summit`/`mid`/`base` reference lines; above/below-freezing shading; featured copy "X {unit} at {tod} · ≈N {unit} below summit".

- [ ] **Step 1: Write failing `representativeRow` test** in `src/lib/__tests__/forecast-select.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { representativeRow, type HourRow } from "@/lib/forecast-select";
const row = (hour: number, fl: number): HourRow => ({
  t: `2026-06-21T${String(hour).padStart(2,"0")}:00`, hour, date: "2026-06-21", fl,
  tempF: 30, tempFRaw: 30, windMph: 10, windMphRaw: 10, gustMph: 15, precipIn: 0, pop: 0,
  snowIn: 0, code: 1, bandTempF: { base: 50, mid: 35, summit: 28 },
});
describe("representativeRow", () => {
  const rows = [row(0, 9000), row(6, 9500), row(12, 11000), row(17, 10200)];
  it("picks the hour nearest dawn/midday/pm", () => {
    expect(representativeRow(rows, "dawn")?.hour).toBe(6);
    expect(representativeRow(rows, "midday")?.hour).toBe(12);
    expect(representativeRow(rows, "pm")?.hour).toBe(17);
  });
  it("returns null on empty", () => { expect(representativeRow([], "dawn")).toBeNull(); });
});
```

- [ ] **Step 2: Run → FAIL**, then implement in `forecast-select.ts`:

```ts
export type TimeOfDay = "dawn" | "midday" | "pm";
const TOD_HOUR: Record<TimeOfDay, number> = { dawn: 6, midday: 12, pm: 17 };
export function representativeRow(rows: HourRow[], tod: TimeOfDay): HourRow | null {
  if (rows.length === 0) return null;
  const want = TOD_HOUR[tod];
  return rows.reduce((best, r) => (Math.abs(r.hour - want) < Math.abs(best.hour - want) ? r : best), rows[0]);
}
```

(Keep `noonRow` — it is still used by `MountainDetail` for the 3D plane's `heroFreezingFt`.)

- [ ] **Step 3: Run → PASS** — `npm test -- src/lib/__tests__/forecast-select.test.ts`.

- [ ] **Step 4: Write failing hero tests** (add to `FreezingLevelHero.test.tsx`):

```tsx
// 1) renders a Dawn/Midday/PM radiogroup, defaulting to Dawn
it("defaults the featured time to Dawn and exposes a time radiogroup", () => {
  // render with dayRows incl hours 6/12/17 distinct fl; assert role=radio "Dawn" aria-checked
  // and the featured number equals the dawn row's fl (formatted)
});
// 2) switching to PM re-points the featured number
it("re-points the featured freezing number when PM is chosen", () => {
  // click the "PM" radio; assert the featured number now equals the pm row's fl
});
// 3) the Y-axis is labeled in the active distance unit and has summit/mid/base reference lines
it("labels the elevation axis in the active unit with band reference lines", () => {
  // assert text matching /summit/i and the unit label (ft) appear in the SVG
});
// 4) loud provenance renders inline when prov is passed
it("shows the loud provenance reason when prov is provided", () => {
  // render with prov={{label:'GFS', reason:'only model with a freezing field at this range'}}
  // assert the reason text is visible (loud)
});
```

- [ ] **Step 5: Run → FAIL**, then implement the hero changes:
  - Add `const [tod, setTod] = React.useState<TimeOfDay>("dawn");` and `const feat = representativeRow(dayRows, tod) ?? noonRow(dayRows);`. Replace every `noon`/`flNoon` usage in the readout/featured-line with `feat`/`feat?.fl`.
  - Render a `<Segmented value={tod} onChange={setTod} options={[{value:"dawn",label:"Dawn"},{value:"midday",label:"Midday"},{value:"pm",label:"PM"}]} ariaLabel="Featured time of day" />` in the hero readout.
  - Featured copy: `` `${fmtDist(feat.fl, dist)} at ${todLabel}` `` and the takeaway `≈{fmtDist(summit - feat.fl, dist)} below summit` (reuse the existing `takeaway` logic but off `feat.fl`).
  - **Labeled Y-axis:** replace the hardcoded `[4000,8000,12000]` ticks with ticks derived from the chart's elevation domain, each labeled via `fmtDist(elev, dist)` (units-aware), drawn as faint gridlines. Add three **reference lines** at `summit`, `mid`, `base` (the existing `Y()` maps elevation→px) labeled with the band name. **Shade** the area above the featured FL one tint and below another (e.g. `var(--wx-snow)` low-alpha above freezing = frozen, warm tint below) so the route crossing reads instantly.
  - Add `prov?: ProvenanceData` to the props; when present render `<Provenance data={prov} loud />` next to the model label (loud per §6.2).

- [ ] **Step 6: Wire the hero in `MountainDetail.tsx`** — pass `prov={toProvenanceData(weatherProvenance(blob, heroKey, { variable: "freezing" }))}` to `<FreezingLevelHero>` (import `weatherProvenance`, `toProvenanceData`). Leave `heroFreezingFt` (the 3D plane) on `noonRow` (documented decision).

- [ ] **Step 7: Add CSS** for the axis labels/reference lines/shading + the toggle placement (`.hero-axis-label`, `.hero-refline`, `.hero-shade-frozen`/`.hero-shade-warm`, responsive ≤680px: stack the toggle above the figure). Use tokens only.

- [ ] **Step 8: Run tests → PASS**; `npx tsc --noEmit`; check the `vitest-axe` a11y test on the hero still passes (Segmented is already an accessible radiogroup).

- [ ] **Step 9: Commit** — `git add src/lib/forecast-select.ts src/lib/__tests__/forecast-select.test.ts src/components/project/FreezingLevelHero.tsx src/components/mountain/MountainDetail.tsx src/app/globals.css src/components/project/__tests__/FreezingLevelHero.test.tsx && git commit -m "feat(forecast): freezing hero — labeled units axis + reference lines + dawn/midday/PM toggle + loud provenance"`

---

## Task 4: Convergence "call" chart (replaces the detail-page evolution chart) + Confidence-strip provenance

**Files:**
- Modify: `src/lib/forecast-select.ts`, `src/components/mountain/MountainDetail.tsx`, `src/components/project/ConfidenceStrip.tsx`, `src/app/globals.css`
- Create: `src/components/project/CallChart.tsx`, `src/components/project/__tests__/CallChart.test.tsx`
- Test: `src/lib/__tests__/forecast-select.test.ts` (extend)

**Interfaces:**
- Consumes: `WeatherSnapshot`/`ModelDaySummary` (existing); `evoPoints`/`EvoVar` (existing); `convTemp`/`convWind`/`convDist`/`useUnits` (existing); `Segmented` (existing); `weatherProvenance`+`toProvenanceData`+`<Provenance>` (Task 1).
- Produces in `forecast-select.ts`:
  - `interface ConvergenceRun { lead: number; min: number; max: number; mid: number }` — `lead` = whole days from the snapshot's issue date to `targetDate`.
  - `function convergenceRuns(snaps: WeatherSnapshot[], variable: EvoVar, targetDate: string): ConvergenceRun[]` — oldest→newest; per snapshot gather the 3 models' values for `targetDate`, drop runs with <1 model; `min`/`max`/`mid` across the available models.
  - `function convergenceVerdict(runs: ConvergenceRun[]): { firming: boolean; recentSpread: number; earlierSpread: number }` — compares the most-recent run's spread (`max-min`) to the mean spread of the earlier runs; `firming = recentSpread <= earlierSpread`.
- Produces `CallChart({ snapshots, targetDate, mountain }: { snapshots: WeatherSnapshot[]; targetDate: string; mountain: Pick<Mountain,"elevations"> })` — a convergence-band SVG (per-run min..max envelope across lead time, narrowing = settling), a verdict chip ("Firming up" / "Still volatile"), a one-line teaching caption, and a variable `<Segmented>` (Temp/Wind/Freezing/Precip).

- [ ] **Step 1: Write failing convergence-helper tests** (add to `forecast-select.test.ts`). Build ≥3 snapshots whose `targetDate` model values narrow over time; assert `convergenceRuns` length + that `convergenceVerdict(...).firming === true` when the latest run's spread is smallest, `false` when it widens. Include the empty/sparse case (`convergenceRuns([],…) === []`).

- [ ] **Step 2: Run → FAIL**, then implement `convergenceRuns`/`convergenceVerdict` (reuse `EVO_FIELD` + the snapshot reading already in `evoPoints`; compute `lead` from `Date` diff of `s.fetchedAt` date vs `targetDate` in whole days).

- [ ] **Step 3: Run → PASS**.

- [ ] **Step 4: Write failing `CallChart` test** (`CallChart.test.tsx`). Cover: (a) renders the verdict chip text "Firming up" for narrowing fixtures; (b) the variable Segmented switches the charted variable (role=radiogroup, switching to "Wind" re-renders without NaN paths); (c) the teaching caption is present; (d) sparse (<3 snapshots) → a calm empty state, no chart; (e) `vitest-axe` clean.

- [ ] **Step 5: Run → FAIL**, then implement `CallChart.tsx`: a hand-built SVG (model the geometry on `ForecastEvolutionChart.tsx` — `PAD`, `linePath`, `sx` from `@/components/charts/chart-utils`). Draw the **band** as a filled `<path>` between the `max` polyline and the reversed `min` polyline (`fill` a faint accent), a `mid` line on top, X = `lead` (days before target, decreasing toward 0 = now), Y = the variable's value in the active unit (labeled axis). Verdict chip uses `convergenceVerdict`; caption explains "narrowing band = the forecast is settling". Variable toggle via `<Segmented>`.

- [ ] **Step 6: Swap into `MountainDetail.tsx`** — replace the `{inRange && snapshots && (<div className="panel">…<ForecastEvolutionChart …/></div>)}` block (~lines 164–173) with a `<CallChart snapshots={snapshots} targetDate={effectiveTarget} mountain={{ elevations }} />` panel (PanelHead kicker "The call" / title "Is your day's forecast settling?"). Remove the now-unused `ForecastEvolutionChart` import from `MountainDetail` (it stays imported in Model Lab). Keep the Model-Lab link.

- [ ] **Step 7: Confidence-strip provenance** — in `ConfidenceStrip.tsx`, add a quiet `<Provenance data={toProvenanceData(weatherProvenance(blob, chooseTargetModel(blob, targetDate)))} />` tag in the `conf-lead`/header area (it already imports the blob). Keep all existing flags/logic. This is the "restyle to provenance convention" the spec asks for.

- [ ] **Step 8: Update tests** — `MountainDetail.test.tsx`: the assertion that previously checked for the evolution heading ("how the target-day call has shifted") must change to the new CallChart heading ("is your day's forecast settling" / verdict chip). `tests/e2e/focused.spec.ts` + `shareable.spec.ts` assert `/how the target-day call has shifted/i` — update those to the new CallChart copy (the detailed evolution chart now lives only in Model Lab). Grep: `rg -n "target-day call has shifted" src tests` and update every hit.

- [ ] **Step 9: Run gates** — `npm test`, `npx tsc --noEmit`, `npm run build`. (Full e2e runs in Task 6.)

- [ ] **Step 10: Commit** — `git add -A && git commit -m "feat(forecast): convergence call chart replaces detail evolution chart; confidence-strip provenance"`

---

## Task 5: Model Lab consistency pass (wind color scale + mobile) + reconciliation

**Files:**
- Modify: `src/components/modellab/HourlyGrid.tsx`, `src/components/modellab/ModelCharts.tsx`, `src/app/globals.css`
- Test: `src/components/modellab/__tests__/HourlyGrid.test.tsx`, `ModelCharts.test.tsx` (extend)

**Context (verified):** The post-POC a11y nits the spec lists are **already fixed** — HourlyGrid has glyphs (`❄`/`△`) + `aria-label` + `<th scope="row">`; `Segmented` is `role="radiogroup"`; `ForecastEvolutionChart` has a model-name legend; `ModelCharts`/`LineChart`/`BarChart` already have units-aware labeled axes + per-chart legends; `ModelInfo` ("About the models") exists. So this task is the **remaining** §6.5 work only: adopt the shared wind color scale for consistency with the redesigned Forecast tab, and a mobile pass. The detailed all-models `ForecastEvolutionChart` already lives here and is **kept** (the detail page now uses `CallChart`) — no move needed, just confirm.

**Interfaces:**
- Consumes: `windSeverity`/`sevToken` (Task 1).

- [ ] **Step 1: Write failing tests** — `HourlyGrid.test.tsx`: a high-wind cell carries a severity color class (`/sev-3/` or `/sev-4/`) in addition to its existing `△` glyph + aria-label (so the grid's wind coloring matches the Daily Outlook scale). `ModelCharts.test.tsx`: assert the wind chart's high-wind reference/threshold or legend uses the shared scale (assert the presence of the severity token class on the relevant element — keep it minimal and real).

- [ ] **Step 2: Run → FAIL**, then implement: in `HourlyGrid` wind/gust cells, add `` className={`... sev-${windSeverity(r.windMph)}`} `` (keep the existing `△` glyph + aria-label — do NOT regress the a11y signals). In `ModelCharts`, apply the shared wind color scale to the wind chart's high-wind shading/threshold line (minimal — reuse `windSeverity`/`sevToken`); leave the model-identity colors (`--accent`/`--caution`/`--good`) as-is (those are model identity, not severity).

- [ ] **Step 3: Add the wind-severity cell CSS** (if the `.sev-*` text-color variant isn't already covered) — `.hourly-grid td.sev-3 { color: var(--d3); } .hourly-grid td.sev-4 { color: var(--d4); font-weight:700; }` (text color, not background, to keep the dense grid legible).

- [ ] **Step 4: Mobile pass** — verify the Model Lab charts + grid have a defined ≤680px treatment (horizontal scroll on the grid, charts shrink); reuse existing patterns. Add any missing `.only-mobile`/scroll rule. Capture is verified in Task 6's e2e.

- [ ] **Step 5: Run tests → PASS**; `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(modellab): adopt shared wind color scale + mobile pass; reconcile with Forecast CallChart"`

---

## Task 6: Final gates + visual QA

**Files:** none new (verification + any straggler fixes).

- [ ] **Step 1: Full suite** — run, fixing failures (stale assertions vs real regressions; the app is the source of truth):
  - `npm test` (coverage ≥ 90/90/85 — the new `CallChart`/severity/hero branches must be covered).
  - `npx tsc --noEmit`
  - `npm run build`
  - `npm run test:e2e` (desktop + mobile + narrow). Update any e2e spec still asserting the removed evolution-chart copy on the detail page (the detailed evolution lives in Model Lab now; the detail page shows the CallChart verdict). The Model Lab spec (`model-lab.spec.ts`) should still pass (the evolution chart is unchanged there).
- [ ] **Step 2: Controller visual QA** — capture the restyled Forecast tab (Daily Outlook tint/wind pill, freezing hero with Dawn/Midday/PM, CallChart) across desktop + mobile + both themes (glacier/slate) with the route-mock harness; inspect the rendered pixels adversarially (legibility of the tint ramp, wind-pill contrast in both themes, axis labels readable, verdict chip correct, mobile step/stack intact). Fix any layout/contrast issues found (e.g. `color-mix` percentages, dark-theme pill text contrast). This mirrors the Phase-1A visual-QA step.
- [ ] **Step 3: Commit any QA fixes** — `git commit -m "fix(forecast): phase-1B visual-QA polish"` (only if fixes were needed).

---

## Self-Review (completed)

**Spec coverage (§6 Forecast tab, the Phase-1B slice):**
- §6.1 Daily Outlook tile-tint + wind color scale + colored icons + target emphasis + blend provenance → Task 1 (severity lib) + Task 2. Target emphasis already exists (`.is-target` + `dt-flag`) and is preserved (target tint wins). Freezing-vs-route dimension deferred (documented §Decisions). ✓
- §6.2 Freezing chart: labeled units axis + reference lines + above/below shading + Dawn/Midday/PM toggle + featured number + loud provenance → Task 3. 3D units fix already done in 1A (not re-done). Card-flip mini-3D stays (untouched). ✓
- §6.3 Convergence call chart + verdict chip + caption + variable toggle, move detailed evolution to Model Lab, Confidence strip stays + provenance → Task 4. ✓
- §6.5 Model Lab cleanup → Task 5 (the a11y nits are already fixed — verified; only wind-scale + mobile remain). ✓
- §3.1 / §10.5 provenance wired into the UI → Tasks 1 (adapter), 2 (Daily Outlook tag), 3 (loud hero), 4 (confidence tag). Boundary-computed via `weatherProvenance` (documented §Decisions). ✓
- §3.3 units honored / §3.4 mobile parity / §11 gates → enforced per task (Global Constraints) + Task 6.

**Placeholder scan:** No "TBD/TODO". Pure-logic helpers (severity, `representativeRow`, `convergence*`, `toProvenanceData`) have full code + concrete tests. UI/SVG steps specify exact files/lines, exact tokens/classes, exact behaviors, and concrete test assertions, leaning on the existing chart-utils (`linePath`/`sx`) and `Segmented` rather than re-deriving — the SVG bodies are restyles of named existing components, not new inventions.

**Type consistency:** `SevLevel` (Task 1) consumed by Tasks 2 & 5. `toProvenanceData` returns the existing `ProvenanceData` (1A) consumed by Tasks 2/3/4. `TimeOfDay`/`representativeRow` (Task 3) self-contained. `ConvergenceRun`/`convergenceRuns`/`convergenceVerdict` (Task 4) consumed by `CallChart` (Task 4). `EvoVar` reused unchanged. `weatherProvenance` signature unchanged from 1A. Consistent.

**Possible split:** If executed in one pass this is sizable (Daily Outlook, freezing hero, and CallChart are each substantial UI tasks). The tasks are ordered so Task 1→2 alone already ships the user's top complaint (the flat Daily Outlook). A reviewer could reasonably approve/reject each task independently — the plan holds together as one cohesive "Forecast polish" slice, but Tasks 3–4 could be carved into a 1B-2 plan if you prefer smaller increments.
