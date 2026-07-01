# Phase 2B — Safety Tab UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Safety tab UI on top of the Phase-2A backend — five new panels (AirQuality, Storm, Volcano, Seismic, ParkAlerts) ordered most-actionable-first beside the existing Avalanche panel, the AirQuality + Storm header hazard chips (fed by `hazards-summary`, storm-red taps to the Safety tab), and a `<Provenance>` tag on every panel (source · distance · freshness) — with graceful per-peak/per-feed degradation.

**Architecture:** Six SWR hooks (one per 2A route) fetch in `MountainDetail`/`MountainHeader` and pass typed data props down to presentational panels (the established AvalanchePanel/SnowpackPanel pattern — panels never self-fetch; the parent owns loading/error). A `sourceProvenance(SourceMeta)` adapter bridges the 2A `SourceMeta` to Phase-1A's `<Provenance>` component. The chip row gains `airQualityChip`/`stormChip` mappers driven by `hazards-summary`. `MountainTabs` becomes URL-param-aware (`?tab=`) so the storm chip can deep-link to Safety and tabs are shareable. No backend changes (2A is deployed).

**Tech Stack:** Next.js 16 App Router, React 19, SWR, TypeScript, Vitest + @testing-library/react + vitest-axe, hand-built SVG (`AreaSpark`), CSS custom properties in `globals.css`.

## Global Constraints

