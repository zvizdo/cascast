# P8 — Enhancements & Corrections — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. Each task ends green (tests + tsc/pytest
> + build) and is independently QA-able.

**Goal:** Fix the summit-temperature/freezing-level inconsistency, the daily-outlook line, and the
forecast-evolution chart; add unpin/delete, wind-direction + feels-like, Model-Lab model descriptions;
and clear the post-POC a11y/UX backlog. (Budget alerts + WeatherNext scoping already done.)

**Architecture:** Same stack. C1 changes the Python weather worker (pressure-level → band selection);
everything else is Next.js/React + the TS API. Local-first; redeploy Cloud Run + the weather worker at
the gate and verify live (incl. the Rainier-June-20 repro).

**Tech Stack:** Python 3.12 Cloud Functions (C1), Next.js 16 / React 19 / TS / Vitest / Playwright / vitest-axe.

**References:** contract `docs/superpowers/specs/2026-06-14-interface-contract.md` (§5.1 Open-Meteo, §6
derivation, §8/§9 types), `prototype-ui/.../DESIGN.md`, `CLAUDE.md` (env, gates, backlog). Decisions
(2026-06-15): C1 geopotential-per-mountain; B1 archive+delete; B2 apparent_temperature; B3 deferred.

**Exit criteria:**
- Summit temp is physically consistent with freezing level for Rainier June-20 (summit above freezing
  level ⇒ summit temp ≤ ~32°F). Per-mountain band altitudes within tolerance of pressure-level heights.
- Daily-outlook temperature line spans start→target for a 5-day-out project in **all three** zoom modes.
- Forecast-evolution chart shows the **backfilled** line distinctly with an unambiguous legend.
- Unpin (archive) + Delete work from the UI; archived projects leave the dashboard and stop refreshing.
- Wind-direction arrow + "Feels like" render in the Daily Outlook; Model Lab shows model descriptions.
- Backlog a11y items resolved; `npm run test:coverage` ≥90/90/85, `pytest` ≥90%, tsc + build clean,
  Playwright (local + live) green.

---

## File structure
| Path | Task | Responsibility |
|---|---|---|
| `functions/weather_worker/open_meteo_client.py` (+ tests) | C1 | request geopotential+temp for candidate levels; per-mountain band selection |
| `functions/weather_worker/main.py` | C1 | pass mountain elevations into parse |
| `lib/derive.ts` (+ tests) | C2 | null-aware daily aggregation; line spans to target |
| `components/project/DailyOutlook.tsx` (+ tests) | C2, A1, B2 | line break on null; wind arrow; feels-like |
| `components/modellab/ForecastEvolutionChart.tsx` (+ tests) | C3 | legend redesign; backfill line drawn |
| `app/api/projects/[id]/route.ts` (+ tests) | B1 | PATCH status=archived; DELETE also removes snapshots |
| `app/api/projects/route.ts` (+ tests) | B1 | GET excludes archived from dashboard |
| `components/project/ProjectHeader.tsx`, `components/dashboard/ProjectCard.tsx` (+ tests) | B1 | unpin/delete actions + confirm |
| `components/modellab/ModelLab.tsx` or new `ModelInfo.tsx` (+ tests) | A2 | 3-model description panel |
| `components/shared/Segmented.tsx`, `HourlyGrid.tsx`, `CopyLinkButton.tsx`, `Header.tsx`, `MountainSearch.tsx`, `ThemeToggle.tsx`, `Skeleton.tsx`, `globals.css` | A3 | a11y/UX backlog |

---

## Task 1 (C1): Per-mountain geopotential band → summit temp

**Problem:** `parse_models` maps bands to FIXED pressure levels (base 925 / mid 850 / summit 700 hPa).
700 hPa ≈ 10,000 ft, so for Rainier (summit 14,410 ft) the "summit" temp is really the *mid* — it reads
warm (~45°F) while the freezing level sits below the true summit. Fix: pick the pressure level whose
**geopotential height** is nearest each band's actual elevation, **per mountain**.

**Files:** `functions/weather_worker/open_meteo_client.py`, `functions/weather_worker/main.py`,
tests `functions/weather_worker/tests/test_open_meteo_client.py`.

- [ ] **Step 1: Failing test** — `parse_models(body, models, elevations)` assigns the summit band to the
  level nearest `elevations["summit"]` by geopotential height. Build a body with candidate levels (e.g.
  850/700/600/500 hPa) carrying `geopotential_height_{lvl}hPa` (in ft) and `temperature_{lvl}hPa`. With
  `elevations={base:5420,mid:10188,summit:14410}`, assert `temp_summit_f` == the 500/550-ish level temp
  (the one whose height ≈ 14,410 ft), NOT the 700 hPa temp. Add a base/mid assertion too.

