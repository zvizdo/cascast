# Mountain Weather POC — Shared Interface Contract

> **Single source of truth** for file paths, resource names, env vars, external-API contracts,
> Firestore/Storage schemas, and the canonical Pydantic + TypeScript types. **Every phase plan
> references this doc by section.** If a phase plan needs a type/endpoint/path, it cites the
> section here rather than redefining it. Verified against live APIs on 2026-06-14.

---

## 0. Visual design source — the **Cirque** prototype (binding for P4–P6)

The frontend phases recreate the user-approved **Cirque** prototype, bundled at
`prototype-ui/prototype-design-review/`. **It is the binding visual spec** — read these before
any UI work:
- `prototype-ui/prototype-design-review/project/DESIGN.md` — full design system (principles,
  tokens, themes, typography, components, IA, signature views). **Read top to bottom.**
- `prototype-ui/prototype-design-review/chats/chat1.md` — the design intent + where the user landed.
- `prototype-ui/prototype-design-review/project/app/*.jsx` + `styles.css` — the reference
  implementation to recreate **pixel-perfect** in Next.js 16 / React 19 / TS / Tailwind.
  Recreate the visual output; do not copy the prototype's `window`-globals structure.

**Where Cirque overrides the seed plan / earlier spec (settled):**
- **Charts:** hand-built SVG (port `app/charts.jsx`: `AreaSpark`, `LineChart`, `BarChart`).
  **No Recharts.** Theme-aware via CSS variables; may use `d3` scales/path helpers.
- **Freezing-level hero:** **static** cross-section — range band + `DayStrip` + labeled band
  cards. **No time scrubber** (deliberate user choice).
- **Detail-page IA (calm layer), in order:** ① Verdict ("The call for {day}" + condition tone +
  3 stats) → ② **Daily Outlook** (progressive: Daily → AM·Mid·PM → Hourly-48h) → ③ Freezing
  Level cross-section → ④ Confidence strip → ⑤ Avalanche → ⑥ Snowpack → ⑦ Satellite + Notes.
- **Model Lab** (`/projects/[id]/models`) is the monospace drill-down: multi-model charts,
  forecast-evolution chart, MOS-style hourly grid.
- **Browse** (`/mountains/[slug]`) reuses the calm-layer panels **minus** the Confidence strip,
  Forecast Evolution, and Model Lab (browse = current only; see spec §1).
- **Typography:** Newsreader (serif), Hanken Grotesk (sans), IBM Plex Mono (mono) via
  `next/font/google`. **Themes:** Glacier (light, default) + Slate (dark) via `[data-theme]` on
  `<html>` + a simple toggle. **No Tweaks panel** (design-review tool, out of POC scope).
- **Condition tone + verdict** are computed **server-side** in the weather worker (see §6) and
  stored on `currentSummary` (§3, §8, §9).

Design tokens also exist as a project `design-tokens` skill; **if it conflicts with Cirque,
Cirque wins** (it is what the user designed and approved). Port the exact token values from
`prototype-ui/.../app/styles.css`.

---

## 1. Repository structure (canonical paths)

```
mountain-weatherman-app/
├── app/                                # Next.js App Router pages
│   ├── layout.tsx
│   ├── page.tsx                        # Dashboard "/"
│   ├── projects/new/page.tsx
│   ├── projects/[id]/page.tsx
│   ├── projects/[id]/models/page.tsx
│   ├── mountains/page.tsx
│   └── mountains/[slug]/page.tsx
├── app/api/                            # Route Handlers (Next.js App Router /api/*)
│   ├── projects/route.ts               # GET list, POST create
│   ├── projects/[id]/route.ts          # GET, PATCH, DELETE
│   ├── projects/[id]/weather/route.ts
│   ├── projects/[id]/snapshots/route.ts
│   ├── projects/[id]/nwac/route.ts
│   ├── projects/[id]/snotel/route.ts
│   ├── mountains/route.ts
│   ├── mountains/[slug]/route.ts       # GET mountain + mountainConditions (get-or-refresh)
│   └── admin/trigger-refresh/route.ts
├── components/                         # see §11 for the full list
│   ├── layout/  dashboard/  project/  mountains/  shared/
├── lib/
│   ├── firebase-admin.ts               # Admin SDK singleton (server only)
│   ├── pubsub.ts                       # PublisherClient helper (server only)
│   ├── storage.ts                      # GCS read helper (server only)
│   ├── types.ts                        # shared TS interfaces (§9)
│   ├── format.ts                       # tz-aware date/number formatting
│   └── env.ts                          # typed env access
├── functions/                          # Python Cloud Functions
│   ├── shared/
│   │   ├── __init__.py
│   │   ├── models.py                   # Pydantic models (§8)
│   │   ├── config.py                   # env + GCP resource names
│   │   ├── firestore_client.py
│   │   ├── storage_client.py
│   │   └── pubsub_client.py
│   ├── orchestrator/{__init__.py,main.py,requirements.txt,tests/}
│   ├── weather_worker/{__init__.py,main.py,open_meteo_client.py,requirements.txt,tests/}
│   ├── backfill_worker/{__init__.py,main.py,requirements.txt,tests/}
│   ├── nwac_worker/{__init__.py,main.py,nwac_client.py,requirements.txt,tests/}
│   ├── snotel_worker/{__init__.py,main.py,snotel_client.py,requirements.txt,tests/}
│   ├── satellite_worker/{__init__.py,main.py,copernicus_client.py,requirements.txt,tests/}
│   ├── conftest.py                     # shared pytest fixtures (§12)
│   ├── pyproject.toml                  # pytest + coverage config
│   ├── requirements.txt                # shared runtime deps
│   └── requirements-dev.txt            # test deps
├── terraform/                          # see seed plan §13 for module layout
│   ├── backend.tf  main.tf  variables.tf  outputs.tf
│   ├── modules/{iam,storage,pubsub,functions,scheduler,firestore,monitoring}/
│   └── environments/{dev.tfvars,prod.tfvars}
├── scripts/seed-mountains.ts
├── tests/                              # Playwright specs (e2e)
│   └── e2e/*.spec.ts
├── fixtures/                           # saved real API responses for contract tests
│   ├── open_meteo_*.json  nwac_*.json  snotel_*.json  copernicus_*.json
├── .github/workflows/{test.yml,deploy.yml}
├── firebase.json  apphosting.yaml  next.config.ts  tailwind.config.ts
├── vitest.config.ts  playwright.config.ts  package.json  tsconfig.json
├── .env.local.example  .firebaserc  firestore.rules  firestore.indexes.json
└── README.md
```

**Note:** Route Handlers live under `app/api/**` (App Router convention), not a top-level
`api/` dir (the seed plan sketch is superseded here).

**Deployment packaging (Cloud Functions Gen2):** each function's source zip is rooted at its own
dir and **cannot reach the sibling `functions/shared/`**. The Terraform `functions` module
(built in P1, extended in P2) vendors `functions/shared/` (and any cross-worker helper a function
imports) **into each function dir at build time** (rsync into a gitignored `_vendor/` or copy
before `archive_file`). Tests still import `shared` from the repo root; only the deployed
artifact vendors it. P1 owns this mechanism; P2 reuses it.

