# P10 — Daily-chart/expander/cache fixes + full mobile redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. TDD where logic exists; visual verification (Playwright MCP) for pure CSS. Steps use checkbox syntax.

**Goal:** Fix three correctness bugs (unpin/delete stale cache; daily-chart trend line truncating; per-day expander offering levels that have no data) and execute a full mobile (≤480 / ≤680px) redesign so every page is clean and usable on an iPhone-12-class phone, with the Base/Mid/Summit + zoom controls collapsed into dropdowns on mobile.

**Architecture:** Frontend-only (Next.js 16 / React 19 / TS). Touches `components/project/*`, `components/shared/*`, `components/layout/*`, `lib/derive.ts`, `lib/hooks`, `app/globals.css`, and the two project API routes (cache headers only). No Python / Terraform / contract changes.

**Tech Stack:** Vitest (≥90/90/85), Playwright (desktop 1280×800, mobile iPhone-12 390×844, narrow 600px), vitest-axe. Cirque design tokens.

**User decisions (2026-06-15):**
- Expander: **expand only as far as data exists** (skip levels with no underlying data; no dead clicks).
- Mobile controls: **collapse Base/Mid/Summit and the Daily/AM·Mid·PM/Hourly zoom into dropdowns** on mobile.
- Responsive scope: **full mobile redesign** across all panels/pages.
- Horizon: **keep GFS forecast_days=7** — just fix the rendering (no backend change).

**Verified root causes (from live QA + code read):**
1. **Cache:** `ProjectHeader.unpin/remove` only `router.push("/")` — never invalidates SWR `/api/projects`; and `GET /api/projects` sends `Cache-Control: public, max-age=300` so even a refetch hits the stale browser cache. (`components/project/ProjectHeader.tsx:25-47`, `app/api/projects/route.ts:7,14`.)
2. **Daily chart:** in the `allDaily` path `innerW="100%"` and the trend `<svg>` uses `width:100%`, but `app/globals.css:485` forces `.daily-grid { grid-template-columns: repeat(7,116px) }` (=812px) at ≤680px. On any container < 812px the SVG compresses the line into the visible width while tiles overflow to 812px → "line stops while tiles continue." (`components/project/DailyOutlook.tsx:126-131,269-316`.)
3. **Expander:** `NEXT_LEVEL` (`DailyOutlook.tsx:30-34`) always offers period→hour regardless of whether finer data exists for that day; HRRR hourly only spans ~48h, far days have no hourly/period to show.

**Exit criteria:** unpin/delete immediately removes the card from the dashboard (no stale read); the daily trend line spans exactly the rendered tiles at every width (mobile included) with the strip scrolling horizontally and the line aligned; a day's expander only steps to a finer level that actually has data (and shows no control / a collapse glyph when nothing finer exists); on a 390px phone every page is legible, no element overflows the viewport, all interactive targets ≥44px, controls are dropdowns; both themes; all gates green; deployed + live-verified with screenshots.

---

## Task 1: Unpin/Delete cache invalidation (TDD)

**Files:** `components/project/ProjectHeader.tsx`, `components/project/__tests__/ProjectHeader.test.tsx`, `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts`.

- [ ] **Step 1 — failing test.** In `ProjectHeader.test.tsx`, mock `swr` `useSWRConfig` to capture `mutate`, mock `next/navigation` `useRouter`, and mock `global.fetch` to resolve ok. Render, click **Unpin** → assert `fetch` called with `PATCH … {status:"archived"}`, then `mutate("/api/projects")` called, then `router.push("/")`. Repeat for **Delete** (open confirm dialog, click confirm) → `fetch` `DELETE`, `mutate("/api/projects")`, `router.push("/")`. These fail today (no mutate).
- [ ] **Step 2 — implement.** In `ProjectHeader.tsx` add `import { useSWRConfig } from "swr";` and `const { mutate } = useSWRConfig();`. In `unpin` and `remove`, after the awaited `fetch`, call `await mutate("/api/projects");` (revalidate the list) and also `mutate(\`/api/projects/${project.id}\`, undefined, { revalidate: false });` to drop the single-project cache, then `router.push("/")`. Keep the `busy`/`finally` handling.
- [ ] **Step 3 — fix the HTTP cache.** In `app/api/projects/route.ts` change the GET `Cache-Control` to `"no-store"` (mutation-sensitive list must never be served stale). Leave POST as-is. In `app/api/projects/[id]/route.ts` change the GET `Cache-Control` to `"no-store"` as well (archive status / edits must reflect immediately). PATCH/DELETE already send no cache header — leave them.
- [ ] **Step 4 — run** `npm test -- ProjectHeader` → pass; `npx tsc --noEmit` clean.
- [ ] **Step 5 — commit** `fix(p10): invalidate SWR projects cache + no-store on project GETs so unpin/delete take effect immediately`.

