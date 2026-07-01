# Interactive 3D Mountain — Design Spec

**Status:** Approved 2026-06-16. First implementation pass = **Mount Rainier end-to-end** (all 4 overlays), then fan out to the other 10 peaks.

## Goal
An interactive, free-orbit 3D model of each mountain that the user can rotate, zoom, and explore — with live and static overlays (freezing level/snow-line, summit marker + labels, 2–3 illustrative summit routes, slope-angle avalanche shading). It surfaces in two places: (1) as the **flip-back of the existing freezing-level cross-section tile** (focused mode), and (2) on a **dedicated 3D exploration page** `/mountains/[slug]/3d` (sibling to Model Lab). The cross-section is **enhanced, not replaced**.

## Core principle: bake-once, overlay-live
The terrain never changes, so the expensive work is done **once per mountain** and stored as static assets; everything time-varying is layered on **client-side** from data already on the page.

| Layer | Static / dynamic | Where produced | Where stored |
|---|---|---|---|
| Terrain mesh (geometry) | Static | Python bake script (one-shot) | `…-terrain` GCS bucket: `{slug}/terrain.glb` |
| Shaded-relief skin (hillshade + hypsometric tint) | Static | baked into the GLB as **vertex colors** | (in the GLB) |
| Terrain metadata (bbox, min/max elev, exaggeration, summit xyz) | Static | Python bake script | `{slug}/metadata.json` |
| Summit routes (2–3, illustrative) | Static | hand-digitized + gov data, elevation pre-sampled | **in-repo** `src/data/routes/{slug}.geojson` |
| Freezing-level plane / snow-line | Dynamic | client, from live weather | — |
| Summit marker + elevation labels | Static-ish | client, from `mountains-data.ts` | — |
| Slope-angle (30–45°) shading | Static (terrain) | client **shader from mesh normals** (toggleable; no extra bake) | — |
| Sun angle (optional later) | Dynamic | client, from date + lat/lng | — |

## Architecture

### 1. Bake pipeline (Python, one-shot CLI — not a worker)
- **New:** `functions/tools/build_terrain.py`. Run locally in the 3.12 venv. CLI: `--mountain <slug>` and `--all`.
- Steps per peak: derive a bbox from the mountain's lat/lng + a fixed half-span (≈0.06° ≈ ~6–9 km, tuned per peak via `--span`) → fetch the USGS **3DEP** DEM via the no-key ImageServer `exportImage` endpoint as float32 GeoTIFF → read with `rasterio`/`numpy` → build a grid mesh (decimated to ≤~256×256) with vertical exaggeration (default **1.6×**, `--exaggeration`) → compute hillshade + hypsometric tint → write as **vertex colors** → export **`.glb`** (`trimesh`) → upload to the terrain bucket + write `metadata.json` (bbox WGS84 corners, min/max elevation ft, exaggeration, mesh extent in local mesh units, summit position in mesh coords).
- **Deps:** new `functions/requirements-terrain.txt` = `rasterio` (wheels bundle GDAL — no system GDAL), `numpy`, `trimesh`. NOT added to the function runtime `requirements.txt`.
- **Idempotent & repeatable:** re-running overwrites the peak's assets. No schedule, no Cloud Run.

### 2. Storage + serving
- **Terraform:** new `google_storage_bucket "terrain"` = `${project}-terrain` (immutable; no lifecycle rule). Output its name; inject `GCS_BUCKET_TERRAIN` into the web Cloud Run env and expose to the Python script via env/default.
- **Web read helpers** (`src/lib/storage.ts`): `readTerrainModel(slug)` → `{buffer, contentType:"model/gltf-binary"}` from `{slug}/terrain.glb`; `readTerrainMeta(slug)` → parsed `metadata.json`. Mirror `readSatelliteImage`.
- **Routes:** `GET /api/mountains/[slug]/terrain/model` (streams the GLB, `Cache-Control: public, max-age=86400, immutable`) and `GET /api/mountains/[slug]/terrain/meta` (JSON). Both validate the slug via `mountainBySlug` (consistent with the other routes) and 404 cleanly when the asset is absent.

