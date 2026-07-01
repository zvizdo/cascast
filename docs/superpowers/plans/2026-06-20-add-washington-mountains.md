# Add Washington (+ Oregon) Mountains Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the catalog 11 → 38 by adding 22 serious Washington alpine peaks + 5 Oregon Cascade volcanoes, each with cross-checked data so all feeds (weather / NWAC / SNOTEL / satellite / safety / terrain) work or degrade gracefully.

**Architecture:** Mountains are data rows in the bundled constant `src/lib/mountains-data.ts` (the only source of truth; web serves the catalog from it, Python functions read it from Firestore after seeding). No schema/type changes — only validated rows + test-invariant widening + per-peak routes/terrain + a deploy. Research is done rigorously per `references/add-mountain.md` §6 (≥2 independent sources per field).

**Tech Stack:** Next 16 / React 19 (TS), Vitest, Playwright, Terraform/Cloud Run, Python terrain CLI (`functions/tools/build_terrain.py`), GCS.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-06-20-add-washington-mountains-design.md`. Contract for fields: `references/add-mountain.md` (§1 fields, §5 base/mid, §6 validation, "How to add one").
- **The `Mountain` type is unchanged** — add rows only; do not edit `src/lib/types.ts`.
- **Every field cross-checked against ≥2 independent sources** (PeakBagger + USGS/CalTopo for lat/lng/summit; avalanche.org for NWAC zone id; NRCS for SNOTEL triplet; HANS `getMonitoredVolcanoes` for volcano ids; recreation.gov/NPS/USFS for permits — GET-verify each permit URL returns 200 and add a dated comment, matching the Whitney rows).
- **Units = feet** for all elevations (contract §12a). **Timezone = `America/Los_Angeles`** for all 27.
- **`mapBbox`** = `{ west: lng-0.08, south: lat-0.08, east: lng+0.08, north: lat+0.08 }`, each rounded to 4 decimals. Mechanical.
- **`webcams`**: OMIT — unused by all existing peaks; not in scope.
- **Empty-field patterns** (carry `""`, never a bogus value): `nwacZone`/`nwacZoneId` empty for the 5 Oregon peaks (south of NWAC's Mt-Hood southern bound); `snotelStation*` empty for any peak with no genuinely nearby SNOTEL station. Empty keys make the workers/routes short-circuit — a wrong id silently fetches the wrong peak's data.
- **`hansVolcanoId`** only on the 5 Oregon volcanoes (verify via HANS; omit if unmonitored). **`npsParkCode`**: `noca` for North Cascades NP peaks, `olym` for Olympic NP peaks (verify boundary); omit otherwise. **`airnowHint`** omitted for all.
- `slug` is the Firestore doc id, immutable after seeding — get it right (kebab-case, matches the spec table).
- Test runner: `npx vitest run --config config/vitest.config.ts <path>`; full `npm test`; build `npm run build`; typecheck via build.
- Deploy is **plan-then-apply, never `-auto-approve`**, and **must** export `TF_VAR_alert_email` (else the monitoring channel is deleted) and `TF_VAR_ga_measurement_id` is unrelated here.

### Canonical record templates (copy this exact shape + field order)

Full WA peak (NWAC + SNOTEL), from `colchuck-peak`:
```ts
  { name:"Colchuck Peak", slug:"colchuck-peak", lat:47.4783, lng:-120.8465,
    elevations:{base:3400,mid:5570,summit:8705}, nwacZone:"east-slopes-central",
    nwacZoneId:"1655", snotelStationId:"478", snotelStationTriplet:"478:WA:SNTL",
    snotelStationName:"Fish Lake", region:"cascades-central", timezone:"America/Los_Angeles",
    description:"…one-sentence route/character blurb…",
    mapBbox:{west:-120.9265,south:47.3983,east:-120.7665,north:47.5583},
    permits:[{label:"…", url:"https://…", note:"…"}] },
```

Empty-NWAC/SNOTEL peak (Oregon pattern), from `mt-whitney`:
```ts
  { name:"South Sister", slug:"south-sister", lat:00.0000, lng:-000.0000,
    elevations:{base:0,mid:0,summit:0}, nwacZone:"",
    nwacZoneId:"", snotelStationId:"", snotelStationTriplet:"",
    snotelStationName:"", region:"oregon", timezone:"America/Los_Angeles", // south of NWAC; weather+satellite(+OR SNOTEL if any)
    description:"…",
    hansVolcanoId:"…",            // only if HANS-monitored; else omit
    mapBbox:{west:0,south:0,east:0,north:0},
    // <permit source> (200 GET-verified <date>): https://…
    permits:[{label:"…", url:"https://…", note:"…"}] },
