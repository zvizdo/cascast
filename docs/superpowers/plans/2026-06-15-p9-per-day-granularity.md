# P9 — Per-day expandable granularity in the Daily Outlook — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD, checkbox steps.

**Goal:** Let each day in the Daily Outlook be **independently expanded** (Daily → AM·Mid·PM → Hourly)
on top of the existing global baseline, so the strip can mix granularities. When the target is **≤48h
out**, auto-expand the **target day + the two days before it** to AM·Mid·PM ("mid") to ease the user in.

**Architecture:** Pure refactor of `lib/derive.ts` (new `mixedCells` + `dayLevelDefaults`) and
`components/project/DailyOutlook.tsx` (global baseline + per-day override state + per-day expand control).
No API/Python/contract changes. Local-first; deploy Cloud Run + verify live after.

**Tech Stack:** Next.js 16 / React 19 / TS / Vitest / Playwright. Cirque styling.

**References:** `prototype-ui/.../DESIGN.md` (Daily Outlook §), `CLAUDE.md` (gates), current
`DailyOutlook.tsx` + `lib/derive.ts` (`dailyCells`/`periodCells`/`hourlyCells`, `Cell`/`Group` types).

**Design model:**
- `globalZoom` (`day|period|hour`) — the existing Segmented = baseline for all days.
- `perDay: Record<dateKey, Zoom>` — optional per-day overrides. **Effective level for a day = the FINER
  of `globalZoom` and `perDay[d]`** (order day < period < hour). So per-day only expands a day beyond the
  baseline; raising the global baseline still applies to all.
- Per-day control: a small expand affordance on each day's group header that cycles that day
  day→period→hour→day (sets/clears `perDay[d]`), with an aria-label + chevron/+− glyph.
- **48h auto-seed:** initial `perDay` = `{target, target−1d, target−2d → "period"}` **only when the target
  start is ≤48h from now**; otherwise empty. User actions override.

**Exit criteria:** mixed-granularity strip renders (some days daily, some mid/hourly); per-day expand
works; within-48h pre-expands target+2 prior to mid; the temp ribbon spans across mixed cells; all gates
green (coverage ≥90/90/85, tsc, build, Playwright local + live); deployed + visually verified.

---

## Task 1: derive — `mixedCells` + `dayLevelDefaults` (TDD)

**Files:** `lib/derive.ts`, `lib/__tests__/derive.test.ts`.

- [ ] **Step 1 — failing tests.**
  - `dayLevelDefaults(gfs, nowIso, targetStart, targetEnd)`: when `targetStart` is ≤48h after `nowIso`,
    returns `{[target]: "period", [target−1d]: "period", [target−2d]: "period"}` (only days present in the
    series); when target is >48h out, returns `{}`.
  - `mixedCells(hrrr, gfs, band, nowIso, targetStart, targetEnd, levelFor)` where `levelFor(dateKey)→Zoom`:
    for a day whose level is `"day"` emits ONE daily cell; `"period"` emits its ≤3 AM·Mid·PM cells;
    `"hour"` emits that day's hourly cells (HRRR row preferred when available, else GFS). Returns
    `{cells, groups}` where each `Group` also carries `dateKey` and `level`. Assert a MIXED case: day A
    `"day"` → 1 cell, day B `"period"` → 3 cells, day C `"hour"` → 24 cells; groups sized accordingly with
    correct `dateKey`/`level`/`isTarget`.
- [ ] **Step 2 — implement.** Extend `Group` with `dateKey: string` and `level: "day"|"period"|"hour"`.
  Add `finerLevel(a,b)` helper (order day<period<hour). Implement `mixedCells` by iterating `dayKeys(gfs)`
  and, per day, reusing the existing per-day aggregation logic (daily = all-day indices; period = the
  PERIODS windows; hour = each hour, HRRR-preferred like `hourlyCells`). Keep the null-aware `hasTemp`
  behavior (C2) so the ribbon still breaks on gaps. Implement `dayLevelDefaults` (compute t−1/t−2 by date
  math; include only days present in `dayKeys`; 48h check via `nowIso`/`targetStart`).