### 3. Route data (legally clean, illustrative)
- Per-mountain static GeoJSON `src/data/routes/{slug}.geojson` — a `FeatureCollection` of `LineString`s; each `properties`: `name`, `grade`, `trailhead`, `source` (attribution), `illustrative: true`.
- Acquisition: government open data for approach trails (NPS for Rainier/Olympic, USFS CC-BY for Forest peaks); **hand-digitized** upper glaciated routes (own work via geojson.io) from route descriptions + topo. Avoid all UGC GPX (AllTrails/Gaia/PeakBagger/WTA/Trailforks — restrictive ToS). OSM (ODbL, attribution) only as supplement.
- Elevation pre-sampled per vertex from the **same DEM** (densify first); store as the `Z` coord so lines sit on the surface.
- Realistic coverage: 2–3 routes for Rainier/Baker/Shuksan/St. Helens/Colchuck/Whitney; **1** for Adams/Hood/Olympus/Liberty Bell/Glacier Peak. v1 ships whatever is real per peak (no forced 3).
- **Safety:** every route overlay carries a persistent **"Illustrative — not for navigation"** label (hard requirement). Stored `illustrative` flag + visible UI disclaimer.

### 4. Frontend — `<Mountain3D>` (react-three-fiber)
- **Library:** add `three`, `@react-three/fiber`, `@react-three/drei`. R3F is the right tool for a true free-orbit object (map libraries are top-down map cameras). The unused `mapbox-gl` dep should be removed in a cleanup (flag, separate).
- **Component:** `src/components/three/Mountain3D.tsx` (client-only; dynamic import with `ssr:false`). Loads the GLB (`useGLTF`) + meta, frames the camera from the summit, `OrbitControls` (drag-rotate, scroll-zoom, pan). Props select size (compact vs full) and which overlays are on.
- **Overlays** (sub-components under `src/components/three/`):
  - `FreezingPlane` — a translucent plane at the freezing elevation (mapped to mesh Y via metadata); the intersection with terrain reads as the snow-line. Driven by the live freezing-level value.
  - `SummitMarker` + `ElevationLabels` — drei `Html`/billboard labels for base/mid/summit from `mountains-data.ts`.
  - `RouteLines` — load `{slug}.geojson`, map lat/lng/elev → mesh coords via metadata, render as `Line`s with a small Y-offset; legend lists names + grades + the disclaimer.
  - `SlopeShading` — a material/shader that colors faces whose normal-derived slope is 30–45° (red/orange); toggleable; no extra bake.
- **Fallbacks:** WebGL-unsupported or GLB-missing → graceful message (and on the tile, stay on the cross-section). `prefers-reduced-motion` → no auto-spin, instant flip.

### 5. Surface 1 — card flip on the cross-section tile
- The `FreezingLevelHero` host (MountainDetail, focused & in-range) gains a flip container: front = cross-section (unchanged), back = compact `<Mountain3D>` + "Explore in 3D →" link.
- Flip via CSS `transform: rotateY(180deg)` on a `.flip` container; a header button toggles `aria-pressed`/state. Reduced-motion → instant swap. WebGL-absent → button hidden/disabled, cross-section stays.

### 6. Surface 2 — `/mountains/[slug]/3d` exploration page
- New route + page component, modeled on `/mountains/[slug]/models`. Large `<Mountain3D>` + overlay toggle controls (freezing plane · routes · slope-angle · labels) + legend + route list + the "not for navigation" disclaimer + attribution (USGS 3DEP, USFS CC-BY, OSM ODbL). Freezing level synced to `?target=` (reuse existing forecast selectors). Linked from the detail header and the flip-back.

## Data flow
1. (one-time) `build_terrain.py --mountain mt-rainier` → GLB + metadata in GCS.
2. (one-time) author `src/data/routes/mt-rainier.geojson`.
3. Client opens the flip or `/3d` page → fetches GLB + meta via the terrain routes (SWR), reads routes GeoJSON (static import/fetch), reads live weather (existing hooks) → renders mesh + overlays.