- **Base branch:** branch from `main` (Phase 2A is merged + deployed). Use `feature/phase2b-safety-ui`.
- Coverage gate: **90% lines / 90% functions / 85% branches** (Vitest). TDD: failing test first.
- Gates: `npm test` · `npx tsc --noEmit` · `npm run build` · `npm run test:e2e` (desktop 1280×800 + iPhone 12 + narrow 600). The 2A routes are read-only and deployed; the e2e is route-mocked locally and reusable live via `PLAYWRIGHT_BASE_URL`.
- **Panels are presentational** — each takes a single typed data prop (`airQuality: AirQuality | null | undefined`), NOT a slug. `MountainDetail` calls the hooks and passes data down; it owns the per-panel loading (`<Skeleton variant="panel">`) and error (`<PanelError label onRetry={mutate}>`). Panels render only their own no-data/empty states (inline `<p className="mono-dim">`). Match `AvalanchePanel`/`SnowpackPanel` exactly: inline `<div className="panel-head"><div><div className="kicker">SOURCE · {meta}</div><h3>Title</h3></div>{right}</div>` (NOT the `PanelHead` component, which is for tab-level `h2` heads).
- **Provenance on every panel:** `<Provenance data={sourceProvenance(data.provenance, {distanceLabel})} />` — source · distance · freshness. Quiet tag (not loud).
- **Graceful degradation (spec §3.2/§7):** a panel is OMITTED entirely when its feed is unavailable — Volcano only when `mountain.hansVolcanoId`, ParkAlerts only when `mountain.npsParkCode`, AirQuality/Storm/Seismic when the hook returns data (a 404 from the route → `error.status===404` → omit, don't show an error). Distinguish 404 (omit panel) from 5xx/network (show `PanelError` with retry).
- **Color language:** AQI category + alert/closure colors reuse the avalanche ramp `--d1`(green) `--d2`(yellow) `--d3`(orange) `--d4`(red) `--d5`(maroon) + `--good/--caution/--alert`. NO new hardcoded hex in components.
- **Chips (spec §4):** three chips — Avalanche (exists), AirQuality, Storm. Storm chip shows only when a storm is active (red, `--d4`) and **taps to the Safety tab**; AirQuality chip shows whenever AQI data exists, colored by category. Fed by `useMountainHazardsSummary` (page-load roll-up). **No page-level banner** (the mockup's banner option was rejected — storm-red taps to Safety instead).
- Mobile parity: panels stack; the chip row wraps (`.hz-row` already wraps). Hand-built SVG only (no Recharts).
- Design source of truth: spec §4, §7 (`docs/superpowers/specs/2026-06-20-data-integrations-and-ux-redesign-design.md`) + the mockup `.superpowers/brainstorm/42711-1781980940/content/safety-tab.html` (note: the page-level banner shown there is NOT built).

## Data types (from `src/lib/hazards/types.ts`, already shipped in 2A)

```ts
AirQuality   { aqi; categoryNumber; categoryName; parameter; reportingArea; trend: {date;aqi}[]; provenance: SourceMeta }
StormAlerts  { nws: {event;severity;urgency;headline;onset;expires;areaDesc}[]; spc: {label;label2}|null; stormActive; provenance }
VolcanoStatus{ name; colorCode; alertLevel; nvewsThreat|null; noticeUrl|null; provenance }
SeismicSummary { count30d; count7d; largestMag|null; swarm; events: {mag;place;time;depthKm;type;status}[]; provenance }
ParkAlerts   { alerts: {category;title;description;url;parkCode;lastIndexedDate}[]; provenance }
HazardsSummary { aqi: {value;category}|null; storm: {active;label}|null; provenance }
SourceMeta   { source; observedAt?; distanceMi?; note? }
```

---

## File Structure

**New files**
- `src/components/project/AirQualityPanel.tsx` (+ `__tests__`)
- `src/components/project/StormPanel.tsx` (+ `__tests__`)
- `src/components/project/VolcanoPanel.tsx` (+ `__tests__`)
- `src/components/project/SeismicPanel.tsx` (+ `__tests__`)
- `src/components/project/ParkAlertsPanel.tsx` (+ `__tests__`)
- `tests/e2e/safety-tab.spec.ts`

**Modified files**
- `src/lib/hooks.ts` — 6 new hooks.
- `src/lib/provenance.ts` — `sourceProvenance(meta, opts?)` adapter (+ test).
- `src/components/mountain/HazardChips.tsx` — `airQualityChip` + `stormChip` mappers.
- `src/components/mountain/MountainHeader.tsx` — wire `useMountainHazardsSummary` + the two chips.
- `src/components/mountain/MountainTabs.tsx` — URL-param-aware (`?tab=`) controlled-by-URL behavior.
- `src/components/mountain/MountainDetail.tsx` — fetch 5 feeds, assemble the Safety tab.
- `src/app/globals.css` — AQI/alert color helpers, panel/spark styling.
- `tests/e2e/_mock.ts` + `tests/e2e/_fixtures.ts` — fixtures for the 6 new endpoints (so all route-mocked detail specs keep passing).

---

## Task 1: SWR hooks + `sourceProvenance` adapter

**Files:** Modify `src/lib/hooks.ts`, `src/lib/provenance.ts`; Test `src/lib/__tests__/provenance.test.ts` (extend) + `src/lib/__tests__/hooks` (if a hooks test exists; else assert hooks indirectly via the panel tests).

**Interfaces:**
- Produces 6 hooks (mirror `useMountainSnotel`, each returns `{ <alias>, isLoading, error, mutate }` — include `mutate` for `PanelError` retry):
  `useMountainAirQuality→airQuality:AirQuality`, `useMountainAlerts→alerts:StormAlerts`, `useMountainVolcano→volcano:VolcanoStatus`, `useMountainSeismic→seismic:SeismicSummary`, `useMountainParkAlerts→parkAlerts:ParkAlerts`, `useMountainHazardsSummary→summary:HazardsSummary`. URLs `/api/mountains/${slug}/{air-quality,alerts,volcano,seismic,park-alerts,hazards-summary}`.
- `function sourceProvenance(meta: SourceMeta, opts?: { reason?: string; href?: string }): ProvenanceData` in `provenance.ts`.

- [ ] **Step 1: Write the failing `sourceProvenance` test** (add to `provenance.test.ts`):

```ts
import { sourceProvenance } from "@/lib/provenance";
describe("sourceProvenance", () => {
  it("maps source + distance + freshness into the meta line", () => {
    const d = sourceProvenance({ source: "AirNow", observedAt: "2026-06-20T18:00:00Z", distanceMi: 22, note: "Enumclaw reporting area" });
    expect(d.label).toBe("AirNow");
    expect(d.reason).toContain("Enumclaw");
    expect(d.meta).toContain("22 mi");
    expect(d.href).toBe("/sources");
  });
  it("omits the distance when absent and falls back to a generic reason", () => {
    const d = sourceProvenance({ source: "USGS ComCat" });
    expect(d.meta ?? "").not.toContain("mi");
    expect(d.reason).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement in `provenance.ts`:

```ts
import { formatTimeAgo } from "@/lib/format";
import type { SourceMeta } from "@/lib/hazards/types";

export function sourceProvenance(meta: SourceMeta, opts: { reason?: string; href?: string } = {}): ProvenanceData {
  const parts: string[] = [];
  if (meta.distanceMi != null) parts.push(`${Math.round(meta.distanceMi)} mi`);
  if (meta.observedAt) parts.push(formatTimeAgo(meta.observedAt));
  return {
    label: meta.source,
    reason: opts.reason ?? meta.note ?? `Live reading from ${meta.source}.`,
    meta: parts.join(" · ") || undefined,
    href: opts.href ?? "/sources",
  };
}
```

(`ProvenanceData` is imported with `import type` already in `provenance.ts` from Task-1A; `SourceMeta` import is new.)

- [ ] **Step 3: Add the 6 hooks** to `hooks.ts` (follow `useMountainSnotel` verbatim; include `mutate`). Example:

```ts
import type { AirQuality, StormAlerts, VolcanoStatus, SeismicSummary, ParkAlerts, HazardsSummary } from "@/lib/hazards/types";

export function useMountainAirQuality(slug: string) {
  const { data, error, isLoading, mutate } = useSWR<AirQuality>(slug ? `/api/mountains/${slug}/air-quality` : null, fetcher);
  return { airQuality: data, isLoading, error, mutate };
}
// …repeat for alerts/volcano/seismic/park-alerts/hazards-summary with their generic + alias…
```

- [ ] **Step 4: Run tests + tsc** — `npm test -- src/lib/__tests__/provenance.test.ts && npx tsc --noEmit`. (Hooks are exercised by the panel/assembly tasks.)

- [ ] **Step 5: Commit** — `git add src/lib/hooks.ts src/lib/provenance.ts src/lib/__tests__/provenance.test.ts && git commit -m "feat(safety): SWR hooks for the 6 hazard routes + sourceProvenance adapter"`

---

## Task 2: AirQualityPanel

**Files:** Create `src/components/project/AirQualityPanel.tsx` + `__tests__/AirQualityPanel.test.tsx`; Modify `globals.css`.

**Interfaces:** `AirQualityPanel({ airQuality }: { airQuality: AirQuality | null | undefined })`. Consumes `AreaSpark` (`@/components/charts/AreaSpark`), `<Provenance>` + `sourceProvenance`, `formatTimeAgo`. Produces a panel: big AQI number colored by `aqiToken(categoryNumber)`, the category name + dominant `parameter`, the reporting-area name + distance ("valley monitor, not summit") caveat, a smoke caveat line when `parameter==="PM2.5" && aqi>=100`, a 7-day `AreaSpark` of `trend.map(t=>({v:t.aqi}))`, and the `<Provenance>` tag. Renders `null` when `airQuality` is null/undefined (parent decides skeleton/omit).

Add to `globals.css` an `aqi`-aware helper used inline via a token: define `aqiToken(n)` in the component (1→`--d1`, 2→`--d2`, 3→`--d3`, 4→`--d4`, 5→`--d4`, 6→`--d5`) and color the `.aqi-num` via inline `style={{color:`var(${aqiToken(n)})`}}`. Add `.aqi-num { font-family: var(--serif); font-size: 26px; font-weight: 700; }` + `.aqi-row { display:flex; gap:14px; align-items:center; }`.

- [ ] **Step 1: Write failing tests** — (a) AQI 112 / category "Unhealthy for Sensitive Groups" / PM2.5 → renders "112", the category, and the reporting area + distance; (b) the smoke caveat line appears when PM2.5 & aqi≥100, absent for AQI 30; (c) a `<Provenance>` button labeled /AirNow/ renders; (d) trend with ≥2 points renders an `AreaSpark` (assert an `svg[role="img"]` with an aria-label mentioning AQI); (e) `airQuality` null → renders nothing (`container.firstChild===null`); (f) vitest-axe clean (use the shared `expectNoA11yViolations`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** the panel (inline `panel-head` pattern; kicker `AirNow · {reportingArea}`; title "Air quality & smoke"; right slot `<LastUpdated iso={airQuality.provenance.observedAt ?? null} prefix="Observed" />`). Distance caveat copy: `` `Nearest monitor ${Math.round(distanceMi)} mi away (valley) — the summit may differ.` `` when `distanceMi` present.
- [ ] **Step 4: Run → PASS**, `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): AirQualityPanel (AQI + category + distance caveat + 7-day spark + provenance)"`

---

## Task 3: StormPanel

**Files:** Create `StormPanel.tsx` + test.

**Interfaces:** `StormPanel({ alerts }: { alerts: StormAlerts | null | undefined })`. Renders: each NWS alert (`event` + a tone dot by `severity`, `headline`, expires time via `formatTimeAgo`/absolute), the SPC line ("SPC Day-1: {spc.label2}") when `spc` present, and a quiet "No active storm risk." state when `nws` empty and `spc` null. `<Provenance>` from `alerts.provenance` ("NWS + SPC"). Null prop → render nothing.

- [ ] **Step 1: Write failing tests** — (a) an active "Severe Thunderstorm Warning" → the event + headline render with an alert-tone dot; (b) `spc.label2="General Thunderstorms"` → an SPC line shows it; (c) empty `nws` + null `spc` → the quiet "No active storm risk" copy, no alert dot; (d) Provenance /NWS/ tag; (e) axe clean.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** (inline panel-head; kicker "NWS + SPC"; title "Storm & lightning risk"). Severity→tone: Extreme/Severe→`--alert`, Moderate→`--caution`, else `--muted`.
- [ ] **Step 4: Run → PASS**, tsc.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): StormPanel (NWS warnings + SPC day-1 + quiet state + provenance)"`

