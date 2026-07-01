# Mountain Weatherman — Data Integrations & UX Redesign

> **Date:** 2026-06-20
> **Status:** Design approved (brainstorm complete) — ready for phased implementation plans
> **Supersedes/extends:** the mountains-first redesign (P13) and the open-data-sources research reference (`2026-06-15-open-data-sources-research.md`)

## 1. Purpose

Two things at once, captured in one vision so the information architecture stays unified:

1. **Add new open data integrations** — air quality, weather/storm alerts, seismic & volcanic hazard, park/road/trail access, snow-cover imagery, and webcams — so a mountain page answers go/no-go questions beyond the forecast.
2. **Redesign the UX & flow** — make the page glanceable (color cues, clearer target date), fix specific weaknesses (freezing-level time-of-day & axes, the units bug in 3D, the unhelpful "call" chart), and reorganize everything into tabs so the new data doesn't drown the page.

The work decomposes into **three sequential implementation plans** (§12). This document is the shared design; each plan is written and executed separately.

## 2. Scope

### In scope (the data sources to integrate)
- **AirNow** (EPA/NOAA) — air quality / wildfire smoke.
- **NWS Alerts API + SPC Convective Outlook** — severe thunderstorm warnings/watches & day-1 storm risk.
- **USGS ComCat FDSN Event API** — recent earthquakes near each peak.
- **USGS HANS Volcano API** — volcano alert level/color + latest notice (5 WA Cascade volcanoes).
- **NASA GIBS** — MODIS snow-cover tile overlay (client-side WMTS tiles).
- **OpenStreetMap Overpass API** — trail/approach geometry.
- **NPS Alerts API** — park closures/hazards.
- **NPS ArcGIS** — trails & parking-lot geometry.
- **USFS EDW** — roads, trails, wilderness, MVUM, recreation sites (with closures).
- **Webcams** — NPS (incl. Camp Muir), USGS (St. Helens/Johnston Ridge), WSDOT pass cameras.

### Explicitly out of scope (pre-filtered from the research doc)
USGS stream gauges, Landsat thermal, MODIS AppEEARS numeric extraction, OpenBeta, Strava, Peakbagger, WTA, GOES GLM lightning. These may be revisited later; they are **not** part of this effort. Ski-resort webcams are deep-link-only (commercial players — do not hotlink).

### Non-goals
- No accounts/login, no server-side user state (the mountains-first model stays: pins are client-side localStorage). 
- No real-time permit availability (deep-link to Recreation.gov instead).
- No new first-class entities. Mountain remains the only one.

## 3. Cross-cutting principles

These apply to **every** surface in every phase.

1. **Provenance is first-class (hybrid model).** The user must always be able to tell where a displayed value comes from — which model, why that model, whether it's a blend and why. Implemented as:
   - A **pipeline change**: the derive/aggregation layer emits a `provenance` record alongside values — chosen model, blend ranges (e.g. HRRR hrs 0–48 / GFS beyond), and *why* a model was skipped (e.g. "ECMWF has no freezing-level field"). The UI states facts, never guesses.
   - A **shared `<Provenance>` component**: a compact always-visible tag (`GFS ⓘ`, `HRRR→GFS ⓘ`, `AirNow ⓘ`). A **short inline reason** shows only where the model choice changes a decision (freezing level, the verdict); a popover holds the full detail elsewhere. The same tag pattern covers external sources (NWAC, NPS, USGS, OSM, NASA) with source · distance · freshness.
   - A global **"Models & sources"** explainer page that ties the conventions together (what HRRR/GFS/ECMWF are, why blends, attribution).
2. **Graceful degradation per peak.** Coverage is uneven (volcano = 5 peaks; webcams ≈ Rainier/St-Helens; NPS = national parks only; EDW = national forests; out-of-region peaks like Whitney lack NWAC/SNOTEL). Any unavailable source **omits its panel / shows an explicit "unavailable" or "off-season" state** — never a broken render. New per-mountain config fields drive availability (§10.3).
3. **Units honored everywhere.** Every elevation/distance respects the units toggle (ft/m), including the 3D overlays (the current bug). Temp/wind/precip honor their toggles too.
4. **Mobile-first parity.** Every new surface has a defined mobile treatment (tabs scroll/stack, date strip collapses to a stepper, the map is touch-usable, panels stack). Reuse the existing `.only-mobile`/`.only-desktop` + `<Select>` patterns.
5. **Freshness & honesty.** Every data display names its update time and, where the reading is geographically distant from the summit (AQI valley stations, MODIS cloud gaps), says so.