**Environments:** there is **one** GCP project (`mountain-weatherman-app`). Pub/Sub, functions,
and scheduler are `${env}`-prefixed so `dev` and `prod` coexist; **buckets and the `(default)`
Firestore DB are shared** across envs (GCP allows one default DB per project). Practically:
**local dev uses the emulators** (the local-first strategy) and the single real
Firestore/buckets are effectively **prod**. A `dev` terraform apply is for exercising infra, not
for holding a separate data set. True isolation (separate projects or named Firestore DBs) is
deferred post-POC. ⚠️ `terraform destroy` on shared buckets affects prod data — guard accordingly.

---

## 2. GCP resource names, env vars, function entry points

**Project:** `mountain-weatherman-app`. **Region:** `us-west1`. Resources are prefixed by
`${env}` (`dev`/`prod`) where they must be unique per env.

### Pub/Sub topics
| Topic (logical) | Terraform name | Publisher | Subscriber |
|---|---|---|---|
| orchestrate | `${env}-orchestrate` | Cloud Scheduler | Orchestrator |
| weather-refresh | `${env}-weather-refresh` | Orchestrator / API | weather_worker |
| backfill-refresh | `${env}-backfill-refresh` | API (on project create) | backfill_worker |
| nwac-refresh | `${env}-nwac-refresh` | Orchestrator | nwac_worker |
| snotel-refresh | `${env}-snotel-refresh` | Orchestrator | snotel_worker |
| satellite-refresh | `${env}-satellite-refresh` | Orchestrator | satellite_worker |
| dead-letter | `${env}-refresh-dlq` | Pub/Sub (auto) | monitoring alert |

### Cloud Scheduler jobs (4) — all `time_zone = America/Los_Angeles`
| Job | Cron | Payload to `orchestrate` |
|---|---|---|
| `${env}-weather-orchestrate` | `0 * * * *` (hourly) | `{"type":"weather"}` |
| `${env}-nwac-orchestrate` | `30,45 7 * * *` **+** `*/15 8-11 * * *` (07:30–11:45 PT) | `{"type":"nwac"}` |
| `${env}-snotel-orchestrate` | `0 7 * * *` | `{"type":"snotel"}` |
| `${env}-satellite-orchestrate` | `0 8 * * 0` (Sun) | `{"type":"satellite"}` |

> The NWAC every-15-min morning window is two scheduler jobs OR one job with a `*/15 7-11`
> cron starting 07:00; we use `*/15 7-11 * * *` for simplicity (first useful tick ~07:30 once
> NWAC publishes). Idempotent skip makes early ticks cheap no-ops. **Decision: one job,
> `*/15 7-11 * * *`.**

### Cloud Functions (Gen2, python312) — name → entry point
| Function | Terraform name | Entry point (`main.py`) | Trigger topic | Mem | Timeout | Max inst |
|---|---|---|---|---|---|---|
| Orchestrator | `${env}-orchestrator` | `orchestrate` | `orchestrate` | 256Mi | 60s | 3 |
| Weather | `${env}-weather-worker` | `handle_message` | `weather-refresh` | 512Mi | 120s | 100 |
| Backfill | `${env}-backfill-worker` | `handle_message` | `backfill-refresh` | 512Mi | 300s | 10 |
| NWAC | `${env}-nwac-worker` | `handle_message` | `nwac-refresh` | 256Mi | 60s | 5 |
| SNOTEL | `${env}-snotel-worker` | `handle_message` | `snotel-refresh` | 256Mi | 60s | 10 |
| Satellite | `${env}-satellite-worker` | `handle_message` | `satellite-refresh` | 512Mi | 300s | 5 |

All Pub/Sub-triggered functions use `@functions_framework.cloud_event`. Entry point for the
orchestrator is `orchestrate`; for all workers it is `handle_message`.

### Cloud Storage buckets
| Logical | Name | Lifecycle |
|---|---|---|
| Weather data | `${project}-weather-data` (or `${env}-…` in dev) | delete `forecasts/**` after 35 days |
| Satellite tiles | `${project}-satellite-tiles` | none (small) |
| Function source | `${project}-function-source` | Terraform-managed |
| TF state | `${project}-tfstate` | versioning on |

All buckets **private** (uniform bucket-level access, no public IAM).

### Environment variables
**Python workers** (set via Terraform `environment_variables`):
```
GCP_PROJECT=mountain-weatherman-app
ENV=dev|prod
GCS_BUCKET_WEATHER=<weather-data bucket>
GCS_BUCKET_SATELLITE=<satellite-tiles bucket>
TOPIC_WEATHER_REFRESH / TOPIC_BACKFILL_REFRESH / TOPIC_NWAC_REFRESH /
TOPIC_SNOTEL_REFRESH / TOPIC_SATELLITE_REFRESH   # full topic paths
CDSE_CLIENT_ID / CDSE_CLIENT_SECRET              # satellite_worker only (Secret Manager)
```
**Next.js** (`.env.local`, App Hosting secrets):
```
GCP_PROJECT=mountain-weatherman-app
GCS_BUCKET_WEATHER=<weather-data bucket>
GOOGLE_APPLICATION_CREDENTIALS / FIREBASE_SERVICE_ACCOUNT  # Admin SDK creds
TOPIC_WEATHER_REFRESH / TOPIC_BACKFILL_REFRESH / TOPIC_NWAC_REFRESH / TOPIC_SNOTEL_REFRESH
NEXT_PUBLIC_MAPBOX_TOKEN=<mapbox token>
NEXT_PUBLIC_EOX_ATTRIBUTION="Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data)"
BROWSE_REFRESH_MODE=scheduled|lazy        # POC=scheduled
FIRESTORE_EMULATOR_HOST / PUBSUB_EMULATOR_HOST   # local dev only
```

### Pub/Sub message schemas (JSON, base64 in CloudEvent `.data.message.data`)
```
orchestrate:        {"type": "weather"|"nwac"|"snotel"|"satellite"}
weather-refresh:    {"mountainId": "mt-rainier", "reason": "scheduled"|"on_create"|"manual"}
backfill-refresh:   {"projectId": "<id>", "mountainId": "mt-rainier", "targetDate": "2026-08-02"}
nwac-refresh:       {"zoneId": "1648"}        # numeric avalanche.org zone id as string
snotel-refresh:     {"stationId": "679"}
satellite-refresh:  {"mountainId": "mt-rainier"}
```

---

## 3. Firestore data model (exact field names)

Field names are **camelCase** in Firestore and TS; Python models map snake_case ↔ camelCase
via Pydantic aliases (§8). Collections:

### `mountains/{mountainId}` (seed data; `mountainId` == `slug`)
```
name str | slug str | lat number | lng number
elevations: { base number, mid number, summit number }   # FEET
nwacZone str            # avalanche.org zone slug label (see §5 zone table) for display
nwacZoneId str          # numeric avalanche.org zone id, e.g. "1648"
snotelStationId str     # NRCS id, e.g. "679"
snotelStationTriplet str# e.g. "679:WA:SNTL"
snotelStationName str
region str              # cascades-south|cascades-central|cascades-north|olympics|oregon
timezone str            # IANA, e.g. "America/Los_Angeles"
description str
createdAt timestamp
```