---

## Task 4: VolcanoPanel

**Files:** Create `VolcanoPanel.tsx` + test.

**Interfaces:** `VolcanoPanel({ volcano }: { volcano: VolcanoStatus | null | undefined })`. Renders: a color dot from `colorCode` (GREEN→`--d1`, YELLOW→`--d2`, ORANGE→`--d3`, RED→`--d4`), `{alertLevel} / {colorCode}` bold, the `nvewsThreat` ("Very High Threat volcano"), and a "latest notice →" link to `noticeUrl` (when present, `target=_blank rel=noopener`). `<Provenance>` "USGS HANS". Null → render nothing.

- [ ] **Step 1: Write failing tests** — (a) GREEN/NORMAL → "NORMAL / GREEN" text + a green dot (assert the dot's inline `--d1` background) + the nvews threat; (b) RED/WARNING → `--d4` dot; (c) `noticeUrl` present → a link with the right href + `rel="noopener"`; (d) Provenance /HANS/; (e) axe clean.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** (kicker "USGS HANS"; title "Volcano status"). Map colorCode→token via a small `COLOR_TOKEN` record; default unknown colors to `--muted`.
- [ ] **Step 4: Run → PASS**, tsc.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): VolcanoPanel (alert level + color + threat + notice link)"`

---