```

---

### Task 1: North Cascades cluster (13 peaks)

**Files:**
- Modify: `src/lib/mountains-data.ts` (append 13 records before the closing `] as const;`)
- Modify (only if new rows break it): `src/lib/__tests__/mountains-data.test.ts`

**Peaks (slug):** Eldorado Peak (`eldorado-peak`), Forbidden Peak (`forbidden-peak`), Sahale Peak (`sahale-peak`), Bonanza Peak (`bonanza-peak`), Mount Goode (`mt-goode`), Mount Buckner (`mt-buckner`), Mount Logan (`mt-logan`), Jack Mountain (`jack-mountain`), Black Peak (`black-peak`), Dome Peak (`dome-peak`), Sloan Peak (`sloan-peak`), Whitehorse Mountain (`whitehorse-mountain`), Three Fingers (`three-fingers`).

**Interfaces:**
- Produces: 13 `Mountain` rows. Later tasks (routes, seed, terrain) consume these exact slugs.

- [ ] **Step 1: Research each peak and record sourced values**

For every peak, gather and **cross-check against ≥2 sources** (per `references/add-mountain.md` §2 + §6): summit `lat`/`lng` (4 dp), `elevations.summit` (ft), `elevations.base`/`mid` (judgment per §5 — trailhead/high-camp), `region` (`cascades-north`), `nwacZone`+`nwacZoneId` (avalanche.org — West/East-Slopes-North by crest side; these are all NWAC-covered), `snotelStation*` (NRCS nearest; **empty `""`** if none genuinely nearby — expect empty for Bonanza/Logan/Jack/Dome and verify the others), `npsParkCode:"noca"` for peaks inside North Cascades NP (verify boundary: Eldorado/Forbidden/Sahale/Buckner/Goode/Logan likely; Bonanza/Jack/Dome/Black/Sloan/Whitehorse/Three Fingers are NF/wilderness → omit), `description`, `mapBbox` (computed), `permits` (NW Forest Pass / NoCa wilderness permit / etc. — GET-verify URLs, dated comment). Keep a per-field source citation for review.

- [ ] **Step 2: Append the 13 records to `mountains-data.ts`**

Insert before `] as const;`, using the exact template shape + field order above. No `webcams`. No `hansVolcanoId` (all non-volcanic).

- [ ] **Step 3: Run the catalog invariant test; extend it only if the new rows legitimately break it**

Run: `npx vitest run --config config/vitest.config.ts src/lib/__tests__/mountains-data.test.ts`
Expected: PASS. If a remote peak's empty `snotelStationTriplet` trips a regex that assumes non-empty, make that check conditional (`if (m.snotelStationTriplet) expect(...)`) — matching how Whitney is already handled. Do NOT loosen slug-uniqueness or required-core-field checks. (Coordinates here are within WA bounds, so the box should already pass.)

- [ ] **Step 4: Typecheck + build**

Run: `npm run build`
Expected: clean (TS `as const` catalog compiles; `/api/mountains` will include the new slugs).

- [ ] **Step 5: Commit**

```bash
git add src/lib/mountains-data.ts src/lib/__tests__/mountains-data.test.ts
git commit -m "feat(mountains): add 13 North Cascades peaks"
```

---

### Task 2: Central / Entiat / Stuart Range cluster (6 peaks)

**Files:** Modify `src/lib/mountains-data.ts`; modify `src/lib/__tests__/mountains-data.test.ts` only if needed.

**Peaks (slug):** Mount Stuart (`mt-stuart`), Dragontail Peak (`dragontail-peak`), Cannon Mountain (`cannon-mountain`), Mount Fernow (`mt-fernow`), Mount Maude (`mt-maude`), Seven Fingered Jack (`seven-fingered-jack`). **All `region:"cascades-central"`.**

- [ ] **Step 1: Research + cross-check** each peak (same field rules as Task 1). NWAC: East-Slopes-Central for Stuart Range/Enchantments; East-Slopes-Central/North for the Entiat peaks (verify by location). SNOTEL: nearest NRCS (e.g. Fish Lake for the Stuart Range, as Colchuck uses) or empty if none. `npsParkCode`: omit (these are USFS wilderness — Alpine Lakes / Glacier Peak Wilderness, not a National Park). `permits`: Enchantments Permit Area applies to Dragontail/Cannon (research + verify URL); NW Forest Pass otherwise.

- [ ] **Step 2: Append the 6 records** (template shape, no webcams, no hansVolcanoId).

- [ ] **Step 3: Run invariant test** — `npx vitest run --config config/vitest.config.ts src/lib/__tests__/mountains-data.test.ts` → PASS (extend conditionally if needed).

- [ ] **Step 4: Build** — `npm run build` → clean.

- [ ] **Step 5: Commit**
```bash
git add src/lib/mountains-data.ts src/lib/__tests__/mountains-data.test.ts
git commit -m "feat(mountains): add 6 Stuart Range + Entiat peaks"
```

---

### Task 3: Olympics + South Cascades cluster (3 peaks)

**Files:** Modify `src/lib/mountains-data.ts`; test only if needed.

**Peaks (slug):** Mount Constance (`mt-constance`, `olympics`), Mount Deception (`mt-deception`, `olympics`), Gilbert Peak / Goat Rocks (`gilbert-peak`, `cascades-south`).

- [ ] **Step 1: Research + cross-check.** NWAC: `olympics` zone for Constance/Deception; West-Slopes-South or East-Slopes-South for Gilbert (verify crest side). SNOTEL: nearest NRCS or empty. `npsParkCode:"olym"` for Constance/Deception if inside Olympic NP boundary (verify — both are in the eastern Olympics; confirm park vs. NF); omit for Gilbert (Goat Rocks Wilderness). `permits`: NW Forest Pass / Olympic NP wilderness permit as applicable (verify URLs).

- [ ] **Step 2: Append the 3 records.**
- [ ] **Step 3: Invariant test** → PASS.
- [ ] **Step 4: Build** → clean.
- [ ] **Step 5: Commit**
```bash
git add src/lib/mountains-data.ts src/lib/__tests__/mountains-data.test.ts
git commit -m "feat(mountains): add Olympics (Constance, Deception) + Goat Rocks (Gilbert)"
```

---

### Task 4: Oregon volcanoes (5 peaks, empty-NWAC pattern)

**Files:** Modify `src/lib/mountains-data.ts`; **modify `src/lib/__tests__/mountains-data.test.ts`** (Oregon-south coords + empty-NWAC are the most likely to need invariant widening).

**Peaks (slug):** Mount Jefferson (`mt-jefferson`), South Sister (`south-sister`), Middle Sister (`middle-sister`), North Sister (`north-sister`), Mount Thielsen (`mt-thielsen`). **All `region:"oregon"`, `nwacZone`/`nwacZoneId` = `""`.**

- [ ] **Step 1: Research + cross-check** using the empty-NWAC template. `nwacZone*` empty (south of NWAC). `snotelStation*`: check Oregon NRCS (`{id}:OR:SNTL`) for a genuinely nearby station, else empty. `hansVolcanoId`: **verify each via the HANS `getMonitoredVolcanoes` endpoint** — add only the confirmed ids; omit any not monitored. `npsParkCode`: omit (none inside a National Park — Thielsen is near, but not in, Crater Lake NP; verify). `permits`: Central Cascades Wilderness Permit (Three Sisters), NW Forest Pass, etc. — research + GET-verify + dated comment. Add the `// south of NWAC…` clarifying comment as Whitney does.

