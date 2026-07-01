# UI Fixes (detail page) — Issues & Root Causes

**Date:** 2026-06-21
**Branch:** `feature/ui-fixes` (off `main` @ b3907d6)
**Reported on:** `/mountains/eldorado-peak?target=2026-06-27` (mobile ~390px)
**Method:** systematic-debugging — root cause established for each before any fix.

Five independent issues. Each below: symptom → root cause (file:line) → fix direction. Coverage gate 90/90/85 and the existing test suite must stay green; changes are surgical.

---

## Issue 1 — Forecast confidence card looks self-contradictory

**Symptom:** The "Forecast confidence" card shows **"High agreement"** at the top but a **"Why this number is uncertain"** list at the bottom — reads as a contradiction.

**Root cause (not a logic bug — a labeling bug):** In `src/components/project/ConfidenceStrip.tsx`:
- The headline `` `${conf} agreement` `` (line ~136) is computed **only from summit-high temperature spread** (`conf` from `spreadF`, line ~60/64: `spreadF <= 6 ? "High" : …`).
- The bottom **"Why this number is uncertain"** block (line ~179, shown only when `flags.length > 0`, line ~171) is computed from **freezing-level data quality** — three independent flags (lines ~76, ~89, ~102): FL-above-summit-while-freezing inconsistency, FL spread ≥ 2000 ft across models, and a model missing the FL field.
- Both signals are legitimate and can be true at once (temps agree, freezing-level is messy — exactly the P5-awareness scenario in the file header). The card just labels the temp-only signal as if it were overall confidence.

**Fix direction:** Scope the headline so it no longer implies whole-forecast confidence. Preferred minimal fix: when `flags.length > 0`, render the headline as temperature-scoped (e.g. **"High agreement on temperature"**) and/or add a one-line bridge ("…but the freezing level is less certain — see below"). Do NOT change the numeric thresholds or the flag logic. Keep "{conf} agreement" wording when there are no flags.

---

## Issue 2 — Terrain map layer toggles (Roads/Trailheads/Wilderness) show nothing

**Symptom:** On the Terrain & Access tab, toggling Roads / Trailheads / Wilderness shows nothing; only **Trails** reliably renders.

**Root cause (data-source limitation + missing UX affordance, NOT a wiring bug):**
- Layer→source mapping (`src/components/map/TerrainMap.tsx` ~19-24, routes in `src/app/api/mountains/[slug]/…`): **Trails = Overpass/OSM** (works on any land); **Roads = EDW `EDW_RoadBasic_01`**, **Wilderness = EDW `EDW_Wilderness_01`**, **Trailheads = EDW `EDW_InfraRecreationSites_01`** (`src/lib/geo.ts` `edwQueryUrl`, hardcoded to `apps.fs.usda.gov/arcx/.../EDW/`).
- **USFS EDW only covers National-Forest land** and returns `features: []` inside NPS units. **Eldorado Peak is `npsParkCode:"noca"` (North Cascades NP)** → EDW layers are legitimately empty there; only the Overpass-backed Trails layer shows. (Matches the known "EDW geo layers = NF land only" behavior.)
- The wiring is correct. The real defect is **UX**: toggling an empty layer leaves the checkbox checked + legend swatch shown but renders nothing, with **no loading/empty/error affordance** — indistinguishable from "broken." (`TerrainAccess.tsx` ~106/124.)
- A tested-but-unused `npsTrailsUrl(parkCode)` helper exists in `geo.ts` (~63) — NPS data sources are available but not wired.

**Fix direction (scope decision — minimal, ship the UX fix; defer full NPS data wiring):**
1. **Per-layer empty/loading state affordance:** when a toggled non-Overpass layer returns 0 features, surface a subtle inline note (e.g. "No Forest Service roads in this area" / "National Forest data only") so empty ≠ broken. This is the core fix.
2. **NPS-park awareness:** for peaks with `npsParkCode`, label the EDW-sourced toggles (Roads/Trailheads/Wilderness) as "National Forest only" (or disable with a tooltip) so the user understands coverage before toggling.
3. **Out of scope (documented follow-up, NOT in this plan):** wiring NPS ArcGIS / `npsTrailsUrl` data sources for in-park peaks. Note it in the doc as future work.

