# Reference: Adding a Mountain

How to add a new peak to the Mountain Weatherman database — the full data contract, where every field comes from, how to cross-check it against at least two independent sources, and which decisions are most likely to break things (especially pressure-level / elevation-band selection).

**Canonical sources this doc is built on** (read these if anything here looks stale — the contract wins):
- Interface contract: [`docs/superpowers/specs/2026-06-14-interface-contract.md`](../docs/superpowers/specs/2026-06-14-interface-contract.md) — §3 (Firestore schema), §5.1 (pressure bands), §5.2 (NWAC zones), §5.3 (SNOTEL), §10 (seed data), §12a (units).
- Seed data: [`src/lib/mountains-data.ts`](../src/lib/mountains-data.ts) — the live source of all mountains (currently 38, extensible; out-of-region peaks supported). **The web API serves the catalog directly from this bundled constant** (not Firestore); the Python functions read it from Firestore (seeded from the same file). Two sources by design — see "How to add one".
- TS type: [`src/lib/types.ts`](../src/lib/types.ts) (`Mountain`, `Elevations`).
- Seed script: [`scripts/seed-mountains.ts`](../scripts/seed-mountains.ts).
- Band selection: [`functions/weather_worker/weather_worker/open_meteo_client.py`](../functions/weather_worker/weather_worker/open_meteo_client.py).

---

## 1. The full contract