### `mountainConditions/{mountainId}` (browse, current-only; written every weather fetch)
```
mountainId str
forecastBlobPath str          # GCS path to latest combined.json (§4)
currentSummary: CurrentSummary  # SAME shape as projects.currentSummary below
updatedAt timestamp
```

### `projects/{projectId}`
```
name str | mountainId str | mountainName str | mountainSlug str
targetDateStart str (ISO date) | targetDateEnd str (ISO date)
status "active"|"archived" | notes str
createdAt timestamp | lastRefreshedAt timestamp
lastRefreshStatus "ok"|"error"|"partial"|"pending"
currentSummary: {            # written by weather_worker
  targetDateHigh number | targetDateLow number | targetDateWind number
  targetDatePrecip number | freezingLevelFt number
  precipType "snow"|"rain"|"mixed"|"none" | summaryModel "hrrr"|"gfs"|"ecmwf"
  tone "good"|"caution"|"alert"          # Cirque condition tone (Favorable/Marginal/Hazardous)
  verdict str                            # editorial sentence, e.g. "Cold window holds before a front"
  updatedAt timestamp
}
currentAvalancheSummary: {   # written by nwac_worker
  dangerUpper number | dangerMiddle number | dangerLower number   # 1-5, -1=no rating
  bottomLine str | forecastDate str | season "winter"|"summer" | updatedAt timestamp
}
currentSnowpackSummary: {    # written by snotel_worker
  snowDepthIn number | sweIn number | percentOfMedian number
  stationName str | updatedAt timestamp
}
```

### `projects/{projectId}/weatherSnapshots/{snapshotId}`
```
fetchedAt timestamp | targetDate str | forecastBlobPath str
source "live"|"backfill"
expireAt timestamp           # TTL field → Firestore TTL policy deletes after 30 days
models: {                    # per-model summary for the target date
  hrrr|gfs|ecmwf: {
    available bool | summitHighF number | summitLowF number
    summitMaxWindMph number (gust) | summitMaxSustainedWindMph number | summitPrecipIn number
    freezingLevelFtNoon number | snowfallIn number
  }
}
```

### `nwacForecasts/{zoneId}` (zoneId = numeric avalanche.org id as string, e.g. "1648")
```
zoneId str | zoneName str | productId number
season "winter"|"summer" | productType str        # "forecast"|"summary"
publishedTime timestamp | expiresTime timestamp
forecastDate str (ISO date, Pacific)
danger: { current: {upper,middle,lower}, tomorrow: {upper,middle,lower} }  # ints 1-5/-1
problems: [ { problemId number, name str, likelihood str, sizeMin str, sizeMax str,
              aspects: { upper:{N..NW bool}, middle:{...}, lower:{...} }, description str } ]
bottomLine str | hazardDiscussion str | weatherDiscussion str   # sanitized HTML→text
fetchedAt timestamp
```

### `snotelData/{stationId}`
```
stationId str | stationTriplet str | stationName str | elevationFt number
lat number | lng number
current: { date str, snowDepthIn number, sweIn number, sweMedianIn number,
           percentOfMedian number, tempMaxF number, tempMinF number, precipAccumIn number }
trend: [ { date str, snowDepthIn number, sweIn number } ]   # 30-day, oldest→newest
fetchedAt timestamp
```

### `satelliteCache/{mountainId}`
```
mountainId str | latestImageDate str? | cloudCoverPercent number? | sceneId str?  # scene badge nullable when CDSE fails/empty
tileUrlTemplate str        # EOX XYZ template (z/y/x) OR SH WMTS template
tileSource "eox-s2cloudless"|"sentinel-hub-wmts" | attribution str
boundingBox: { north number, south number, east number, west number }
updatedAt timestamp
```

### `firestore.indexes.json` (composite indexes required)
- `projects`: `status ASC, targetDateEnd ASC` (orchestrator query).
- `weatherSnapshots` (collection group or per-project): `fetchedAt DESC`.

### `firestore.rules` (POC: public read; writes server-only via Admin SDK which bypasses rules)
Public `read` on all collections; `write: if false` (Admin SDK ignores rules). Tighten when
auth is added.

---

## 4. Cloud Storage layout

```
${weather-data}/forecasts/{mountainId}/{YYYY-MM-DD}/{HHmm}-combined.json
${satellite-tiles}/{mountainId}/metadata.json        # mirror of satelliteCache
```
`combined.json` is the normalized multi-model blob the API serves; shape = the
`CombinedForecastBlob` Pydantic model (§8) serialized to JSON. Raw per-model responses are NOT
persisted separately in the POC (the combined blob is sufficient; saves storage).

---

## 5. External API contracts (verified live 2026-06-14)