## 4. Information architecture

The mountain detail page is reorganized from a single long scroll into **three tabs** under a sticky header.

### 4.1 Sticky header (persists across tabs)
- Mountain name · region · summit elevation.
- **Target-date selector** (§5).
- **Hazard chip row** — exactly three chips: **Avalanche · Air Quality · Storm**. Each is color-coded (green→red, reusing the avalanche `d1–d5` ramp). A chip lights red on a critical condition; the **Storm chip turning red is the cross-tab signal** for an active NWS warning and **taps through to the Safety tab** (scrolls to the relevant panel). Volcano, earthquakes, and closures do **not** get a chip — they live as panels in Safety. No banner above the tabs.

### 4.2 Tabs
- **Forecast** (default tab) — the weather story (§6).
- **Safety** — hazard panels (§7).
- **Terrain & Access** — the map, webcams, access info, and the standalone-3D entry (§8).

Tabs appear progressively as phases land (§12): Phase 1 builds the header, the Forecast tab, and a Safety tab seeded with the existing Avalanche panel; Phase 2 fills Safety; Phase 3 adds Terrain & Access.

## 5. Flow redesign — always-targeted; pin = bookmark

Replaces today's browse-vs-focused split and the separate `/pin` form.

- **Every mountain page always has a target date.** Default = **Tomorrow**. **Today is a selectable day** (current conditions are one tap away). The target is read from / written to `?target=YYYY-MM-DD` (shareable), defaulting to tomorrow when absent.
- **Date selector (header):** a plain-English headline — *"Planning for Tomorrow · Sat Jun 21 · in range · not pinned"* — above a **day-strip** of selectable days. Days beyond model range are dimmed (focused-only panels degrade for them). A 📅 control picks arbitrary far-out dates. **Responsive:** the headline always shows; the strip collapses toward a ◀/▶ stepper on mobile.
- **Pin = bookmark.** Pinning saves `{mountainId, name, targetDate, notes}` to Your Mountains (localStorage, the existing `pins.ts`). It is **not** how you set a date. Notes become **inline on the page** (no separate form). The `/mountains/[slug]/pin` route and the browse/focused branching in `MountainDetail` are removed.
- **Your Mountains** lists bookmarks; each opens `/mountains/[slug]?target=…`.
- **Out-of-range targets** (> model horizon): focused panels (freezing hero, confidence, call chart) show a "we'll track this as your date nears" state; the Daily Outlook and Safety/Terrain data still render.

## 6. Forecast tab

### 6.1 Daily Outlook — visual cues (tile-tint model)
Goal: glance and instantly see good days vs bad. Reuse the avalanche color ramp so wind/severity speak the same language as avy danger.
- **Per-day severity tile-tint.** Each day tile gets a faint background wash by its **severity score = worst of {wind, precip, freezing-level-vs-route}** (green→yellow→orange→red). The tint carries **down into AM/Mid/PM and hourly cells** when a day is expanded.
- **Wind:** a **direction arrow only** (no compass letters) + a **color-scaled sustained pill** + a **gust line** ("gust 68 mph"). Scale (sustained, summit; tunable per-mountain later): **<12 green · 12–25 yellow · 25–40 orange · 40+ red mph**.
- **Feels-like** stays, under the temps. **Precip** type+amount stays, colored (snow/rain/mixed). **Weather icons** get subtle tints (sun gold, snow pale-cyan, rain blue, etc.).
- **Target day** gets extra emphasis (ring/📌).
- Tile density = the "Rich" layout (≈104px), responsive.
- **Provenance:** a blend legend (`● HRRR hrs 0–48  ● GFS beyond`) + the `HRRR→GFS ⓘ` tag (the existing `hourSource()` already picks per cell — surface it).