- [ ] **Step 2: Append the 5 records** (empty-NWAC template; `hansVolcanoId` where confirmed; no webcams).

- [ ] **Step 3: Update the invariant test for out-of-NWAC-region OR peaks**

Run: `npx vitest run --config config/vitest.config.ts src/lib/__tests__/mountains-data.test.ts`
If it fails: widen the coordinate bounding box to include the Oregon latitudes/longitudes (Thielsen ≈ 43.15°N is the southern extent; the Sisters/Jefferson ≈ −121.7…−121.8°W), and ensure NWAC-zone-membership / SNOTEL-triplet checks are skipped when those fields are `""` (mirror the existing Whitney handling). Re-run → PASS.

- [ ] **Step 4: Full suite + build**

Run: `npm test` then `npm run build`
Expected: full suite green (catalog now 38); clean build. This is the **catalog-complete milestone** — all 27 appear in `/api/mountains` and resolve in the UI after deploy.

- [ ] **Step 5: Commit**
```bash
git add src/lib/mountains-data.ts src/lib/__tests__/mountains-data.test.ts
git commit -m "feat(mountains): add 5 Oregon volcanoes (Jefferson, Three Sisters, Thielsen)"
```

---

### Task 5: Illustrative routes — Washington peaks (22)

**Files:**
- Create: `public/routes/<slug>.geojson` for each of the 22 WA peaks (Tasks 1–3 slugs)
- Modify: `src/data/routes/__tests__/routes.test.ts` (`EXPECTED_COUNTS`)

