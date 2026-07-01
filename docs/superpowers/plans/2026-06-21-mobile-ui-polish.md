# Mobile UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the mobile responsive UI ~99% faithful to the Cirque prototype — fix alignment/spacing/badge issues and two functional render bugs (freezing-hero flip blanks; map/3D render-nothing on toggle) across all 6 routes, without regressing desktop.

**Architecture:** Most changes are in the single style file `src/app/globals.css` plus targeted component className/structure tweaks. Two tasks carry real logic (map resize lifecycle; 3D error recovery) and get unit tests + live verification. Visual changes are verified by re-running the gated QA capture (`QA_POLISH=1`) and a final `ux-reviewer` pass; existing route-mocked e2e specs (which assert structure) must stay green throughout.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, hand-built SVG charts, MapLibre GL, react-three-fiber, Vitest, Playwright.

## Global Constraints
- Quality gates must stay green: `npm run build`; `npm test` (Vitest coverage ≥ **90/90/85** lines/functions/branches); `npm run test:e2e` (desktop 1280×800 + mobile iPhone 12). Coverage **>90%** is a hard user directive.
- TDD for logic: failing test first, then implement.
- Surgical changes only — every changed line traces to a spec item (`docs/superpowers/specs/2026-06-21-mobile-ui-polish-design.md`).
- Touch-target floor **≥44px** under `@media (pointer:coarse)`.
- Themes: both `slate` (dark) and `glacier` (light) must pass. Widths: **360 / 390 / 412**.
- Commit to `main` (small commits per task). Use the repo's commit trailer convention.
- The QA capture: `QA_POLISH=1 npx playwright test --config config/playwright.config.ts tests/e2e/qa-mobile-polish.spec.ts --project=mobile` → writes `qa-screenshots/polish/<state>__<theme>__<width>.png` (gitignored). Re-run per task and read the affected screenshots to confirm the fix.
- Design reference: `docs/prototype-ui/prototype-design-review/project/` (`DESIGN.md`, `app/styles.css`, `app/*.jsx`).

**Per-task definition of done (DoD):** `npx tsc --noEmit` clean · affected unit tests green (add/adjust where structure changes) · affected e2e specs green · re-captured screenshots for the task's page(s) reviewed clean at 360/390/412 × both themes · desktop spot-check unchanged · commit.

---

### Task 1: Safe-area page-gutter primitive (spec A1, A6)

**Files:**
- Modify: `src/app/globals.css` (`.appbar`, `.appbar-in` ~145, `.page` ~189, detail/lab bodies, `.app-footer` ~740, `.empty` ~318, mobile breakpoints ~544/584)
- Modify: `src/app/layout.tsx` (viewport meta / `viewport` export)

**Changes (concrete):**
1. Enable safe-area: in `src/app/layout.tsx` ensure the Next `viewport` export includes `viewportFit: "cover"` (add it to the existing `export const viewport` object; if absent, add `export const viewport: Viewport = { viewportFit: "cover", themeColor: ... }` preserving any existing fields).
2. Fold insets into the horizontal gutters. Replace the static horizontal padding on the page containers with `max(<existing>, env(safe-area-inset-*))`:
   - `.appbar-in { padding: 0 max(28px, env(safe-area-inset-right)) 0 max(28px, env(safe-area-inset-left)); }`
   - `.page { padding: 38px max(28px, env(safe-area-inset-right)) 96px max(28px, env(safe-area-inset-left)); }`
   - Do the same for `.detail-body` and `.lab-body` (find their padding rules; apply the same `max(<existing-px>, env(safe-area-inset-left/right))`).
   - At the `≤680` / `≤480` breakpoints, repeat with the breakpoint's own px (e.g. `max(18px, env(...))`, `max(14px, env(...))`).
3. `.appbar { padding-top: env(safe-area-inset-top); }` (keeps the blurred bar bg under the notch but content below it).
4. Footer: add `padding-bottom: max(<existing>, env(safe-area-inset-bottom))` to `.app-footer` (and/or `.page` bottom) so the home indicator doesn't overlap.
5. A6: at `@media (max-width: 480px)` add `.empty { padding: 48px 24px; }` (down from `80px 24px`).