- [ ] **Step 2: Implement.**
  - Add candidate levels `CANDIDATE_HPA = ["925","850","700","600","500","400"]`; request
    `temperature_{lvl}hPa` AND `geopotential_height_{lvl}hPa` for each (replace the old `PRESSURE_VARS`/
    `BAND_HPA`). Keep surface `HOURLY_VARS`.
  - In `parse_models(body, models, elevations)`: per model, read each candidate level's geopotential
    height series (unit-aware m→ft, same helper as freezing level — geopotential under imperial is feet;
    multi-model suffixes the unit key). Compute a representative height per level (e.g. mean of non-null).
    For each band in {base, mid, summit}, pick `argmin |levelHeightFt − elevations[band]|`; set
    `temp_{band}_f` = that level's `temperature_{lvl}hPa` series (de-suffixed). If a level's geopotential
    is entirely null for a model, exclude it from candidates for that model.
  - `fetch_forecast(mountain)` already has `mountain["elevations"]`; pass it through to `parse_models`.
    Update `main.py` if it calls `parse_models` directly.
  - Keep `temp_summit_f`/`temp_mid_f`/`temp_base_f` field names (no schema change).

- [ ] **Step 3:** run `pytest weather_worker/tests/test_open_meteo_client.py -p no:cov -o addopts=""` → pass.

- [ ] **Step 4: Contract note** — update §5.1/§6: bands are resolved per-mountain by nearest geopotential
  height (not fixed 925/850/700). Note the candidate-level set.

- [ ] **Step 5: Full gate** — `cd functions && source .venv/bin/activate && pytest` ≥90%. Commit
  `fix(p8): per-mountain geopotential band selection so summit temp matches summit altitude (C1)`.

- [ ] **Step 6: Deploy + live verify** — `./scripts/stage-functions.sh && terraform -chdir=terraform apply
  -var-file=environments/dev.tfvars -auto-approve`; force-refresh Rainier
  (`gcloud pubsub topics publish dev-weather-refresh --project mountain-weatherman-app
  --message='{"mountainId":"mt-rainier","reason":"manual"}'`); confirm the stored blob's
  `gfs.temp_summit_f` at June-20 noon is now cold (≤ ~32°F, consistent with freezing level 13,451 ft).

---

## Task 2 (C2): Daily-outlook temperature line spans to the target

**Problem:** In **Daily** mode the temp line stops a few days in; **Hourly** reaches the target. Root: in
`lib/derive.ts` `aggregate()` uses `num()` (null→0), and/or all-null days collapse the line. After C1 the
band source may legitimately be null on far days for short-range models.

**Files:** `lib/derive.ts` (+ `lib/__tests__/derive.test.ts`), `components/project/DailyOutlook.tsx`
(+ tests).

- [ ] **Step 1: Reproduce** — note current behavior with a 5-day-out target where the summit-band series
  has values across the range; identify whether cells stop or the SVG line stops.
- [ ] **Step 2: Failing test** — `dailyCells(gfs, "summit", start, target5dOut)` returns a cell for **every**
  day start→target with non-null `hi/lo` where data exists; a day with all-null band temps yields a cell
  flagged `hasTemp:false` (or `hi/lo=null`) rather than `0`.