## Task 5: SeismicPanel

**Files:** Create `SeismicPanel.tsx` + test.

**Interfaces:** `SeismicPanel({ seismic }: { seismic: SeismicSummary | null | undefined })`. Renders: a summary line (`{count30d} events in 30 days within ~30 km` + `largest M{largestMag}`), the most-recent ~5 events (`M{mag} · {place} · {depthKm} km deep` + `formatTimeAgo(time)`), a **swarm badge** (`--d3` tinted "Swarm") when `seismic.swarm`, and a calm "near the normal baseline. No swarm." line otherwise. `<Provenance>` "USGS ComCat · 30 km · 30 days". Empty (`count30d===0`) → "No recent earthquakes within ~30 km." Null → render nothing.

- [ ] **Step 1: Write failing tests** — (a) 11 events + largestMag 1.8 → summary text + the events list (assert a "M1.8" event + its relative time); (b) `swarm:true` → a "Swarm" badge present; `swarm:false` → the baseline copy; (c) `count30d:0` → the no-quakes copy, no event rows; (d) Provenance /ComCat/; (e) axe clean.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** (kicker "USGS ComCat"; title "Recent earthquakes"; events via the existing `.evt` flex-row class from the mockup — add `.evt` CSS if absent). Cap the displayed events at 5 (the route already caps the payload at 15).
- [ ] **Step 4: Run → PASS**, tsc.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): SeismicPanel (count + recent events + swarm badge)"`

---

## Task 6: ParkAlertsPanel

