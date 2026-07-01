# Phase 3B — Terrain & Access: Cached Geospatial Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Phase-3A Terrain map's "coming soon" layers live — read-through-cached GeoJSON routes for **trails** (OSM Overpass), **roads + closures** (USFS EDW), **wilderness** (EDW), and **rec-sites/trailheads** (EDW), plus **earthquake epicenter markers** (shared ComCat) — wired as toggleable MapLibre layers, with the Roads/Trails access cards fed by the cached data.

**Architecture:** Each geospatial route handler is a thin Next.js Route Handler that reads a **GCS read-through cache** (new `GCS_BUCKET_GEO`, object `${slug}/${layer}.geojson`, TTL via a `cachedAt` metadata stamp); on a cache miss/staleness it fetches the upstream (Overpass POST / EDW ArcGIS GET), normalizes to a GeoJSON `FeatureCollection`, writes the cache, and returns it. No scheduled worker — the cache is populated lazily on first request and protects Overpass's rate limit. The map adds each layer as a `geojson` source pointed at its route URL; because MapLibre's `setStyle` (base/snow swap) **wipes imperatively-added layers**, `TerrainMap` re-adds all enabled geo layers on every `style.load`. The Roads/Trails access cards summarize the same cached GeoJSON via SWR hooks.

**Tech Stack:** Next.js 16 Route Handlers (Node runtime), `@google-cloud/storage`, `global fetch` (POST for Overpass), MapLibre GL (geojson sources/layers), SWR, Vitest, Terraform (one new GCS bucket + the web env var).

## Global Constraints