### 6.2 Freezing level — chart redesign + time-of-day + units fix
- **Labeled chart.** Replace the unlabeled DayStrip sparkline with a chart that has a **labeled elevation Y-axis (in selected units)**, a **time X-axis**, and **summit/mid/base reference lines** so you see the curve cross your route. Shade above/below-freezing zones.
- **Featured time = dawn by default**, with a **Dawn / Midday / PM toggle** (climbing-relevant default; still comparable). The featured number reads e.g. "9,800 ft at dawn · ≈1,000 ft below summit." Replace the hard-coded `noonRow()` default with a selectable time; keep the chosen model FL-capable.
- **3D units fix (bug).** `FreezingPlane` (`three/FreezingPlane.tsx:15`) and `SummitMarker` (`three/SummitMarker.tsx:28`) currently hard-code `ft`; make them read `useUnits()` and format via `fmtDist`. The freezing value already flows as feet (canonical) — only the label formatting is wrong.
- **Provenance:** loud here — `GFS ⓘ` + short inline reason ("only model with a freezing field at this range").
- The **freezing cross-section card-flip mini-3D** stays on the Forecast tab next to the hero.

### 6.3 The "target-day call" chart — convergence band
Replace the multi-model spaghetti evolution chart on the detail page with a **convergence band** that answers *"is the forecast for my day settling, and which way is it moving?"*
- X = how long before the target each run was issued; lines = successive runs (HRRR/GFS/ECMWF); a **spread band that narrows = converging = trustworthy**, widening = volatile.
- A **verdict chip** ("Firming up" / "Still volatile") + a one-line **teaching caption**.
- A **variable toggle** (temp / wind / freezing / precip).
- The **detailed all-models evolution** view moves to Model Lab (§6.5) so the two complement rather than duplicate.
- The existing **Confidence strip** (current cross-model disagreement: spread, missing fields, freezing-vs-summit inconsistency) **stays on the Forecast tab** next to the call chart — it is the *snapshot* of model agreement, complementing the convergence chart's *run-over-run* stability. Restyle to the new tokens/provenance.

### 6.4 Snowpack & satellite
Existing SNOTEL snowpack panel and the Sentinel-2 satellite panel stay on the Forecast tab, restyled to the new token/provenance conventions.

### 6.5 Model Lab — kept & cleaned up
Remains a dedicated deep-dive route (`/mountains/[slug]/models`), **linked from the Forecast tab** (not a 4th tab). It is the home for **per-model detail**: multi-model ModelCharts (temp/wind/freezing/precip), the HourlyGrid MOS table, the **detailed all-models forecast-evolution/convergence** view, and "About the models." Cleanup (folded into Phase 1):
- Adopt the **new color/wind scale + units-aware labeled axes** for consistency with the redesigned Forecast tab.
- Reconcile the evolution chart with §6.3 (summary lives on Forecast; detail lives here).
- Sweep the leftover post-POC nits scoped to Model Lab (Segmented→radiogroup, evolution-chart model-name legend, HourlyGrid glyphs + `th scope`, About-the-models) + a mobile pass.

## 7. Safety tab

Panels ordered most-actionable-first; each carries a `<Provenance>` tag (source · distance · freshness); unavailable sources omit their panel.

1. **Air quality & smoke (AirNow).** Current AQI + category + dominant pollutant; **always shows the reporting-area name + distance** (valley monitor, not summit) + a 24h sparkline. Drives the **AQI hazard chip**. Smoke caveat text when PM2.5 elevated.
2. **Storm & lightning (NWS + SPC).** Active **Severe Thunderstorm Warning/Watch** (NWS Alerts) + **SPC Day-1 categorical risk**. Active warning lights the **Storm chip red** (the cross-tab signal). No data outside risk windows = a quiet "no active storm risk" state.
3. **Volcano status (HANS).** Alert level + color (GREEN/…/RED), NVEWS threat tier, date + one-line summary of the latest notice, link out. Only on the 5 volcano peaks.
4. **Recent earthquakes (ComCat).** Count in 30 days within ~30 km, largest magnitude, depth, most-recent events list; **swarm badge** when the 7-day count exceeds the 30-day baseline.
5. **Park alerts & closures (NPS Alerts).** Active alerts color-coded by category (Danger/Closure/Caution/Information).
6. **Avalanche (NWAC).** The existing panel moves here (its chip already exists).