### 5.1 Open-Meteo
- **Forecast:** `GET https://api.open-meteo.com/v1/forecast`
- **Previous Runs:** `GET https://previous-runs-api.open-meteo.com/v1/forecast`
- **Model IDs:** HRRR=`gfs_hrrr`, GFS=`gfs_seamless`, ECMWF=`ecmwf_ifs025`. *(These supersede
  the seed plan's `hrrr`/`gfs`/`ecmwf_ifs`.)*
- **Multi-model keying:** with ≥2 models every hourly key is suffixed `_{model}`, e.g.
  `temperature_2m_gfs_hrrr`. With one model, **no suffix**. Always request ≥2 models so keys
  are consistently suffixed. `hourly.time` is a single shared array.
- **Hourly vars (exact snake_case):** `temperature_2m, apparent_temperature, wind_speed_10m,
  wind_gusts_10m, wind_direction_10m, precipitation, precipitation_probability, snowfall,
  freezing_level_height, cloud_cover, visibility, weather_code`.
- **Units gotcha (verified live):** when imperial params are requested
  (`temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch`), Open-Meteo
  returns **`freezing_level_height` AND `visibility` in feet** (`hourly_units` reports `"ft"`),
  NOT meters. Canonical storage is imperial (feet), so the worker stores these as-is and converts
  m→ft ONLY when `hourly_units` reports meters (handles plain/non-imperial responses). Do not
  blindly multiply by 3.28084. **Multi-model gotcha:** in multi-model responses the `hourly_units`
  keys are ALSO model-suffixed (`freezing_level_height_gfs_seamless: "ft"`), so detect the unit
  via the suffixed key per model (fall back to unsuffixed). **ECMWF (`ecmwf_ifs025`) does NOT
  provide `freezing_level_height`** (all null, unit `"undefined"`) — use HRRR/GFS for freezing level.
- **Pressure-level vars:** `{var}_{level}hPa`, e.g. `temperature_925hPa`, `wind_speed_700hPa`,
  `geopotential_height_700hPa`. **Bands are resolved PER-MOUNTAIN by nearest geopotential
  height — NOT fixed 925/850/700 hPa** (P8 C1 fix). The worker requests `temperature_{lvl}hPa`
  AND `geopotential_height_{lvl}hPa` for candidate levels `925/850/700/600/500/400 hPa`, computes
  a representative height per level (mean of non-null values, ft), and for each band
  (base/mid/summit) picks the level minimizing `|levelHeightFt − elevations[band]|`; that level's
  temperature series becomes `temp_{band}_f`. A level whose geopotential series is entirely null
  for a model is excluded. Rationale: a fixed 700 hPa (~10,000 ft) read the MID altitude as the
  "summit" for high peaks (e.g. Rainier summit 14,410 ft), making summit temp physically
  inconsistent with the freezing level. **Geopotential height obeys the same units gotcha as
  freezing level** — feet under imperial params (`hourly_units` reports `"ft"`, suffixed per model
  in multi-model responses); the worker converts m→ft only when the reported unit is meters.
- **Units/params:** `temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&
  timezone={mountain.timezone}&forecast_days=7`.
- **Previous Runs:** suffix `_previous_dayN` (N=0..7); combined form
  `{var}_previous_day{N}_{model}`. Value at target timestamp in `_previous_dayN` = what the
  model predicted N×24h earlier. Sweep N=0..7 to build the evolution curve.
  - **Day-0 key (discovered during P1 implementation):** the API returns day-0 (the current
    run) under the **bare** key `{var}_{model}` (no `_previous_day0` infix); only N≥1 carry
    `_previous_dayN_{model}`. The backfill worker already handles both forms (falls back to the
    bare key when `_previous_day0` is absent).
  - **No pressure-level vars (discovered live in P7):** the Previous Runs API **rejects**
    pressure-level vars in `_previous_dayN` form (e.g. `temperature_700hPa_previous_day0` →
    HTTP 400 "invalid String value"). Request **surface vars only**; derive summit-day high from
    `temperature_2m`. Freezing level comes back in **feet** under imperial params (like the
    forecast API) — convert m→ft only when `hourly_units` reports meters.
- **CRITICAL gotchas:**
  - HRRR outside CONUS = top-level HTTP error (not nulls). All 10 POC peaks are CONUS, so a
    combined `gfs_hrrr,gfs_seamless,ecmwf_ifs025` call works — but **fetch HRRR in a separate
    request** anyway so a future non-CONUS mountain or an HRRR outage doesn't fail the whole
    fetch. POC client: one call for `gfs_seamless,ecmwf_ifs025`, one for `gfs_hrrr`; merge.
  - HRRR horizon ~18h (48h on synoptic runs) → series short/null beyond; UI shows "not
    available". Expected.
  - Error shape: HTTP 400 `{"error":true,"reason":"..."}`. Check status AND body.
  - Missing values inside a valid model = `null` aligned to `time`. `list[float | None]`.
  - **Rate limits (free):** 600/min, 5k/hr, 10k/day, 300k/mo. Backfill sweeps are the risk —
    throttle and batch. **Attribution required (CC BY 4.0): "Weather data by Open-Meteo.com".**

### 5.2 NWAC (avalanche.org NAC API) — no auth
- **Forecast (full):** `GET https://api.avalanche.org/v2/public/product?type=forecast&center_id=NWAC&zone_id={numericId}`
- **Zones (startup map):** `GET https://api.avalanche.org/v2/public/products/map-layer/NWAC`
  → build `{feature.properties.name: feature.id}`.
- **Zone ID table (verified):**

  | Zone | id | Zone | id |
  |---|---|---|---|
  | Olympics | 1645 | Stevens Pass | 1649 |
  | West Slopes North | 1646 | Snoqualmie Pass | 1653 |
  | West Slopes Central | 1647 | East Slopes North | 1654 |
  | West Slopes South | 1648 | East Slopes Central | 1655 |
  | Mt Hood | 1657 | East Slopes South | 1656 |

- **Response shape:** `danger[]` entries have `valid_day ∈ {"current","tomorrow"}` and int
  `lower/middle/upper` (1–5; -1/0 = no rating; lower=below treeline, upper=above treeline).
  `forecast_avalanche_problems[]`: `{avalanche_problem_id, name, likelihood, size:[min,max],
  location:["{aspect} {elevation}", ...], discussion, problem_description}`. Narrative fields
  (`bottom_line`, `hazard_discussion`, `weather_discussion`) are **HTML** → sanitize to text.
  Timestamps ISO-8601 UTC.
- **Aspect rose:** `location` = flat array of `"{aspect} {elevation}"` (lowercase). Aspects:
  north, northeast, east, southeast, south, southwest, west, northwest. Elevations: lower,
  middle, upper. Use `rpartition(" ")` to split. Up to 24 cells.
- **Summer (verified today):** HTTP 200 but `product_type:"summary"`, `danger:[]`,
  `forecast_avalanche_problems:[]`, `bottom_line:null`. Detect via `product_type != "forecast"`
  OR empty `danger`. Map-layer features carry `off_season:true`, `danger_level:-1`.
  **The summer summary's `forecast_zone[]` lists ALL zones** (one shared product), so the worker
  must store the **requested** zone's identity — `next(z for z in forecast_zone if str(z.id) ==
  requested_zone_id)`, not `forecast_zone[0]` — so stored `zoneId`/`zoneName` match the doc id.
- **`forecastDate`:** the Pacific (America/Los_Angeles) date of `published_time`, not the raw UTC
  date prefix.
- **Capture pattern:** see spec §3 — fetch only zones not yet captured today; honor
  `expires_time`. Add descriptive `User-Agent` + `Accept: application/json`.

### 5.3 SNOTEL (NRCS AWDB REST API) — no auth
- **Data:** `GET https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets={id}:WA:SNTL&elements=WTEQ,SNWD,TMAX,TMIN,PREC&duration=DAILY&beginDate={YYYY-MM-DD}&endDate={YYYY-MM-DD}&centralTendencyType=MEDIAN&returnFlags=false`
- **Stations meta:** `GET .../services/v1/stations?stationTriplets=*:WA:SNTL&activeOnly=true`
  → resolve name → triplet, elevation (ft), lat/lng.
- **Triplet format:** `{id}:{state}:SNTL` — network is **`SNTL`**, not `SNOTEL`.
- **Response:** array → `[0].data[]` each `{stationElement:{elementCode,storedUnitCode,
  dataPrecision}, values:[{date,value,median?}]}`. `median` present only for WTEQ/PREC with
  `centralTendencyType=MEDIAN`. **Compute** `percentOfMedian = swe / sweMedian * 100` (guard
  median 0/None). Align series **by `date`**, not positional zip.
- **Gotchas:** PREC is cumulative (diff for daily); units inches / °F; dates are station-local
  calendar dates (don't convert to UTC); missing day = absent/null. CSV fallback exists
  (`reportGenerator/view_csv/...`) but REST JSON is primary. Modest concurrency + tenacity
  retry (gov servers can be slow).

### 5.4 Copernicus / Sentinel-2
- **Map layer (no auth):** EOX s2cloudless XYZ —
  `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg`
  **Note `{z}/{y}/{x}` (TMS order).** Annual cloud-free mosaic. Attribution required (see env).
- **Scene metadata (badge), auth:** CDSE Sentinel Hub Catalog API (0 processing units).
  - Token: `POST https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token`
    body `grant_type=client_credentials&client_id=$CDSE_CLIENT_ID&client_secret=$CDSE_CLIENT_SECRET`
    → JWT `access_token`; **cache until `exp`** (re-requesting per call → 429).
  - Search: `POST https://sh.dataspace.copernicus.eu/catalog/v1/search` with
    `{bbox, datetime:"<start>/<end>", collections:["sentinel-2-l2a"], limit:1,
    sortby:[{field:"properties.datetime",direction:"desc"}],
    filter:{op:"lt",args:[{property:"eo:cloud_cover"},70]}, "filter-lang":"cql2-json"}`.
  - Read `features[0].properties.datetime` and `features[0].properties["eo:cloud_cover"]`.