- **Base branch:** branch from `main` (Phase 3A merged + deployed). Use `feature/phase3b-terrain-layers`. **Do NOT touch GA4/analytics** (`src/lib/analytics.ts`, the GA4 plan/terraform, `feature/analytics-ga4`) or the other active worktrees — separate workstreams. **After adding any dependency, verify package.json + package-lock.json are committed** (a working-tree-only install ships via the deploy but breaks `npm ci`).
- Coverage gate: **90% lines / 90% functions / 85% branches** (Vitest). TDD: failing test first. `src/components/map/**` stays coverage-excluded (logic in tested `lib/map.ts`/`lib/geo.ts`).
- Gates: `npm run build` · `npm test` · `npm run test:e2e` · `npx tsc --noEmit` · `terraform -chdir=terraform validate`.
- **No new scheduled worker / Pub/Sub / DLQ / runtime key** (spec §10.1). The geo sources (Overpass, EDW, NPS-ArcGIS) need **no auth**. Overpass requires a **User-Agent** identifying the app (reuse the `NWS_CONTACT` env default convention — NEVER a personal email).
- **Read-through cache in GCS** (spec §13 — GeoJSON exceeds Firestore's 1 MB doc cap): new `GCS_BUCKET_GEO`; the web-runtime SA already has `storage.objectAdmin` (it can read+write). TTL: trails ~7d, EDW (roads/wilderness/rec-sites) ~1d. Freshness via a `cachedAt` ISO stamp in object custom metadata.
- **Graceful degradation (spec §3.2):** an upstream failure on a cache MISS returns an EMPTY `FeatureCollection` (200) with a `stale: false` marker — the map layer just shows nothing, never a broken render. A peer outside USFS land (e.g. an NP-only or out-of-region peak) still gets a valid (possibly empty) collection. The cards show "No data" rather than erroring.
- **Attribution (ODbL/ToS):** trails layer + `/sources` must credit "© OpenStreetMap contributors (ODbL)"; EDW/NPS are public domain (no mandatory attribution, but keep the existing USFS/NPS credits). Add OSM trail attribution to the map attribution line.
- Mobile parity; tokens for colors; hand-built UI. The map layer toggles reuse the existing `.layer-panel` checkboxes (the disabled "coming soon" entries become enabled).
- Design source of truth: spec §8.1/§8.2 + §10. **All external contracts below carry ⚠️ live-verify items** (the research doc is vague on some EDW field names / layer indices) — verify against the live service metadata (`/MapServer/{n}?f=json`) during the route task and at the deploy step.

## Reference: external contracts (⚠️ = confirm live during the task)

| Layer | Upstream | Endpoint | Notes |
|---|---|---|---|
| trails | OSM Overpass | **POST** `https://overpass-api.de/api/interpreter`, body `data=<QL>` | QL: hiking route relations + `sac_scale` paths in bbox `(S,W,N,E)`, `out geom`. Convert Overpass-JSON→GeoJSON LineStrings. User-Agent required. ~7d TTL. ⚠️ exact way-query for `sac_scale` |
| roads | USFS EDW | `https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer/0/query` (+ `/1/query` = closed-to-motorized) | `f=geojson&where=1=1&geometry={xmin,ymin,xmax,ymax}&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326&outSR=4326&outFields=*&returnGeometry=true`. Fields: `route_status`,`oper_maint_level`,`openforuseto`. ~1d TTL. ⚠️ field semantics |
| wilderness | USFS EDW | `…/EDW_Wilderness_01/MapServer/0/query` | same bbox params; polygon; field `wildernessname`. ~1d TTL |
| rec-sites | USFS EDW | `…/EDW_InfraRecreationSites_01/MapServer/0/query` | same bbox params; points; closure fields `CLOSURE_REASON`,`UNIT_CLOSURE_*`,`ALERTS_*`. ~1d TTL. ⚠️ site-name field |
| (trails alt) | NPS ArcGIS | `https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/NPS_Public_Trails/FeatureServer/0/query?where=UNITCODE='{npsParkCode}'&outFields=*&f=geojson` | secondary trail source for NP peaks; merge into trails when `npsParkCode` set. ⚠️ optional |

EDW returns max 2,000 records/request (a peak bbox ±0.08° is well under). Each route returns a standard GeoJSON `FeatureCollection`; the map consumes it directly.

---

## File Structure

**New files**
- `src/lib/geo.ts` — pure helpers: `overpassTrailsQuery(bbox)`, `osmToGeoJson(overpassJson)`, `edwQueryUrl(service, layer, bbox)`, `npsTrailsUrl(parkCode)`, `cacheFresh(cachedAt, ttlMs)`, `EMPTY_FC`. (+ `__tests__`)
- `src/app/api/mountains/[slug]/trails/route.ts` (+ test)
- `src/app/api/mountains/[slug]/roads/route.ts` (+ test)
- `src/app/api/mountains/[slug]/wilderness/route.ts` (+ test)
- `src/app/api/mountains/[slug]/rec-sites/route.ts` (+ test)
- `terraform/modules/web/` (or root) — the `mountain-weatherman-app-geo` bucket + the `GCS_BUCKET_GEO` web env var.

**Modified files**
- `src/lib/storage.ts` — `readCachedGeo(slug, layer)` + `writeCachedGeo(slug, layer, fc)` (+ test).
- `src/lib/types.ts` — add optional `usfsForestName?` to `Mountain`; add `lng`/`lat` to `QuakeEvent`.
- `src/lib/mountains-data.ts` — seed `usfsForestName` where known.
- `src/app/api/mountains/[slug]/seismic/route.ts` + test — include `lng`/`lat` on events (for the map markers).
- `src/lib/hooks.ts` — `useMountainTrails/Roads/Wilderness/RecSites` SWR hooks.
- `src/components/map/TerrainMap.tsx` — `enabledLayers` prop + add/toggle geojson layers + re-add on `style.load`.
- `src/components/terrain/TerrainAccess.tsx` + test — enable the layer checkboxes (Trails/Roads/Wilderness/Trailheads/Earthquakes); pass `enabledLayers` + slug to the map.
- `src/components/terrain/AccessCards.tsx` + test — Roads/Trails cards fed by the cached GeoJSON summaries.
- `src/app/globals.css` — map layer styling (line/fill/marker colors via tokens) + legend.
- `src/app/sources/page.tsx` — OSM ODbL trail attribution.
- `tests/e2e/_mock.ts` + `_fixtures.ts` — fixtures for the 4 geo routes.
- `references/add-mountain.md` — document `usfsForestName`.

---

## Task 1: GCS geo cache (storage helpers + Terraform bucket + usfsForestName)

**Files:** `src/lib/storage.ts` + `src/lib/__tests__/storage.test.ts`; `terraform/modules/web/main.tf` (+ variables); `src/lib/types.ts`; `src/lib/mountains-data.ts` + test; `references/add-mountain.md`.

**Interfaces:**
- `async function writeCachedGeo(slug: string, layer: string, fc: unknown): Promise<void>` — saves to `GCS_BUCKET_GEO` object `${slug}/${layer}.geojson` with custom metadata `{ cachedAt: <ISO> }`.
- `async function readCachedGeo(slug: string, layer: string): Promise<{ data: unknown; cachedAt: string } | null>` — returns the parsed FeatureCollection + its `cachedAt` (from custom metadata, falling back to `meta.updated`), or `null` if absent.
- `Mountain` gains `usfsForestName?: string`.

- [ ] **Step 1: Write the failing storage test** — extend `storage.test.ts`: mock the GCS `file()` to expose `save`/`exists`/`getMetadata`/`download` `vi.fn()`s; assert `writeCachedGeo("mt-rainier","trails",fc)` calls `save(JSON.stringify(fc), { contentType:"application/json", metadata:{ metadata:{ cachedAt: <iso> } } })`; `readCachedGeo` returns `{data, cachedAt}` when `exists`→true, `null` when false. (Add `GCS_BUCKET_GEO` to the test's env beforeEach.)
- [ ] **Step 2: Run → FAIL**, implement the two helpers in `storage.ts` (use `requireEnv("GCS_BUCKET_GEO")`; `f.save(...)`, `f.getMetadata()`, `f.download()`).
- [ ] **Step 3: Run → PASS.**
- [ ] **Step 4: Terraform** — add a `google_storage_bucket` `geo` (`mountain-weatherman-app-geo`, uniform access, a 14-day `lifecycle_rule` to auto-evict stale cache objects) and a Cloud Run `env { name="GCS_BUCKET_GEO"; value=<bucket name> }` on the web service (the web-runtime SA already has `storage.objectAdmin` project-wide). `terraform -chdir=terraform validate` → success. Do NOT apply (Task 10 deploys, after a targeted bucket bootstrap).
- [ ] **Step 5: Catalog** — add `usfsForestName?` to `Mountain` (types.ts); seed it where known (e.g. mt-baker/mt-shuksan "Mt. Baker-Snoqualmie National Forest", glacier-peak same, mt-adams/mt-st-helens "Gifford Pinchot National Forest", mt-stuart/colchuck/liberty-bell "Okanogan-Wenatchee National Forest"; leave NP-only/out-of-region peaks empty). It is optional context (the EDW routes are bbox-queryable without it). Update `mountains-data.test.ts` + `add-mountain.md`. `npx tsc --noEmit` clean.
- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(terrain): GCS geo read-through cache helpers + bucket + usfsForestName"`

---

## Task 2: `src/lib/geo.ts` — query builders + normalizers + cache-freshness (TDD, pure)

**Files:** Create `src/lib/geo.ts` + `src/lib/__tests__/geo.test.ts`.

**Interfaces:**
- `const EMPTY_FC: GeoJSON.FeatureCollection` = `{ type:"FeatureCollection", features:[] }`.
- `function cacheFresh(cachedAt: string, ttlMs: number, now?: number): boolean`.
- `function overpassTrailsQuery(b: BBox): string` — the Overpass QL for hiking relations + `sac_scale` paths in `(south,west,north,east)`, `[out:json][timeout:25]`, `out geom;`.
- `function osmToGeoJson(overpass: { elements: any[] }): GeoJSON.FeatureCollection` — convert Overpass `out geom` ways/relations → LineString features carrying `{name, sac_scale, highway}` props (skip elements without geometry).
- `function edwQueryUrl(service: string, layer: number, b: BBox): string` — the EDW ArcGIS `…/{service}/MapServer/{layer}/query?f=geojson&where=1=1&geometry=…&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&inSR=4326&outSR=4326&outFields=*&returnGeometry=true`.
- `function npsTrailsUrl(parkCode: string): string`.
- `type BBox = { west:number; south:number; east:number; north:number }`.

- [ ] **Step 1: Write the failing test** — assert: `cacheFresh(now-1h, 7d)` true, `cacheFresh(now-8d, 7d)` false; `overpassTrailsQuery({s,w,n,e})` contains `route"="hiking"` + the bbox in `(S,W,N,E)` order + `out geom`; `osmToGeoJson` maps a way with `geometry:[{lat,lon},…]` → a LineString Feature with reversed `[lon,lat]` coords + `sac_scale` prop, and DROPS elements without `geometry`; `edwQueryUrl("EDW_RoadBasic_01",0,bbox)` contains `EDW_RoadBasic_01/MapServer/0/query`, `f=geojson`, `esriGeometryEnvelope`, the bbox JSON; `npsTrailsUrl("mora")` contains `UNITCODE='mora'`.
- [ ] **Step 2: Run → FAIL**, implement `geo.ts` (pure; no fetch).
- [ ] **Step 3: Run → PASS**; `npx tsc --noEmit` (install `@types/geojson` if `GeoJSON.FeatureCollection` isn't resolved — it ships with TS lib `dom`? if not, add the dev dep AND commit package.json/lock).
- [ ] **Step 4: Commit** — `git commit -m "feat(terrain): geo.ts Overpass/EDW/NPS query builders + osm→geojson + cache-freshness"`

---

## Task 3: `trails` route (Overpass, read-through cached) — the template route

**Files:** Create `src/app/api/mountains/[slug]/trails/route.ts` + `__tests__/route.test.ts`.

**Interfaces:** `GET` returns a GeoJSON `FeatureCollection` (200) or 404 "Mountain not found". Cache TTL 7d. Consumes `mountainBySlug`, `readCachedGeo`/`writeCachedGeo`, `geo.ts`, and a POST fetch.

- [ ] **Step 1: Write failing tests** — mock `@/lib/storage` (`readCachedGeo`/`writeCachedGeo` as `vi.fn()`) + `global fetch`. Cases: (a) cache HIT (readCachedGeo returns a fresh fc) → returns it WITHOUT calling fetch; (b) cache MISS (readCachedGeo null) → POSTs Overpass (assert the request method POST + the `data=` body contains the bbox + a `User-Agent` header with no `@`), normalizes, calls `writeCachedGeo`, returns the FC; (c) a STALE cache (cachedAt old) → re-fetches; (d) an upstream throw on a miss → returns `EMPTY_FC` 200 (graceful, no 500); (e) unknown slug → 404.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — resolve mountain + its `mapBbox` (fallback to a ±0.08° box from lat/lng); `const cached = await readCachedGeo(slug,"trails"); if (cached && cacheFresh(cached.cachedAt, 7d)) return json(cached.data)`; else POST `overpassTrailsQuery(bbox)` to the interpreter (`method:"POST"`, `Content-Type: application/x-www-form-urlencoded`, body `data=${encodeURIComponent(q)}`, `User-Agent: ${process.env.NWS_CONTACT ?? "MountainWeatherman/1.0 (+https://github.com/mountain-weatherman)"}`, `AbortSignal.timeout(15000)`); `osmToGeoJson` → `writeCachedGeo` → return. Wrap the fetch+normalize in try/catch → on error return `EMPTY_FC` (graceful). ⚠️ Live-verify the Overpass QL returns trails for a real peak at the deploy step. Cache header `public, max-age=300, stale-while-revalidate=600`.
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(terrain): trails route (Overpass, GCS read-through cache)"`

---

## Task 4: `roads` route (EDW RoadBasic + closed, cached)

**Files:** Create `roads/route.ts` + test.

**Interfaces:** `GET` → GeoJSON FeatureCollection. Merges EDW layer 0 (all NFS roads) with a `closed: true` flag on features also in layer 1 (closed-to-motorized) — OR, simpler/robust: fetch layer 0 with `outFields` incl `oper_maint_level`/`openforuseto` and derive a `closed` property; ALSO fetch layer 1 and tag those as closed. Each feature carries `{ name, closed, status }`.

- [ ] **Step 1: Write failing tests** — mock storage + fetch (branch by URL: layer 0 vs layer 1). Cases: (a) miss → fetches EDW layer 0 (+ layer 1), merges, sets `closed` on the closed-layer features, caches, returns; (b) hit → cached; (c) upstream throw → `EMPTY_FC` 200; (d) unknown slug → 404; assert the request URL contains `EDW_RoadBasic_01/MapServer/0/query` + `f=geojson` + the bbox envelope.
- [ ] **Step 2: Run → FAIL**, implement (GET via `fetchJson` — EDW supports GET; TTL 1d; graceful empty on error). ⚠️ Live-verify the `oper_maint_level`/`openforuseto` field meaning + that closed-layer 1 exists, at deploy.
- [ ] **Step 3: Run → PASS**; tsc.
- [ ] **Step 4: Commit** — `git commit -m "feat(terrain): roads route (EDW RoadBasic + closures, cached)"`

---

## Task 5: `wilderness` route (EDW polygon, cached)

**Files:** Create `wilderness/route.ts` + test.

- [ ] **Step 1: Write failing tests** — (a) miss → fetches `EDW_Wilderness_01/MapServer/0/query` (assert URL + bbox), caches, returns polygons with `{ name: wildernessname }`; (b) hit; (c) error → EMPTY_FC 200; (d) unknown slug → 404.
- [ ] **Step 2: Run → FAIL**, implement (GET, TTL 1d, graceful).
- [ ] **Step 3: Run → PASS**; tsc.
- [ ] **Step 4: Commit** — `git commit -m "feat(terrain): wilderness route (EDW polygon, cached)"`

---

## Task 6: `rec-sites` route (EDW trailheads/sites + closures, cached)

**Files:** Create `rec-sites/route.ts` + test.

- [ ] **Step 1: Write failing tests** — (a) miss → fetches `EDW_InfraRecreationSites_01/MapServer/0/query`, caches, returns point features carrying `{ name, closure }` (closure derived from `UNIT_CLOSURE_END_DATE > now` / `CLOSURE_REASON`); (b) hit; (c) error → EMPTY_FC 200; (d) unknown slug → 404.
- [ ] **Step 2: Run → FAIL**, implement (GET, TTL 1d, graceful). ⚠️ Live-verify the site-name field (`UNIT_NAME`/`SITE_NAME`) + closure fields at deploy.
- [ ] **Step 3: Run → PASS**; tsc.
- [ ] **Step 4: Commit** — `git commit -m "feat(terrain): rec-sites route (EDW trailheads + closures, cached)"`

---

## Task 7: Seismic coords for earthquake markers

**Files:** Modify `src/lib/hazards/types.ts` (`QuakeEvent`), `src/app/api/mountains/[slug]/seismic/route.ts` + its test.

**Interfaces:** `QuakeEvent` gains `lng: number; lat: number` (from ComCat `geometry.coordinates[0]`/`[1]`; `depthKm` already comes from `[2]`). The Safety SeismicPanel ignores them (additive); the map builds an epicenter `FeatureCollection` from `seismic.events`.

- [ ] **Step 1: Extend the seismic test** — assert each mapped event now carries `lng`/`lat` from `geometry.coordinates[0]`/`[1]`. Run → FAIL.
- [ ] **Step 2: Add `lng`/`lat`** to the mapping in `seismic/route.ts`; update `QuakeEvent`. Run → PASS (the existing SeismicPanel tests stay green — the fields are additive).
- [ ] **Step 3: Commit** — `git commit -m "feat(terrain): seismic events carry lng/lat for map epicenter markers"`

---

## Task 8: Map geo layers (TerrainMap + TerrainAccess toggles)

**Files:** Modify `src/components/map/TerrainMap.tsx` (coverage-excluded), `src/components/terrain/TerrainAccess.tsx` + test; `src/lib/hooks.ts` (geo + seismic hooks); `src/app/globals.css`.

**Interfaces:** `TerrainMap` gains `enabledLayers: Set<LayerKey>` (`LayerKey = "trails"|"roads"|"wilderness"|"trailheads"|"earthquakes"`) + `slug`. It manages geojson sources/layers:
- a reusable `applyGeoLayers(map)` that, for each enabled layer, `addSource({type:"geojson", data: "/api/mountains/${slug}/${route}"})` (route = trails/roads/wilderness/rec-sites; earthquakes uses a geojson built from the `/seismic` events — pass that FC in as a prop OR add a tiny `seismic` geojson) + `addLayer` (trails=line accent, roads=line with a `closed`→red paint expression, wilderness=fill low-opacity, trailheads=circle, earthquakes=circle sized by mag). Toggling visibility by add/remove on `enabledLayers` change.
- **CRITICAL:** because `setStyle` (base/snow swap) wipes custom layers, register `map.on("style.load", () => applyGeoLayers(map))` so the geo layers re-add after every style change. Call `applyGeoLayers` once on initial `map.on("load")` too.

`TerrainAccess`: replace the disabled "coming soon" checkboxes with REAL checkboxes driving `enabledLayers` (a `Set` in state); pass `enabledLayers` + `slug` to `TerrainMap`. For earthquakes, use `useMountainSeismic(slug)` → build the epicenter FC → pass to the map. Add a small **legend** for the visible layers. Add OSM attribution to the attribution line when trails is on.

- [ ] **Step 1: Add the SWR hooks** to `hooks.ts`: `useMountainTrails/Roads/Wilderness/RecSites(slug)` (return `{ <alias>: GeoJSON.FeatureCollection | undefined, isLoading, error }`). (TerrainAccess uses them only for the access-card counts in Task 9; the MAP sources use the route URLs directly, not the hooks.)
- [ ] **Step 2: TerrainAccess test (TDD)** — mock the dynamic `TerrainMap`; assert the 5 layer checkboxes are now ENABLED (not disabled) and toggling one updates state (e.g. the map stub receives the enabled set, or a legend entry appears); the OSM attribution shows when Trails is checked; `expectNoA11yViolations`. Run → FAIL → implement TerrainAccess. Run → PASS.
- [ ] **Step 3: Implement `TerrainMap` geo layers** — the `applyGeoLayers` + `style.load` re-add + visibility toggling, using token-derived colors via `globals.css` (the GL paint colors can read CSS vars by resolving them in JS, OR use fixed hex matching the tokens — document the choice; prefer reading `getComputedStyle(document.documentElement).getPropertyValue('--accent')` for theme-awareness, fallback to a literal). Update the smoke test if needed. `npm run build` (confirm not in server bundle).
- [ ] **Step 4: CSS + legend** styling (tokens).
- [ ] **Step 5: Run** `npm test` + `npx tsc --noEmit` + `npm run build` → green.
- [ ] **Step 6: Commit** — `git commit -m "feat(terrain): live map layers (trails/roads/wilderness/trailheads/earthquakes) + style.load re-add"`

---

## Task 9: Access cards fed by cached data (Roads/Trails summaries)

**Files:** Modify `src/components/terrain/AccessCards.tsx` + test; `src/components/terrain/TerrainAccess.tsx` (pass the data/counts).

**Interfaces:** `AccessCards` gains optional `roads?: GeoJSON.FeatureCollection`, `trails?: GeoJSON.FeatureCollection` props (from `useMountainRoads`/`useMountainTrails` in TerrainAccess). The **Roads** card replaces its placeholder with a summary: `${nRoads} forest road segments · ${nClosed} closed near the peak` (or "Road data unavailable" when the FC is empty/undefined). The **Trails** card: `${nTrails} mapped trail segments` + a snow-line note placeholder (or "Trail data unavailable"). Permits card unchanged.

- [ ] **Step 1: Update AccessCards tests** — (a) roads FC with 5 features, 2 with `closed:true` → "5 forest road segments · 2 closed"; (b) empty/undefined roads → "Road data unavailable"; (c) trails FC with 8 features → "8 mapped trail segments"; (d) permits behavior unchanged; (e) axe clean.
- [ ] **Step 2: Run → FAIL**, implement the summaries (count `features`, count `feature.properties.closed`). Run → PASS.
- [ ] **Step 3: Wire** in `TerrainAccess`: `const { roads } = useMountainRoads(slug); const { trails } = useMountainTrails(slug);` → `<AccessCards permits={...} roads={roads} trails={trails} />`. Keep existing TerrainAccess tests green (mock the new hooks).
- [ ] **Step 4: Run** `npm test` + tsc → green.
- [ ] **Step 5: Commit** — `git commit -m "feat(terrain): Roads/Trails access cards fed by cached geo data"`

---

## Task 10: e2e fixtures/mocks + final gates + deploy + live-verify

**Files:** `tests/e2e/_mock.ts` + `_fixtures.ts`; deploy.

- [ ] **Step 1: e2e fixtures/mocks** — add `buildTrails/buildRoads/buildWilderness/buildRecSites(slug)` returning small GeoJSON FeatureCollections (a trail LineString, a road incl one `closed`, a wilderness polygon, a trailhead point); wire them into `_mock.ts` for the 4 new sub-paths (so the route-mocked terrain e2e can toggle layers + assert the access-card counts). Update `terrain-tab.spec.ts`: enable the Trails + Roads toggles → assert a legend entry + the Roads/Trails cards show the counts (e.g. "1 closed").
- [ ] **Step 2: Full local gates** — `npm test` (coverage ≥ 90/90/85), `npx tsc --noEmit`, `npm run build`, `npm run test:e2e` (all viewports), `terraform -chdir=terraform validate`.
- [ ] **Step 3: Bootstrap the geo bucket** (it must exist before the web service env references it / before runtime writes): `terraform -chdir=terraform plan -out=PLAN -target=<the geo bucket resource address>` then `apply PLAN` (with `TF_VAR_alert_email` set).
- [ ] **Step 4: Full deploy** — `export TF_VAR_alert_email=…`; `terraform -chdir=terraform plan -out=PLAN`; inspect (web rebuild + the GCS_BUCKET_GEO env + the bucket = non-destructive); `apply PLAN`.
- [ ] **Step 5: Live-verify each route + resolve the ⚠️ items** against the deployed URL: `GET /api/mountains/mt-rainier/trails` (real Overpass trails), `/roads`, `/wilderness`, `/rec-sites` → valid FeatureCollections; confirm the EDW field names (`oper_maint_level`/closure/site-name) + the Overpass QL produce real data, and fix any normalization mismatch (commit). A SECOND request should be cache-fast (served from GCS).
- [ ] **Step 6: Controller visual QA (route-mocked + live)** — capture the Terrain tab with Trails/Roads/Wilderness/Trailheads/Earthquakes layers ON across desktop + mobile + both themes; live-capture against the deployed URL (real OSM trails + EDW roads over the topo map). Inspect: layers render + are legible over Topo/Satellite, closed roads highlighted, the legend, the access-card counts, mobile. Fix any issue (commit).
- [ ] **Step 7: Commit** any live-fix — `git commit -m "fix(terrain): reconcile geo-layer normalization with live Overpass/EDW responses"`

---

## Self-Review (completed)

**Spec coverage (§8.2 layer data sources + §10 cached routes):**
- §8.2 Trails (Overpass + NPS-ArcGIS → cached GeoJSON) → Tasks 2,3 (+ NPS merge as a ⚠️-optional enhancement). ✓
- §8.2 Roads + closures (EDW RoadBasic + closed-to-motorized) → Task 4. ✓ (MVUM folded into the roads layer is ⚠️ deferred — RoadBasic + closures covers the spec's "closed road segments highlighted".)
- §8.2 Wilderness (EDW polygon) → Task 5. ✓
- §8.2 Trailheads/rec-sites + closures (EDW InfraRecreationSites) → Task 6. ✓
- §8.2 Earthquakes (ComCat markers, shares Safety) → Task 7 (coords) + Task 8 (markers). ✓
- §8.1 layer toggle panel (the "coming soon" entries become live) + §8.4 Roads/Trails access cards fed from the cached route → Tasks 8, 9. ✓
- §10.1/10.3 read-through GCS cache + `usfsForestName` catalog field; §10 no-worker/no-key → Tasks 1,2; all routes are lazy-cached proxies. ✓
- §3.2 degradation (empty FC on upstream failure; cards "unavailable") + attribution (OSM ODbL) → per task + Tasks 8,9,10. ✓
- **Deferred / ⚠️ live-verify (documented):** the exact EDW field semantics (oper_maint_level/closure/site-name), the Overpass `sac_scale` way-query, the optional NPS-ArcGIS trail merge, and MVUM — all flagged for the Task-10 deploy verification against live service metadata, not silently assumed.

**Placeholder scan:** No "TBD/TODO". `geo.ts`/`storage` helpers carry full signatures + concrete tests; each route task carries its exact endpoint, the cache-then-fetch-then-cache template, the graceful-empty rule, and concrete test cases. The ⚠️ items are explicitly scheduled for live verification (the research doc flagged them as vague) — a deliberate verify step, not a placeholder.

**Type consistency:** `BBox` (geo.ts) consumed by the query builders + routes. `readCachedGeo`/`writeCachedGeo` (Task 1) consumed by Tasks 3–6. `GeoJSON.FeatureCollection` is the uniform route return + map source + hook type + AccessCards prop. `LayerKey` (Task 8) drives TerrainMap + TerrainAccess. `QuakeEvent.lng/lat` (Task 7) consumed by the earthquake markers (Task 8). `usfsForestName` (Task 1) optional context. `GCS_BUCKET_GEO` env (Task 1) read by storage (Task 1) + deployed (Task 10). Consistent.