## 8. Terrain & Access tab

### 8.1 Map
- **MapLibre GL** map centered on the peak's bbox (new per-mountain `mapBbox` field).
- **Base style: Topo default + Satellite toggle** (topographic/contour base for terrain reading; aerial alternate).
- **Layers** (toggle panel): **Trails** and **Roads + closures** ON by default; **Wilderness**, **Snow cover (GIBS)**, **Webcams**, **Trailheads**, **Earthquakes** opt-in. Closed road segments are highlighted.
- **Attribution** line: © OpenStreetMap · USFS · NPS · NASA GIBS (+ NRCS/EOX as already present).

### 8.2 Layer data sources
- **Trails:** OSM Overpass (`route=hiking`, `sac_scale`) + NPS ArcGIS trails + EDW trails → cached GeoJSON.
- **Roads + closures:** EDW `RoadBasic` (+ closed-to-motorized layer) + MVUM → cached GeoJSON.
- **Wilderness:** EDW `Wilderness` polygon.
- **Snow cover:** NASA GIBS WMTS tiles (`MODIS_*_NDSI_Snow_Cover` daily + 8-day composite fallback) — **loaded client-side, no backend**, with the acquisition-date caveat.
- **Trailheads / rec sites + closures:** EDW `InfraRecreationSites` (closure fields).
- **Earthquakes:** ComCat epicenter markers (shares Safety data).

### 8.3 Webcams — render-direct, no backend
- A horizontally-scrollable **webcam strip** + optional **map markers**. Sources: NPS (incl. Camp Muir 10,100 ft), USGS Johnston Ridge, WSDOT pass cameras.
- **Rendered directly in the browser** as `<img src="{url}?t={now}">` with a cache-bust param — NPS/USGS are public-domain direct JPEGs; WSDOT JPEG URLs are stable once discovered. **No worker, no GCS proxy, no runtime key.** Per-peak camera URLs live in the catalog (`webcams` field), discovered once during catalog setup (WSDOT camera list is a one-time lookup, not a runtime dependency).
- `onError` placeholder fallback. Peaks with no camera show an explicit **"no webcam available"** state; seasonal cams show "offline (seasonal)."

### 8.4 Access cards
Plain-text summaries so the user gets the answer without reading the map:
- **Roads** — "N closed near peak," which/why, open alternates (EDW, via the cached access route §10.2).
- **Trails** — open/closed + snow-line note (NPS/EDW/OSM, via the cached access route).
- **Permits** — **static per-peak catalog text + deep-link** (free self-issue vs. reservable; e.g. MORA climbing permit, Mt. Adams Climbing Pass links). **No RIDB integration** (removed) — the deep-link URLs and pass facts are stable, so they live in the catalog as plain content, not a live data source.

### 8.5 Standalone 3D
The existing `/mountains/[slug]/3d` full-screen explorer (overlays + legend + "illustrative — not for navigation" disclaimer) **stays**. Its **entry point moves into this tab** (alongside the map). The **units fix (§6.2)** applies here too. Until Phase 3 lands, keep a "3D" link near the Forecast freezing hero so it's never orphaned.

## 9. Data sources reference

Serving model column: **render-direct** = browser consumes it natively (no backend); **route** = thin on-demand Next.js Route Handler (no scheduled worker); **cached route** = on-demand route with a read-through GCS/Firestore cache.