**Verify:**
- [ ] `npx tsc --noEmit` clean; `npm run build` succeeds.
- [ ] `npm run test:e2e -- --grep "nav|search|your-mountains"` green (structure unchanged).
- [ ] Re-capture, read `home__*`, `sources__*` — confirm gutters unchanged on non-notch capture (insets resolve to 0 in Playwright, so layout must be identical to before; this task is a no-op visually in the harness and only adds device safety). Confirm no regression.
- [ ] Commit: `style(mobile): fold safe-area insets into page/appbar/footer gutters`.

---

### Task 2: Compact mobile header (spec A2, A3, A4)

**Files:**
- Modify: `src/components/layout/Header.tsx`
- Modify: `src/app/globals.css` (`.appbar-*`, new mobile menu rules, `@media (max-width:900px)`)
- Test: `src/components/layout/__tests__/Header.test.tsx` (create if absent; else extend)

**Decision implemented:** compact bar — keep brand + Search + Your Mountains nav visible; collapse the 3 units segmenteds + theme toggle into a single compact "Display" control (a `<details>`/popover or a `Select`-style menu) shown only on mobile; **hide the "Pin a Peak" CTA when `pathname === "/"`**.

**Interfaces:**
- Produces: `Header` still renders `nav` (Search, Your Mountains), a units/theme control, and the CTA. The CTA is conditionally rendered: `const showCta = pathname !== "/";`.

- [ ] **Step 1 — failing test:** in `Header.test.tsx`, render `Header` with `usePathname` mocked to `"/"`; assert the "Pin a Peak" CTA is NOT in the document; with pathname `"/mountains/mt-rainier"` assert it IS.

```tsx
// uses existing test setup; mock next/navigation usePathname
it("hides the Pin a Peak CTA on the home route", () => {
  mockPathname("/");
  render(<Header />);
  expect(screen.queryByRole("link", { name: /pin a peak/i })).toBeNull();
});
it("shows the Pin a Peak CTA off the home route", () => {
  mockPathname("/mountains/mt-rainier");
  render(<Header />);
  expect(screen.getByRole("link", { name: /pin a peak/i })).toBeInTheDocument();
});
```

- [ ] **Step 2 — run, expect FAIL** (`npm test -- Header`).
- [ ] **Step 3 — implement** the `showCta` gate in `Header.tsx`; wrap units+theme in a mobile `.display-menu` (a `<details class="display-menu">` with a summary "Display" and the existing `UnitsToggle`/`ThemeToggle` inside; show inline on desktop, collapse into the menu via CSS `.only-mobile`/`.only-desktop` already in the codebase). Keep desktop markup intact.
- [ ] **Step 4 — run, expect PASS**; full `npm test -- Header` green.
- [ ] **Step 5 — CSS:** in `@media (max-width:900px)` make `.appbar-in` target a 2-row max: brand+nav row, then a right cluster with the compact Display menu + CTA. Ensure the Display menu summary is a ≥44px tap target. Remove the now-redundant `.units-toggle` wrap rules if they become unused (only if YOUR change orphaned them).
- [ ] **Verify:** re-capture; read `home__{slate,glacier}__{360,390,412}` and `detail-forecast__*` — header is ≤2 rows, no CTA on home, units/theme reachable via the Display menu. `npm run test:e2e -- --grep "nav"` green. Desktop spot-check (capture at 1280 or reason from CSS) unchanged.
- [ ] **Commit:** `feat(mobile): compact header — collapse units/theme into a Display menu, hide home CTA`.

---

### Task 3: Unify page mastheads (spec A5)

**Files:** Modify `src/app/page.tsx` (`.home-search`), `src/app/your-mountains/page.tsx` (`.dash-head`), `src/app/globals.css`.

**Changes:** give `.home-search` and `.dash-head` the same masthead rhythm as `.page-head` (`margin-bottom: 30px`) — either add CSS rules for both selectors mirroring `.page-head`, or switch both wrappers to also carry `page-head`. Keep their existing inner content. Confirm no double-margin.