**Files:** Create `ParkAlertsPanel.tsx` + test.

**Interfaces:** `ParkAlertsPanel({ parkAlerts }: { parkAlerts: ParkAlerts | null | undefined })`. Renders each alert as a row colored by `category` (Danger→`--d4`, Closure→`--d3`, Caution→`--d2`, Information→`--accent`) with a glyph (⛔ closure, ⚠ caution/danger, ℹ info) + the `title`, linking to `url`. Empty `alerts` → "No active park alerts." `<Provenance>` "NPS". Null → render nothing.

- [ ] **Step 1: Write failing tests** — (a) a Closure + a Caution → both titles render, the Closure row carries the `--d3` color and the Caution `--d2` (assert via class or inline style); (b) each row links to its `url`; (c) empty alerts → the no-alerts copy; (d) Provenance /NPS/; (e) the category color/glyph is not color-only (a text category label or glyph + aria is present); (f) axe clean.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** (kicker "NPS · {parkCode upper}"; title "Park alerts & closures"). `CATEGORY` record maps category→{token, glyph}; default unknown→`--muted`/ℹ.
- [ ] **Step 4: Run → PASS**, tsc.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): ParkAlertsPanel (category-coded alerts + links)"`

---

## Task 7: AirQuality + Storm hazard chips + header wiring

**Files:** Modify `src/components/mountain/HazardChips.tsx` + its test; `src/components/mountain/MountainHeader.tsx` + its test.

**Interfaces:**
- `airQualityChip(summary: HazardsSummary | undefined, onClick?: () => void): HazardChip | null` — `null` when `summary?.aqi == null`; else `{ key:"aqi", label:`AQI ${summary.aqi.value}`, tokenVar: aqiCatToken(summary.aqi.category), onClick }`.
- `stormChip(summary: HazardsSummary | undefined, onClick?: () => void): HazardChip | null` — `null` unless `summary?.storm?.active`; else `{ key:"storm", label:"Storm", tokenVar:"--d4", onClick }`.
- `aqiCatToken(category: string)` maps the category NAME → token (Good→`--d1`, Moderate→`--d2`, "Sensitive"→`--d3`, "Unhealthy"→`--d4`, "Very Unhealthy"→`--d4`, "Hazardous"→`--d5`).

- [ ] **Step 1: Write failing chip tests** (`HazardChips.test.tsx`) — (a) `airQualityChip({aqi:{value:112,category:"Unhealthy for Sensitive Groups"},storm:null,provenance})` → label "AQI 112", tokenVar `--d3`; (b) `airQualityChip` with `aqi:null` → null; (c) `stormChip` with `storm:{active:true,label:"..."}` → label "Storm", `--d4`, and the onClick is carried; (d) `stormChip` with `storm:{active:false}` → null.
- [ ] **Step 2: Run → FAIL**, implement the two mappers + `aqiCatToken` in `HazardChips.tsx`.
- [ ] **Step 3: Run → PASS.**
- [ ] **Step 4: Wire the header** — in `MountainHeader.tsx` add `const { summary } = useMountainHazardsSummary(slug);` and extend the chips array:

```ts
const chips = [
  avalancheChip(nwac),
  airQualityChip(summary),
  stormChip(summary, () => router.replace(`/mountains/${slug}?target=${effectiveTarget}&tab=safety`, { scroll: false })),
].filter(Boolean) as HazardChip[];
```

(the storm `onClick` deep-links to the Safety tab via the `?tab=` param Task 8 adds; `router` already exists in the header). Update `MountainHeader.test.tsx`: mock `useMountainHazardsSummary`; assert the AQI chip renders when summary has aqi, and clicking the Storm chip calls `router.replace` with `tab=safety`.
- [ ] **Step 5: Run header tests + tsc → green.**
- [ ] **Step 6: Commit** — `git commit -m "feat(safety): AirQuality + Storm header chips fed by hazards-summary"`

---

## Task 8: URL-param-aware MountainTabs (`?tab=`)

**Files:** Modify `src/components/mountain/MountainTabs.tsx` + `MountainTabs.test.tsx`.