A mountain is defined once in the `MOUNTAINS` array in `src/lib/mountains-data.ts` — there is **no admin UI and no API write path**; that file is the source of truth. It feeds **two consumers**: (1) the **web** API/UI, which serves the catalog **directly from the bundled constant** (`/api/mountains`, the `[slug]` route metadata, and the detail/Model-Lab pages all read `mountains-data.ts` at build time — no Firestore read), and (2) the **Python Cloud Functions**, which read the catalog from the Firestore `mountains/{slug}` document (the orchestrator's `all_mountain_ids`). The seed script writes the constant into Firestore for the functions; the document ID **is** the slug. Because the two consumers read from separate places, **adding a mountain requires both a Firestore seed and a web redeploy** (see "How to add one").

Verbatim type (`src/lib/types.ts` / mirrored in `mountains-data.ts`):

```ts
export interface Elevations { base: number; mid: number; summit: number }
export interface Mountain {
  slug: string; name: string; lat: number; lng: number; elevations: Elevations;
  nwacZone: string; nwacZoneId: string; snotelStationId: string;
  snotelStationTriplet: string; snotelStationName: string;
  region: string; timezone: string; description: string;
  // Phase 2 optional
  hansVolcanoId?: string; npsParkCode?: string; airnowHint?: string;
  // Phase 3 optional
  mapBbox?: { west: number; south: number; east: number; north: number };
  webcams?: { id: string; label: string; source: string; url: string; seasonal?: boolean }[];
  permits?: { label: string; url: string; note?: string }[];
  usfsForestName?: string; // USFS National Forest name; omit for NP-only or out-of-region peaks
}
```

| Field | Type | Units / format | Required | Notes |
|---|---|---|---|---|
| `slug` | string | URL-safe kebab-case | ✓ | **Firestore doc ID.** Must be unique. e.g. `mt-rainier`. Never change after seeding (URLs + accumulated snapshots are keyed to it). |
| `name` | string | display text | ✓ | e.g. `Mount Rainier`. |
| `lat` | number | decimal degrees, WGS84 | ✓ | **Summit** latitude. 4 decimals (~11 m) is enough; this is the point the weather API is queried at. |
| `lng` | number | decimal degrees, WGS84 | ✓ | **Summit** longitude (negative for W). |
| `elevations.base` | number | **feet** | ✓ | Route start / trailhead / base camp — NOT the lowest point on the mountain. See §5. |
| `elevations.mid` | number | **feet** | ✓ | Mid-route reference (high camp / midpoint). See §5. |
| `elevations.summit` | number | **feet** | ✓ | True summit elevation. |
| `nwacZone` | string | zone slug label | ✓* | Display label, e.g. `west-slopes-south`. Cosmetic — `nwacZoneId` is what fetches data. *Empty `""` for out-of-NWAC-region peaks (see "Out-of-NWAC-region peaks"). |
| `nwacZoneId` | string | numeric id as **string** | ✓* | avalanche.org zone id, e.g. `"1648"`. Drives the NWAC fetch (`nwacForecasts/{zoneId}`). *Empty `""` for out-of-region peaks → nwac worker/route short-circuit (never build a doc ref from it). |
| `snotelStationId` | string | NRCS id as **string** | ✓* | e.g. `"679"`. Keys `snotelData/{stationId}`. *Empty `""` for peaks with no nearby SNOTEL. |
| `snotelStationTriplet` | string | `{id}:{ST}:SNTL` | ✓* | e.g. `"679:WA:SNTL"`. **Network is `SNTL`, not `SNOTEL`.** State is `WA` or `OR`. This is what the worker actually queries. *Empty `""` for peaks with no nearby SNOTEL → snotel worker early-returns. |
| `snotelStationName` | string | display text | ✓* | e.g. `Paradise`. *Empty `""` for peaks with no nearby SNOTEL. |
| `region` | string | enum | ✓ | One of `cascades-south` \| `cascades-central` \| `cascades-north` \| `olympics` \| `oregon` \| `sierra-nevada` (out-of-NWAC-region, e.g. Mount Whitney). |
| `timezone` | string | IANA tz | ✓ | All current peaks use `America/Los_Angeles`. |
| `description` | string | narrative | ✓ | One-sentence route/character blurb. |
| `hansVolcanoId` | string | HANS id, e.g. `"wa6"` | optional | Phase 2 Safety gating. HANS (Hazard Assessment for North Slope) volcano id; omit/`""` for non-volcanoes. Present on the five WA Cascade volcanoes: Rainier `wa6`, Baker `wa2`, Glacier Peak `wa3`, Adams `wa1`, St Helens `wa4`. Hood's id is unverified — confirm via the HANS `getMonitoredVolcanoes` endpoint before adding. |
| `npsParkCode` | string | NPS unit code, e.g. `"mora"` | optional | Phase 2 Safety gating. NPS park code for the containing National Park (used to gate the NPS permit/reservation panel); omit/`""` for peaks not inside a National Park. Present entries: Rainier `mora`, Shuksan/N-Cascades `noca`, Olympus `olym`, Whitney/Sequoia-Kings-Canyon `seki`. |
| `airnowHint` | string | AirNow reporting area name | optional | Phase 2 Safety gating. Preferred AirNow reporting area for air-quality data; omit/`""` to use the nearest area by lat/lng. Currently empty for all 11 peaks (nearest-by-location is adequate). |
| `mapBbox` | `{west,south,east,north}` | decimal degrees, WGS84 | optional | **Phase 3.** Default MapLibre viewport for this peak. If absent, the map component falls back to a ±0.08° box around `lat`/`lng`. For the seed 11, computed as `{west:lng−0.08, south:lat−0.08, east:lng+0.08, north:lat+0.08}`. Widen for peaks where the approach/glacier context matters at a larger span. |
| `webcams` | `{id,label,source,url,seasonal?}[]` | — | optional | **Phase 3.** Live or near-live webcam feeds for the peak. `id` is a unique string, `source` is the operator name (e.g. `"WSDOT"`, `"NPS"`), `url` is a direct image or embed URL. Absent/empty → the Webcam panel is hidden. Task 6 populates real URLs for the seed peaks. |
| `permits` | `{label,url,note?}[]` | — | optional | **Phase 3.** Required access permits or passes, each with a human-readable `label`, a deep-link `url`, and an optional `note`. Absent/empty → the Permits card is omitted. Currently seeded for Mount Rainier only (NPS climbing permit). |
| `usfsForestName` | string | display text | optional | **Phase 3B.** USFS National Forest name, e.g. `"Mt. Baker-Snoqualmie National Forest"`. Used as optional context for geo/EDW queries. Omit for NP-only peaks (Rainier, Olympus, Whitney) and out-of-region peaks. Current mapping: Baker/Shuksan/Glacier Peak → Mt. Baker-Snoqualmie NF; Adams/St. Helens → Gifford Pinchot NF; Hood → Mount Hood NF; Colchuck/Liberty Bell → Okanogan-Wenatchee NF. |
| `createdAt` | timestamp | — | auto | Added by the seed script (`new Date()`), not in the source file. |

> **Units (contract §12a):** every elevation/height in the system is canonically **feet**. The UI toggles to metric for display only. Do not store metric.

There is **no Python/Pydantic `Mountain` model** — the workers read the Firestore doc as a dict. The TS type in `mountains-data.ts` is the only compile-time guard, so the seed file is where correctness is enforced.

### How to add one (procedure)

> **The catalog lives in two places** (see §1): the bundled constant the **web** reads, and the Firestore docs the **Python functions** read. Adding a mountain therefore needs **both a seed and a web redeploy** — the redeploy is **mandatory, not optional** (this supersedes any earlier "redeploy optional" wording). Without it, the new slug 404s in the UI and is absent from `/api/mountains`, because the detail/Model-Lab pages and the `/api/mountains*` routes resolve metadata from the constant baked into the image.

1. **Edit the constant.** Append a record to `MOUNTAINS` in `src/lib/mountains-data.ts` (copy an existing entry, keep the field order). For an out-of-NWAC-region peak, set the `nwacZone*`/`snotelStation*` fields to `""` (see below).
2. Run the validation checklist in §6 against two independent sources for every field. (Also widen `src/lib/__tests__/mountains-data.test.ts` if the peak is out of the existing WA/OR coordinate box or carries empty station/zone fields — see §6.)
3. **Seed Firestore** (for the Python functions): `npm run seed:mountains` — it runs `scripts/seed-mountains.ts`, which upserts with `merge:true`, so re-running is safe and only the new doc is added. Target `--project mountain-weatherman-app`.
4. **`terraform apply` (web image rebuild — MANDATORY).** The web serves the catalog from the bundled constant, so the detail/Model-Lab pages and the `/api/mountains*` routes only see the new mountain after the image is rebuilt and Cloud Run is redeployed. Use plan-then-apply (`terraform -chdir=terraform plan -out=PLAN` → `terraform -chdir=terraform apply PLAN`), never blind `-auto-approve`.
5. **Trigger-refresh** to backfill data immediately instead of waiting on cadence — per source:
   `POST /api/admin/trigger-refresh?mountainId=<slug>&type=weather|nwac|snotel|satellite`
   (or publish `{"mountainId":"<slug>"}` to the matching `*-refresh` topic). The orchestrator otherwise fans out to all mountains on schedule (weather hourly, snotel daily, nwac morning window, satellite Sunday).
6. **Bake the 3D terrain (one-shot)** so the `/mountains/<slug>/3d` page + the cross-section flip have a model. From the repo root, with `functions/.venv` + `requirements-terrain.txt` installed: `npx tsx scripts/export-peaks.ts` then `PYTHONPATH=functions GCS_BUCKET_TERRAIN=mountain-weatherman-app-terrain GCP_PROJECT=mountain-weatherman-app functions/.venv/bin/python -m functions.tools.build_terrain --mountain <slug>`. Verify `gs://mountain-weatherman-app-terrain/<slug>/{terrain.glb,metadata.json}` exist and the metadata's `minElevM/maxElevM` bracket the summit. (Default `--span 0.06`/`--exaggeration 1.6` frames most peaks; tune per peak if it looks flat or clipped.)
7. **Author illustrative routes** at `public/routes/<slug>.geojson` (copy the format of an existing file; `[lng,lat,elevFt]`, ascending, last point = summit, `illustrative:true`, every coord within ±0.055° of center). Extend `src/data/routes/__tests__/routes.test.ts`'s `EXPECTED_COUNTS` with the new slug+count. The new route file is picked up automatically (`useRoutes(slug)` fetches it) but ships only after the **web redeploy** in step 4 (public assets are baked into the image) — so do steps 6–7 BEFORE the `terraform apply`, or redeploy again.
8. Verify: the mountain appears in `/api/mountains`, `mountains/<slug>` exists, and `mountains/<slug>/snapshots` starts accumulating; `nwacForecasts/<zoneId>` and `snotelData/<stationId>` populate (NWAC is empty in summer — off-season, expected; out-of-region peaks stay off-season/pending for NWAC+SNOTEL by design); `/api/mountains/<slug>/terrain/meta` returns 200 and the `/3d` page renders.

### Out-of-NWAC-region peaks (e.g. Mount Whitney)

NWAC covers **Washington + Oregon only**, and NRCS SNOTEL is sparse outside the Cascades — so a peak elsewhere (e.g. the California Eastern Sierra) has no avalanche zone and no representative SNOTEL station. These are supported:

- Set `nwacZone`, `nwacZoneId`, `snotelStationId`, `snotelStationTriplet`, and `snotelStationName` all to `""`.
- Set the appropriate `region` (e.g. `sierra-nevada`).
- Leave `lat`/`lng`/`elevations`/`timezone`/`description` as for any peak.

The pipeline degrades gracefully: the **snotel and nwac workers early-return ("skip") on an empty station/zone** (the orchestrator still fans out to the peak — it doesn't filter), and the **API/UI already render off-season / pending** for the missing feeds. **Weather and satellite are global** data sources, so they still populate normally.

**`region:"oregon"` peaks south of Mt Hood** (e.g. Jefferson, Three Sisters, Thielsen) use the same empty-NWAC pattern: set all `nwacZone*` and `snotelStation*` fields to `""` if no representative SNOTEL exists; set `region:"oregon"`. Weather and satellite still populate.

**Worked example — Mount Whitney** (`mt-whitney`, `region: sierra-nevada`, summit **14,505 ft**, Eastern Sierra, CA): weather + satellite populate; NWAC + SNOTEL fields are `""` and show off-season/pending. It is the first out-of-region peak and brings the set to **11**.

---

## 2. Where every field comes from — and how to cross-check it

> **Principle:** never take a single source for elevation, coordinates, NWAC zone, or SNOTEL station. Use the authoritative source plus one independent cross-check. If the two disagree by more than the tolerance below, stop and resolve it before seeding — a wrong `nwacZoneId` or `snotelStationTriplet` silently fetches the *wrong* mountain's data.

### Summit `lat` / `lng`
- **Primary (authoritative):** USGS **GNIS** / The National Map — `https://edits.nationalmap.gov/apps/gaz-domestic/public/search/names` (official US summit feature, gives the named summit point).
- **Cross-check:** **PeakBagger** (`peakbagger.com`, climber-maintained summit coords + elevation + prominence) and/or **OpenStreetMap** `natural=peak` node / **CalTopo**.
- **Tolerance:** the two should agree within ~0.001° (~100 m). The point only needs to land on the right summit for the Open-Meteo query.

### `elevations.summit`
- **Primary:** USGS GNIS / NGS datasheet, or USGS topo via **CalTopo** (`caltopo.com`).
- **Cross-check:** PeakBagger and Wikipedia (Wikipedia cites its source — follow it, don't trust the infobox blindly).
- **Tolerance:** ±20 ft. Prefer the surveyed USGS value.

### `elevations.base` and `elevations.mid` — **judgment calls, not a lookup**
These are **route reference elevations**, not "the mountain's lowest/middle point". Across the seed set, `base` = the standard route start (trailhead, lodge, or base camp) and `mid` = a high camp or mid-route waypoint. Examples: Rainier `base 5420` = Paradise; Hood `base 5960` = Timberline Lodge; Olympus `base 600` = Hoh rainforest trailhead.
- **How to set them:** read the elevation at the route's start and high camp from **CalTopo / Gaia GPS** (click the point → elevation), and confirm against a route description — **The Mountaineers / SummitPost / a guidebook** (independent #2).
- These drive the pressure-band temperature columns (base/mid/summit), so pick values that genuinely represent where a climber is — see §4 and §5.

### `nwacZone` + `nwacZoneId`
- **Primary (authoritative — and what the pipeline uses):** avalanche.org map layer
  `GET https://api.avalanche.org/v2/public/products/map-layer/NWAC` → for each feature, `properties.name` → `id`. Find the zone polygon that contains the summit; use its numeric `id` as `nwacZoneId` and a kebab label as `nwacZone`.
- **Cross-check:** the NWAC zone map at `nwac.us/avalanche-forecast/#/all` (visually confirm the peak falls in that zone).
- Valid NWAC zones (contract §5.2): Olympics `1645`, West Slopes North `1646`, West Slopes Central `1647`, West Slopes South `1648`, Stevens Pass `1649`, Snoqualmie Pass `1653`, East Slopes North `1654`, East Slopes Central `1655`, East Slopes South `1656`, Mt Hood `1657`.

### `snotelStationId` + `snotelStationTriplet` + `snotelStationName`
- **Primary (authoritative):** NRCS AWDB stations API — list active SNOTEL stations and pick the nearest representative one:
  `GET https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations?stationTriplets=*:WA:SNTL&activeOnly=true` (swap `OR` for Oregon). Use the returned `stationId`, build the triplet `{id}:{ST}:SNTL`, and copy the official `name`.
- **Cross-check:** the NRCS interactive SNOTEL map / report generator (`nwcc.sc.egov.usda.gov/nwcc/` → "Interactive Map") to eyeball which station is nearest and on the right side of the divide.
- **Pick the most representative station, and document any compromise** (see the ⚠️ proxies in §3). Confirm the triplet actually returns data before relying on it (`.../data?stationTriplets=<triplet>&elements=WTEQ,SNWD&duration=DAILY&...`).

### `region`, `timezone`, `description`
- `region`: pick the matching enum from the contract by geography.
- `timezone`: WA + OR Cascades/Olympics are all `America/Los_Angeles`.
- `description`: one sentence — character + standard route. No sourcing rigor needed.

---

## 3. Provenance of the existing seed mountains

The set is now **11** (the original 10 WA/OR peaks below plus Mount Whitney, the first out-of-NWAC-region peak — see §1) and is extensible, including out-of-region peaks. The 10 below were **live-verified on 2026-06-14** against the NWAC and SNOTEL APIs (contract §10: *"Verified 2026-06-14. ⚠️ = flagged proxy"*). That verification confirmed each `nwacZoneId` and `snotelStationTriplet` actually returns data — but the repo does **not** cite the original source for coordinates/elevations of the seven non-proxy peaks. When extending the set, fill that gap by recording your two sources in the PR/commit message (see §6).

The 10 mountains and their **documented compromises** (carry this same discipline forward — flag proxies inline with a `// ⚠️` comment in `mountains-data.ts`):

| Slug | Name | NWAC zone (id) | SNOTEL | Flag |
|---|---|---|---|---|
| `mt-rainier` | Mount Rainier | west-slopes-south (1648) | 679 Paradise | — |
| `mt-baker` | Mount Baker | west-slopes-north (1646) | 909 Wells Creek | — |
| `mt-shuksan` | Mount Shuksan | west-slopes-north (1646) | 909 Wells Creek | ⚠️ shares Baker's SNOTEL station (no dedicated one) |
| `glacier-peak` | Glacier Peak | west-slopes-central (1647) | 606 Lyman Lake | — |
| `mt-adams` | Mount Adams | east-slopes-south (1656) | 702 Potato Hill | ⚠️ Adams has a separate special NWAC forecast — zone is a geographic best-fit; SNOTEL is an NW-flank proxy |
| `mt-st-helens` | Mount St. Helens | west-slopes-south (1648) | 553 June Lake | — |
| `mt-hood` | Mount Hood | mt-hood (1657) | 651 Mt Hood Test Site (OR) | — |
| `colchuck-peak` | Colchuck Peak | east-slopes-central (1655) | 478 Fish Lake | — |
| `liberty-bell` | Liberty Bell | east-slopes-north (1654) | 711 Rainy Pass | — |
| `mt-olympus` | Mount Olympus | olympics (1645) | 1107 Buckinghorse | ⚠️⚠️ remote — all Olympic SNOTEL sit on the drier NE side, none near the windward summit |

Sample record (verbatim, `mt-rainier`):

```ts
{ name:"Mount Rainier", slug:"mt-rainier", lat:46.8517, lng:-121.7603,
  elevations:{base:5420,mid:10188,summit:14410}, nwacZone:"west-slopes-south",
  nwacZoneId:"1648", snotelStationId:"679", snotelStationTriplet:"679:WA:SNTL",
  snotelStationName:"Paradise", region:"cascades-south", timezone:"America/Los_Angeles",
  description:"The Cascades' highest, most glaciated volcano, climbed via Camp Muir and the Disappointment Cleaver from Paradise." }
```

---

## 4. Most critical — what actually breaks things

Ordered by blast radius.

### 4.1 Pressure level vs. elevation (the band selection — read this)
This is the subtle one that caused real bugs. The weather worker reports a temperature for each band (base/mid/summit) by choosing, **per band, the pressure level whose geopotential height is nearest that band's elevation** — it does **not** use fixed levels.

- Candidate levels (`open_meteo_client.py`): `925, 850, 700, 600, 500, 400 hPa`.
- For each level the worker computes a representative height (mean of non-null geopotential values) and picks, per band, the level minimizing `|levelHeightFt − elevations[band]|`. A level whose geopotential series is entirely null for a model is excluded.

**Why it matters:** a fixed `700 hPa` (~10,000 ft) read a 14,410-ft summit as if it were mid-mountain, so "summit temp" came out physically inconsistent with the freezing level (Rainier read ~44.9 °F when the summit was near freezing). Selecting by nearest geopotential height fixed it (P8 "C1").

**The gotcha that bit us — units:** Open-Meteo returns `geopotential_height_*hPa` (and `freezing_level_height`, `visibility`) in **FEET under imperial params**, but the worker also handles the **meters** case and converts `m → ft` (`× 3.28084`). The unit is reported in `hourly_units`, **suffixed per model** in multi-model responses. Two ways this has gone wrong:
- **Double-converting** a value already in feet → absurd heights.
- Reading the **wrong model's** unit suffix → converting when you shouldn't (or vice-versa).

**Consequences for adding a mountain:** your `elevations.base/mid/summit` directly choose which pressure level each band reads. If `mid`/`summit` are set unrealistically (e.g. base far below the actual route start), the nearest-level match shifts and the band temps become misleading. Set the three elevations to genuinely represent the route, and after seeding sanity-check that summit temp is consistent with the freezing level (the Confidence strip + Model Lab surface model disagreement by design — see CLAUDE.md "P5 awareness"). **Do not** clamp or "fix" the stored freezing level; it is kept model-faithful on purpose.

### 4.2 `nwacZoneId` / `snotelStationTriplet` correctness — and the empty-fetch-key hazard
These are fetch keys. A plausible-but-wrong id returns a *real* forecast for the *wrong* place with no error. Always confirm the id against the authoritative API **and** confirm it returns data (§2). Network must be `:SNTL`; state `:WA`/`:OR`.

**`Firestore.doc("")` throws.** When a fetch key is intentionally empty (an out-of-region peak), any route or worker that builds a doc ref from it (`nwacForecasts/<nwacZoneId>`, `snotelData/<snotelStationId>`) must **guard the empty case BEFORE constructing the ref** — an empty doc id raises. The nwac route/worker and the snotel worker now short-circuit on empty (the nwac route returns `{season:"summer"}`, the workers early-return "skip"). Keep this guard if you add another consumer of these fields.

### 4.3 `slug` immutability
The slug is the doc ID, the URL (`/mountains/[slug]`), and the key for accumulated snapshots/history (35-day TTL). Changing it orphans data. Choose it once, correctly.

### 4.4 `lat`/`lng` must be the summit
The coordinate is the weather query point. A trailhead coordinate produces valley weather. Use the summit.

### 4.5 Proxy honesty
If a SNOTEL station or NWAC zone is a compromise, flag it inline with `// ⚠️` (as the seed set does) so the imperfection is visible rather than silently trusted.

---

## 5. Setting base/mid/summit well

- `summit` = true surveyed summit elevation (USGS).
- `base` = where the standard route **starts** (trailhead/lodge/base camp), read off CalTopo/Gaia and confirmed against a route description.
- `mid` = a meaningful mid-route elevation (high camp or the midpoint of the climb).
- Keep `base < mid < summit`. These three feet values are what the band selector maps onto pressure levels (§4.1), so they should reflect *where climbers actually are*, not arbitrary thirds.

---

## 6. Validation checklist (run before seeding)

- [ ] `slug` unique, kebab-case, and final (won't change).
- [ ] `lat`/`lng` are the **summit**, agree across 2 sources within ~0.001°.
- [ ] `summit` elevation agrees across 2 sources within ±20 ft.
- [ ] `base`/`mid`/`summit` strictly increasing and reflect the real route (CalTopo + route description).
- [ ] `nwacZoneId` from the avalanche.org map-layer API, summit verified inside that zone on the NWAC map; id is in the §2 valid list — **OR** intentionally `""` for an out-of-NWAC-region peak (see §1).
- [ ] `snotelStationTriplet` from the NRCS stations API, `{id}:{WA|OR}:SNTL`, cross-checked on the NRCS map, and **confirmed to return data** — **OR** intentionally `""` for a peak with no nearby SNOTEL.
- [ ] If any fetch-key field is `""`, confirmed the consuming worker/route guards the empty case before building a Firestore doc ref (§4.2).
- [ ] `src/lib/__tests__/mountains-data.test.ts` updated if the peak is out of the existing WA/OR assumptions — widen the coordinate bounds, and make the `:(WA|OR):SNTL` triplet regex + `NWAC_ZONE_IDS` membership checks conditional (`if (m.nwacZoneId) ...`) so empty fields are allowed.
- [ ] Any compromise flagged inline with `// ⚠️`.
- [ ] `region` enum valid (`cascades-*` | `olympics` | `oregon` | `sierra-nevada`); `timezone` correct.
- [ ] `mapBbox` set (minimum: `{west:lng−0.08,south:lat−0.08,east:lng+0.08,north:lat+0.08}`); verify `west<east` and `south<north`.
- [ ] `webcams` populated if live feeds are known; otherwise omit (UI hides the panel gracefully).
- [ ] `permits` populated if access permits/passes are required; otherwise omit.
- [ ] **Record your two sources per sourced field in the commit message** (fills the provenance gap noted in §3).
- [ ] After seeding + trigger-refresh: `mountains/<slug>` exists, `/api/mountains` lists it, snapshots accumulate, NWAC/SNOTEL docs populate (NWAC empty in summer is expected), and summit temp is consistent with the freezing level.