**Verify:**
- [ ] Re-capture `home__*`, `your-mountains__*`, `sources__*`; the heading→content gap is visually identical across all three.
- [ ] `npm run test:e2e -- --grep "search|your-mountains"` green.
- [ ] Commit: `style(mobile): unify page masthead spacing across home/your-mountains/sources`.

---

### Task 4: Fix the freezing-hero flip card on mobile (spec B1, B2, D10) — P0

**Files:** Modify `src/components/three/Mountain3DCard.tsx`, `src/app/globals.css` (`.xflip*` ~816-846).

**Root cause (from review):** the 2D front face blanks inside the `preserve-3d` / `backface-visibility:hidden` context on mobile, and the rotated back face ("Explore in 3D") bleeds through mirrored because it isn't fully hidden when unflipped; `.xflip-back`/`.xflip-stage` can also resolve to ~0 height.

**Changes (concrete):**
1. In `globals.css`, gate the back face's visibility on the flipped state via a class toggle rather than `backface-visibility` alone: e.g. `.xflip-face { backface-visibility: hidden; }` PLUS, when not flipped, `.xflip-inner:not(.is-flipped) .xflip-back { visibility: hidden; }` and when flipped `.xflip-inner.is-flipped .xflip-front { visibility: hidden; }`. (Add the `is-flipped` class in the component based on its existing `flipped` state.)
2. Ensure the front 2D hero paints: give `.xflip-front { transform: translateZ(0); }` and confirm `.xflip-inner` keeps `transform-style: preserve-3d` only on the rotating element. Verify the `.hero` SVG inside has a non-zero measured height (give `.xflip-stage`/`.xflip-back` an explicit `min-height` tied to the front, e.g. `min-height: 320px`).
3. In `Mountain3DCard.tsx`, add the `is-flipped` class to the inner element when `flipped` is true (alongside the existing rotation styling). Do not change the flip trigger/behaviour.

**Verify:**
- [ ] Re-capture `detail-forecast__*` and `focused-forecast__*` (all 3 widths × both themes): the cross-section SVG (mountain silhouette + dashed freezing line + band cards) paints; NO mirrored "Explore in 3D" text bleeds through.
- [ ] `npm run test:e2e -- --grep "hero-flip|focused"` green.
- [ ] **Live spot-check** after deploy (or `npx next dev --webpack` per CLAUDE.md) on a real mobile viewport — the hero is the signature element.
- [ ] Commit: `fix(mobile): freezing-hero flip card — front face paints, back face fully hidden`.

---

### Task 5: DailyOutlook badge alignment + chart label (spec B3–B8) — the "badges don't align" complaint

**Files:** Modify `src/components/project/DailyOutlook.tsx`, `src/components/project/CallChart.tsx`, `src/app/globals.css` (`.dt-wind`:424, `.wind-pill`:435, `.dt-flag`:429, `.day-tile`:414, `.daily-scroll`:398).

**Changes (concrete):**
1. **B3 wind row:** in `DailyOutlook.tsx` remove the literal `{" "}` whitespace text nodes between the flex children of `.dt-wind` (arrow / wind icon / `.wind-pill` / `g24`). In `globals.css` give `.wind-pill { display:inline-flex; align-items:center; line-height:1; }` and ensure its font-size matches the 11px icons so its box height equals theirs; `.dt-wind { display:flex; align-items:center; gap:3px; }` (gap only, no whitespace nodes).
2. **B4 target flag:** add top clearance so `.dt-flag` ("Target", `position:absolute; top:0`) doesn't overlap the "Morning" label — e.g. `.day-tile.is-target { padding-top: 20px; }` (match the flag height) OR render the flag above the label in normal flow. Confirm against `detail-forecast`/`focused-forecast` target tile.
3. **B5 feels-like:** add `.dt-feels { white-space:nowrap; }` and a compact size (e.g. `font-size:9.5px` at `≤480`), or shorten copy to "Feels 36°" on compact tiles.
4. **B6 elevation readout:** at `≤480`, drop the "· daytime high / overnight low" suffix (render shorter "hi/low") so it doesn't wrap.
5. **B7 scroll-fade:** add a right-edge mask/fade affordance to `.daily-scroll` so hidden columns are discoverable (reuse the same approach as Task 9/E2 — a CSS mask gated to overflow if feasible, else a static right fade).
6. **B8 CallChart:** nudge the `°F` axis-unit label so it doesn't collide with the top tick (small `y` offset in the SVG).