- **POC satellite worker:** compute bbox from mountain lat/lng (±~0.08°); get token; catalog
  search for latest <70%-cloud scene; write `satelliteCache/{mountainId}` with the EOX tile
  template (`tileSource:"eox-s2cloudless"`) + the scene date/cloud badge. Secrets server-side
  only.
- **Graceful degradation:** the worker must **ALWAYS** write `satelliteCache/{mountainId}` with
  the no-auth EOX tile template + bbox + attribution. Any CDSE error (outage/401/timeout) OR an
  empty search falls through to writing with a **null** scene badge (`latestImageDate`,
  `cloudCoverPercent`, `sceneId` = null); the badge is only populated when a scene is found. The
  scene-newer skip applies only when a scene is found.
- **GCS mirror:** after the Firestore write, mirror the same record to
  `${satellite-tiles}/{mountainId}/metadata.json` (content-type `application/json`).

---

## 6. Open-Meteo → summary derivation rules

- **Target-date summary** (for `currentSummary` and snapshot `models.*`): from the chosen
  model's hourly arrays, filter to `targetDate` (project's `targetDateStart`); `summitHighF`/
  `summitLowF` = max/min `temperature_2m` (summit band) that day; `summitMaxWindMph` = max
  `wind_gusts_10m`; `summitPrecipIn` = sum `precipitation`; `freezingLevelFtNoon` =
  `freezing_level_height` at 12:00 local (already feet — see §5.1 units gotcha; the worker only
  converts m→ft when `hourly_units` reports meters); `snowfallIn` = sum `snowfall`.
- **`summaryModel` precedence:** HRRR if it has data for the target date (≤48h out), else GFS,
  else ECMWF. `currentSummary` uses this precedence.
- **`precipType`:** "snow" **only when `snowfall`>0** (and freezing level below summit); if
  `precipitation`>0 and freezing level > summit elev → "rain"; mixed if freezing level within
  ±500ft of summit; "none" if no precip and no snowfall. No-snowfall precip is never "snow" —
  it falls back to "rain". (Exact thresholds defined in the weather_worker plan.)
- **Elevation bands:** base/mid/summit temps come from the candidate pressure level
  (`925/850/700/600/500/400 hPa`) whose geopotential height is nearest each band's actual
  elevation, resolved **per-mountain** at parse time (P8 C1 — see §5.1); freezing level is a
  single surface-derived value (not per band).
- **Condition tone (`tone`)** — weighted score over the target window, bucketed to
  `good`/`caution`/`alert` (Cirque "Favorable/Marginal/Hazardous"). Inputs + weights ported
  from the prototype's `data.js` tone scoring (summit max wind, gusts, target-window precip,
  NWAC danger for the band, and cold/wind-chill). The wind-score uses **sustained** wind
  (`summitMaxSustainedWindMph`, from `wind_speed_10m`) and the gust-score uses the **gust**
  (`summitMaxWindMph`, from `wind_gusts_10m`) — these are distinct inputs, not the same value. The weather worker reads the latest
  `currentAvalancheSummary` danger (if present) as one input. Exact thresholds: replicate
  `prototype-ui/.../app/data.js` (search "tone") so the real tone matches the approved look;
  the P1 plan inlines the ported formula + unit tests.
- **Verdict (`verdict`)** — a short editorial sentence templated from tone + the dominant
  driver (e.g. "Cold window holds before a front", "High wind shuts the summit down"). P1 plan
  defines the template table; deterministic, unit-tested.

---

## 7. API response shapes (Next.js Route Handlers)

> **Next.js 16 convention:** dynamic `params` is a `Promise` — handlers do
> `async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) { const { id } = await params; … }`.
> GET handlers are uncached by default; set the `Cache-Control` header explicitly (below).

```
GET  /api/projects                 → Project[] (with currentSummary etc.)
POST /api/projects {name,mountainId,targetDateStart,targetDateEnd,notes?}
                                   → Project ; side effects: publish weather-refresh
                                     {reason:"on_create"} + nwac/snotel refresh + backfill-refresh
GET  /api/projects/[id]            → Project
PATCH/api/projects/[id] {…}        → Project (accepts status:"active"|"archived" to (un)pin)
DELETE /api/projects/[id]          → {ok:true} (hard-deletes doc + weatherSnapshots subcollection)
GET  /api/projects/[id]/weather    → CombinedForecastBlob (from GCS; resolve path via
                                     mountainConditions/{project.mountainId}.forecastBlobPath —
                                     a project's "current weather" IS the mountain's latest
                                     combined blob; per-project history lives in /snapshots)
GET  /api/projects/[id]/snapshots  → WeatherSnapshot[] (last 10, fetchedAt desc)
GET  /api/projects/[id]/nwac       → NwacForecast | {season:"summer", …}
GET  /api/projects/[id]/snotel     → SnotelData
GET  /api/projects/[id]/satellite  → SatelliteCache | null   (reads satelliteCache/{project.mountainId})
GET  /api/mountains                → Mountain[]
GET  /api/mountains/[slug]         → { mountain: Mountain, conditions: MountainConditions|null,
                                       satellite: SatelliteCache|null,
                                       weather: CombinedForecastBlob|null,
                                       nwac: NwacForecast|null, snotel: SnotelData|null,
                                       stale: boolean }
                                     (weather = readCombinedBlob(conditions.forecastBlobPath);
                                      nwac = nwacForecasts/{mountain.nwacZoneId};
                                      snotel = snotelData/{mountain.snotelStationId} — all nullable.
                                      Browse renders the CURRENT calm-layer panels —
                                      Verdict + DailyOutlook + Avalanche + Snowpack + Satellite —
                                      minus Confidence, Forecast Evolution, and Model Lab.
                                      stale = conditions older than ~3h; get-or-refresh: if stale
                                      & BROWSE_REFRESH_MODE=lazy → publish. UI shows "updating…" pill
                                      when stale — see spec §4)
POST /api/admin/trigger-refresh?mountainId=… → {ok:true} (publishes weather-refresh{reason:"manual"})
```
All GET handlers set `Cache-Control: public, max-age=300, stale-while-revalidate=600`.

