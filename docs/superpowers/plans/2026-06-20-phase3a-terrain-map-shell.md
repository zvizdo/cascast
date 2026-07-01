# Phase 3A — Terrain & Access: Map Shell + GIBS + Webcams + Access + 3D-entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the third **Terrain & Access** tab — a MapLibre map (Topo + Satellite base, NASA GIBS snow overlay), a render-direct webcam strip, static access/permit cards, and the standalone-3D entry point — WITHOUT any cached geospatial backend (trails/roads/wilderness data layers are Phase 3B).

**Architecture:** A new client-only `<TerrainMap>` (raw `maplibre-gl`, loaded via `next/dynamic(ssr:false)` exactly like the existing `Mountain3D`) renders a **keyless** raster-only MapLibre style (OpenTopoMap + Esri World Imagery + a date-templated GIBS WMTS snow layer) — all map *logic* (the style JSON, the GIBS date/URL, the bbox→center) lives in a pure, fully-tested `src/lib/map.ts`; the WebGL component itself is coverage-excluded (un-mountable in jsdom, like `three/**`). Webcams and GIBS are **render-direct** (no backend). Access permits are **static catalog content**. The Terrain tab slots into the URL-aware `MountainTabs` (`?tab=terrain`) added in Phase 2B. New per-mountain catalog fields (`mapBbox`, `webcams`, `permits`) gate availability per peak.

**Tech Stack:** Next.js 16 App Router, React 19, `maplibre-gl` (new dep, raster-only/keyless), `next/dynamic`, SWR (none needed here — all render-direct/static), Vitest + Testing Library, hand-built CSS, Terraform (no infra change in 3A).

## Global Constraints

- **Base branch:** branch from `main` (Phases 1–2B + backlog merged & deployed). Use `feature/phase3a-terrain-map`. **Do NOT touch anything analytics/GA4** (`src/lib/analytics.ts`, any `Analytics` component, the GA4 plan/terraform, `feature/analytics-ga4`) — a separate active workstream owns it.
- Coverage gate: **90% lines / 90% functions / 85% branches** (Vitest). TDD: failing test first.
- **`src/components/map/**` is coverage-EXCLUDED** (MapLibre needs WebGL, un-mountable in jsdom) — same policy as `src/components/three/**`. ALL non-render logic lives in `src/lib/map.ts` (pure, fully tested). The map component is verified via an import smoke test + a route-mocked e2e that asserts the tab shell/controls/attribution (not the GL canvas). Add `src/components/map/**` to the coverage `exclude` list in `config/vitest.config.ts` (mirror the existing `three/**` entry).
- Gates that must stay green: `npm run build` · `npm test` · `npm run test:e2e` (desktop 1280×800 + iPhone 12 + narrow 600) · `npx tsc --noEmit` · `terraform -chdir=terraform validate` (unchanged — no infra in 3A).
- **No new backend / no scheduled worker / no runtime key (spec §10.1):** the map tiles (OpenTopoMap, Esri World Imagery, GIBS) and webcam JPEGs are fetched **directly by the browser**. MapLibre uses a raster-only style object (no Mapbox/MapTiler style server, no token). The repo previously removed `mapbox-gl` — do NOT reintroduce it; use `maplibre-gl`.
- **Attribution is mandatory** (tile-provider ToS): the map shows "© OpenStreetMap · OpenTopoMap (CC-BY-SA) · Esri/Maxar · NASA GIBS/MODIS" and the GIBS snow layer always shows its **acquisition date** caveat (§8.2). The MODIS citation `DOI 10.5067/MODIS/MOD10A1.061` goes on the `/sources` page.
- Units honored (elevations via `fmtDist`); mobile parity (map ≥ 320px tall, touch-usable; webcam strip horizontally scrollable; cards stack). Tokens for all colors; hand-built SVG/CSS.
- **Graceful degradation per peak (spec §3.2):** a peak with no `mapBbox` still gets a map centered on its `lat/lng` with a default span; a peak with empty `webcams` shows an explicit "No webcam available" state; a peak with empty `permits` omits the permits card. Out-of-region peaks (Whitney) behave fine (map + GIBS are global).
- Design source of truth: spec §8 (`docs/superpowers/specs/2026-06-20-data-integrations-and-ux-redesign-design.md`) + the mockup `.superpowers/brainstorm/42711-1781980940/content/` if a terrain mockup exists.