**Verify:**
- [ ] Re-capture `detail-forecast__*`, `focused-forecast__*`: wind row `↙ ≋ 12 g24` shares one vertical center with even gaps; no flag/label overlap; feels-like on one line; elevation readout single-line at 360.
- [ ] `npm test -- DailyOutlook CallChart` green (adjust snapshot/structure tests if present).
- [ ] `npm run test:e2e -- --grep "browse|daily-outlook"` green.
- [ ] Commit: `fix(mobile): DailyOutlook wind-badge alignment, target-flag overlap, compact wraps`.

---

### Task 6: Safety tab — inter-panel rhythm + badge alignment (spec C1–C12) — the "safety band" complaint

**Files:** Modify `src/components/mountain/MountainDetail.tsx` (safety tab assembly ~222-253), `src/app/globals.css` (`.mtab-panel`, `.aqi-row`:972, `.evt`:978, danger tokens), and panels: `AvalanchePanel.tsx`, `DangerColumn.tsx`, `AspectRose.tsx`, `AirQualityPanel.tsx`, `SeismicPanel.tsx`, `ParkAlertsPanel.tsx`, `StormPanel.tsx`.

**Changes (concrete):**
1. **C1 (P0) inter-panel gap:** wrap the Safety tab content in a stack with rhythm. Add `.safety-stack { display:flex; flex-direction:column; gap:22px; }` and apply it to the Safety tab's container in `MountainDetail.tsx` (the fragment currently has no gap; `.detail-grid` gap is 22px — match it).
2. **C2 danger chip:** keep the avalanche `DangerChip` on the title row on mobile (override the `≤680` `.panel-head { flex-direction:column }` for this panel to `flex-direction:row; flex-wrap:wrap; justify-content:space-between;`), so it doesn't orphan left-aligned below the title.
3. **C3 AQI baseline:** `.aqi-row { align-items: flex-start; }` (was `center`) so the serif "80" aligns to the first text row, not the block center. Verify the number's cap-height sits on the "Moderate · PM2.5" line.
4. **C4 danger meter at 360:** at `≤480`, reflow `.danger-row` so the `54px 1fr auto` grid gives the meter full width — e.g. label column `44px` and move the `.danger-tag` to a second row (`grid-template-columns: 44px 1fr;` + tag on row 2), or the existing `.compact` variant. Keep a meter `min-width` so segments don't collapse.
5. **C5 park-alert emoji → Icons:** replace the emoji glyphs in `ParkAlertsPanel.tsx` `categoryStyle` with the app's monochrome `Icons.*` set (consistent baseline + theme-aware), or a colored `.dot` like StormPanel.
6. **C6 seismic truncation:** give the left span of `.evt` `min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;` so long place names truncate and the time-ago stays pinned right.
7. **C7 seismic swarm badge:** reuse a shared pill class (match other badges' radius/padding) instead of the ad-hoc inline `borderRadius:4`.
8. **C8 AspectRose:** drop the fixed `width`/`height` on the SVG (keep `viewBox`), size via CSS (`width:96px` at `≤480`); bump N/E/S/W tick `font-size` to ~10.
9. **C9:** remove the inline `maxWidth:360` on the avalanche bottom line; let the single-column flow control width (optional `max-width:60ch` class).
10. **C10 storm dot:** align the alert dot via `align-items:baseline` in a flex row instead of hard-coded `marginTop:4`.
11. **C11 provenance:** once C1 adds gaps, the repeated inline `marginTop:14` footers are fine; optionally extract a shared `.panel-foot` (only if it stays surgical).
12. **C12 light-theme contrast:** verify the avalanche danger tokens (`--d2`/`--d3` with white text) meet AA on glacier `--surface-2`; if not, darken the token or the text for the light theme only.

**Verify:**
- [ ] Re-capture `detail-safety__{slate,glacier}__{360,390,412}`: consistent ~22px gaps between every panel; danger chip on the header row; AQI "80" baseline-aligned; danger meters full-width at 360; no emoji; seismic rows truncate.
- [ ] `npm test -- AvalanchePanel DangerColumn AspectRose AirQualityPanel SeismicPanel ParkAlertsPanel StormPanel` green (adjust tests for the emoji→Icons + structure changes).
- [ ] `npm run test:e2e -- --grep "safety"` green.
- [ ] Commit: `fix(mobile): Safety tab panel rhythm + avalanche/AQI/danger/seismic/park-alert badges`.

---

### Task 7: Map render reliability on tab switch / toggle (spec D1, D2) — P0 functional

**Files:** Modify `src/components/map/TerrainMap.tsx`. Test: `src/components/map/__tests__/TerrainMap.test.tsx` (create/extend — mock `maplibre-gl`).

**Root cause:** the map is built once per tab-mount (tabs unmount inactive content) with no `map.resize()`/ResizeObserver, so it can size to a not-yet-laid-out container and render blank; `setStyle()` on base/snow toggle wipes layers and the re-add races on `style.load`.

- [ ] **Step 1 — failing test:** with `maplibre-gl` mocked (a fake `Map` recording `resize`/`on`/`setStyle` calls), render `TerrainMap`, fire the mocked `load` event, and assert `map.resize()` was called after load; and assert a `ResizeObserver` was constructed observing the container.

```tsx
// mock maplibre-gl Map: { on, off, addControl, setStyle, resize: vi.fn(), remove, isStyleLoaded:()=>true }
it("calls map.resize() after load and observes container resize", () => {
  const { map, resizeObserverObserve } = renderTerrainMapWithMock();
  map.__emit("load");
  expect(map.resize).toHaveBeenCalled();
  expect(resizeObserverObserve).toHaveBeenCalledWith(expect.any(Element));
});
```

- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:** on `map.on("load", ...)` call `map.resize()`; add a `ResizeObserver` on the container ref that calls `map.resize()` (cleanup on unmount); for D2, guard `setStyle` (only when the base/snow value actually changed) and re-apply geo layers defensively after the style settles (on `idle`/`style.load`, and call once immediately if `isStyleLoaded()`).
- [ ] **Step 4 — run, expect PASS;** `npm test -- TerrainMap` green.
- [ ] **Verify (live):** deploy or `next dev --webpack`; on a mobile viewport, switch to Terrain tab repeatedly and toggle Topo/Satellite + Snow cover — the map always renders, never blanks. Re-capture `detail-terrain__*` for layout.
- [ ] **Commit:** `fix(mobile): map resize on load + ResizeObserver; guard setStyle layer race`.

---

### Task 8: /3d error recovery + disclaimer + disabled hints (spec D3, D4, D7, D9) — P0 functional

**Files:** Modify `src/lib/hooks.ts` (`useTerrainMeta` ~213-224), `src/app/mountains/[slug]/3d/Explore3D.tsx`, `src/components/three/Mountain3D.tsx`. Test: `src/lib/__tests__/hooks.test.ts` (extend) for the meta error semantics.

**Root cause:** `useTerrainMeta` sets `available=false` on ANY error, and `Explore3D` renders a permanent "3D model not available" on `!available && !isLoading` — so a transient meta failure becomes a dead-end; GLB load failures fall back to invisible `null`.

- [ ] **Step 1 — failing test:** unit-test the meta hook's status mapping — a 404 ⇒ `unavailable` (truly unbaked), a 500/network error ⇒ `error` (retryable), success ⇒ `available`. (Mock the fetcher.)

```ts
it("distinguishes 404 (unavailable) from transient error (retryable)", async () => {
  expect(deriveTerrainState({ error: { status: 404 }, data: undefined })).toBe("unavailable");
  expect(deriveTerrainState({ error: { status: 503 }, data: undefined })).toBe("error");
  expect(deriveTerrainState({ error: undefined, data: META })).toBe("available");
});
```

- [ ] **Step 2 — run, expect FAIL** (extract a pure `deriveTerrainState` helper if needed so it's unit-testable).
- [ ] **Step 3 — implement:** `useTerrainMeta` returns a 3-state status; `Explore3D` shows the model when available, a **retryable** error panel (with a Retry button calling SWR `mutate`) on `error`, and the calm "not baked yet" only on a true 404. In `Mountain3D.tsx`, give the inner `GLErrorBoundary`/`Suspense` a VISIBLE fallback (a small "couldn't load the 3D model — retry" rather than `null`). D7: add a compact "Illustrative — not for navigation" disclaimer directly under the canvas/toggle bar (in addition to the routes panel). D9: surface disabled-toggle reasons inline (a small caption under the toggle bar) since `title` is desktop-only.
- [ ] **Step 4 — run, expect PASS;** `npm test -- hooks` green.
- [ ] **Verify (live):** `/mountains/mt-rainier/3d` on mobile — model renders; simulate a transient meta failure (or trust the unit test) shows Retry, not a dead-end; disclaimer visible without scrolling.
- [ ] **Commit:** `fix(3d): recover from transient terrain-meta/GLB errors; surface disclaimer + disabled hints`.

---

### Task 9: Terrain layer pills + access/webcam/3d-toggle polish (spec D5, D6, D8, D11, D12, D13)

**Files:** Modify `src/components/terrain/TerrainAccess.tsx`, `src/app/mountains/[slug]/3d/Explore3D.tsx`, `src/components/terrain/AccessCards.tsx`, `src/components/terrain/WebcamStrip.tsx`, `src/app/globals.css` (`.layer-panel`:996, `.webcam-*`:985, `.access-card`).

**Changes (concrete):**
1. **D5 layer pills:** make each `.layer-panel label` a bordered pill: `display:inline-flex; align-items:center; gap:8px; padding:8px 12px; border:1px solid var(--line); border-radius:999px; min-height:44px;` and style the checkbox (`width:18px;height:18px;accent-color:var(--accent)`). Keep `flex-wrap` but equalize sizing so chips grid cleanly (no orphaned "Earthquakes").
2. **D6:** move the MODIS snow-cover caption out of the `.layer-panel` flex onto its own line below the snow checkbox (`flex-basis:100%` or a separate `<p class="mono-dim">`).
3. **D8 (/3d toggles):** shorten "Slope angle (30–45°)" → "Slope 30–45°"; give the toggle chips equal width or a 2-col grid on mobile so rows align.
4. **D11 access cards:** de-dupe the repeated "ACCESS" kicker (render one "Access" panel with labeled rows, or drop the kicker on rows 2-3). Keep links/permits content.
5. **D12 webcam strip:** add the right-edge scroll-fade affordance; reduce `.webcam-card` basis to ~200px at `≤412`.
6. **D13:** group the Topo/Satellite Segmented + layer pills into one "map controls" cluster (shared border/kicker) so they don't read as two disconnected widgets.

**Verify:**
- [ ] Re-capture `detail-terrain__*`, `explore-3d__*`: layer pills are ≥44px and wrap cleanly; MODIS caption on its own line; 3D toggles align; access section de-duped; webcam strip shows scroll affordance.
- [ ] `npm test -- TerrainAccess AccessCards WebcamStrip` green (adjust for structure).
- [ ] `npm run test:e2e -- --grep "terrain|explore-3d"` green.
- [ ] Commit: `fix(mobile): terrain layer pills (44px) + access/webcam/3d-toggle polish`.

---

### Task 10: Model Lab — touch targets, chart legibility, hourly grid (spec E1–E12)

**Files:** Modify `src/components/modellab/ModelLab.tsx`, `ModelCharts.tsx`, `HourlyGrid.tsx`, `ForecastEvolutionChart.tsx`, `ModelInfo.tsx`, `src/components/charts/LineChart.tsx`, `src/app/globals.css` (`.modeltag`, `.grid-table`/mask ~514-522, coarse-pointer ~719).

**Changes (concrete):**
1. **E1 touch targets:** add `.modeltag` (header model chips + "About the models" toggle) to the `@media (pointer:coarse) { min-height:44px }` block; add vertical padding and a `.modeltag:focus-visible` ring.
2. **E2 hourly mask:** gate the scroll-fade mask on actual overflow — toggle a class via JS (`scrollWidth > clientWidth`) instead of always-on `-webkit-mask-image`; never fade the sticky `.rowlbl` column (only fade the right edge).
3. **E3/E4 chart axis legibility:** stop the whole `viewBox 640×…` SVG from scaling tick text into illegibility at 360 — either bump tick `font-size` for narrow viewports, render at a fixed device-px height, or reduce the mobile `viewBox` width so 1 user-unit ≈ 1 CSS px; widen `LineChart` `PAD.l` (prop-driven) when tick labels exceed ~4 chars (freezing 5-digit feet must not clip).
4. **E5 header chips:** at `≤480` hide the `res` sub-label (`.only-desktop`) or move chips to their own full-width wrapping row below the title.
5. **E6:** move the wind-threshold "≥45 mph high wind" pill onto its own line under the model legend (`flex-basis:100%`) so it isn't mistaken for a 4th model; prefix with a non-model glyph.
6. **E7:** make `.grid-table tr.is-target th.rowlbl` background `var(--target-band)` so the sticky label keeps its row highlight.
7. **E8:** scope the generic `position:sticky` to `.rowlbl` only (not all `th`); add `scope="col"` to hour `<th>`.
8. **E9:** use distinct glyphs for hot-temp vs high-wind (keep the existing per-cell `aria-label`s).
9. **E10:** tone the intro mono lat/lng/TZ block on mobile (smaller/secondary or truncate the coords line).
10. **E11:** verify glacier `--line`/series contrast ≥3:1; bump faded-series opacity to ~0.45 or darken the light-theme gridline.
11. **E12:** ensure the "About the models" `<dl>` long GFS source string doesn't overflow the card at 360 (`minmax(200px,1fr)` or stack label-above-value on phones).

**Verify:**
- [ ] Re-capture `model-lab__{slate,glacier}__{360,390,412}`: all controls ≥44px; axis labels legible, no clipping; hourly grid fade only on real overflow and sticky column not dimmed; chips on their own row; target-row label highlighted.
- [ ] `npm test -- ModelLab ModelCharts HourlyGrid ForecastEvolutionChart ModelInfo LineChart` green (adjust for structure/scope/glyph changes).
- [ ] `npm run test:e2e -- --grep "model-lab"` green.
- [ ] Commit: `fix(mobile): Model Lab touch targets, chart axis legibility, hourly-grid mask/scope`.

---

### Task 11: Final integration, full gates, re-QA, ux-review

**Files:** none new (fix-loop only).

- [ ] Run the full QA capture; read all 54 screenshots; confirm every P0/P1 from the spec is resolved and P2s addressed (or list any deliberately deferred with reason).
- [ ] Full gates: `npm run build` · `npm test` (coverage ≥90/90/85) · `npm run test:e2e` (desktop + mobile) all green · `npx tsc --noEmit` clean.
- [ ] Desktop regression spot-check at 1280×800 (capture or reason): unchanged.
- [ ] Dispatch a `ux-reviewer` over the final screenshots + diff; fix any blockers (loop).
- [ ] **Deploy** (`terraform plan -out=PLAN` with `TF_VAR_alert_email` + `TF_VAR_ga_measurement_id` set, then `apply PLAN`) and **live spot-check** the two functional fixes (freezing hero; map/3D toggles) at mobile widths on the deployed URL.
- [ ] Commit: `chore(mobile): final mobile-polish integration + ux-review fixes`.

---

## Self-Review (spec coverage)
- A1✓T1 A2✓T2 A3✓T2 A4✓T2 A5✓T3 A6✓T1 · B1✓T4 B2✓T4 B3✓T5 B4✓T5 B5✓T5 B6✓T5 B7✓T5 B8✓T5 · C1✓T6 C2✓T6 C3✓T6 C4✓T6 C5✓T6 C6✓T6 C7✓T6 C8✓T6 C9✓T6 C10✓T6 C11✓T6 C12✓T6 · D1✓T7 D2✓T7 D3✓T8 D4✓T8 D5✓T9 D6✓T9 D7✓T8 D8✓T9 D9✓T8 D10✓T4 D11✓T9 D12✓T9 D13✓T9 · E1–E12✓T10. All spec items mapped. Functional bugs (B1/B2/D1/D3) carry live verification; the rest carry re-capture + ux-review.