---

## 8. Canonical Pydantic models (`functions/shared/models.py`)

Pydantic v2. Use `model_config = ConfigDict(populate_by_name=True, extra="allow")` where
dynamic keys appear. camelCase aliases for Firestore writes.

```python
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime, date

# ---- Open-Meteo (dynamic hourly keys) ----
class OMHourly(BaseModel):
    model_config = ConfigDict(extra="allow")   # temperature_2m_<model>, *_previous_dayN_<model>
    time: list[str]

class OMResponse(BaseModel):
    latitude: float; longitude: float; elevation: float
    utc_offset_seconds: int; timezone: str
    hourly_units: dict = {}
    hourly: OMHourly

class OMError(BaseModel):
    error: bool; reason: str

# ---- Normalized per-model series stored in combined.json ----
class ModelSeries(BaseModel):
    available: bool = True
    time: list[str] = []
    temperature_2m: list[float | None] = []
    apparent_temperature: list[float | None] = []
    wind_speed_10m: list[float | None] = []
    wind_gusts_10m: list[float | None] = []
    wind_direction_10m: list[float | None] = []
    precipitation: list[float | None] = []
    precipitation_probability: list[float | None] = []
    snowfall: list[float | None] = []
    freezing_level_height: list[float | None] = []   # feet (converted)
    cloud_cover: list[float | None] = []
    visibility: list[float | None] = []
    weather_code: list[int | None] = []
    # pressure-level band temps (feet-keyed bands resolved by worker)
    temp_base_f: list[float | None] = []
    temp_mid_f: list[float | None] = []
    temp_summit_f: list[float | None] = []

class CombinedForecastBlob(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    mountain_id: str = Field(alias="mountainId")
    timezone: str
    fetched_at: datetime = Field(alias="fetchedAt")
    hrrr: ModelSeries | None = None
    gfs: ModelSeries | None = None
    ecmwf: ModelSeries | None = None

class ModelDaySummary(BaseModel):
    available: bool
    summitHighF: float | None = None
    summitLowF: float | None = None
    summitMaxWindMph: float | None = None             # gust (max wind_gusts_10m)
    summitMaxSustainedWindMph: float | None = None    # max wind_speed_10m
    summitPrecipIn: float | None = None
    freezingLevelFtNoon: float | None = None
    snowfallIn: float | None = None

class CurrentSummary(BaseModel):
    targetDateHigh: float | None; targetDateLow: float | None
    targetDateWind: float | None; targetDatePrecip: float | None
    freezingLevelFt: float | None; precipType: str; summaryModel: str
    tone: str            # "good" | "caution" | "alert"
    verdict: str         # editorial sentence

# ---- NWAC ----
class NwacDanger(BaseModel):
    upper: int | None; middle: int | None; lower: int | None
class NwacProblem(BaseModel):
    problemId: int; name: str; likelihood: str | None = None
    sizeMin: str | None = None; sizeMax: str | None = None
    aspects: dict   # {"upper":{"N":bool,...}, "middle":{...}, "lower":{...}}
    description: str | None = None
class NwacForecast(BaseModel):
    zoneId: str; zoneName: str; productId: int
    season: str; productType: str
    publishedTime: datetime; expiresTime: datetime; forecastDate: str
    danger: dict   # {"current": NwacDanger, "tomorrow": NwacDanger}
    problems: list[NwacProblem] = []
    bottomLine: str | None = None; hazardDiscussion: str | None = None
    weatherDiscussion: str | None = None

# ---- SNOTEL ----
class SnotelReading(BaseModel):
    date: str; snowDepthIn: float | None = None; sweIn: float | None = None
    sweMedianIn: float | None = None; percentOfMedian: float | None = None
    tempMaxF: float | None = None; tempMinF: float | None = None
    precipAccumIn: float | None = None
class SnotelData(BaseModel):
    stationId: str; stationTriplet: str; stationName: str; elevationFt: float
    lat: float; lng: float
    current: SnotelReading; trend: list[SnotelReading]

# ---- Satellite ----
class SatelliteCache(BaseModel):
    mountainId: str; latestImageDate: str | None = None
    cloudCoverPercent: float | None = None; sceneId: str | None = None
    tileUrlTemplate: str; tileSource: str; attribution: str
    boundingBox: dict   # {north,south,east,west}
```

---

## 9. Canonical TypeScript types (`lib/types.ts`)

Mirror the Firestore camelCase shapes (§3). Key interfaces:

```ts
export interface Elevations { base: number; mid: number; summit: number }
export interface Mountain {
  slug: string; name: string; lat: number; lng: number; elevations: Elevations;
  nwacZone: string; nwacZoneId: string; snotelStationId: string;
  snotelStationTriplet: string; snotelStationName: string;
  region: string; timezone: string; description: string;
}
export interface CurrentSummary {
  targetDateHigh: number; targetDateLow: number; targetDateWind: number;
  targetDatePrecip: number; freezingLevelFt: number;
  precipType: 'snow'|'rain'|'mixed'|'none'; summaryModel: 'hrrr'|'gfs'|'ecmwf';
  tone: 'good'|'caution'|'alert'; verdict: string;
  updatedAt: string;
}
export interface AvalancheSummary {
  dangerUpper: number; dangerMiddle: number; dangerLower: number;
  bottomLine: string; forecastDate: string; season: 'winter'|'summer'; updatedAt: string;
}
export interface SnowpackSummary {
  snowDepthIn: number; sweIn: number; percentOfMedian: number;
  stationName: string; updatedAt: string;
}
export interface Project {
  id: string; name: string; mountainId: string; mountainName: string; mountainSlug: string;
  targetDateStart: string; targetDateEnd: string;
  status: 'active'|'archived'; notes: string;
  createdAt: string; lastRefreshedAt: string | null;
  lastRefreshStatus: 'ok'|'error'|'partial'|'pending';
  currentSummary?: CurrentSummary; currentAvalancheSummary?: AvalancheSummary;
  currentSnowpackSummary?: SnowpackSummary;
}
export interface MountainConditions { mountainId: string; forecastBlobPath: string;
  currentSummary: CurrentSummary; updatedAt: string }
export interface ModelSeries { available: boolean; time: string[];
  temperature_2m: (number|null)[]; apparent_temperature: (number|null)[];
  wind_speed_10m: (number|null)[]; wind_gusts_10m: (number|null)[];
  wind_direction_10m: (number|null)[]; precipitation: (number|null)[];
  precipitation_probability: (number|null)[]; snowfall: (number|null)[];
  freezing_level_height: (number|null)[]; cloud_cover: (number|null)[];
  visibility: (number|null)[]; weather_code: (number|null)[];
  temp_base_f:(number|null)[]; temp_mid_f:(number|null)[]; temp_summit_f:(number|null)[] }
export interface CombinedForecastBlob { mountainId: string; timezone: string;
  fetchedAt: string; hrrr: ModelSeries|null; gfs: ModelSeries|null; ecmwf: ModelSeries|null }
export interface WeatherSnapshot { id: string; fetchedAt: string; targetDate: string;
  source: 'live'|'backfill'; models: { hrrr: ModelDaySummary; gfs: ModelDaySummary;
  ecmwf: ModelDaySummary } }
export interface ModelDaySummary { available: boolean; summitHighF: number|null;
  summitLowF: number|null; summitMaxWindMph: number|null;
  summitMaxSustainedWindMph: number|null; summitPrecipIn: number|null;
  freezingLevelFtNoon: number|null; snowfallIn: number|null }
export interface NwacForecast { zoneId: string; zoneName: string; season: 'winter'|'summer';
  forecastDate: string; publishedTime: string; expiresTime: string;
  danger: { current: NwacDanger; tomorrow: NwacDanger }; problems: NwacProblem[];
  bottomLine: string; hazardDiscussion: string; weatherDiscussion: string }
export interface NwacDanger { upper: number; middle: number; lower: number }
export interface NwacProblem { problemId: number; name: string; likelihood: string;
  sizeMin: string; sizeMax: string;
  aspects: Record<'upper'|'middle'|'lower', Record<string, boolean>>; description: string }
export interface SnotelReading { date: string; snowDepthIn: number|null; sweIn: number|null;
  sweMedianIn: number|null; percentOfMedian: number|null; tempMaxF: number|null;
  tempMinF: number|null; precipAccumIn: number|null }
export interface SnotelData { stationId: string; stationTriplet: string; stationName: string;
  elevationFt: number; lat: number; lng: number; current: SnotelReading; trend: SnotelReading[] }
export interface SatelliteCache { mountainId: string; latestImageDate: string|null;
  cloudCoverPercent: number|null; tileUrlTemplate: string;
  tileSource: 'eox-s2cloudless'|'sentinel-hub-wmts'; attribution: string;
  boundingBox: { north: number; south: number; east: number; west: number } }
```