**Interfaces:** `MountainTabs` keeps its `{ tabs, initial }` API but additionally reads/writes the `?tab=` search param: the active tab initializes from `?tab=` (falling back to `initial ?? tabs[0].key`), updates the URL (`router.replace`, `scroll:false`) on tab click, and reacts to external `?tab=` changes (so the storm chip's `router.replace(...&tab=safety)` switches the panel). Use `useSearchParams` + `useRouter`/`usePathname` from `next/navigation`. Guard against an unknown `?tab=` value (fall back to the default). Keep all existing ARIA/roving-focus behavior + tests green.

- [ ] **Step 1: Write failing tests** — mock `next/navigation` (`useSearchParams` returns a `URLSearchParams`, `useRouter` a `{replace:vi.fn()}`, `usePathname`). (a) `?tab=safety` present → the Safety panel is active on first render; (b) clicking a tab calls `router.replace` with the new `?tab=`; (c) an unknown `?tab=bogus` → falls back to the first tab; (d) existing tests (default first tab, click switches, aria-selected, axe) still pass.
- [ ] **Step 2: Run → FAIL**, implement the URL-aware behavior (derive `active` from the search param with a `useState`+`useEffect` sync, or compute directly from `searchParams.get("tab")` validated against `tabs`).
- [ ] **Step 3: Run → PASS**, `npx tsc --noEmit`.
- [ ] **Step 4: Commit** — `git commit -m "feat(ia): MountainTabs reads/writes ?tab= so the Storm chip deep-links to Safety"`

---

## Task 9: Safety-tab assembly + e2e fixtures/mocks + spec

**Files:** Modify `src/components/mountain/MountainDetail.tsx` + `MountainDetail.test.tsx`; `tests/e2e/_fixtures.ts` + `tests/e2e/_mock.ts`; Create `tests/e2e/safety-tab.spec.ts`.

**Interfaces:** `MountainDetail` calls the 5 feed hooks (`useMountainAirQuality/Alerts/Volcano/Seismic/ParkAlerts`) and builds `safetyTab` as a fragment ordered most-actionable-first: AirQuality, Storm, Volcano, Seismic, ParkAlerts, Avalanche. Each panel is wrapped so it: shows `<Skeleton variant="panel" name="…">` while loading; is OMITTED on a 404 (`error?.status===404`) or, for Volcano/ParkAlerts, when the gating catalog field is empty; shows `<PanelError label onRetry={mutate}>` on a non-404 error; renders the panel when data is present.

- [ ] **Step 1: Add fixtures** to `tests/e2e/_fixtures.ts` — `buildAirQuality/buildStormAlerts/buildVolcano/buildSeismic/buildParkAlerts/buildHazardsSummary(slug)` returning the 2A shapes with deterministic data (a Moderate AQI with a 7-day trend, a quiet storm + one optional warning fixture, GREEN volcano, a few quakes incl. one recent, a Closure + Caution park alert, and a summary with aqi+storm). Wire them into `tests/e2e/_mock.ts`'s `**/api/mountains/**` interceptor for the six new sub-paths (so EVERY route-mocked detail spec — browse/focused/etc. — keeps passing now that MountainDetail fetches them). For a non-park / non-volcano peer, the mock returns 404 for `volcano`/`park-alerts`.
- [ ] **Step 2: Write the failing MountainDetail tests** — mock the 5 new hooks (+ existing). Assert: (a) on the Safety tab, the AirQuality/Storm/Seismic panels render in order; (b) the Volcano panel renders only when `mountain.hansVolcanoId` is set, omitted otherwise; (c) the ParkAlerts panel renders only when `mountain.npsParkCode` is set; (d) a 404 error on a feed omits its panel (no PanelError); (e) a 500 error shows a `PanelError` with a retry. Run → FAIL.
- [ ] **Step 3: Implement** the assembly in `MountainDetail.tsx` (add the hooks; build the ordered fragment with the per-panel wrapper helper). Run → PASS.
- [ ] **Step 4: Write `tests/e2e/safety-tab.spec.ts`** — route-mocked: navigate to `/mountains/mt-rainier`, click the Safety tab, assert the AirQuality ("Air quality"), Storm, Volcano, Earthquakes, Park-alerts, and Avalanche panels are visible; assert the AQI header chip is visible; for a non-volcano peer (e.g. `colchuck-peak` if mocked) assert the Volcano panel is absent. Desktop + mobile. Self-gate any live-only assertion.
- [ ] **Step 5: Run `npm test` + `npx tsc --noEmit` + `npm run build`** → green (coverage held).
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(safety): assemble Safety tab (5 feeds, ordered, graceful degradation) + e2e"`

---

## Task 10: Final gates + visual QA

**Files:** none new (verification + any straggler fixes).

- [ ] **Step 1: Full suite** — `npm test` (coverage ≥ 90/90/85), `npx tsc --noEmit`, `npm run build`, `npm run test:e2e` (desktop + mobile + narrow — all specs incl. the new Safety spec; fix any route-mock gaps surfaced by the new MountainDetail fetches).
- [ ] **Step 2: Controller visual QA** — capture the Safety tab (all six panels) + the header chip row across desktop + mobile + both themes (glacier/slate) with the route-mock harness; ALSO run a live check against the deployed URL (`PLAYWRIGHT_BASE_URL=https://mtn-weather-web-hne2exapaa-uw.a.run.app`) so the panels render against REAL 2A data (real AQI for mt-hood/mt-whitney, real quakes for mt-rainier, GREEN volcano, real NPS alerts). Adversarially inspect: AQI category color + distance caveat legibility, storm quiet-vs-active state, volcano color dot, seismic events + swarm badge, park-alert category colors, chip contrast in both themes, mobile stacking, and graceful omission on peers lacking a volcano/park. Fix any issue found (commit).
- [ ] **Step 3: Commit QA fixes** (if any) — `git commit -m "fix(safety): phase-2B visual-QA polish"`

---

## Self-Review (completed)

**Spec coverage (§4 chips + §7 Safety panels):**
- §7.1 AirQuality (AQI + category + dominant pollutant + reporting-area name + distance + 24h→7-day sparkline + smoke caveat; drives the AQI chip) → Tasks 2, 7. ✓ (sparkline is 7-day per the 2A finding that AirNow has no hourly granularity.)
- §7.2 Storm (NWS Severe T-storm Warning/Watch + SPC Day-1; quiet state; active lights the Storm chip red) → Tasks 3, 7. ✓
- §7.3 Volcano (alert level + color + NVEWS + notice; only 5 volcano peaks) → Tasks 4, 9 (gating). ✓
- §7.4 Seismic (count/30 km/30 days + largest mag + recent events + swarm badge) → Task 5. ✓
- §7.5 Park alerts (category-coded) → Tasks 6, 9 (gating). ✓
- §7.6 Avalanche stays (existing panel, moved into the Safety tab by Phase 1A). ✓
- §4 header chips Avalanche/AirQuality/Storm; **storm-red taps to Safety, no banner** → Tasks 7, 8. ✓ (banner intentionally NOT built.)
- §7 "each carries a Provenance tag (source · distance · freshness); unavailable sources omit their panel" → `sourceProvenance` (Task 1) on every panel; 404/empty-gating omission (Task 9). ✓
- §3.3 units / §3.4 mobile / §11 gates → per task + Task 10.
- **Deferred to Phase 3 (documented):** all Terrain & Access (§8) — map, GIBS, webcams, access cards, 3D-entry move. The Volcano/Closure header chips shown in the mockup beyond Avalanche/AirQuality/Storm are NOT built (spec §4 lists exactly three chips).

**Placeholder scan:** No "TBD/TODO". Task 1 (hooks + adapter) and Task 7/8 (chips, tabs) carry full code; the 5 panels carry exact data shapes, the inline-`panel-head` render pattern, the token mappings, the empty/null states, and concrete failing-test cases — each is a restyle of the established AvalanchePanel pattern, not a new invention.

**Type consistency:** the 6 hooks return the `src/lib/hazards/types.ts` types (shipped in 2A) consumed unchanged by the panels (Tasks 2–6) and chips (Task 7). `sourceProvenance` returns the existing `ProvenanceData` (1A) consumed by `<Provenance>`. `HazardsSummary` drives `airQualityChip`/`stormChip` (Task 7) and is fetched by `useMountainHazardsSummary` (Task 1) in the header. `MountainTabs` keeps its `{tabs, initial}` API (Task 8 adds URL-awareness without breaking it). Catalog gating fields `hansVolcanoId`/`npsParkCode` (2A) drive the Volcano/ParkAlerts omission (Task 9). Consistent.