---

## Issue 3 — AQI badge looks off on mobile

**Symptom:** The AQI badge is visually off on mobile (~390px).

**Root cause:** The AQI badge is the `airQualityChip()` → `.hz-chip` rendered by `HazardChips` (`src/components/mountain/HazardChips.tsx` ~32-53), styled in `src/app/globals.css` (~1018-1021):
`.hz-chip { … padding: 2px 9px; font-size: 11px; color: #111; }`.
Problems: (a) **hardcoded `color:#111`** — not theme-aware (jarring on the slate/dark theme); (b) **2px vertical padding** → ~15px tall touch target, below the app's own 44px `pointer:coarse` minimum; (c) **fixed 11px font, no mobile scaling** while sibling badges use 12–12.5px; (d) **no mobile override** at all. Same class also styles the avalanche chip, so the fix improves both.

**Fix direction:** make `.hz-chip` theme-aware (`color: var(--ink)`/appropriate token that keeps contrast on the colored token backgrounds), give symmetric padding, and a `pointer:coarse`/`max-width:680px` rule for a ≥44px touch target + slightly larger font, consistent with `.swarm-badge`. ALSO check whether `AirQualityPanel` renders its own AQI badge and align it; fix whichever the report confirms is "off."

---

## Issue 4 — Summit/Mid/Base temp card overlaps the freezing cross-section on mobile

**Symptom:** On the freezing-level cross-section, the floating Summit/Mid/Base band cards overlap the SVG chart at ~390px (per screenshot).

**Root cause:** In `src/components/project/FreezingLevelHero.tsx` (~272-295) the band readouts use `className="band-card"` positioned by elevation: `style={{ top: calc(${topPct}% - 26px) }}`. CSS (`globals.css` ~374) sets `.band-card { position:absolute; right:16px; width:132px; … }`. The ≤680px override (~605) only shrinks to `width:116px; right:8px` — it **keeps `position:absolute`**, so on a ~354px-wide figure the cards float over the chart and overlap it. (The `Mountain3DCard` wrapper, `globals.css` ~905 `.xflip-inner min-height:340px`, doesn't isolate this.)

**Fix direction:** At ≤680px, stop overlaying — render the three band readouts as a compact row/stack **below** the SVG (`position:static`, full-width row of 3) so they don't cover the chart and stay legible. Preserve the desktop floating-overlay behavior (elevation-aligned) unchanged. Keep the elevation + temp + precip content; only the mobile layout changes.

---

## Issue 5 — Plan/notes panel appears mid-page, not last

**Symptom:** "Your plan / notes" shows in the middle of the Forecast tab; it should be the last thing.

**Root cause:** In `src/components/mountain/MountainDetail.tsx` (~169-181) `PinNotes` is rendered inside a `cols-2` grid alongside `SatellitePanel`, which sits **before** "The Call" (`CallChart`, ~184) and the Model Lab link (~191).

**Fix direction:** Move `PinNotes` to the **end** of the forecast tab (after "The Call"; the Model Lab drill-link may sit above or below it — keep notes the last *panel*). `SatellitePanel` then renders on its own (single-column / full width) where the cols-2 grid was.

---

## Out of scope / non-goals
- No change to ConfidenceStrip thresholds or freezing-level flag logic (Issue 1 is presentation only).
- No new NPS/ArcGIS data wiring for in-park geo layers (Issue 2 follow-up only).
- No backend/API changes; these are web-UI fixes.

## Verification
- Each fix gets/updates a unit test where one is feasible (ConfidenceStrip headline text under flags; MountainDetail panel order; HazardChips styling presence; band-card mobile rule via component test or CSS assertion where the suite already does this).
- Full `npm test` (cov 90/90/85) + `npm run build` green. Mobile (~390px) re-checked for issues 3 & 4.