---

## 10. Seed mountains dataset (`scripts/seed-mountains.ts`)

Verified 2026-06-14. ⚠️ = flagged proxy (documented, acceptable for POC). `nwacZoneId` added
from §5.2. Full literal:

```ts
export const MOUNTAINS = [
  { name:"Mount Rainier", slug:"mt-rainier", lat:46.8517, lng:-121.7603,
    elevations:{base:5420,mid:10188,summit:14410}, nwacZone:"west-slopes-south",
    nwacZoneId:"1648", snotelStationId:"679", snotelStationTriplet:"679:WA:SNTL",
    snotelStationName:"Paradise", region:"cascades-south", timezone:"America/Los_Angeles",
    description:"The Cascades' highest, most glaciated volcano, climbed via Camp Muir and the Disappointment Cleaver from Paradise." },
  { name:"Mount Baker", slug:"mt-baker", lat:48.7766, lng:-121.8145,
    elevations:{base:3500,mid:6000,summit:10781}, nwacZone:"west-slopes-north",
    nwacZoneId:"1646", snotelStationId:"909", snotelStationTriplet:"909:WA:SNTL",
    snotelStationName:"Wells Creek", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A glaciated North Cascades volcano near the border, climbed via Coleman-Deming from Heliotrope Ridge." },
  { name:"Mount Shuksan", slug:"mt-shuksan", lat:48.8315, lng:-121.6032,
    elevations:{base:4700,mid:6700,summit:9131}, nwacZone:"west-slopes-north",
    nwacZoneId:"1646", snotelStationId:"909", snotelStationTriplet:"909:WA:SNTL", // ⚠️ shares Baker's station
    snotelStationName:"Wells Creek", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A rugged North Cascades peak beside Baker, climbed via the Fisher Chimneys to the Sulphide or Hells Highway." },
  { name:"Glacier Peak", slug:"glacier-peak", lat:48.1119, lng:-121.1142,
    elevations:{base:2100,mid:7300,summit:10541}, nwacZone:"west-slopes-central",
    nwacZoneId:"1647", snotelStationId:"606", snotelStationTriplet:"606:WA:SNTL",
    snotelStationName:"Lyman Lake", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"Washington's most remote volcano, deep in the Glacier Peak Wilderness via the North Fork Sauk." },
  { name:"Mount Adams", slug:"mt-adams", lat:46.2024, lng:-121.4909,
    elevations:{base:5600,mid:9300,summit:12281}, nwacZone:"east-slopes-south", // ⚠️ Adams has a separate special forecast; geographic best-fit
    nwacZoneId:"1656", snotelStationId:"702", snotelStationTriplet:"702:WA:SNTL", // ⚠️ Potato Hill, NW flank proxy
    snotelStationName:"Potato Hill", region:"cascades-south", timezone:"America/Los_Angeles",
    description:"Washington's second-highest volcano, a non-technical South Spur climb past the Lunch Counter." },
  { name:"Mount St. Helens", slug:"mt-st-helens", lat:46.1912, lng:-122.1944,
    elevations:{base:3700,mid:4800,summit:8363}, nwacZone:"west-slopes-south",
    nwacZoneId:"1648", snotelStationId:"553", snotelStationTriplet:"553:WA:SNTL",
    snotelStationName:"June Lake", region:"cascades-south", timezone:"America/Los_Angeles",
    description:"The active 1980-eruption volcano, climbed via Monitor Ridge from Climbers Bivouac to the crater rim." },
  { name:"Mount Hood", slug:"mt-hood", lat:45.3736, lng:-121.6958,
    elevations:{base:5960,mid:8470,summit:11249}, nwacZone:"mt-hood",
    nwacZoneId:"1657", snotelStationId:"651", snotelStationTriplet:"651:OR:SNTL",
    snotelStationName:"Mt Hood Test Site", region:"oregon", timezone:"America/Los_Angeles",
    description:"Oregon's highest peak, a glaciated volcano climbed via the Hogsback and Pearly Gates above Timberline." },
  { name:"Colchuck Peak", slug:"colchuck-peak", lat:47.4783, lng:-120.8465,
    elevations:{base:3400,mid:5570,summit:8705}, nwacZone:"east-slopes-central",
    nwacZoneId:"1655", snotelStationId:"478", snotelStationTriplet:"478:WA:SNTL",
    snotelStationName:"Fish Lake", region:"cascades-central", timezone:"America/Los_Angeles",
    description:"A Stuart Range granite peak above Colchuck Lake in the Enchantments, with the classic NE Couloir." },
  { name:"Liberty Bell", slug:"liberty-bell", lat:48.5154, lng:-120.6579,
    elevations:{base:5200,mid:7000,summit:7720}, nwacZone:"east-slopes-north",
    nwacZoneId:"1654", snotelStationId:"711", snotelStationTriplet:"711:WA:SNTL",
    snotelStationName:"Rainy Pass", region:"cascades-north", timezone:"America/Los_Angeles",
    description:"A striking granite spire at Washington Pass on Hwy 20, home to the Beckey Route." },
  { name:"Mount Olympus", slug:"mt-olympus", lat:47.8013, lng:-123.7108,
    elevations:{base:600,mid:4200,summit:7980}, nwacZone:"olympics",
    nwacZoneId:"1645", snotelStationId:"1107", snotelStationTriplet:"1107:WA:SNTL", // ⚠️⚠️ remote; all Olympic SNOTEL on drier NE side
    snotelStationName:"Buckinghorse", region:"olympics", timezone:"America/Los_Angeles",
    description:"The glaciated high point of the Olympics, via a long Hoh Rainforest approach and the Blue Glacier." },
] as const;
```