**Interfaces:** Consumes the slugs from Tasks 1–3. Each file is a `FeatureCollection` of `LineString`(s), coords `[lng, lat, elevFt]` ascending, **last point = the summit lat/lng/elev from the catalog**, every coordinate within **±0.055°** of the peak center, `properties.illustrative: true`.

- [ ] **Step 1: Author each route file** following the existing format (copy `public/routes/mt-rainier.geojson`). One representative ascent line per peak (trailhead → summit), 5–9 points, monotonically increasing elevation, ending exactly at the catalog summit coordinate. `properties`: `name`, `grade`, `trailhead`, `source:"Illustrative; route descriptions + USGS topo"`, `illustrative:true`.

- [ ] **Step 2: Add each new slug + its point count to `EXPECTED_COUNTS`** in `src/data/routes/__tests__/routes.test.ts`.

- [ ] **Step 3: Run the routes test**

Run: `npx vitest run --config config/vitest.config.ts src/data/routes/__tests__/routes.test.ts`
Expected: PASS — confirms every route ends at its summit, stays within ±0.055°, and counts match.

- [ ] **Step 4: Commit**
```bash
git add public/routes/ src/data/routes/__tests__/routes.test.ts
git commit -m "feat(mountains): illustrative routes for 22 WA peaks"
```

---

### Task 6: Illustrative routes — Oregon peaks (5)

**Files:** Create `public/routes/{mt-jefferson,south-sister,middle-sister,north-sister,mt-thielsen}.geojson`; modify `src/data/routes/__tests__/routes.test.ts`.

- [ ] **Step 1: Author the 5 OR route files** (same rules as Task 5; summit = catalog coordinate).
- [ ] **Step 2: Extend `EXPECTED_COUNTS`** with the 5 slugs + counts.
- [ ] **Step 3: Run** `npx vitest run --config config/vitest.config.ts src/data/routes/__tests__/routes.test.ts` → PASS.
- [ ] **Step 4: Commit**
```bash
git add public/routes/ src/data/routes/__tests__/routes.test.ts
git commit -m "feat(mountains): illustrative routes for 5 Oregon peaks"
```

---

### Task 7: Seed + deploy + data backfill (OPERATIONAL — needs GCP access)

> Run by the operator (or controller with cloud creds) — not a sandboxed subagent. Single prod environment; `--project mountain-weatherman-app`.

**Files:** none (operational).

- [ ] **Step 1: Seed Firestore** (for the Python functions)
Run: `npm run seed:mountains` (targets `mountain-weatherman-app`; upserts `merge:true`, so only the 27 new docs are added).
Expected: 38 `mountains/*` docs.

- [ ] **Step 2: Deploy the web image (MANDATORY redeploy — catalog is bundled)**
Run: `export TF_VAR_alert_email=<operator-email>` then `terraform -chdir=terraform plan -out=PLAN` → review (~hash-triggered web image rebuild + function restage; no Firestore/bucket loss) → `terraform -chdir=terraform apply PLAN`.
Expected: `mtn-weather-web` redeployed; `/api/mountains` returns 38.

- [ ] **Step 3: Trigger-refresh all sources for the 27 new slugs**
For each new slug and each `type` in `weather|nwac|snotel|satellite`:
`POST /api/admin/trigger-refresh?mountainId=<slug>&type=<type>` (or publish `{"mountainId":"<slug>"}` to the matching `*-refresh` topic). zsh: iterate with `for s in ${=slugs}`.
Expected: `mountainConditions/<slug>`, `mountains/<slug>/snapshots`, `nwacForecasts/<zoneId>` (WA only; OR + remote stay off-season/pending by design), `snotelData/<stationId>` (where non-empty), and satellite metadata populate.

- [ ] **Step 4: Verify live** — `/api/mountains` = 38; spot-check 3 peaks (one WA NWAC peak, one remote empty-SNOTEL peak, one OR volcano) return weather + correct degradation.

---

### Task 8: 3D terrain bakes (OPERATIONAL — needs GCP + functions/.venv)