- [ ] **Step 3 — run** `npm test -- lib/__tests__/derive.test.ts` → pass. tsc clean.
- [ ] **Step 4 — commit** `feat(p9): derive mixedCells + 48h day-level defaults`.

---

## Task 2: DailyOutlook — per-day expand + 48h auto-seed (TDD)

**Files:** `components/project/DailyOutlook.tsx`, `components/project/__tests__/DailyOutlook.test.tsx`,
`app/globals.css` (per-day control styling), maybe `components/icons` (chevron exists? else use a glyph).

- [ ] **Step 1 — failing tests.**
  - Renders mixed: with `globalZoom="day"` and a per-day override expanding one day to `"period"`, that
    day shows 3 period cells while others show 1 — i.e. clicking a day's expand control changes only that day.
  - 48h auto-seed: when `targetStart` ≤48h from `nowIso`, on initial render the target day and the two
    prior days are at AM·Mid·PM (period) without any user interaction (assert those day groups have
    `level="period"` / show period sub-cells); when target is far out, all days start at the global level.
  - Global Segmented still works as the baseline (changing to "hour" makes every day hourly; effective =
    finer(global, perDay)).
- [ ] **Step 2 — implement.**
  - State: keep `globalZoom` from the Segmented; add `perDay` state initialized from
    `dayLevelDefaults(gfs, nowIso, targetStart, targetEnd)` (re-init when those inputs change).
  - `levelFor(d) = finerLevel(globalZoom, perDay[d] ?? globalZoom)`. Build the strip from
    `mixedCells(blob.hrrr, gfs, band, nowIso, targetStart, targetEnd, levelFor)`.
  - Render per-day group headers (always show day groups now, not just in period/hour mode) with a compact
    **expand control** (button) that cycles `perDay[d]` day→period→hour→(unset) — accessible
    (`aria-label="Expand {day} to hourly detail"` etc.), Cirque-styled (a `+`/chevron in the group header).
  - Keep the temperature ribbon (spans all rendered cells; null-break preserved) and the existing
    tile rendering (wind arrow, feels-like, precip) for each cell regardless of its day's level. Column
    widths: daily cell wide; period/hour cells narrower (reuse existing `colW` logic per cell or per group).
    Horizontal scroll when total width exceeds the panel.
  - Relabel the global Segmented subtly (e.g. keep Daily / AM·Mid·PM / Hourly as "all days" baseline);
    a short helper line: "Tap a day to expand it."
- [ ] **Step 3 — gates.** `npm test` + `npm run test:coverage` (≥90/90/85 on touched files), tsc clean,
  `npm run build` compiles. Update any existing DailyOutlook tests affected by the markup change.
- [ ] **Step 4 — commit** `feat(p9): per-day expandable granularity + 48h target pre-expand in Daily Outlook`.

---

## Task 3: Playwright + deploy + live verify

- [ ] **Step 1 — e2e.** Add/extend a Playwright spec (runs vs `PLAYWRIGHT_BASE_URL`): on a project detail,
  click a day's expand control → that day shows finer cells while neighbors don't; assert no page overflow
  at 390px. Keep it data-tolerant.
- [ ] **Step 2 — local gate.** `npm run test:coverage`, `npx tsc --noEmit`, `npm run build`,
  `cd functions && pytest` (no regressions) all green.
- [ ] **Step 3 — deploy.** `./scripts/deploy-web.sh dev`.
- [ ] **Step 4 — live verify (Playwright MCP).** On a near-term project (target ≤48h, e.g. the 34h Rainier
  demo) confirm the target + 2 prior days default to AM·Mid·PM; expand one far day to Hourly and confirm
  mixed rendering; desktop + mobile; 0 console errors. Screenshot.
- [ ] **Step 5 — commit** `test(p9): per-day granularity e2e + live verification`; update CLAUDE.md.

---

## Verification gate (P9 done when all true)
- Days expand independently; mixed granularity renders; ribbon spans mixed cells (breaks on gaps).
- Target ≤48h ⇒ target + 2 prior days auto-start at AM·Mid·PM; far target ⇒ all at baseline.
- Global Segmented still sets the baseline (finer-of semantics).
- Coverage ≥90/90/85 · tsc · build · pytest · Playwright local + live green · deployed + visually verified.