## Scope boundary (what is NOT in 3A)

- **Phase 3B (separate plan):** the read-through-cached geospatial route handlers (`trails`/`roads`/`wilderness`/`rec-sites` from Overpass/EDW/NPS-ArcGIS) + the map vector/GeoJSON data layers + the Roads/Trails access cards fed from them + earthquake epicenter markers. In 3A the map has ONLY raster base + GIBS snow; the layer toggle panel shows Trails/Roads/Wilderness/Trailheads/Earthquakes as **disabled "coming soon"** entries (or omits them) so 3B can wire them. The Roads/Trails access cards render a "Live road & trail status arrives soon" placeholder in 3A.

## Reference: keyless raster tile sources (no token, attribution required)

| Source | URL template | Attribution |
|---|---|---|
| Topo (default) | `https://{a-c}.tile.opentopomap.org/{z}/{x}/{y}.png` (maxzoom 17) | © OpenStreetMap contributors, SRTM · map style © OpenTopoMap (CC-BY-SA) |
| Satellite | `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Esri, Maxar, Earthstar Geographics |
| Snow (GIBS) | `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_L3_NDSI_Snow_Cover_Daily/default/{date}/GoogleMapsCompatible/{z}/{y}/{x}.png` (date = a recent `YYYY-MM-DD`; 8-day fallback layer `MODIS_Terra_L3_Snow_Extent_8Day`) | NASA EOSDIS GIBS · MODIS/Terra (DOI 10.5067/MODIS/MOD10A1.061) |

MapLibre renders a style of the form `{ version: 8, sources: { topo: {type:"raster", tiles:[...], tileSize:256, attribution:"…"} , … }, layers: [{id:"topo", type:"raster", source:"topo"}] }` — no glyphs/sprite needed for raster-only.

---

## File Structure

**New files**
- `src/lib/map.ts` — pure map helpers: `gibsSnowDate(now?)`, `gibsSnowTiles(date)`, `baseStyle(kind)`, `terrainMapStyle(opts)`, `peakCenter(mountain)`, `bboxSpan`. (+ `__tests__`)
- `src/components/map/TerrainMap.tsx` — client-only MapLibre component (coverage-excluded).
- `src/components/map/__tests__/smoke.test.ts` — import smoke test.
- `src/components/terrain/TerrainAccess.tsx` — the tab content shell (map + layer panel + webcams + access cards + 3D entry).
- `src/components/terrain/WebcamStrip.tsx` (+ test) — render-direct webcam strip.
- `src/components/terrain/AccessCards.tsx` (+ test) — static permits + roads/trails placeholders.
- `tests/e2e/terrain-tab.spec.ts`

**Modified files**
- `package.json` — add `maplibre-gl`.
- `config/vitest.config.ts` — exclude `src/components/map/**` from coverage.
- `src/lib/types.ts` — add optional `mapBbox?`, `webcams?`, `permits?` to `Mountain`.
- `src/lib/mountains-data.ts` — seed the new fields.
- `src/lib/__tests__/mountains-data.test.ts` — assert the new fields where present.
- `src/components/mountain/MountainDetail.tsx` — add the third `TabDef` (Terrain & Access).
- `src/app/globals.css` — `.terrain-*`, `.webcam-*`, `.map-*` styles + import `maplibre-gl/dist/maplibre-gl.css` (in `globals.css` or the layout).
- `src/app/sources/page.tsx` — add the OpenTopoMap/Esri/GIBS+MODIS-DOI attribution.
- `references/add-mountain.md` — document `mapBbox`/`webcams`/`permits`.

---

## Task 1: Install maplibre-gl + catalog fields (mapBbox / webcams / permits)

**Files:** `package.json`; `src/lib/types.ts`; `src/lib/mountains-data.ts` + its test; `config/vitest.config.ts`; `references/add-mountain.md`.

**Interfaces:**
- `Mountain` gains: `mapBbox?: { west: number; south: number; east: number; north: number }`; `webcams?: { id: string; label: string; source: string; url: string; seasonal?: boolean }[]`; `permits?: { label: string; url: string; note?: string }[]`. Absent/empty ⇒ the corresponding UI degrades (default-span map / "no webcam" / omit permits card).

- [ ] **Step 1: Add the dep** — `npm install maplibre-gl@^4` (a 4.x release compatible with Next 16/React 19; pin the installed version). Confirm `node_modules/maplibre-gl` present.
- [ ] **Step 2: Exclude the map dir from coverage** — in `config/vitest.config.ts`, add `"src/components/map/**"` to the coverage `exclude` array right beside the existing `"src/components/three/**"` entry.
- [ ] **Step 3: Write the failing catalog test** — add to `mountains-data.test.ts`:

```ts
import { mountainBySlug } from "@/lib/mountains-data";
describe("Phase 3 terrain catalog fields", () => {
  it("gives Rainier a mapBbox around its summit", () => {
    const b = mountainBySlug("mt-rainier")?.mapBbox;
    expect(b).toBeTruthy();
    expect(b!.west).toBeLessThan(b!.east);
    expect(b!.south).toBeLessThan(b!.north);
  });
  it("carries at least one permit deep-link for Rainier", () => {
    expect((mountainBySlug("mt-rainier")?.permits ?? []).length).toBeGreaterThan(0);
  });
});
```
- [ ] **Step 4: Run → FAIL**, then add the three optional fields to the `Mountain` interface (`types.ts`) and seed `mapBbox` for ALL 11 peaks (a ~±0.08° box around `lat/lng`, or reuse the terrain bbox span), `permits` for the peaks with known passes (Rainier `mora` climbing permit + Mt Adams Cougar Rock/Climbing Pass, etc. — deep-link URLs; leave others `[]`), and `webcams: []` for now (Task 6 populates real URLs). `npx tsc --noEmit` clean (the `as const` MOUNTAINS must still type-check).
- [ ] **Step 5: Run → PASS**; document the fields in `references/add-mountain.md`.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(terrain): maplibre-gl dep + mapBbox/webcams/permits catalog fields"`

---

## Task 2: `src/lib/map.ts` — pure map-style helpers (TDD)

**Files:** Create `src/lib/map.ts` + `src/lib/__tests__/map.test.ts`.

**Interfaces:**
- `type BaseKind = "topo" | "satellite"`
- `function gibsSnowDate(now?: Date): string` — a recent `YYYY-MM-DD` (yesterday, since the daily product lags ~1 day).
- `function gibsSnowTiles(date: string): string[]` — the GIBS WMTS REST URL with `{z}/{y}/{x}` for MapLibre.
- `function terrainMapStyle(opts: { base: BaseKind; snow: boolean; snowDate: string }): maplibregl.StyleSpecification` — the full raster-only style (topo OR satellite base layer + an optional GIBS snow raster layer on top), each source carrying its `attribution`.
- `function peakCenter(m: Pick<Mountain,"lat"|"lng"|"mapBbox">): { lng: number; lat: number; zoom: number }` — center on the bbox midpoint (else lat/lng) with a sensible zoom (~12).

- [ ] **Step 1: Write the failing test** — assert: `gibsSnowDate(new Date(2026,5,20))` returns `"2026-06-19"` (yesterday); `gibsSnowTiles("2026-06-19")[0]` contains `MODIS_Terra_L3_NDSI_Snow_Cover_Daily/default/2026-06-19/` and `{z}/{y}/{x}.png`; `terrainMapStyle({base:"topo",snow:false,…})` has a `topo` raster source whose `attribution` mentions "OpenTopoMap" and exactly one layer; `terrainMapStyle({base:"satellite",snow:true,snowDate})` has a `satellite` source (attribution "Esri") + a `snow` source + two layers with snow last; `peakCenter` returns the bbox midpoint when `mapBbox` is set.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `map.ts`** (full style builder; import the `StyleSpecification` type from `maplibre-gl`). Keep it pure — no DOM/GL.
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(terrain): map.ts style + GIBS snow + peak-center helpers"`

---

## Task 3: `<TerrainMap>` client-only MapLibre component

**Files:** Create `src/components/map/TerrainMap.tsx` + `src/components/map/__tests__/smoke.test.ts`; Modify `src/app/globals.css` (or layout) to import `maplibre-gl/dist/maplibre-gl.css`.

**Interfaces:** `TerrainMap({ mountain, base, snow }: { mountain: Mountain; base: BaseKind; snow: boolean })` — a `"use client"` component that, in a `useEffect`, constructs `new maplibregl.Map({ container, style: terrainMapStyle(...), center, zoom })`, updates the style when `base`/`snow` change, adds `NavigationControl`, and cleans up on unmount. It is imported ONLY via `next/dynamic(() => import("@/components/map/TerrainMap"), { ssr: false })` from the tab content (Task 5) — never directly server-rendered. Coverage-excluded.

- [ ] **Step 1: Write the import smoke test** — `src/components/map/__tests__/smoke.test.ts`: `it("imports without throwing", async () => { expect(await import("@/components/map/TerrainMap")).toBeTruthy(); })`. (jsdom can't mount WebGL; this just guards the module graph. Mock `maplibre-gl` in the test if the import touches the GL constructor at module scope — keep the `new maplibregl.Map` inside `useEffect` so import is safe.)
- [ ] **Step 2: Run → it should pass once the file exists** (write the file, then the smoke test passes).
- [ ] **Step 3: Implement `TerrainMap.tsx`** — the `useEffect` map lifecycle using `map.ts` helpers; `setStyle` on base/snow change; cleanup `map.remove()`. Import the maplibre CSS once (in `globals.css`: `@import "maplibre-gl/dist/maplibre-gl.css";` at the top, or in the layout). Container div `className="terrain-map"` with a defined height.
- [ ] **Step 4: Run the smoke test → PASS**; `npx tsc --noEmit`; `npm run build` (confirm the dynamic import + CSS import build cleanly and the map code is NOT in the server bundle).
- [ ] **Step 5: Commit** — `git commit -m "feat(terrain): TerrainMap client-only MapLibre component (coverage-excluded)"`

---

## Task 4: WebcamStrip + AccessCards (presentational)

**Files:** Create `src/components/terrain/WebcamStrip.tsx` + test; `src/components/terrain/AccessCards.tsx` + test; Modify `globals.css`.

**Interfaces:**
- `WebcamStrip({ webcams }: { webcams: Mountain["webcams"] })` — a horizontally-scrollable strip of `<img src={`${url}?t=${cacheBust}`} loading="lazy" onError={→placeholder}>` with the cam `label` + `source`; seasonal cams flagged "offline (seasonal)"; **empty/undefined → an explicit "No webcam available for this peak." state**. (Use a stable cache-bust seed from a prop or `Date.now()` guarded for tests — accept an optional `now?` for determinism.)
- `AccessCards({ permits }: { permits: Mountain["permits"] })` — a **Permits** card listing each `{label, url, note}` as an external deep-link (`rel="noopener noreferrer"`), omitted when `permits` is empty; plus a **Roads** and a **Trails** card each rendering a "Live road & trail status arrives in a later update." placeholder (Phase 3B wires the real data).

- [ ] **Step 1: Write failing WebcamStrip tests** — (a) two webcams → two `<img>` with the right `src` (incl the cache-bust param) + labels; (b) a seasonal cam → "seasonal" text; (c) empty/undefined → the "No webcam available" copy, no `<img>`; (d) `onError` swaps to a placeholder (simulate an error event → assert the fallback); (e) `expectNoA11yViolations` (each img has alt text).
- [ ] **Step 2: Run → FAIL**, implement `WebcamStrip`. Run → PASS.
- [ ] **Step 3: Write failing AccessCards tests** — (a) two permits → two external links with the right hrefs + `rel="noopener noreferrer"`; (b) empty permits → no Permits card; (c) the Roads + Trails placeholder cards always render with the "arrives in a later update" copy; (d) axe clean.
- [ ] **Step 4: Run → FAIL**, implement `AccessCards`. Run → PASS.
- [ ] **Step 5: Add CSS** (`.webcam-strip` horizontal scroll, `.webcam-card`, `.access-card`, placeholder styling; tokens only).
- [ ] **Step 6: Commit** — `git commit -m "feat(terrain): WebcamStrip (render-direct) + AccessCards (static permits + placeholders)"`

---

## Task 5: TerrainAccess tab content + base/snow/layer controls

**Files:** Create `src/components/terrain/TerrainAccess.tsx` + test; Modify `globals.css`.

**Interfaces:** `TerrainAccess({ mountain }: { mountain: Mountain })` — the Terrain tab body. Holds local UI state: `base: BaseKind` (default "topo"), `snow: boolean` (default false). Renders:
- a **base-style toggle** (Topo / Satellite — reuse `Segmented`),
- a **layer panel**: a "Snow cover (GIBS)" checkbox (wired to `snow`) WITH the acquisition-date caveat (`gibsSnowDate`), plus disabled "Trails / Roads / Wilderness / Trailheads / Earthquakes — coming soon" entries (Phase 3B),
- the `<TerrainMap mountain base snow />` via `next/dynamic(ssr:false)` (with a calm loading placeholder + a WebGL-unsupported fallback),
- the **attribution** line,
- the `<WebcamStrip webcams={mountain.webcams} />`,
- the `<AccessCards permits={mountain.permits} />`,
- a **standalone-3D entry**: a prominent link/button to `/mountains/[slug]/3d?target=…` (§8.5 — the 3D entry "moves into this tab"), with the "Illustrative — not for navigation" disclaimer.

- [ ] **Step 1: Write failing tests** — mock the dynamic `TerrainMap` (so jsdom doesn't load GL): assert the base Segmented (Topo/Satellite) renders; toggling "Snow cover" flips a checkbox + shows the acquisition-date caveat; the attribution line names OpenTopoMap + NASA GIBS; the WebcamStrip + AccessCards render; a "3D" link points to `/mountains/{slug}/3d`; the disabled layer entries show "coming soon"; axe clean.
- [ ] **Step 2: Run → FAIL**, implement `TerrainAccess`. Run → PASS.
- [ ] **Step 3: Commit** — `git commit -m "feat(terrain): TerrainAccess tab content (map controls + layers + webcams + access + 3D entry)"`

---

## Task 6: Wire the Terrain tab into MountainDetail + populate webcam/permit data

**Files:** Modify `src/components/mountain/MountainDetail.tsx` + its test; `src/lib/mountains-data.ts` (webcam/permit data); `src/app/sources/page.tsx`; `tests/e2e/_fixtures.ts` (mountain fixtures already include the catalog — confirm the new fields flow).

**Interfaces:** Add a third `TabDef` `{ key: "terrain", label: "Terrain & Access", content: <TerrainAccess mountain={mountain} /> }` to the `tabs` array (after Safety). The URL-aware `MountainTabs` (`?tab=terrain`) already supports it.

- [ ] **Step 1: Write the failing MountainDetail test** — assert a third tab labelled "Terrain & Access" (role="tab") exists; clicking it reveals the map controls / webcam / access content (mock `TerrainAccess` or its dynamic map). Keep existing tab tests green.
- [ ] **Step 2: Run → FAIL**, add the tab. Run → PASS.
- [ ] **Step 3: Populate real webcam + permit catalog data** — research and add public **direct-JPEG** webcam URLs for the peaks that have them (e.g. WSDOT pass cameras near the peak, USGS Johnston Ridge for St Helens, NPS Rainier cams) into `webcams`, and the climbing-permit/pass deep-links into `permits`; peaks without a known cam keep `webcams: []` (→ "no webcam" state). Document each URL's source in a code comment. (This is the §13 "one-time WSDOT/NPS/USGS lookup".)
- [ ] **Step 4: Update `/sources`** — add the OpenTopoMap (CC-BY-SA), Esri/Maxar, and NASA GIBS/MODIS (DOI 10.5067/MODIS/MOD10A1.061) attribution to the Data sources list.
- [ ] **Step 5: Run `npm test` + `npx tsc --noEmit` + `npm run build`** → green.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(terrain): add Terrain & Access tab; seed webcam/permit catalog data; /sources attribution"`

---

## Task 7: e2e + final gates + visual QA

**Files:** Create `tests/e2e/terrain-tab.spec.ts`; Modify `tests/e2e/_mock.ts` (mock the external tile/webcam hosts to a tiny PNG so the map/cams don't hammer real servers in route-mocked mode).

- [ ] **Step 1: Mock external hosts** — in `_mock.ts`, add `page.route` handlers for `**/tile.opentopomap.org/**`, `**/server.arcgisonline.com/**`, `**/gibs.earthdata.nasa.gov/**`, and the webcam hosts → a 1×1 PNG (reuse `TINY_PNG_BASE64`), so the route-mocked e2e never hits real tile servers.
- [ ] **Step 2: Write `terrain-tab.spec.ts`** — route-mocked: goto `/mountains/mt-rainier`, click the "Terrain & Access" tab, assert: the base Topo/Satellite toggle is visible; the map container (`.terrain-map` / a `canvas` or the MapLibre root) is present; the Snow-cover layer toggle + acquisition-date caveat show; toggling Satellite + Snow doesn't error (assert no console error); the webcam strip (or "no webcam" state) and the Permits/Roads/Trails cards render; the "3D" entry links to `/mountains/mt-rainier/3d`. Desktop + mobile. (Don't assert GL pixels — MapLibre may fall back in headless; assert the DOM shell + controls.)
- [ ] **Step 3: Full gates** — `npm test` (coverage ≥ 90/90/85), `npx tsc --noEmit`, `npm run build`, `npm run test:e2e` (all viewports), `terraform -chdir=terraform validate`.
- [ ] **Step 4: Controller visual QA** — capture the Terrain tab (map Topo + Satellite + Snow overlay, webcam strip, access cards, 3D entry) desktop + mobile + both themes (route-mocked tiles). Inspect: map renders + controls legible, snow overlay visible + dated, webcam strip/empty-state, cards, 3D entry, mobile map height + touch. Fix any issue. (A live check against the deployed URL — real GIBS/topo tiles — is part of the post-merge deploy.)
- [ ] **Step 5: Commit QA fixes** (if any) — `git commit -m "fix(terrain): phase-3A visual-QA polish"`

---

## Self-Review (completed)

**Spec coverage (§8 Terrain & Access — the 3A slice):**
- §8.1 Map: MapLibre, Topo default + Satellite toggle, attribution → Tasks 2,3,5. Layer panel with Trails/Roads/Wilderness/Snow/Webcams/Trailheads/Earthquakes — **Snow (GIBS) is live in 3A**; the data layers (Trails/Roads/Wilderness/Trailheads/Earthquakes) are **disabled "coming soon"** in 3A, wired in 3B. ✓ (documented scope boundary)
- §8.2 Snow cover (GIBS WMTS, render-direct, acquisition-date caveat) → Tasks 2,5. The other layer SOURCES (Overpass/EDW/ArcGIS) are Phase 3B. ✓
- §8.3 Webcams (render-direct `<img>` strip + catalog `webcams` + "no webcam"/"seasonal" states) → Tasks 1,4,6. ✓
- §8.4 Access cards: Permits = static catalog deep-links (built in 3A); Roads/Trails = placeholders in 3A (real data in 3B). ✓
- §8.5 Standalone 3D entry moves into this tab → Task 5 (keep the header 3D button too; the freezing-hero flip is unchanged). ✓
- §10.1 render-direct/no-backend/no-key for map+GIBS+webcams; §10.3 catalog fields mapBbox/webcams/permits → Tasks 1,3,4. (usfsForestName is a 3B field.) ✓
- §3.2 degradation / §3.4 mobile / §11 gates → per task + Task 7.
- **Deferred to Phase 3B (documented, not gaps):** cached `trails`/`roads`/`wilderness`/`rec-sites` routes + read-through cache + the live map data layers + the Roads/Trails access-card data + earthquake markers.

**Placeholder scan:** No "TBD/TODO". `map.ts` (helpers), the catalog fields, WebcamStrip/AccessCards/TerrainAccess carry exact interfaces, render structure, states, and concrete test cases; the GIBS/topo/Esri URLs are exact. The one genuine data-gathering step (real webcam URLs, Task 6 Step 3) is explicitly a research step with a documented fallback (empty → "no webcam" state) — not a code placeholder.

**Type consistency:** `BaseKind` (Task 2) consumed by `TerrainMap` (3) + `TerrainAccess` (5). `terrainMapStyle`/`peakCenter`/`gibsSnow*` (Task 2) consumed by `TerrainMap` (3). The new `Mountain` fields `mapBbox`/`webcams`/`permits` (Task 1) consumed by `peakCenter` (2), `WebcamStrip`/`AccessCards` (4), `TerrainAccess`/MountainDetail (5,6). `TabDef` (existing) for the third tab. `MountainTabs ?tab=terrain` (Phase 2B) already supports an arbitrary tab key. Consistent.