| Source | Auth (runtime) | Serving model | Cache TTL | Tab / surface |
|---|---|---|---|---|
| AirNow | API key (have) | route (key-proxy) | ~30 min | Safety: AQI panel + chip |
| NWS Alerts | none (User-Agent) | route | ~10 min | Safety: storm panel + chip |
| SPC Outlook | none | route | ~3 h | Safety: storm panel |
| ComCat | none | route (30-day range query) | ~30 min | Safety: quakes; map markers |
| HANS Volcano | none | route | ~6 h | Safety: volcano panel |
| NPS Alerts | API key (have) | route (key-proxy) | ~1 h | Safety: closures panel |
| GIBS tiles | none | **render-direct** (map tiles) | — | Terrain: snow layer |
| Overpass | none (User-Agent) | cached route | ~7 d | Terrain: trails |
| NPS ArcGIS | none | cached route | ~7 d | Terrain: trails/parking |
| EDW (roads/trails/wilderness/MVUM/rec) | none | cached route | ~1 d | Terrain: roads/wilderness/closures |
| NPS/USGS/WSDOT webcams | none | **render-direct** (`<img>`) | — (cache-bust) | Terrain: webcam strip/markers |

No scheduled workers, Pub/Sub topics, or DLQ are added — only Route Handlers (some with a read-through cache). RIDB/permits is removed; permit info is static catalog content (§8.4). Rate limits, exact endpoints, and field lists live in the research reference (`2026-06-15-open-data-sources-research.md`) and the interface contract (to be extended in each plan).

## 10. Backend architecture

**No new scheduled workers.** The new data is served two ways: render-direct in the browser, or via thin on-demand Next.js Route Handlers (some with a read-through cache). The existing scheduled pipelines (weather/NWAC/SNOTEL/satellite) are unchanged — they keep their workers because they accumulate forecast history that has no on-demand equivalent.

### 10.1 Serving model
1. **Render-direct (no backend):** artifacts the browser renders natively — **webcam JPEGs** (`<img>` with cache-bust) and **GIBS/MODIS snow tiles** (MapLibre raster layer pointed at NASA WMTS). No key, no reshaping, no proxy.
2. **On-demand Route Handlers (no scheduled worker):** JSON/GeoJSON we must secure, normalize, attach provenance to, or rate-protect. Fetched when the relevant tab opens (SWR per-panel loading state). The handler injects keys/headers, maps to our TS types, stamps freshness/provenance, and sets `Cache-Control`.
   - *Why not pure client-direct:* AirNow & NPS need their keys hidden; NWS requires a `User-Agent`; routing everything through our server also avoids per-upstream CORS risk and gives one place to normalize + attach provenance.
   - *Why no scheduled worker / history:* the hazard APIs are **range-queryable on demand** — AirNow's historical endpoint returns the 24h sparkline in one call; ComCat returns 30 days of events in one query; HANS/NWS/SPC are current-state. There is nothing to pre-accumulate.
3. **Read-through cached routes (no scheduled worker):** the heavy, slow-changing geospatial layers (Overpass, EDW, NPS ArcGIS GeoJSON). First request populates a GCS/Firestore cache with a daily/weekly TTL; subsequent requests serve from cache. Protects Overpass's rate limit and avoids re-shipping large EDW payloads. Still no scheduler/Pub/Sub/DLQ.

### 10.2 Route Handlers (read-only, mountain-scoped)
New handlers mirroring the existing `/api/mountains/[slug]/…` family: `air-quality`, `alerts` (NWS+SPC), `volcano`, `seismic`, `park-alerts` (NPS), `hazards-summary` (lightweight roll-up of AQI value + storm-active + avy level, fetched on page load so the **header chips** populate on every tab), and the cached geospatial routes `trails`, `roads`, `wilderness`, `rec-sites`. GeoJSON passthrough for map layers. No `webcams` image route and no `permits` route (render-direct / static catalog respectively).

### 10.3 Per-mountain catalog fields (new)
Added to `src/lib/mountains-data.ts` (web source of truth) **and** the Firestore `mountains` doc (Python source of truth) — keep them in sync per `references/add-mountain.md`, and update that doc + `mountains-data.test.ts` (which encodes WA/OR assumptions) for the new fields and out-of-region cases:
- `airnowHint` (lat/lng already exist; optional preferred reporting area), `hansVolcanoId` (e.g. `wa6`; empty if none), `npsParkCode` (e.g. `mora`; empty if none), `usfsForestName`, `webcams` (list of `{id, label, source, url, seasonal?}` — direct JPEG URLs), `mapBbox`, `permits` (optional static `{label, url, note}` deep-links). Empty/absent → UI "unavailable," exactly like the existing `nwacZone*`/`snotelStation*` pattern.