---

## 11. Component inventory (`components/**`) — recreated from Cirque (§0); props in P4/P5 plans

Maps to the prototype modules in `prototype-ui/.../app/`. Recreate the visual output, wired to
the real types in §9.

```
layout/   Header.tsx (Cirque Header/Brand: wordmark, nav Projects/Peaks, "Pin a Peak", sticky/blur)
          ThemeToggle.tsx (Glacier/Slate via [data-theme]; no Tweaks panel)  PageWrapper.tsx
charts/   AreaSpark.tsx  LineChart.tsx  BarChart.tsx   # hand-built SVG, port app/charts.jsx; NO Recharts
icons/    icons.tsx (line set)  WeatherIcon.tsx (WMO→sun/partly/cloud/rain/snow/fog)  WindArrow.tsx
dashboard/ Dashboard.tsx  ProjectCard.tsx  AddCard.tsx  EmptyState.tsx   # port app/dashboard.jsx
create/   PinAPeak.tsx  MountainSearch.tsx (typeahead)  MountainMap.tsx (Mapbox)  DateRangePicker.tsx
project/  ProjectHeader.tsx (sticky sub-header: back, dates, last-refreshed, Share, Model lab)
          Verdict.tsx ("The call for {day}" + tone + 3 Stats)
          DailyOutlook.tsx (Segmented: Daily | AM·Mid·PM | Hourly-48h + temp trend ribbon + target flag)
          FreezingLevelHero.tsx (static SVG cross-section, range band, band label cards)  DayStrip.tsx
          ConfidenceStrip.tsx (model agreement + "Compare all models →")
          AvalanchePanel.tsx  DangerColumn.tsx  AspectRose.tsx (8-sector × 3-ring)
          SnowpackPanel.tsx (SNOTEL + AreaSpark 30-day)  SatellitePanel.tsx  NotesPanel.tsx
modellab/ ModelLab.tsx  ModelCharts.tsx (4 LineCharts)  ForecastEvolutionChart.tsx
          HourlyGrid.tsx (MOS-style mono table, target row shaded, cold/hot cells)  # port app/modellab.jsx
shared/   Stat.tsx  Segmented.tsx (role=tablist, sliding active)  DangerChip.tsx  PrecipChip.tsx
          PanelHead.tsx  SectionTitle.tsx  DrillLink.tsx  ConditionTone.tsx (dot+word)
          CopyLinkButton.tsx  LastUpdated.tsx  LoadingSpinner.tsx  ErrorBoundary.tsx
mountains/ Mountains.tsx (browse list)  MountainCard.tsx
```

**Browse (`/mountains/[slug]`)** reuses the `project/*` calm-layer panels **minus**
`ConfidenceStrip`, `ForecastEvolutionChart`, and the Model Lab (browse = current only; spec §1).
**Tokens/typography/themes:** port from `prototype-ui/.../app/styles.css` into `app/globals.css`
CSS variables + Tailwind theme; load the three fonts via `next/font/google`.

---

## 12a. Units & display preferences (UI toggle)

Data is **stored canonically** by the workers — temperature °F, wind mph, precip/snow inches,
elevation/height feet (contract §5.1 requests `fahrenheit/mph/inch`; SNOTEL inches/°F;
elevations feet). The UI offers a **units toggle** with three independent axes:

| Axis | Options | Canonical (stored) |
|---|---|---|
| Temperature | °F ⇄ °C | °F |
| Wind speed | mph ⇄ km/h | mph |
| Elevation / height | ft ⇄ m | ft |

- The **elevation/height** axis governs mountain elevations + freezing level (ft⇄m) and
  **SNOTEL snow depth (in⇄cm)**. **SWE and precipitation/snowfall stay in inches** in the POC
  (note for future: tie precip to the height axis as in⇄cm).
- Preference lives in a Zustand store `lib/units.ts` (`useUnits`), persisted to `localStorage`
  (key `cirque.units`), default imperial (`{ temp: 'F', wind: 'mph', dist: 'ft' }`).
- Conversion helpers live in `lib/units.ts`: `convTemp`, `convWind`, `convDist` + `fmtTemp`,
  `fmtWind`, `fmtDist` (value→string with the active unit + symbol). **All display components
  render measured quantities through these helpers** — never raw stored numbers. Charts/axes
  read the active units too (axis labels + tick values convert).
- The toggle control (a `Segmented`-style triplet) lives in the Header (compact) and is
  echoed in any settings affordance. `role="group"` + labels for a11y.

## 12. Test & tooling conventions

- **Python:** pytest 8, `asyncio_mode=auto`, `--cov=functions --cov-fail-under=90`. Fixtures in
  `functions/conftest.py`: `mock_db`, `mock_publisher`, `mock_storage_client`,
  `sample_mountain_doc`, `sample_active_project`, `sample_open_meteo_response` (multi-model
  shape), plus loaders for `fixtures/*.json`. HTTP mocked with `pytest-httpx`. Contract tests
  parse saved `fixtures/*.json`. Opt-in live smoke tests marked `@pytest.mark.live`
  (deselected by default via `-m "not live"`).
- **Next.js:** Vitest + Testing Library, coverage thresholds lines/functions 90, branches 85.
  Route Handlers tested with mocked `lib/firebase-admin` + `lib/pubsub`. Integration tests run
  against the Firestore/Pub-Sub **emulators**.
- **Playwright:** `playwright.config.ts` projects for **desktop (1280×800)** and **mobile
  (390×844, iPhone 12)**. Specs in `tests/e2e/`. App served against emulator-seeded data.
  Screenshots saved to `test-results/` and reviewed at each UI phase gate.
- **Emulators:** `firebase.json` configures Firestore + Pub/Sub emulators; a `scripts/seed-emulator.ts`
  loads mountains + a sample project + sample blobs for local dev and Playwright.
- **Reuse:** invoke project skills `python-gcp-patterns` (workers), `nextjs-patterns` (app),
  `design-tokens` (UI), and agents `python-reviewer` / `ux-reviewer` at the relevant gates.
- **Cirque prototype (§0)** is the binding visual reference for all UI work — recreate it
  pixel-perfect. Charts are hand-built SVG (no Recharts). Fonts via `next/font/google`
  (Newsreader, Hanken Grotesk, IBM Plex Mono). Themes Glacier/Slate via `[data-theme]`.
  Playwright screenshots are compared against the prototype screens at each UI gate.
- **Attribution (must ship in UI footer):** "Weather data by Open-Meteo.com" (CC BY 4.0);
  avalanche data © NWAC; SNOTEL data © USDA NRCS; EOX s2cloudless attribution string (§2 env).