## Error handling
- Missing GLB/meta → terrain routes 404 → viewer shows a calm "3D model not available yet" state; the tile flip button is hidden when no model exists.
- Missing routes file → no route layer (no error).
- No freezing data (browse/out-of-range) → no freezing plane; on the `/3d` page the toggle is disabled with a hint.
- WebGL unsupported → static fallback + message.

## Testing
- **Python:** unit-test the mesh/bbox/color math with a tiny synthetic DEM array (no network); mock the DEM fetch + GCS upload. Keep ≥90% on the new module (or explicitly omit the thin network/IO shims from coverage like other workers).
- **Web unit (Vitest):** terrain routes (200 streams bytes / 404 unknown slug / 404 missing asset); `storage.ts` helpers (mocked GCS); overlay coordinate-mapping pure functions (lat/lng/elev → mesh xyz) tested directly; route GeoJSON loader/validator. R3F canvas rendering itself is not unit-tested (jsdom has no WebGL) — extract logic into pure functions and test those; smoke-test the page shell renders controls/legend/disclaimer.
- **Playwright:** the `/3d` page renders the canvas container, controls, legend, and the disclaimer (desktop + mobile); the cross-section tile shows a working "View in 3D" button that flips (assert `aria-pressed` + back-panel visibility). 3D pixels aren't asserted; structural + a11y checks + screenshots.
- **Gates:** all existing gates stay green (web build/tsc/test ≥90/90/85, python pytest ≥90, tf validate, e2e).

## Units / boundaries (file responsibilities)
- `functions/tools/build_terrain.py` — DEM→GLB bake CLI (one responsibility). Helper math factored into a tested module (e.g. `functions/tools/terrain_mesh.py`).
- `src/lib/storage.ts` — +terrain read helpers. `src/app/api/mountains/[slug]/terrain/{model,meta}/route.ts` — serving.
- `src/components/three/*` — viewer + overlays (each overlay its own file).
- `src/data/routes/*.geojson` — route data. `src/lib/terrain.ts` — pure coordinate-mapping + GLB/meta types + route loader.
- `src/app/mountains/[slug]/3d/page.tsx` — exploration page. Flip wiring in the existing hero host.

## Rollout — ONE plan, two stages
This is a single implementation plan with a **hard QA gate** between the two stages.

1. **Stage A — Rainier end-to-end (everything):** bake Rainier, infra (terrain bucket + serving routes), `<Mountain3D>` + all 4 overlays, the card flip on the cross-section tile, the `/mountains/mt-rainier/3d` page, Rainier's route GeoJSON, the disclaimer + attribution. Run ALL gates (web build/tsc/test, python pytest, tf validate, e2e), deploy to Cloud Run, and **QA locally + live** (Playwright + manual render check: does the model load, orbit, and do all overlays render correctly on desktop + mobile, both themes). Rainier must be **fully correct and pass QA** before Stage B starts.
2. **Stage B — fan out to all other 10 peaks (gated on Stage A QA passing):** in the SAME plan, as the final phase: bake the remaining 10 terrains, author each peak's route GeoJSON (1–3 routes per peak per the realistic coverage), and verify each renders on its `/3d` page + flip. No new code — only data/asset production + verification — reusing the Stage-A components unchanged. Final full-suite gate + deploy + spot-check several peaks live.

## Risks / gotchas
- Vertical exaggeration mandatory (~1.6×) or peaks look flat; expose `--exaggeration`.
- Coordinate alignment: overlays map through the **baked bbox/metadata** — never re-derive; a GLB/GeoJSON must share the DEM's space.
- Mobile GPU: decimate mesh (≤256²), cap pixel ratio, lazy-load the viewer (dynamic import), pause render when off-screen.
- `three` bundle size: client-only dynamic import so it never hits SSR/first paint of other pages.
- Route z-fighting: densify + small Y-offset + `polygonOffset`.
- Safety/liability: the "not for navigation" disclaimer is a hard, persistent requirement.
- New Python deps are heavy (`rasterio`): isolated to the one-shot tool's own requirements file + venv, never the function runtime.