---

## Task 2: Daily-chart trend/grid width alignment (TDD + visual)

**Files:** `components/project/DailyOutlook.tsx`, `lib/derive.ts` (add a tiny pure helper for the width decision so it's unit-testable), `lib/__tests__/derive.test.ts`, `app/globals.css`.

**Design:** The trend SVG width must ALWAYS equal the rendered grid width. Replace the `allDaily ? "100%" : totalW` special-case with a measured stretch/scroll decision:
- Measure the scroll container width `cw` via a `ref` + `ResizeObserver` (client only). `stretch = totalW <= cw`.
- **Stretch** (fits): wrapper `width:"100%"`, grid `gridTemplateColumns = colWArr.map(w => \`${w}fr\`).join(" ")` (proportional `fr` fills the container while preserving column ratios), SVG `width:"100%"`. Uniform SVG stretch then aligns with proportional columns.
- **Scroll** (overflows): wrapper `width: totalW`, grid `gridTemplateColumns = colWArr.map(w=>\`${w}px\`).join(" ")`, SVG `width: totalW`. Horizontal scroll; SVG === grid width.
- Initial state `stretch=true` (deterministic for SSR → no hydration mismatch); `useLayoutEffect` measures on mount and corrects.
- **Remove** `app/globals.css:485` `.daily-grid { grid-template-columns: repeat(7,116px); }` and the base `.daily-grid { grid-template-columns: repeat(7,1fr); }` reliance — columns are now ALWAYS set inline, so no media query may override them.

- [ ] **Step 1 — failing unit test.** In `derive.test.ts` add a test for a new pure helper `gridWidthMode(totalW, containerW)` returning `"stretch"` when `totalW <= containerW` else `"scroll"`. (e.g. `gridWidthMode(812, 1100)==="stretch"`, `gridWidthMode(812, 318)==="scroll"`.)
- [ ] **Step 2 — implement helper** in `lib/derive.ts` (one-liner, exported) and import it in `DailyOutlook.tsx`.
- [ ] **Step 3 — rewire DailyOutlook.** Add `const scrollRef = React.useRef<HTMLDivElement>(null);` and `const [cw, setCw] = React.useState(Infinity);` (Infinity ⇒ stretch on first paint). `useLayoutEffect` with a `ResizeObserver` on `scrollRef.current` updating `cw`. Compute `mode = gridWidthMode(totalW, cw)`. Set the wrapper `<div>` width, the `.daily-grid` `gridTemplateColumns`, and the `<svg style={{width}}>` all from `mode` per the design above (SVG `viewBox` stays `0 0 ${totalW} ${H}` with `preserveAspectRatio="none"`). Put `ref={scrollRef}` on `.daily-scroll`. Delete the now-unused `scroll`/`innerW`/`allDaily`-for-width logic (keep `allSingle` for labels). The `.daily-grid` must always receive an inline `gridTemplateColumns`.
- [ ] **Step 4 — CSS.** In `app/globals.css` remove line 361's column template reliance (set `.daily-grid { display:grid; background:var(--surface); }` only) and delete the `.daily-grid { grid-template-columns: repeat(7,116px); }` rule inside the ≤680px block (line 485).
- [ ] **Step 5 — DailyOutlook test.** In `components/project/__tests__/DailyOutlook.test.tsx` assert that the rendered `.daily-grid` always has an inline `grid-template-columns` style (never empty) and that the `<svg.daily-trend>` and the grid wrapper share the same width basis (both `100%` in stretch, both the px total in scroll — simulate by mocking ResizeObserver / setting cw). Keep existing tests green.
- [ ] **Step 6 — gates.** `npm test`, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 7 — commit** `fix(p10): daily trend SVG width always equals grid width (line no longer truncates on narrow/mobile)`.

---

## Task 3: Expander gating — expand only as far as data exists (TDD)

**Files:** `lib/derive.ts`, `lib/__tests__/derive.test.ts`, `components/project/DailyOutlook.tsx`, `components/project/__tests__/DailyOutlook.test.tsx`.

**Design:** `mixedCells` already knows, per day, whether period and hour cells have data. Surface it on `Group` and let `DailyOutlook` gate the per-day control and the global zoom is unaffected (global still applies finer-of, but a day with no hour data simply renders its deepest-available level).

- [ ] **Step 1 — failing derive test.** Extend `Group` with `canPeriod: boolean` and `canHour: boolean`. In `mixedCells`, while building each day, compute: `canPeriod` = at least one of the 3 AM/Mid/PM windows has ≥1 GFS row for that day; `canHour` = HRRR has ≥1 row for that day OR the day falls within the GFS hourly window (the same `[startIdx, startIdx+48)` bound `hourlyCells` uses). Add a test: a near day (within 48h) → `canPeriod=true,canHour=true`; a far day (e.g. day 6, beyond the hourly window) → `canPeriod=true,canHour=false`. (Keep `dateKey`,`level`,`span`,`isTarget` as today.)
- [ ] **Step 2 — implement** the two flags in `mixedCells`. Factor the hourly-window bound into a shared const so `hourlyCells` and the flag use the same number.
- [ ] **Step 3 — failing DailyOutlook test.** Replace the static `NEXT_LEVEL` step with an availability-aware `nextAvailableLevel(group)`: from the day's current effective level, the next level is `period` only if `group.canPeriod` and current is `day`; `hour` only if `group.canHour` and current is `period`; else cycle back to `day` (collapse). Assert: a far day at `day` whose `canHour=false` but `canPeriod=true` → expander steps day→period→(collapse, NOT hour); a day with `canPeriod=false` (degenerate) → no expand control rendered; the chevron aria-label reflects the actual next step ("Expand … to AM·Mid·PM detail" / "Collapse …") and never offers hourly when `canHour=false`.
- [ ] **Step 4 — implement** in `DailyOutlook.tsx`: compute the next step from `group.can*` + the day's effective level; render the `.dg-expand` button only when a finer level is available OR the day is currently expanded (so it can collapse); when fully collapsed and nothing finer exists, render no button. Update `cycleDay` to set the per-day override to the next AVAILABLE level (skip unavailable), and ensure `levelFor`/`finerLevel` still clamps to availability (a day must never render `hour` cells it has no data for — clamp the effective level down to the deepest available when global zoom would force a finer level than the day supports).
- [ ] **Step 5 — clamp in mixedCells too (defense):** if `levelFor(d)` returns `hour` but `!canHour`, render `period` (or `day` if `!canPeriod`). Add a derive test for the clamp so raising the GLOBAL zoom to Hourly does not produce empty hour cells on far days.
- [ ] **Step 6 — gates.** `npm test`, coverage ≥90/90/85 on touched files, `npx tsc --noEmit`, `npm run build`.
- [ ] **Step 7 — commit** `feat(p10): per-day expander only steps to levels that have data; clamp global zoom to per-day availability`.

---

## Task 4: Responsive foundation — mobile breakpoint, type scaling, touch targets

**Files:** `app/globals.css`.

**Design:** Add a coherent mobile layer. Keep existing 900/680 rules; add a ≤480px layer and broaden touch-target + type-scaling rules. Use `clamp()` for the big serif type so it scales smoothly instead of stepping.

- [ ] **Step 1 — type scaling.** Convert fixed large sizes to `clamp()`: `.page-title { font-size: clamp(28px, 7vw, 40px); }`; `.dh-title { font-size: clamp(19px, 5.5vw, 24px); }`; `.panel-head h3 { font-size: clamp(17px, 4.8vw, 20px); }`; `.stat-value { font-size: clamp(24px, 7vw, 30px); }`; `.hero-fl { font-size: clamp(38px, 11vw, 52px); }`; `.section-title { font-size: clamp(20px, 5.5vw, 24px); }`. Remove the now-redundant `.page-title`/`.hero-fl` step overrides in the ≤680 block.
- [ ] **Step 2 — touch targets.** Broaden the `@media (pointer: coarse)` block to also cover `.nav-link, .dh-back, .drill-link, .dg-expand, .btn, a.btn`, all to `min-height: 44px` (and `.dh-back`/`.dg-expand` to `min-width: 44px`; keep their visual box small via inner sizing if needed, but the hit area ≥44px). Ensure `.seg` already covered.
- [ ] **Step 3 — add ≤480px layer** (new `@media (max-width: 480px)` block): `.page { padding: 22px 14px 72px; }`; `.detail-head-in, .detail-body, .appbar-in, .lab-body { padding-left: 14px; padding-right: 14px; }`; `.panel { padding: 18px 16px; }`; `.proj-grid { grid-template-columns: 1fr; gap: 16px; }`. (Per-component specifics land in Tasks 5–8.)
- [ ] **Step 4 — verify** `npm run build` compiles; no Vitest changes needed (pure CSS). Quick visual sanity via Playwright MCP at 390px after deploy (Task 9).
- [ ] **Step 5 — commit** `feat(p10): responsive foundation — clamp type scaling, ≥44px touch targets, ≤480px layer`.

---

## Task 5: Mobile controls → dropdowns (Select component + DailyOutlook/band)

**Files:** Create `components/shared/Select.tsx` + `components/shared/__tests__/Select.test.tsx`; modify `components/project/ElevationBandSelector.tsx`, `components/project/DailyOutlook.tsx`, `app/globals.css`.

**Design:** Dual-render the two segmented value-pickers (band; zoom). Show the existing `Segmented` on desktop (`.only-desktop`) and a styled native `<select>` (`.only-mobile`) on mobile. `display:none` removes the hidden one from the a11y tree, so no duplicate-announcement and no hydration/SSR issue.

- [ ] **Step 1 — failing test.** `Select.test.tsx`: renders a native `<select>` with the given options, current value selected, fires `onChange` with the chosen value, and applies `aria-label`. Assert it's a real `<select>` (so mobile gets native picker + ≥44px).
- [ ] **Step 2 — implement `Select`**: `Select<T extends string>({ value, onChange, options:{value,label}[], ariaLabel })` → `<select className="m-select" aria-label value onChange>`. Style `.m-select` in globals.css (Cirque tokens: surface bg, line border, radius-sm, 44px min-height, mono/sans font, chevron via background SVG or `appearance:auto`).
- [ ] **Step 3 — utility classes.** Add to globals.css: `.only-mobile { display: none; }` and inside `@media (max-width: 680px)`: `.only-desktop { display: none; } .only-mobile { display: block; }` (use `inline-flex`/`flex` as appropriate). Confirm these don't fight existing layout.
- [ ] **Step 4 — ElevationBandSelector**: render BOTH `<Segmented … className-wrapper .only-desktop>` and `<Select … .only-mobile>` bound to the same `band`/`setBand`. (Segmented currently has no className prop — wrap each in a `<div className="only-desktop">` / `<div className="only-mobile">` instead of modifying Segmented.)
- [ ] **Step 5 — DailyOutlook zoom**: same dual-render for the global zoom control (Daily / AM·Mid·PM / Hourly). The "Tap a day to expand it." helper stays. On mobile, the band selector moves out of `.panel-head` into its own full-width row above the strip (so it no longer squishes against the title) — wrap the controls row to stack on mobile (see Task 6 CSS for `.panel-head`).
- [ ] **Step 6 — tests.** Update `DailyOutlook.test.tsx` / `ElevationBandSelector` tests for the dual render (both controls present in DOM; changing the select updates state). vitest-axe: no violations (the hidden control is `display:none`).
- [ ] **Step 7 — gates + commit** `feat(p10): Base/Mid/Summit + zoom collapse to native dropdowns on mobile`.

---

## Task 6: ProjectHeader + panel-head mobile layout

**Files:** `components/project/ProjectHeader.tsx`, `app/globals.css`, `components/project/__tests__/ProjectHeader.test.tsx` (adjust if markup changes).

- [ ] **Step 1 — panel-head stacking.** In globals.css, at ≤680px: `.panel-head { flex-direction: column; align-items: flex-start; gap: 10px; }` so the title and the (now-dropdown) band control stack instead of squishing. Verify DailyOutlook + other panels that use `.panel-head` still look right.
- [ ] **Step 2 — header actions on mobile.** The 4 actions (Share/Copy, Unpin, Delete, Model lab) overflow at 390px. At ≤680px: `.dh-actions { width: 100%; flex-wrap: wrap; gap: 8px; }` and let each `.btn-sm` in the actions flex to fit (`flex: 1 1 auto; justify-content: center;` with a sensible min-width) so they form a tidy 2×2 grid rather than a ragged wrap. Keep Model lab visually primary. Ensure the sticky `.detail-head` height increase doesn't break `top:64px` stacking — at ≤680px set `.detail-head { position: static; }` (drop sticky on mobile to reclaim vertical space) and `.detail-body`/anchor offsets accordingly.
- [ ] **Step 3 — meta wrap.** `.dh-meta` already wraps; ensure it reads cleanly stacked at 390px (gap, line-height). `.dh-left` keep `min-width:0` so the title ellipsizes rather than overflows.
- [ ] **Step 4 — verify** existing ProjectHeader tests still pass (Task 1 added behavior). Build compiles.
- [ ] **Step 5 — commit** `feat(p10): mobile-friendly project header (stacked actions, static sub-header, stacked panel-head)`.

---

## Task 7: App bar (header) mobile

**Files:** `components/layout/Header.tsx` (only if markup needs a wrapper), `app/globals.css`.

- [ ] **Step 1 — audit at 390px.** The appbar wraps to 2 rows at ≤900px. Tighten ≤680/≤480: brand + nav on row 1, units/theme/CTA on row 2; ensure the units toggles (3 segmenteds: temp/wind/dist) don't overflow — at ≤480px allow them to wrap and shrink (`.units-toggle .seg { padding: 6px 9px; min-height: 44px; }` to keep tap targets while compact). Consider hiding the distance toggle label redundancy only if it overflows (do NOT remove functionality).
- [ ] **Step 2 — CTA.** "Pin a Peak" stays reachable; at ≤480px it may shrink to icon + short label but must remain a ≥44px target.
- [ ] **Step 3 — verify** build; visual at 390px in Task 9.
- [ ] **Step 4 — commit** `feat(p10): app bar fits cleanly on phones (units/theme/CTA wrap, 44px targets)`.

---

## Task 8: Per-panel mobile pass (detail panels + model lab + create/browse)

**Files:** `app/globals.css` primarily; touch component files only if a wrapper/class is needed. Components to check: `Verdict`, `FreezingLevelHero`/hero, `ConfidenceStrip` (`.conf-strip`), `AvalanchePanel` (`.avy-*`), `SnowpackPanel` (`.snotel-*`), `SatellitePanel` (`.sat-*`), `NotesPanel`, dashboard `proj-card`, create flow (`.dates`, `.create-foot`, `.mtn-*`), Model Lab (`.lab-*`, `.grid-table`, `ModelCharts`, `ForecastEvolutionChart`, `HourlyGrid`).

- [ ] **Step 1 — Verdict.** At ≤480px ensure the 3 stat boxes (`.verdict-stats`) wrap to a readable row/column without cramping; `.stat-value` already clamped (Task 4). Confirm the summit/wind/freezing trio doesn't overflow.
- [ ] **Step 2 — Hero / FreezingLevelHero.** Already stacks at 900px; verify the `.band-card` overlays and `.hero-side` day-strip read well at 390px; `.hero-fl` clamped. Ensure the cross-section SVG scales (width 100%).
- [ ] **Step 3 — ConfidenceStrip.** `.conf-strip` wraps; at ≤480px ensure `.conf-models` (HRRR/GFS/ECMWF) wraps under the lead text rather than overflowing.
- [ ] **Step 4 — Avalanche/Snowpack/Satellite/Notes.** `.avy-today`, `.snotel-top`, `.problem` grids: confirm they stack at ≤680/≤480; `.snotel-top` (flex gap 26) should wrap; satellite tile keeps `aspect-ratio:1` and fits.
- [ ] **Step 5 — Dashboard cards.** `.proj-grid` 1 col (done Task 4); verify `.pc-stats` (3 cols) and `.pc-foot` fit at 390px.
- [ ] **Step 6 — Create flow.** `.dates { grid-template-columns: 1fr; }` at ≤480px (stack the two date inputs); `.create-foot` wrap; MountainSearch results dropdown fits.
- [ ] **Step 7 — Model Lab.** `.lab-grid` already 1 col at 900px. The `.grid-table` (`HourlyGrid`) and `ModelCharts`/`ForecastEvolutionChart` must scroll horizontally inside `.grid-scroll`/a scroll wrapper with the edge-fade, never overflow the page. Confirm chart SVGs use `width:100%`/viewBox. The lab sub-header (`.lab-head-in`) wraps.
- [ ] **Step 8 — gates.** `npm test` (any snapshot/markup tests), `npm run build`. Add/extend vitest-axe smoke on a couple of panels at narrow width if feasible.
- [ ] **Step 9 — commit** `feat(p10): per-panel mobile pass (verdict/hero/confidence/avy/snotel/sat/notes/dashboard/create/model-lab)`.

---

## Task 9: Verify — gates, e2e, deploy, live verify

- [ ] **Step 1 — full local gate.** `npx tsc --noEmit`, `npm run test:coverage` (≥90/90/85), `npm run build`. (`cd functions && pytest` only as a no-regression sanity — nothing Python changed.)
- [ ] **Step 2 — e2e.** Extend Playwright specs (run vs `PLAYWRIGHT_BASE_URL`): (a) **cache**: open a project, click Unpin → land on dashboard → assert that project's card is gone without a manual reload; (b) **daily chart**: on a >48h-target project at Daily zoom, assert the trend `<svg>` width equals the grid width (no truncation) and the polyline spans the full strip; (c) **expander gating**: a far day's expander never reaches "Hourly" when `canHour` is false; (d) **mobile**: at 390px, no horizontal page overflow (>8px) on dashboard, project detail, model lab, create; the band/zoom controls are `<select>` dropdowns; tap targets ≥44px on the expander/nav/back. Keep specs data-tolerant (skip if no project).
- [ ] **Step 3 — deploy.** `./scripts/deploy-web.sh dev`.
- [ ] **Step 4 — live verify (Playwright MCP).** Desktop 1280 + mobile 390, BOTH themes: (1) unpin a throwaway project → it disappears from the dashboard immediately; (2) the daily trend line spans the tiles on a far-target project at Daily; scroll right → line continues to the last tile; (3) far day expander stops at the deepest available level; (4) mobile: dropdown controls, no overflow, header/panels clean. Screenshot each. 0 console errors.
- [ ] **Step 5 — commit + docs.** `test(p10): cache/daily/expander/mobile e2e + live verification`; update `CLAUDE.md` progress log with a P10 entry (keep <250 lines).

---

## Verification gate (P10 done when all true)
- Unpin/Delete removes the card from the dashboard immediately (no stale cache); verified live.
- Daily trend line spans exactly the rendered tiles at every width incl. mobile; strip scrolls with the line aligned; no truncation.
- Per-day expander only steps to levels with data; global zoom clamps to per-day availability (no empty hour cells).
- 390px: every page legible, zero horizontal overflow, ≥44px targets, dropdown controls; both themes.
- Coverage ≥90/90/85 · tsc · build · Playwright local + live green · deployed + screenshot-verified.