### 10.4 Secrets / prerequisites
Only **two** runtime secrets, both **already obtained** (in `NOTES.md`): **AirNow** and **NPS Data API**. They go in **Secret Manager** (env-prefixed, like CDSE) and are injected into the Cloud Run web service env for the key-proxy routes — they must **not** stay in `NOTES.md` (which is in git history). NWS/SPC/ComCat/HANS/Overpass/EDW/GIBS/webcams need **no runtime key**. WSDOT camera URLs are a one-time catalog lookup (not a runtime secret). **No new key registration is required.**
> ⚠️ Security: `NOTES.md` already contains the CDSE secret and now these keys in committed history. Recommend rotating all of them and keeping values only in Secret Manager going forward.

### 10.5 Provenance data
The weather derive layer (`lib/derive.ts` / `lib/forecast-select.ts`) emits a `provenance` object per derived value/series: `{ model, blendRanges?, skipped: [{model, reason}] }`. External-source docs already carry source/time; standardize a `{ source, observedAt, distanceMi? }` shape the `<Provenance>` component reads.

## 11. Testing & quality gates (unchanged bar)
Every phase holds the existing gates: web `npm run build` + Vitest (coverage 90/90/85) + Playwright (desktop 1280×800 + iPhone 12, route-mocked locally, reused live via `PLAYWRIGHT_BASE_URL`); Python `pytest --cov-fail-under=90` (terrain suite from repo root); `terraform validate`; TDD (failing test first). `three/**` stays coverage-excluded (logic in tested `terrain.ts`/hooks). New live-only e2e specs self-gate on `PLAYWRIGHT_BASE_URL`. Subagent-driven execution with python-reviewer / ux-reviewer per task.

## 12. Phasing → three implementation plans

### Phase 1 — Flow + Forecast polish (no new data sources)
Tab shell + sticky header + hazard chip row (Avalanche chip only for now) + date selector & always-targeted flow (remove `/pin` form & browse/focused split; inline notes; pin=bookmark) + Daily Outlook color/tile-tint + freezing chart redesign (dawn default, labeled axes) + **3D units fix** + convergence "call" chart + **Model Lab cleanup** + `<Provenance>` component & pipeline provenance emission + "Models & sources" page. **Ships standalone.**

### Phase 2 — Safety data
On-demand Route Handlers (`air-quality`, `alerts`, `volcano`, `seismic`, `park-alerts`, `hazards-summary`) + AirNow/NPS keys into Secret Manager + Cloud Run env + Safety-tab panels (AirNow, NWS+SPC, ComCat, HANS, NPS Alerts) + AQI/Storm chips wired (fed by `hazards-summary` on page load) + provenance tags on each. No scheduled workers. Keys already in hand.

### Phase 3 — Terrain & Access
MapLibre map + base/layer system + GIBS render-direct tiles + cached geospatial routes (`trails`/`roads`/`wilderness`/`rec-sites` from Overpass/EDW/NPS ArcGIS, read-through cache) + render-direct webcam strip/markers + access cards + static permit deep-links + standalone-3D entry moved into the tab. No scheduled workers, no new keys.

## 13. Open questions (resolve during plan writing, not blocking)
- NWS+SPC alerts: one merged `alerts` route or separate per source.
- Read-through cache store for geospatial: GCS object vs Firestore doc per (mountain, layer) — pick by payload size during the Phase 3 plan.
- Whether the cached geospatial routes need any eviction/refresh trigger beyond TTL (likely not — daily/weekly TTL is enough).
- Exact webcam URL list per peak (Glacier Peak & Adams have no government cam — explicit "unavailable"); one-time WSDOT lookup to populate the catalog.
- Severity-score weighting for the Daily Outlook tint (worst-of vs weighted) — start simple (worst-of), tune later.