- [ ] **Step 3: Implement** — make `aggregate()` compute hi/lo from **non-null** temps only (skip nulls,
  don't `num()`-coerce to 0); expose nullable `hi/lo` (or a `hasTemp` flag). In `DailyOutlook`, build the
  `daily-trend` line from cells with a temp and **break** at gaps (reuse the null-break pattern), so the
  line spans to the target across all three zoom modes.
- [ ] **Step 4:** tests pass; `npm test` green; tsc clean.
- [ ] **Step 5: Commit** `fix(p8): daily-outlook line spans start→target (null-aware aggregation) (C2)`.

---

## Task 3 (C3): Forecast-evolution legend + visible backfill line

**Problem:** Legend is confusing and the backfilled line isn't visibly drawn (data exists). Distinguish
**two** dimensions clearly: model (color) and provenance (live vs backfilled).

**Files:** `components/modellab/ForecastEvolutionChart.tsx` (+ tests).

- [ ] **Step 1: Failing test** — given snapshots with both `source:"live"` and `source:"backfill"`, the
  chart renders a visible backfilled line segment (a `<path>` for the backfill portion) AND a legend with
  a model-name entry plus a separate live/backfill style key.
- [ ] **Step 2: Implement** — draw the backfilled points as a connected line (e.g. dashed) and live as
  solid, joined at the boundary; redesign the legend into two small groups: "Models" (HRRR/GFS/ECMWF
  colors) and "Data" (solid = live, dashed = backfilled). Keep empty-state (<3 pts). Guard null/Infinity.
- [ ] **Step 3:** tests pass; tsc clean. Commit `fix(p8): evolution chart — visible backfill line + clear two-axis legend (C3)`.

---

## Task 4 (B1): Unpin (archive) + Delete

**Files:** `app/api/projects/[id]/route.ts`, `app/api/projects/route.ts` (+ tests),
`components/project/ProjectHeader.tsx`, `components/dashboard/ProjectCard.tsx` (+ tests),
`lib/hooks.ts`/`lib/types.ts` as needed.

- [ ] **Step 1: API (TDD).** PATCH: allow `status` transition to `"archived"` (validated enum
  `active|archived`; keep existing PATCHABLE fields). DELETE: also delete the `weatherSnapshots`
  subcollection (batch) before deleting the project doc. Tests: PATCH→archived persists; DELETE removes
  doc + snapshots; 404 paths intact.
- [ ] **Step 2: Dashboard filter (TDD).** `GET /api/projects` excludes `status==="archived"` (dashboard
  shows active only). Test asserts archived omitted.
- [ ] **Step 3: UI (TDD).** Add an actions menu on `ProjectHeader` (detail) with **Unpin** (PATCH
  status=archived → toast/redirect to dashboard) and **Delete** (confirm dialog → DELETE → redirect).
  Add a compact delete/unpin affordance on the dashboard `ProjectCard` (optional menu). Tests: unpin calls
  PATCH archived + navigates; delete confirms then calls DELETE; cancel does nothing.
- [ ] **Step 4:** `npm test` green; tsc + build clean. Commit `feat(p8): unpin (archive) + delete project — API + UI (B1)`.

---

## Task 5 (A1+B2): Wind-direction arrow + "Feels like" in Daily Outlook

**Files:** `components/project/DailyOutlook.tsx`, `lib/derive.ts` (carry `windDir` + `apparent`),
`components/icons/WindArrow.tsx` (exists), tests.

- [ ] **Step 1: derive (TDD)** — `aggregate()`/cell carries a representative `windDir` (noon
  `wind_direction_10m`) and `feelsLike` (min/representative `apparent_temperature`, °, units-aware).
- [ ] **Step 2: UI (TDD)** — render `WindArrow` rotated to `windDir` next to wind on each tile (aria-label
  "wind from NNN°"); show "Feels like {apparent}°" under the temp. Units toggle applies to feels-like.
- [ ] **Step 3:** tests pass; tsc clean. Commit `feat(p8): wind-direction arrow + feels-like in Daily Outlook (A1/B2)`.

---

## Task 6 (A2): Model Lab — model descriptions

**Files:** `components/modellab/ModelLab.tsx` (or new `components/modellab/ModelInfo.tsx`) + test.

- [ ] **Step 1: Failing test** — a description block renders HRRR/GFS/ECMWF with source, resolution,
  coverage, horizon, best-for.
- [ ] **Step 2: Implement** — HRRR (NOAA, 3 km, CONUS, ~48 h, hourly — best for near-term terrain),
  GFS (NOAA GFS-seamless, ~13–25 km, global, 16 d), ECMWF (ECMWF IFS, ~9–25 km, global, 15 d — strong
  medium-range). Cirque mono styling; collapsible/aside.
- [ ] **Step 3:** test passes; tsc clean. Commit `feat(p8): Model Lab model descriptions (A2)`.

---

## Task 7 (A3): a11y/UX backlog cluster

**Files:** `components/shared/Segmented.tsx`, `components/modellab/HourlyGrid.tsx`,
`components/shared/CopyLinkButton.tsx`, `components/layout/Header.tsx`,
`components/create/MountainSearch.tsx`, `components/layout/ThemeToggle.tsx`,
`components/shared/Skeleton.tsx`, `app/globals.css`, `app/api/.../SectionError`/detail-404, tests.

- [ ] Segmented: `role=radiogroup`/`radio` + `aria-checked` (keep roving keys). HourlyGrid: hot/cold/
  high-wind cells get a glyph or `aria-label` (not color-only) + row `<th scope="row">`. CopyLinkButton:
  2.0 s success, `.catch()` fallback feedback, unmount timer cleanup, `aria-label` announces Copied.
  Project not-found: add "Back to projects" link + distinguish 404 vs transient. Daily/grid scrollers:
  edge-fade affordance. Nav: `aria-current="page"`. Skeleton wrappers: `role="status"` + sr-only "Loading".
  MountainSearch: `aria-controls` only when open + active option `scrollIntoView`. ThemeToggle: read saved
  theme before first paint (avoid FOUC/aria mismatch) — e.g. inline script or layout cookie.
- [ ] Per change add/extend a test (vitest-axe where applicable). `npm run test:coverage` ≥90/90/85.
- [ ] Commit `feat(p8): a11y/UX backlog — radiogroup, hourly-grid signals, copy/404/scroll/nav/skeleton/search/theme (A3)`.

---

## Verification gate (P8 done when all true)
- C1 live: Rainier June-20 summit temp cold + consistent with freezing level; per-mountain bands sane.
- C2: daily line spans to target in all zoom modes (Playwright screenshot).
- C3: backfilled line visible + legend clear (Playwright screenshot).
- B1: unpin removes from dashboard + stops refresh; delete removes project + snapshots (live).
- A1/B2/A2 render; A3 axe-clean.
- `npm run test:coverage` ≥90/90/85 · `pytest` ≥90% · tsc · build · Playwright local + live green.
- Redeploy Cloud Run + weather worker; re-run live Playwright + the Rainier-June-20 repro. Update CLAUDE.md.