> Operator/controller with cloud creds. Per `references/add-mountain.md` step 6. The peaks function without this (3D/flip degrade gracefully); do it to complete the feature.

**Files:** none (writes to `gs://mountain-weatherman-app-terrain/<slug>/`).

- [ ] **Step 1: Refresh the peaks export** — `npx tsx scripts/export-peaks.ts` (writes the gitignored `functions/tools/peaks.json` from the now-38 catalog).
- [ ] **Step 2: Bake each new peak** — from repo root with `functions/.venv` + `requirements-terrain.txt` installed:
`PYTHONPATH=functions GCS_BUCKET_TERRAIN=mountain-weatherman-app-terrain GCP_PROJECT=mountain-weatherman-app functions/.venv/bin/python -m functions.tools.build_terrain --mountain <slug>` for each of the 27 (or `--all`; default `--span 0.06`/`--exaggeration 1.6`).
- [ ] **Step 3: Verify** — `gs://…-terrain/<slug>/{terrain.glb,metadata.json}` exist and `metadata.minElevM/maxElevM` bracket the summit; `/api/mountains/<slug>/terrain/meta` returns 200; a couple of `/mountains/<slug>/3d` pages render. Re-tune `--span`/`--exaggeration` for any peak that looks flat or clipped.

---

### Task 9: Update docs (action item)

**Files:** Modify `references/add-mountain.md`; `README.md`; `CLAUDE.md`.

- [ ] **Step 1: `references/add-mountain.md`** — change the count to **38** everywhere it says 11; confirm the §1 field table fully documents the Phase 3A terrain fields (`mapBbox`, `webcams`, `permits`) and their sourcing (mapBbox mechanical; webcams optional/unused; permits GET-verified + dated comment); add a one-line note that `region:"oregon"` peaks south of Mt Hood use the empty-NWAC pattern.
- [ ] **Step 2: `README.md`** — fix the stale "All 10 mountains" → 38 (and the pulled-continuously line).
- [ ] **Step 3: `CLAUDE.md`** — update any "currently 11" / mountain-count references to 38 in the progress log / deploy notes.
- [ ] **Step 4: Commit**
```bash
git add references/add-mountain.md README.md CLAUDE.md
git commit -m "docs(mountains): update catalog count to 38 + terrain-field sourcing"
```

---

### Task 10: Final verification gate

**Files:** none.

- [ ] **Step 1: Full suite + build + typecheck** — `npm run test:coverage` (≥90/90/85) then `npm run build` → clean.
- [ ] **Step 2: Catalog integrity** — confirm 38 unique slugs, no duplicate slug/name, every required core field present; `grep -c "slug:" src/lib/mountains-data.ts` accounts for 38 rows + the helper.
- [ ] **Step 3: Routes coverage** — `ls public/routes/*.geojson | wc -l` = 38; `routes.test.ts` green.
- [ ] **Step 4: (if Tasks 7–8 run) live** — `/api/mountains` = 38; terrain meta 200 for a sample; feeds populated.
- [ ] **Step 5: Commit** any verification fixes.

---

## Self-Review (completed by plan author)

**Spec coverage:** 27-peak list → Tasks 1–4 (13+6+3+5 = 27 ✓); field matrix (NWAC/SNOTEL empty patterns, hansVolcanoId, npsParkCode, mapBbox, permits, webcams-omitted) → Global Constraints + per-task research steps; test-invariant widening → Tasks 1–4 Step 3/3; routes → Tasks 5–6; seed+deploy+backfill → Task 7; terrain → Task 8; add-mountain.md + README/CLAUDE doc action item → Task 9; final gate → Task 10.

**Placeholder scan:** the only "to be filled" values are researched data (lat/lng/elevation/zone-id/triplet/permit URLs) — inherently the implementer's deliverable, governed by the exact templates + the ≥2-source §6 validation, not free-form placeholders. No deterministic code is left unspecified.

**Type consistency:** all slugs match the spec table and are reused verbatim across Tasks 1–8; record shape matches the `Mountain` type + the Colchuck/Whitney templates; `region` values are confined to the existing enum (`cascades-north|central|south`, `olympics`, `oregon`).

**Risk note:** Tasks 7–8 require GCP credentials + `functions/.venv` and are operator-run; Tasks 1–6 + 9–10 are pure code/docs and fully sandbox-executable. The catalog-complete milestone (end of Task 4) makes all 27 peaks resolve in the web build before any deploy.
