# Mountain Weather POC — Seed Plan
> A unified mountain weather dashboard for Washington State hiking and mountaineering.
> This document is an exploratory seed plan to guide the creation of a detailed implementation plan.
> Authentication is explicitly excluded from the POC scope.

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [POC Scope](#2-poc-scope)
3. [Tech Stack](#3-tech-stack)
4. [High-Level Architecture](#4-high-level-architecture)
5. [Data Sources](#5-data-sources)
6. [Firestore Data Model](#6-firestore-data-model)
7. [Cloud Storage Strategy](#7-cloud-storage-strategy)
8. [Scheduler & Worker Architecture](#8-scheduler--worker-architecture)
9. [Python Cloud Functions](#9-python-cloud-functions)
10. [Next.js Application](#10-nextjs-application)
11. [POC Feature Specifications](#11-poc-feature-specifications)
12. [Testing Strategy](#12-testing-strategy)
13. [Terraform — Infrastructure as Code](#13-terraform--infrastructure-as-code)
14. [CI/CD Pipeline](#14-cicd-pipeline)
15. [Repository Structure](#15-repository-structure)
16. [Development Phases](#16-development-phases)
17. [Open Questions for Detailed Plan](#17-open-questions-for-detailed-plan)

---

## 1. Vision & Goals

### What We Are Building

A web application that gives mountaineers and hikers in Washington State a single, unified view of everything they need to assess conditions for an upcoming trip. Rather than checking Mountain-Forecast, NWAC, a SNOTEL portal, and Windy separately, the user pins a mountain as a "project," sets a target date range, and the app continuously aggregates and refreshes all relevant data in the background.

The core differentiator is the **evolving forecast view**: by storing timestamped forecast snapshots over time, the app lets users see not just what the weather looks like now for their target date, but how that forecast has shifted over the past 7–10 days. Models converging on the same answer = trust it. Models diverging = uncertainty.

### POC Goals

- Validate the core data pipeline: automated background fetching from multiple sources, stored in GCP, served via a clean UI.
- Validate the UX concept: does the unified project-based view actually serve the mountaineering planning workflow?
- Prove the scheduler fan-out architecture at small scale before investing in multi-user infrastructure.
- Produce a working, shareable demo that can be shown to potential users for feedback.
- Establish a clean codebase architecture and testing baseline that the full product can grow from.

### What Success Looks Like for POC

- A user can pin Mt. Rainier with a target date of the coming weekend.
- The app automatically fetches and stores weather, avalanche, and snowpack data on a schedule without any manual intervention.
- The user opens the app to a dashboard and sees all their pinned projects with a meaningful at-a-glance weather summary.
- Drilling into a project shows: elevation-band forecasts, a multi-model comparison, a freezing level hero view, NWAC avalanche danger, and SNOTEL snowpack data.
- A chart shows how the forecast for the target date has shifted over the last several days.
- Any URL in the app can be shared directly — no login required, anyone can view.

---

## 2. POC Scope

### In Scope

- **Single-user, no authentication.** The app is fully public. Any URL is shareable. Auth will be added in a later phase.
- **Project/pin system.** Create a named project tied to a mountain and a target date range. Projects persist in Firestore.
- **Automated background data refresh.** Cloud Scheduler → Pub/Sub → Python Workers refresh all projects on a schedule.
- **Multi-source weather data.** Open-Meteo (HRRR + GFS + ECMWF), NWS alerts.
- **Elevation-specific forecasts.** Base, mid, and summit elevation bands per mountain.
- **Forecast evolution timeline.** Stored snapshots show how the prediction for a target date has changed day by day.
- **Multi-model comparison panel.** HRRR, GFS, and ECMWF side-by-side for the same location and time window.
- **Freezing level hero view.** Stylized mountain cross-section with the freezing level line, temperatures by elevation band, and precipitation type indicator.
- **NWAC avalanche forecast panel.** Daily danger ratings by elevation band for the relevant Washington zone.
- **SNOTEL snowpack panel.** Current snow depth, SWE, and a 30-day trend from the nearest SNOTEL station.
- **Satellite snow coverage.** Most recent Copernicus Sentinel-2 imagery tile for the project area.
- **Shareable project URLs.** Since there is no auth, any `/projects/[id]` URL is directly shareable.
- **GCP-native infrastructure.** Firebase App Hosting, Firestore, Cloud Storage, Cloud Functions (Python Gen 2), Cloud Scheduler, Pub/Sub.
- **Terraform IaC.** All GCP resources managed as code.
- **Automated tests.** Python workers at ≥90% coverage with pytest-cov; Next.js Route Handlers with Vitest.

### Out of Scope for POC (Future Phases)

- User authentication and Gmail sign-in.
- Per-user project isolation and access control.
- Project invite / collaborator system.
- Push notifications (Firebase Cloud Messaging).
- Post-trip conditions logging.
- GPX route file upload and elevation profile overlay.
- Washington Trails Association trail condition integration.
- Webcam feed aggregation.
- Summit window finder (best 4-hour window computation).
- Historical analog search (comparing current synoptic pattern to past years).
- AI-generated gear checklist.
- Mobile native apps.
- Offline mode.

---

## 3. Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Frontend framework | Next.js 14+ (App Router) | SSR, Route Handlers as API layer, Firebase App Hosting support |
| UI language | TypeScript | Type safety across the full frontend |
| Styling | Tailwind CSS | Rapid prototyping, consistent design tokens |
| Charting / visualization | Recharts + D3.js | Recharts for time-series charts; D3 for the custom freezing level SVG |
| Map | Mapbox GL JS (free tier) | Topographic tiles, interactive peak selection |
| Hosting | Firebase App Hosting | Deploys Next.js to Cloud Run + CDN automatically via GitHub |
| Database | Firestore (GCP) | Document store, real-time capable, generous free tier |
| File storage | Cloud Storage (GCP) | Large JSON blobs, satellite tiles |
| Background workers | Python 3.12 Cloud Functions Gen 2 | Data processing strength, great GCP SDK support |
| Worker trigger | Cloud Pub/Sub | Fan-out parallelism for the scheduler pattern |
| Scheduler | Cloud Scheduler | Managed cron, triggers Pub/Sub topics |
| Data validation (Python) | Pydantic v2 | Type-safe API response parsing in workers |
| HTTP client (Python) | httpx (async) | Async HTTP calls within a single worker execution |
| IaC | Terraform (hashicorp/google provider ~5.x) | Declarative GCP resource management |
| CI/CD | GitHub Actions | Test, plan, and deploy on push/PR |
| Python testing | pytest + pytest-cov + pytest-mock + pytest-httpx | 90% coverage enforcement |
| JS/TS testing | Vitest + Testing Library | Route Handler and component tests |
| State management | Zustand (client) | Lightweight, works well with Next.js App Router |
| Data fetching (client) | SWR | Stale-while-revalidate, pairs naturally with Next.js caching |

---

## 4. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                           │
│  Next.js React App (Firebase App Hosting CDN)                   │
│  Dashboard / Project Detail / Freezing Level / Model Compare    │
└───────────────────────┬─────────────────────────────────────────┘
                        │ HTTP (Route Handlers)
┌───────────────────────▼─────────────────────────────────────────┐
│              FIREBASE APP HOSTING (Cloud Run)                    │
│              Next.js Route Handlers  (/api/*)                    │
│   /api/projects         → reads Firestore                        │
│   /api/projects/[id]    → reads Firestore + Cloud Storage        │
│   /api/weather/[id]     → serves cached forecast blob           │
│   /api/nwac/[zone]      → reads Firestore nwacForecasts         │
│   /api/snotel/[station] → reads Firestore snotelData            │
└────┬───────────────────┬─────────────────────────────────────────┘
     │                   │
     ▼                   ▼
┌─────────┐      ┌───────────────┐
│Firestore│      │ Cloud Storage │
│         │      │               │
│projects │      │ /forecasts/   │
│mountains│      │ /satellite/   │
│nwac     │      │ /source-zips/ │
│snotel   │      │               │
│snapshots│      └───────────────┘
└─────────┘

─────────────── BACKGROUND (ASYNC, SCHEDULED) ──────────────────

┌─────────────────────────────────────────────────────────────────┐
│                      CLOUD SCHEDULER                             │
│   hourly-weather    (0 * * * *)                                  │
│   daily-nwac        (30 18 * * *)    ← 6:30pm Pacific           │
│   daily-snotel      (0 7 * * *)                                  │
│   weekly-satellite  (0 8 * * 0)      ← Sunday 8am               │
└────────────────────────┬────────────────────────────────────────┘
                         │ publishes to Pub/Sub
┌────────────────────────▼────────────────────────────────────────┐
│                  ORCHESTRATOR FUNCTION (Python)                  │
│  - Reads Firestore for active projects (targetDateEnd >= today)  │
│  - Deduplicates to unique mountains / zones / stations           │
│  - Publishes one Pub/Sub message per unique entity               │
└────────────────────────┬────────────────────────────────────────┘
                         │ fan-out
        ┌────────────────┼──────────────────────┐
        ▼                ▼                      ▼
┌──────────────┐ ┌──────────────┐   ┌───────────────────┐
│Weather Worker│ │ NWAC Worker  │   │  SNOTEL Worker    │
│(Python Gen2) │ │(Python Gen2) │   │  (Python Gen2)    │
│              │ │              │   │                   │
│Open-Meteo → │ │NWAC public→  │   │ NRCS SNOTEL API → │
│Cloud Storage │ │Firestore     │   │ Firestore         │
│+ Firestore   │ │              │   │                   │
│snapshot      │ └──────────────┘   └───────────────────┘
└──────────────┘
        ▼
┌───────────────────────────────────────────────────────────────┐
│  Separate Pub/Sub topic for satellite (weekly)                  │
│  Satellite Worker: Copernicus catalog → Cloud Storage tiles     │
└───────────────────────────────────────────────────────────────┘
```

### Key Architectural Principles

**The UI never calls external weather APIs.** All external data flows through the scheduled workers. Route Handlers serve pre-fetched data from Firestore and Cloud Storage. The user experience is always fast because they are reading cached data, not waiting on Open-Meteo or NWAC.

**Workers are stateless and single-purpose.** Each worker receives one message (`{ mountainId }` or `{ zoneId }` or `{ stationId }`), does one unit of work, and exits. No shared state, no coordination.

**Deduplication happens at the Orchestrator.** Many projects may reference the same mountain. The Orchestrator emits one Pub/Sub message per unique mountain, so weather for Mt. Rainier is fetched once per cycle regardless of how many projects reference it.

**Firestore stores summaries; Cloud Storage stores raw blobs.** A 7-day hourly forecast for 3 elevation bands across 3 models is approximately 150–250KB of JSON — too large to efficiently store in a Firestore document. The raw blob goes to Cloud Storage. Firestore stores the snapshot summary (high temp, low temp, max wind, precip total, freezing level range) which is what the dashboard cards need. The full blob is only fetched when the user opens a project detail.

---

## 5. Data Sources

### 5.1 Open-Meteo

**URL:** `https://api.open-meteo.com/v1/forecast`
**Cost:** Free for non-commercial use (CC BY 4.0). No API key required.
**Response time:** Typically 50–150ms per request.
**Update cadence:** HRRR updates every hour. GFS every 6 hours. ECMWF every 6 hours.

Open-Meteo is the primary weather engine. It aggregates data from 15+ national weather services and exposes a unified JSON API. For this app, three models are queried per mountain:

- **HRRR** (`model=hrrr`): 3km resolution, updates hourly, best for 0–48hr. North America only. The "ground truth" short-range model.
- **GFS** (`model=gfs`): 25km resolution, 16-day range. Good for planning-window decisions (5–14 days out).
- **ECMWF IFS** (`model=ecmwf_ifs`): 9km resolution, widely regarded as the best global model for medium-range accuracy. Available free via Open-Meteo open-data tier.

**Key variables requested per model:**
- `temperature_2m` — surface temperature
- `apparent_temperature` — feels-like (wind chill)
- `windspeed_10m`, `windgusts_10m`, `winddirection_10m`
- `precipitation`, `precipitation_probability`
- `snowfall`
- `freezinglevel_height` — altitude in meters where temperature crosses 0°C (critical for mountaineering)
- `cloudcover`, `visibility`
- `weathercode` — WMO weather code for icon display

**Elevation-specific approach:** Open-Meteo's pressure-level data (`pressure_level_variables`) provides temperature, wind, and humidity at specific atmospheric pressure levels corresponding to approximate altitudes. For a mountain like Rainier (14,411 ft / 4,392m summit), the relevant pressure levels are approximately 925 hPa (trailhead ~2,500 ft), 700 hPa (mid ~10,000 ft), and 500 hPa (summit ~18,000 ft — interpolate down from this). The exact pressure-level-to-altitude mapping varies with atmospheric conditions, so the app should display the approximate elevation alongside each band.

**Example API call (simplified):**
```
GET https://api.open-meteo.com/v1/forecast
  ?latitude=46.8523
  &longitude=-121.7603
  &hourly=temperature_2m,windspeed_10m,windgusts_10m,precipitation,
          freezinglevel_height,snowfall,precipitation_probability
  &models=hrrr,gfs,ecmwf_ifs
  &temperature_unit=fahrenheit
  &windspeed_unit=mph
  &precipitation_unit=inch
  &timezone=America/Los_Angeles
  &forecast_days=7
```

**Multi-model response structure:** When multiple models are requested, Open-Meteo returns each model's data as a separate key in the response object, e.g., `hrrr_hourly`, `gfs_hourly`, `ecmwf_ifs_hourly`. This makes the comparison panel straightforward to build.

**Open-Meteo Previous Runs API:** Available at `https://previous-runs-api.open-meteo.com/v1/forecast`. This archives what each model predicted at various lead times (up to 7 days back). This is an alternative approach for the forecast evolution timeline — rather than storing our own snapshots, we can query what HRRR predicted for Saturday when it was queried 7 days ago, 5 days ago, 3 days ago, etc. However, this API has rate limits and the data availability is model-dependent. **Recommended approach for POC:** Use our own snapshot storage in Firestore for reliability.

### 5.2 NWS / NOAA API

**URL:** `https://api.weather.gov`
**Cost:** Free. No API key required. Requires a `User-Agent` header identifying your app.
**Response time:** Variable. Known to have occasional delays of 1–3 hours on observation data. Can return 503 intermittently.
**Use in this app:** Secondary source. Used for official NWS weather alerts and hazardous weather outlook text for Washington zones. Not used as primary forecast engine due to reliability issues — Open-Meteo is primary.

**Key endpoints:**
- `GET /alerts/active?area=WA` — active weather alerts for Washington State
- `GET /points/{lat},{lon}` — resolves a coordinate to the NWS grid and forecast office
- `GET /gridpoints/{office}/{gridX},{gridY}/forecast` — 7-day human-readable forecast
- `GET /gridpoints/{office}/{gridX},{gridY}/forecast/hourly` — hourly forecast

**Implementation note:** The NWS `/points` response is cacheable nearly permanently (the grid mapping for a given coordinate almost never changes). Cache the gridpoint result in Firestore under `mountains/{id}.nwsGridpoint` so subsequent calls go directly to the forecast endpoint without the lookup step.

### 5.3 NWAC — Northwest Avalanche Center

**URL:** `https://nwac.us/avalanche-forecast/`
**Cost:** Free. Public forecast pages. Formal API is restricted to approved researchers. Public forecast JSON is accessible and has been used by community projects.
**Update cadence:** Once daily at 6:00 PM Pacific. Valid for the following 24 hours. Extended outlook covers the day after.
**Coverage:** 10 forecast zones across Washington State and northern Oregon.

**Washington zones relevant to this app:**
- Olympics
- West Slopes North (Mt. Baker area)
- West Slopes Central (Stevens Pass, Glacier Peak)
- West Slopes South (Crystal, Rainier)
- East Slopes North
- East Slopes South
- Mt. Hood (Oregon, included as it's a popular WA mountaineer destination)
- Snoqualmie Pass
- Washington Cascades — additional sub-zones

**Data available per forecast:**
- Danger rating (1–5 scale) for Low, Mid, and High elevation bands
- Tomorrow's danger ratings
- Avalanche problems (list of 1–5 problem types with descriptions)
- Aspect/elevation rose for each problem (which directions and elevations are most affected)
- Bottom line summary (plain English paragraph)
- Snowpack analysis narrative
- Detailed forecast narrative

**Implementation note:** NWAC explicitly discourages API scraping that causes server load. The worker should fetch each zone's forecast once per day and cache it in Firestore. Do not poll more than once per day. The daily-nwac Cloud Scheduler job fires at 6:30 PM Pacific, 30 minutes after NWAC publishes.

**Firestore caching:** One document per zone per day. The Orchestrator for NWAC reads all active projects, maps each mountain to its NWAC zone, deduplicates to unique zones, and publishes one Pub/Sub message per zone. With 10 zones and one fetch per zone, total daily NWAC API calls = 10 regardless of project count.

### 5.4 SNOTEL — USDA Natural Resources Conservation Service

**URL:** `https://wcc.sc.egov.usda.gov/reportGenerator/`
**Cost:** Free. Public US government data.
**Update cadence:** Most stations update hourly; some once daily.
**Coverage:** ~800+ automated stations in mountain watersheds across the western US, ~100+ in Washington State.

**Data available:**
- Snow Water Equivalent (SWE) — the key metric for snowpack assessment
- Snow depth (inches)
- Air temperature (current, min, max)
- Precipitation accumulation
- Historical percentages (current SWE as % of median for this date)

**Key Washington SNOTEL stations for major mountaineering objectives:**
- Paradise (Mt. Rainier, 5,430 ft elevation)
- Morse Lake (Glacier Peak area)
- Stevens Pass (Stevens Pass area)
- Lyman Lake (North Cascades)
- Harts Pass (North Cascades)
- Cayuse Pass (Mt. Rainier east side)

**API approach:** The NRCS report generator accepts URL-encoded parameters. A typical request:
```
GET https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/customSingleStationReport/daily/
    start_of_period/647:WA:SNOTEL%7Cid=%22%22%7Cname/
    -30,0/WTEQ::value,SNWD::value,TMAX::value,TMIN::value,PREC::value
```
Returns CSV data. Parse with Python's `csv` module or `pandas`. Cache daily in Firestore.

**Mountain-to-station mapping:** Stored in the `mountains` Firestore collection. Each mountain document includes `snotelStationId` and `snotelStationName`. This is seed data populated at setup time.

### 5.5 Copernicus Sentinel-2 Satellite Imagery

**URL:** `https://dataspace.copernicus.eu/` / WMTS tile service
**Cost:** Free. Copernicus Open Access Hub.
**Update cadence:** Sentinel-2 constellation has a ~5-day revisit cycle per location. Cloud cover frequently delays usable imagery.
**Use in app:** Visual snow coverage indicator — the user can see satellite-derived snow extent on the mountain.

**Two approaches:**

**Option A (recommended for POC):** Use Copernicus' pre-rendered tile service. The `EO Browser` tile service provides RGB and False Color composite tiles via a standard WMTS/XYZ endpoint. Request tiles for the bounding box of the mountain, at zoom level ~13. Display as a semi-transparent layer over the Mapbox base map in the project detail page. This requires no large file download — just tile requests.

**Option B (more powerful, more complex):** Use the Copernicus Data Space Ecosystem API to query the catalog for the most recent cloud-free Sentinel-2 scene over the project area, download the Band 3/2/4 (RGB) GeoTIFF, clip to a bounding box, convert to PNG, and store in Cloud Storage. Then serve via a signed URL. This gives full control over processing but requires significant image processing code in the Satellite Worker.

**POC recommendation:** Start with Option A. If image quality is insufficient, migrate to Option B in a later iteration.

**Satellite Worker cadence:** Runs weekly (Sunday mornings). Checks the Copernicus catalog for imagery newer than what's currently cached for each project area. Downloads and caches only if a newer scene exists. Cloud cover metadata is available in the catalog response — skip scenes with >70% cloud cover.

---

## 6. Firestore Data Model

No authentication. No `userId` fields. All collections are globally readable and writable in the POC (security rules will be tightened when auth is added).

### Collection: `mountains`

Seed data. Populated once at setup. One document per major Washington peak.

```
mountains/{mountainId}
  name:             string          // "Mount Rainier"
  slug:             string          // "mt-rainier" (used in URLs)
  lat:              number          // 46.8523
  lng:              number          // -121.7603
  elevations: {
    base:           number          // 5,400 ft (Paradise trailhead)
    mid:            number          // 10,000 ft (Camp Muir area)
    summit:         number          // 14,411 ft
  }
  nwacZone:         string          // "west-slopes-south"
  snotelStationId:  string          // "647" (NRCS station ID)
  snotelStationName: string         // "Paradise"
  nwsGridpoint: {                   // cached from NWS /points lookup
    office:         string          // "SEW"
    gridX:          number
    gridY:          number
  }
  region:           string          // "cascades-south" | "cascades-north" | "olympics"
  description:      string          // brief description for the project creation UI
  defaultPhotoUrl:  string          // Cloud Storage URL for a mountain photo
  createdAt:        timestamp
```

**Seed data for POC (initial set):**
- Mount Rainier
- Mount Baker
- Mount Shuksan
- Glacier Peak
- Mount Adams
- Mount St. Helens
- Mount Hood (Oregon — popular WA mountaineer objective)
- Enchantments / Colchuck Peak area
- Liberty Bell / Early Winters area
- Olympic Mountains / Mount Olympus

### Collection: `projects`

One document per pinned project. In the POC, these are global (no owner).

```
projects/{projectId}
  name:             string          // "Rainier — August Summit Attempt"
  mountainId:       string          // reference to mountains/{id}
  mountainName:     string          // denormalized for display without join
  mountainSlug:     string          // denormalized
  targetDateStart:  string          // "2026-08-02" (ISO date)
  targetDateEnd:    string          // "2026-08-03"
  status:           string          // "active" | "archived"
  notes:            string          // optional free text notes
  createdAt:        timestamp
  lastRefreshedAt:  timestamp       // when scheduler last successfully updated
  lastRefreshStatus: string         // "ok" | "error" | "partial"
  
  // Denormalized summary for dashboard cards (written by weather worker)
  currentSummary: {
    targetDateHigh:   number        // °F predicted high on target date (summit)
    targetDateLow:    number        // °F predicted low on target date (summit)
    targetDateWind:   number        // mph predicted max wind on target date (summit)
    targetDatePrecip: number        // inches predicted precip on target date
    freezingLevelFt:  number        // ft predicted freezing level at noon target date
    precipType:       string        // "snow" | "rain" | "mixed" | "none"
    summaryModel:     string        // which model this summary uses ("hrrr" | "gfs")
    updatedAt:        timestamp
  }
  
  // NWAC summary for dashboard card (written by nwac worker)
  currentAvalancheSummary: {
    dangerHigh:       number        // 1-5
    dangerMid:        number
    dangerLow:        number
    bottomLine:       string        // first 200 chars of bottom line
    forecastDate:     string        // ISO date this forecast covers
    updatedAt:        timestamp
  }
  
  // SNOTEL summary for dashboard card
  currentSnowpackSummary: {
    snowDepthIn:      number
    sweIn:            number        // snow water equivalent
    percentOfMedian:  number        // current SWE as % of historical median
    stationName:      string
    updatedAt:        timestamp
  }
```

### Subcollection: `projects/{projectId}/weatherSnapshots`

One document per scheduled refresh cycle. This is the evolving forecast feature — stores what each model predicted for the target date at the time of each refresh.

```
weatherSnapshots/{snapshotId}
  fetchedAt:        timestamp       // when this snapshot was taken
  targetDate:       string          // the date this snapshot predicts (target date)
  forecastBlobPath: string          // Cloud Storage path to full hourly JSON
  
  // Per-model summary for the target date (for the evolution chart)
  models: {
    hrrr: {
      available:          boolean
      summitHighF:        number
      summitLowF:         number
      summitMaxWindMph:   number
      summitPrecipIn:     number
      freezingLevelFtNoon: number
      snowfallIn:         number
    }
    gfs: { ... same fields ... }
    ecmwf: { ... same fields ... }
  }
```

**Retention policy:** Keep snapshots for 30 days. A cleanup Cloud Function (or Firestore TTL) removes old snapshots. In the detailed plan, decide whether to use Firestore's native TTL feature or a scheduled cleanup function.

### Collection: `nwacForecasts`

Shared across all projects. One document per zone per day.

```
nwacForecasts/{zoneId}
  zone:             string          // "west-slopes-south"
  forecastDate:     string          // "2026-08-02" (ISO date)
  issuedAt:         timestamp
  validUntil:       timestamp
  
  danger: {
    today: {
      high:         number          // 1-5
      mid:          number
      low:          number
    }
    tomorrow: {
      high:         number
      mid:          number
      low:          number
    }
  }
  
  problems: [
    {
      type:         string          // "Wind Slab" | "Persistent Slab" | etc.
      likelihood:   string          // "Unlikely" | "Likely" | "Very Likely"
      size:         string          // "Small" | "Large" | "Very Large"
      aspects: {
        high: { N, NE, E, SE, S, SW, W, NW: boolean }
        mid:  { N, NE, E, SE, S, SW, W, NW: boolean }
        low:  { N, NE, E, SE, S, SW, W, NW: boolean }
      }
      description:  string
    }
  ]
  
  bottomLine:       string          // full text
  snowpackAnalysis: string          // full text
  detailedForecast: string          // full text
  fetchedAt:        timestamp
```

### Collection: `snotelData`

Shared across all projects. One document per station, updated daily.

```
snotelData/{stationId}
  stationId:        string          // "647"
  stationName:      string          // "Paradise"
  elevationFt:      number          // 5,430
  lat:              number
  lng:              number
  
  current: {
    date:           string          // ISO date of most recent reading
    snowDepthIn:    number
    sweIn:          number
    tempMaxF:       number
    tempMinF:       number
    precipAccumIn:  number
    percentOfMedianSWE: number
  }
  
  // 30-day trend (array of daily readings, most recent last)
  trend: [
    {
      date:         string
      snowDepthIn:  number
      sweIn:        number
    }
  ]
  
  fetchedAt:        timestamp
```

### Collection: `satelliteCache`

One document per mountain area.

```
satelliteCache/{mountainId}
  mountainId:       string
  latestImageDate:  string          // date of most recent Sentinel-2 scene
  cloudCoverPercent: number
  tileUrl:          string          // Cloud Storage signed URL or WMTS endpoint
  boundingBox: {
    north: number, south: number, east: number, west: number
  }
  updatedAt:        timestamp
```

---

## 7. Cloud Storage Strategy

### Buckets

```
{project-id}-weather-data/        # forecast JSON blobs
{project-id}-satellite-tiles/     # cached Copernicus imagery
{project-id}-function-source/     # Cloud Function deployment zips (Terraform managed)
```

### Forecast Blob Structure

```
{project-id}-weather-data/
  forecasts/
    {mountainId}/
      {YYYY-MM-DD}/
        {HHmm}-hrrr.json           # full HRRR hourly response for this fetch
        {HHmm}-gfs.json
        {HHmm}-ecmwf.json
        {HHmm}-combined.json       # all three models merged, normalized
  snotel/
    {stationId}/
      {YYYY-MM-DD}.json
```

The `combined.json` file is what the Next.js Route Handler serves to the frontend. It contains the full hourly arrays for all three models, pre-normalized to the same timezone and time step. This avoids any further data processing in the Route Handler or client.

### Satellite Tile Cache

```
{project-id}-satellite-tiles/
  {mountainId}/
    {YYYY-MM-DD}/
      tile.png                     # cropped, composited RGB tile
      metadata.json                # scene date, cloud cover, bounding box
    latest -> {most-recent-date}/  # symlink-style reference stored in Firestore
```

### Access Pattern

Cloud Storage objects are **not publicly accessible**. Route Handlers read them using the Firebase Admin SDK / `google-cloud-storage` Python client, which uses the service account's credentials. For the POC with no auth, you may choose to make the weather-data bucket publicly readable via IAM — weigh the cost (public egress) against simplicity. **Recommended POC decision:** Make blobs publicly readable to simplify the Route Handler code, then restrict in production.

### TTL / Lifecycle Policy

Set a Cloud Storage lifecycle rule on `forecasts/` to delete objects older than 35 days. This keeps storage costs near zero and aligns with the 30-day snapshot retention in Firestore.

---

## 8. Scheduler & Worker Architecture

### The Fan-Out Pattern

```
Cloud Scheduler Job
       │
       │ publishes message to Pub/Sub topic: "orchestrate"
       ▼
Orchestrator Function (Python)
  - reads Firestore projects (status=active, targetDateEnd >= today)
  - deduplicates by mountainId → unique mountains
  - for each unique mountain, publishes to "weather-refresh" topic
  - also deduplicates by nwacZone → unique zones
  - for each unique zone, publishes to "nwac-refresh" topic (daily only)
  - also deduplicates by snotelStationId
  - for each unique station, publishes to "snotel-refresh" topic (daily only)
       │
       │ fan-out (parallel Pub/Sub messages)
       ▼
Worker Functions (one invocation per message)
  WeatherWorker × N_mountains  (runs hourly)
  NWACWorker × N_zones         (runs daily)
  SnotelWorker × N_stations    (runs daily)
  SatelliteWorker × N_areas    (runs weekly)
```

### Cloud Scheduler Jobs

| Job Name | Cron Expression | Timezone | Pub/Sub Topic | Payload |
|---|---|---|---|---|
| `hourly-weather-orchestrate` | `0 * * * *` | America/Los_Angeles | `orchestrate` | `{"type": "weather"}` |
| `daily-nwac-orchestrate` | `30 18 * * *` | America/Los_Angeles | `orchestrate` | `{"type": "nwac"}` |
| `daily-snotel-orchestrate` | `0 7 * * *` | America/Los_Angeles | `orchestrate` | `{"type": "snotel"}` |
| `weekly-satellite-orchestrate` | `0 8 * * 0` | America/Los_Angeles | `orchestrate` | `{"type": "satellite"}` |

### Pub/Sub Topics

| Topic | Publisher | Subscriber (Worker) | Message Schema |
|---|---|---|---|
| `orchestrate` | Cloud Scheduler | Orchestrator | `{"type": "weather"|"nwac"|"snotel"|"satellite"}` |
| `weather-refresh` | Orchestrator | WeatherWorker | `{"mountainId": "mt-rainier"}` |
| `nwac-refresh` | Orchestrator | NWACWorker | `{"zoneId": "west-slopes-south"}` |
| `snotel-refresh` | Orchestrator | SnotelWorker | `{"stationId": "647"}` |
| `satellite-refresh` | Orchestrator | SatelliteWorker | `{"mountainId": "mt-rainier"}` |
| `refresh-dlq` | Pub/Sub (auto) | (monitor) | Dead-letter for all workers |

### Scaling Behavior

With 10 pinned projects across 5 unique mountains:
- Hourly cycle: Orchestrator publishes 5 messages → 5 WeatherWorkers run in parallel → done in ~3 seconds
- 100 projects, 30 unique mountains: 30 parallel workers, ~4 seconds
- 1,000 projects, 60 unique mountains: 60 parallel workers, ~5 seconds

Total Cloud Function invocations per day (at 10 mountains):
- Weather: 24 hrs × 10 mountains = 240 invocations
- NWAC: 1 × 10 zones = 10 invocations
- SNOTEL: 1 × 10 stations = 10 invocations
- Satellite: (weekly) 10/7 ≈ 1–2/day average
- Cloud Functions free tier: 2M invocations/month = this app runs for free indefinitely at this scale.

---

## 9. Python Cloud Functions

### 9.1 Orchestrator Function

**Trigger:** Pub/Sub (topic: `orchestrate`)
**Runtime:** Python 3.12
**Memory:** 256Mi
**Timeout:** 60 seconds

**Responsibilities:**
1. Parse the `type` field from the Pub/Sub message.
2. Query Firestore for active projects with `targetDateEnd >= today`.
3. Depending on type, deduplicate to unique mountainIds / zoneIds / stationIds.
4. Publish one Pub/Sub message per unique entity to the appropriate worker topic.

**Key implementation notes:**
- Use `firebase_admin` with `firebase_admin.firestore` for Firestore access.
- Use `google.cloud.pubsub_v1.PublisherClient` for Pub/Sub publishing.
- Deserialize the Pub/Sub message from base64 within the CloudEvent payload.
- Handle the case where there are no active projects gracefully (exit cleanly, don't error).
- Log counts: "Publishing N weather-refresh messages for N unique mountains."

```python
# functions/orchestrator/main.py (sketch)
import base64
import json
import functions_framework
from cloudevents.http import CloudEvent
from firebase_admin import firestore, initialize_app
from google.cloud import pubsub_v1
from datetime import date

initialize_app()

@functions_framework.cloud_event
def orchestrate(cloud_event: CloudEvent):
    message_data = base64.b64decode(
        cloud_event.data["message"]["data"]
    ).decode()
    payload = json.loads(message_data)
    refresh_type = payload.get("type")

    db = firestore.client()
    today_str = date.today().isoformat()

    # Query active projects with future target dates
    projects = db.collection("projects") \
        .where("status", "==", "active") \
        .where("targetDateEnd", ">=", today_str) \
        .stream()

    project_list = [p.to_dict() for p in projects]

    if refresh_type == "weather":
        _fan_out_weather(project_list)
    elif refresh_type == "nwac":
        _fan_out_nwac(project_list)
    elif refresh_type == "snotel":
        _fan_out_snotel(project_list)
    elif refresh_type == "satellite":
        _fan_out_satellite(project_list)

def _fan_out_weather(projects):
    unique_mountains = {p["mountainId"] for p in projects}
    publisher = pubsub_v1.PublisherClient()
    topic = "projects/{project}/topics/weather-refresh"  # fill project id from env
    for mountain_id in unique_mountains:
        data = json.dumps({"mountainId": mountain_id}).encode()
        publisher.publish(topic, data)
```

### 9.2 Weather Worker

**Trigger:** Pub/Sub (topic: `weather-refresh`)
**Runtime:** Python 3.12
**Memory:** 512Mi
**Timeout:** 120 seconds
**Max instances:** 100 (allows full parallelism)

**Responsibilities:**
1. Receive `{ mountainId }` from Pub/Sub.
2. Fetch mountain metadata from Firestore (coords, elevations, slug).
3. Call Open-Meteo for HRRR, GFS, and ECMWF data for this mountain's coordinates.
4. Parse and validate responses with Pydantic models.
5. Merge the three model responses into a `combined.json` blob.
6. Write blobs to Cloud Storage: `forecasts/{mountainId}/{date}/{time}-combined.json`.
7. Compute summary stats (target date high/low/wind/precip/freezingLevel) from each model.
8. Write a snapshot document to Firestore: `projects/{id}/weatherSnapshots/{snapshotId}` for each project that references this mountain.
9. Update `projects/{id}.currentSummary` with the latest HRRR (or GFS if HRRR not available) stats.
10. Update `mountains/{id}.lastWeatherFetchAt`.

**Libraries:**
- `httpx` (async HTTP client) for Open-Meteo calls
- `pydantic` v2 for response validation
- `firebase_admin` for Firestore
- `google-cloud-storage` for blob storage
- `tenacity` for retry with exponential backoff on API failures

**Error handling:**
- If Open-Meteo returns a non-200 for one model, log the error and continue with the other two models. A partial update is better than no update.
- If all three models fail, set `projects/{id}.lastRefreshStatus = "error"` and exit without writing.
- Use `tenacity.retry` with exponential backoff (3 retries, 2s initial delay) for network calls.

**Pydantic models (sketch):**
```python
# functions/shared/models.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class HourlyForecast(BaseModel):
    time: list[str]
    temperature_2m: list[float]
    windspeed_10m: list[float]
    windgusts_10m: list[float]
    precipitation: list[float]
    snowfall: list[float]
    freezinglevel_height: list[float]
    precipitation_probability: Optional[list[float]] = None
    weathercode: list[int]

class ModelForecastResponse(BaseModel):
    latitude: float
    longitude: float
    elevation: float
    timezone: str
    hourly: HourlyForecast

class CombinedForecastBlob(BaseModel):
    mountainId: str
    fetchedAt: datetime
    hrrr: Optional[ModelForecastResponse] = None
    gfs: Optional[ModelForecastResponse] = None
    ecmwf: Optional[ModelForecastResponse] = None
```

### 9.3 NWAC Worker

**Trigger:** Pub/Sub (topic: `nwac-refresh`)
**Runtime:** Python 3.12
**Memory:** 256Mi
**Timeout:** 60 seconds

**Responsibilities:**
1. Receive `{ zoneId }` from Pub/Sub.
2. Fetch the NWAC forecast for that zone from the public forecast JSON endpoint.
3. Parse the response with Pydantic models.
4. Write parsed data to Firestore: `nwacForecasts/{zoneId}`.
5. Find all active projects in this zone and update `projects/{id}.currentAvalancheSummary`.

**NWAC data access:** The NWAC website serves forecast data as JSON that can be fetched programmatically. The endpoint patterns should be confirmed during implementation (the site has changed formats before). A fallback is HTML parsing via `BeautifulSoup`, but JSON is strongly preferred. Rate limiting: one request per zone, once per day.

**Implementation note:** Include a `respectful_delay` of 1–2 seconds between zone requests even though the fan-out makes them parallel — NWAC is a non-profit with limited server resources. Configure max instances for this worker at 5 (not 100) to avoid hammering their servers.

### 9.4 SNOTEL Worker

**Trigger:** Pub/Sub (topic: `snotel-refresh`)
**Runtime:** Python 3.12
**Memory:** 256Mi
**Timeout:** 60 seconds

**Responsibilities:**
1. Receive `{ stationId }` from Pub/Sub.
2. Fetch the last 30 days of daily readings from the NRCS report generator for this station.
3. Parse the CSV response.
4. Write to Firestore: `snotelData/{stationId}`.
5. Update `projects/{id}.currentSnowpackSummary` for all projects referencing this station.

**NRCS API approach:**
```python
import httpx
import csv
import io

async def fetch_snotel(station_id: str, state: str = "WA") -> dict:
    url = (
        f"https://wcc.sc.egov.usda.gov/reportGenerator/view_csv/"
        f"customSingleStationReport/daily/start_of_period/"
        f"{station_id}:{state}:SNOTEL%7Cid=%22%22%7Cname/"
        f"-30,0/WTEQ::value,SNWD::value,TMAX::value,TMIN::value,PREC::value"
    )
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.get(url, headers={"User-Agent": "MtnWeatherApp/1.0"})
        response.raise_for_status()
    
    lines = [l for l in response.text.splitlines() if not l.startswith("#")]
    reader = csv.DictReader(lines)
    return list(reader)
```

### 9.5 Satellite Worker

**Trigger:** Pub/Sub (topic: `satellite-refresh`)
**Runtime:** Python 3.12
**Memory:** 512Mi
**Timeout:** 300 seconds
**Max instances:** 5 (image processing is memory-intensive)

**Responsibilities:**
1. Receive `{ mountainId }` from Pub/Sub.
2. Query Copernicus Data Space catalog for most recent Sentinel-2 scene with cloud cover < 70%.
3. Check if this is newer than the cached scene in Firestore `satelliteCache/{mountainId}`.
4. If newer: download the scene tile, crop to mountain bounding box, convert to PNG, upload to Cloud Storage `satellite-tiles/{mountainId}/{date}/tile.png`.
5. Update `satelliteCache/{mountainId}` in Firestore with new tile URL and metadata.
6. If not newer (or all scenes cloudy): log and exit without updating.

---

## 10. Next.js Application

### 10.1 Pages & Navigation Flow

```
/                          → Dashboard (all pinned projects as cards)
/projects/new              → Create project (mountain search + date picker)
/projects/[id]             → Project detail (full weather view)
/projects/[id]/models      → Multi-model comparison panel (full screen)
/mountains                 → Browse/search all available mountains
/mountains/[slug]          → Mountain page (conditions overview, no project needed)
```

No login pages, no user settings, no authentication routes.

**Navigation header (all pages):**
- App name / logo → links to `/`
- "Pin a Mountain" button → `/projects/new`
- Simple, minimal. No user avatar or account menu.

### 10.2 Route Handlers (API Layer)

All external data access is server-side. The browser never calls Firestore or Cloud Storage directly.

```
/api/projects
  GET    → returns all projects with currentSummary fields
  POST   → creates a new project (name, mountainId, targetDateStart, targetDateEnd)

/api/projects/[id]
  GET    → returns full project document
  PATCH  → updates project (name, dates, status, notes)
  DELETE → archives project (sets status = "archived")

/api/projects/[id]/weather
  GET    → fetches combined forecast blob from Cloud Storage, returns JSON
  Params: ?date=2026-08-02 (optional, defaults to nearest target date)

/api/projects/[id]/snapshots
  GET    → returns last 10 weatherSnapshot documents (for evolution chart)
  Returns: array of { fetchedAt, models: { hrrr, gfs, ecmwf } summary objects }

/api/projects/[id]/nwac
  GET    → returns nwacForecasts document for this project's zone

/api/projects/[id]/snotel
  GET    → returns snotelData document for this project's station

/api/mountains
  GET    → returns all mountains documents (for project creation search)

/api/mountains/[slug]
  GET    → returns mountain document by slug
```

**Caching in Route Handlers:** Use Next.js `fetch` cache with appropriate `revalidate` values. Since data is already pre-fetched by workers and stored in Firestore/GCS, the Route Handler just reads and serves — response times should be 50–150ms.

```typescript
// Example: weather endpoint with 5-minute cache
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const blob = await getWeatherBlob(params.id);   // reads from Cloud Storage
  return Response.json(blob, {
    headers: { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' }
  });
}
```

### 10.3 Component Architecture

```
components/
  layout/
    Header.tsx
    PageWrapper.tsx

  dashboard/
    ProjectCard.tsx            // card showing mountain + summary + mini status
    ProjectGrid.tsx            // grid layout of cards
    EmptyState.tsx             // shown when no projects exist yet

  project/
    ProjectHeader.tsx          // mountain name, dates, last updated indicator
    ElevationBandSelector.tsx  // Base / Mid / Summit tab switcher
    WeatherTimeline.tsx        // hour-by-hour chart (Recharts)
    FreezingLevelHero.tsx      // custom D3/SVG mountain cross-section
    ModelComparisonPanel.tsx   // HRRR vs GFS vs ECMWF
    ForecastEvolutionChart.tsx // line chart of how forecast shifted over time
    AvalanchePanel.tsx         // NWAC danger ratings + problem cards
    SnowpackPanel.tsx          // SNOTEL data + 30-day trend sparkline
    SatelliteTile.tsx          // Copernicus imagery display

  mountains/
    MountainSearch.tsx         // searchable dropdown for project creation
    MountainCard.tsx

  shared/
    DangerRatingBadge.tsx      // 1-5 colored avalanche danger indicator
    WindIndicator.tsx          // wind speed + direction display
    TempBadge.tsx
    LoadingSpinner.tsx
    ErrorBoundary.tsx
    DateRangePicker.tsx
```

---

## 11. POC Feature Specifications

### 11.1 Dashboard — Project Cards

**Page:** `/`
**Data source:** `GET /api/projects` → reads `projects` collection, returns all with `currentSummary`

Each project card displays:
- Mountain name and project name
- Target date range
- At-a-glance weather: predicted summit high/low temp and max wind on target date
- Precipitation type indicator (snow/rain/mixed/none)
- Freezing level on target date vs. summit elevation (visual: "freezing level 2,000ft below summit")
- Avalanche danger badge (color-coded 1–5 for the relevant elevation band)
- Snowpack % of median (single number: "SWE at 94% of median")
- Last refreshed timestamp
- A subtle color/tone indicating conditions (cool blues for good conditions, warm ambers for concerning)

Cards link to `/projects/[id]`.

**Empty state:** If no projects exist, show a prompt to pin the first mountain with a prominent "Pin a Mountain" CTA.

**Performance:** All data on this page is pre-computed in `currentSummary`, `currentAvalancheSummary`, and `currentSnowpackSummary` fields. No Cloud Storage reads needed for the dashboard. Page loads from Firestore in a single collection read.

### 11.2 Create / Pin a Project

**Page:** `/projects/new`
**Form fields:**
1. Mountain search (typeahead against `mountains` collection)
2. Project nickname (auto-filled from mountain name, user can edit)
3. Target date start (date picker, min: today, max: 14 days out)
4. Target date end (date picker, must be ≥ start)
5. Optional notes

On submit: `POST /api/projects` creates the Firestore document. The new project immediately shows on the dashboard with a "Pending first refresh" state. The next scheduled hourly run will pick it up and fetch data.

**For the POC:** Consider also adding a "Refresh Now" button that manually triggers the Orchestrator for this one mountain — useful for demos so you don't have to wait an hour for first data. This can be a simple Route Handler `POST /api/admin/trigger-refresh?mountainId=mt-rainier` that publishes directly to the `weather-refresh` Pub/Sub topic.

### 11.3 Project Detail View

**Page:** `/projects/[id]`
**Layout:** Sticky project header → tabbed or scrollable sections

**Sections (in scroll order):**
1. Project header: mountain name, target dates, last refreshed
2. Elevation band selector (Base / Mid / Summit tabs — affects all weather panels below)
3. Freezing Level Hero View (always visible, not affected by elevation selector)
4. 7-day weather timeline with hour-by-hour chart
5. Multi-model comparison panel
6. Forecast evolution timeline
7. NWAC avalanche panel
8. SNOTEL snowpack panel
9. Satellite snow coverage

### 11.4 Elevation Weather Bands

Three named bands per mountain, derived from the mountain seed data:
- **Base / Trailhead** — the starting elevation (e.g., Paradise at 5,400 ft for Rainier)
- **Mid / High Camp** — intermediate elevation (e.g., Camp Muir at 10,000 ft)
- **Summit** — the peak elevation

When the user selects a band, the weather timeline and summary stats update to show conditions at that elevation. The data comes from Open-Meteo's pressure-level variables, interpolated to the target altitude.

Displayed per band:
- Temperature (°F), apparent temperature
- Wind speed and gusts (mph), wind direction
- Hourly precipitation probability (%)
- Snowfall accumulation
- Weather condition icon (from WMO weather code)

**Chart:** A 7-day timeline using Recharts `ComposedChart`. X-axis: time (hourly). Y-axis (left): temperature. Y-axis (right): precipitation probability as a bar chart. Wind speed overlaid as a line. Target date range highlighted with a subtle background shade.

### 11.5 Multi-Model Comparison Panel

**Purpose:** Show HRRR, GFS, and ECMWF side-by-side for the same mountain and time window. When lines converge → high confidence. When they diverge → flag uncertainty.

**What is compared:**
- Temperature at summit (°F) — 7-day hourly lines, one per model
- Wind speed at summit (mph) — same chart layout
- Precipitation (inches/hr) — bar chart, one color per model
- Freezing level altitude (ft) — 7-day line chart, one per model

**Visual treatment:** Three distinct colors for three models (e.g., blue for HRRR, orange for GFS, green for ECMWF). When the spread between models on the target date exceeds a threshold (e.g., >15°F temperature difference, or >20mph wind difference), display a subtle "Model disagreement" callout near that date.

**Data flow:** Client calls `GET /api/projects/[id]/weather`, receives `combined.json` blob which has all three models' hourly arrays. All three are rendered client-side in Recharts. No additional API calls needed.

**POC scope for models:**
- HRRR: available for next ~48 hours, then falls back to GFS for the tail
- GFS: full 7-day range
- ECMWF: full 7-day range
- Note: HRRR data after 48hr will show "not available" in the UI

### 11.6 Freezing Level Hero View

The most visually distinctive feature of the app. A custom SVG/D3 rendering that shows the mountain in cross-section with the freezing level line animating through the day.

**Layout:**
- Mountain silhouette polygon as background (stylized, not topographically precise — a clean triangle with the correct summit elevation labeled)
- Y-axis on the left: elevation in feet from trailhead to summit
- X-axis: time (6am through 10pm on the target date, or hourly for the full window)
- Horizontal animated line: the predicted freezing level, moving up and down as time progresses
- Above the line: blue-to-white gradient fill (snow zone)
- Below the line: earth-tone gradient fill (above-freezing zone, rain/mud)
- Three horizontal dashed lines: Base elevation, Mid elevation, Summit elevation — labeled with elevation and temperature at that point for each hour

**Temperature labels:**
- At each of the three elevation bands, show the predicted temperature as a floating label that updates with the time scrubber: e.g., "Summit: 24°F" / "Camp Muir: 38°F" / "Paradise: 51°F"

**Precipitation type:**
- If the freezing level is above a given elevation, show snowflake icons on hover/scrubber for that elevation. If below, show raindrop icons. If the freezing level oscillates close to an elevation (within 500ft), show a warning "Mixed precip zone" in amber.

**Interaction:**
- A time scrubber (range input) lets the user drag across the day to see how the freezing level and temperatures shift hour by hour.
- Could also auto-animate on load to illustrate the diurnal cycle.

**Data source:** `freezinglevel_height` array from Open-Meteo (HRRR preferred for the target date if within 48hr, else GFS). Temperature at elevation bands from pressure-level variables.

**Implementation:** SVG with React state for the scrubber position. D3 scales for coordinate mapping. No third-party chart library — this is a custom visual.

### 11.7 Forecast Evolution Timeline

**Purpose:** Show how the forecast for the target date has changed over the last 7–10 days of refresh cycles.

**Chart type:** Multi-line Recharts `LineChart`. X-axis: date the snapshot was taken (from most recent going back). Y-axis: predicted value for the target date. One line per weather variable (or user selects one variable at a time).

**Variables available for evolution view:**
- Predicted summit high temperature
- Predicted summit max wind
- Predicted total precipitation
- Predicted freezing level at noon

**Visual:** Three model lines (HRRR, GFS, ECMWF) per variable. A converging pattern (lines approaching each other) near the present date indicates improving forecast confidence. A widening pattern indicates uncertainty.

**Data source:** `GET /api/projects/[id]/snapshots` returns the last 10 `weatherSnapshots` subcollection documents, ordered by `fetchedAt` desc. Each snapshot has per-model summary stats for the target date.

**Edge case:** For new projects with fewer than 3 snapshots, show a "More data will appear here as the app refreshes forecasts daily" message with a partial chart.

### 11.8 NWAC Avalanche Panel

**Data source:** `GET /api/projects/[id]/nwac`

**Display:**
- Zone name and forecast date
- Danger ratings: three rows (High Elevation / Mid Elevation / Low Elevation), each with a colored bar: 1=Green (Low), 2=Green-Yellow (Low–Moderate), 3=Yellow (Moderate), 4=Orange (Considerable), 5=Red (High)
- Tomorrow's danger ratings (smaller, below today's)
- Avalanche problems: for each problem type, show:
  - Problem name (e.g., "Wind Slab")
  - Likelihood and size
  - Aspect/elevation rose diagram (SVG compass showing which directions and elevations are affected)
- Bottom Line text (truncated with expand toggle)

**Aspect/elevation rose:** A small SVG compass rose showing the eight cardinal directions as pie slices, with three concentric rings for Low/Mid/High elevation. Filled slices = problem is present on that aspect/elevation combination. Standard avalanche forecast visual.

**Winter-only note:** NWAC issues avalanche forecasts during the winter season (typically November through May, varying by year). In summer, the panel should show: "NWAC is in summer operations mode. No avalanche forecast is active. Check nwac.us for any special bulletins."

### 11.9 SNOTEL Snowpack Panel

**Data source:** `GET /api/projects/[id]/snotel`

**Display:**
- Station name and elevation
- Current snow depth (inches) — large prominent number
- Current SWE (inches) — snow water equivalent
- % of historical median SWE — with a color indicator (>90% = normal/green, 70–90% = below normal/yellow, <70% = drought conditions/red)
- 30-day trend sparkline (Recharts `AreaChart`, small): shows snow depth over the last 30 days, giving the user a sense of whether snowpack is accumulating or melting
- Last reading date and time

**Context note:** Include a one-sentence explanation of what SWE means and why it matters for mountaineering (snowpack stability, route conditions).

### 11.10 Satellite Snow Coverage

**Data source:** `GET /api/projects/[id]` → `satelliteCache` ref → Cloud Storage URL

**Display:**
- A small map panel (250×250px or similar) showing the most recent Sentinel-2 RGB composite for the mountain area
- Scene date labeled: "Sentinel-2 imagery from June 3, 2026"
- Cloud cover percentage if available: "12% cloud cover"
- A note if imagery is older than 14 days: "No recent cloud-free imagery available — last clear scene was X days ago"
- Link to Copernicus EO Browser for the full-resolution view

**Fallback:** If no satellite imagery has been cached yet (new project, or all recent scenes cloudy), show a placeholder with a "Satellite imagery will appear here once a cloud-free scene is available" message.

### 11.11 Shareable URLs

Since there is no authentication in the POC, every URL is inherently shareable. No additional implementation needed.

- Dashboard: `yourapp.com/` — shows all projects
- Project detail: `yourapp.com/projects/[id]` — full project view
- Model comparison: `yourapp.com/projects/[id]/models`

**To share a project:** User copies the URL from the browser address bar. That is the shareable link. No token generation, no invite system — those come later.

The copy of the URL in the project header could include a convenience "Copy Link" button that uses the Clipboard API. One line of JavaScript. No backend involvement.

---

## 12. Testing Strategy

### 12.1 Python Workers — pytest

**Testing stack:**
- `pytest` (v8+)
- `pytest-cov` — coverage measurement and enforcement
- `pytest-mock` — `mocker` fixture for `unittest.mock` integration
- `pytest-httpx` — intercept and mock `httpx` HTTP calls
- `pytest-asyncio` — async function support
- `pydantic` — validate test data against production models

**`pyproject.toml` configuration:**
```toml
[tool.pytest.ini_options]
testpaths = ["functions"]
asyncio_mode = "auto"
addopts = [
    "--cov=functions",
    "--cov-report=term-missing",
    "--cov-report=xml:coverage.xml",
    "--cov-fail-under=90",
    "-v"
]

[tool.coverage.run]
source = ["functions"]
omit = [
    "*/tests/*",
    "*/__init__.py",
    "*/conftest.py",
]

[tool.coverage.report]
exclude_lines = [
    "if __name__ == .__main__.:",
    "pragma: no cover",
    "raise NotImplementedError",
]
```

**What to test at 90% coverage:**

| Module | Test focus |
|---|---|
| `orchestrator/main.py` | Deduplication logic, correct topic routing, correct Pub/Sub message format, empty project list handling, Firestore query correctness |
| `weather_worker/main.py` | Full data pipeline: Open-Meteo fetch → Pydantic parse → Cloud Storage write → Firestore update. Error path: one model fails, others succeed. All models fail. |
| `weather_worker/open_meteo_client.py` | HTTP request construction, timeout handling, non-200 responses, Pydantic validation of real-shape response, multi-model merging |
| `shared/models.py` | Pydantic model validation, optional field handling, type coercion |
| `nwac_worker/main.py` | Zone fetch → parse → Firestore write. Winter vs. summer season handling. Parse failure graceful exit. |
| `snotel_worker/main.py` | CSV fetch → parse → Firestore write. Missing station data. Partial data (some days missing). |

**`conftest.py` shared fixtures:**
```python
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from datetime import date

@pytest.fixture
def mock_db():
    with patch("firebase_admin.firestore.client") as mock:
        yield mock.return_value

@pytest.fixture
def mock_publisher():
    with patch("google.cloud.pubsub_v1.PublisherClient") as mock:
        yield mock.return_value

@pytest.fixture
def mock_storage_client():
    with patch("google.cloud.storage.Client") as mock:
        yield mock.return_value

@pytest.fixture
def sample_mountain_doc():
    return {
        "mountainId": "mt-rainier",
        "name": "Mount Rainier",
        "lat": 46.8523,
        "lng": -121.7603,
        "elevations": {"base": 5400, "mid": 10000, "summit": 14411},
        "nwacZone": "west-slopes-south",
        "snotelStationId": "647",
    }

@pytest.fixture
def sample_active_project(sample_mountain_doc):
    return {
        "projectId": "proj-abc",
        "mountainId": "mt-rainier",
        "status": "active",
        "targetDateStart": "2026-08-02",
        "targetDateEnd": "2026-08-03",
        **{k: v for k, v in sample_mountain_doc.items() if k != "mountainId"},
    }

@pytest.fixture
def sample_open_meteo_response():
    """Minimal valid Open-Meteo response for testing."""
    hours = [f"2026-08-02T{h:02d}:00" for h in range(24)]
    return {
        "latitude": 46.85,
        "longitude": -121.76,
        "elevation": 14411.0,
        "timezone": "America/Los_Angeles",
        "hourly": {
            "time": hours,
            "temperature_2m": [20.0] * 24,
            "windspeed_10m": [30.0] * 24,
            "windgusts_10m": [45.0] * 24,
            "precipitation": [0.0] * 24,
            "snowfall": [0.0] * 24,
            "freezinglevel_height": [9500.0] * 24,
            "precipitation_probability": [10] * 24,
            "weathercode": [3] * 24,
        }
    }
```

**Example test file — `test_orchestrator.py`:**
```python
import base64
import json
import pytest
from cloudevents.http import CloudEvent
from unittest.mock import MagicMock, call

def make_cloud_event(payload: dict) -> CloudEvent:
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    return CloudEvent(
        attributes={"type": "google.cloud.pubsub.topic.v1.messagePublished", "source": "test"},
        data={"message": {"data": data}}
    )

class TestOrchestrator:
    def test_deduplicates_mountains_for_weather(self, mock_db, mock_publisher):
        mock_db.collection.return_value.where.return_value.where.return_value.stream.return_value = [
            MagicMock(to_dict=lambda: {"mountainId": "mt-rainier", "status": "active", "targetDateEnd": "2026-08-03"}),
            MagicMock(to_dict=lambda: {"mountainId": "mt-rainier", "status": "active", "targetDateEnd": "2026-08-03"}),
            MagicMock(to_dict=lambda: {"mountainId": "mt-baker",   "status": "active", "targetDateEnd": "2026-08-03"}),
        ]
        from orchestrator.main import orchestrate
        orchestrate(make_cloud_event({"type": "weather"}))
        assert mock_publisher.publish.call_count == 2

    def test_no_active_projects_exits_cleanly(self, mock_db, mock_publisher):
        mock_db.collection.return_value.where.return_value.where.return_value.stream.return_value = []
        from orchestrator.main import orchestrate
        orchestrate(make_cloud_event({"type": "weather"}))
        mock_publisher.publish.assert_not_called()

    def test_routes_nwac_by_zone(self, mock_db, mock_publisher):
        mock_db.collection.return_value.where.return_value.where.return_value.stream.return_value = [
            MagicMock(to_dict=lambda: {"mountainId": "mt-rainier", "nwacZone": "west-slopes-south", "status": "active", "targetDateEnd": "2026-08-03"}),
            MagicMock(to_dict=lambda: {"mountainId": "mt-adams",   "nwacZone": "west-slopes-south", "status": "active", "targetDateEnd": "2026-08-03"}),
        ]
        from orchestrator.main import orchestrate
        orchestrate(make_cloud_event({"type": "nwac"}))
        # Both mountains are in the same zone → only 1 NWAC message
        assert mock_publisher.publish.call_count == 1
```

### 12.2 Next.js Route Handlers — Vitest

**Testing stack:**
- `vitest` with `@vitejs/plugin-react`
- `@testing-library/react` for component rendering
- `msw` (Mock Service Worker) for mocking fetch calls within Route Handlers
- Coverage via Vitest's built-in coverage (uses v8 or istanbul)

**Route Handler test pattern:**
```typescript
// api/projects/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET, POST } from './route'

vi.mock('@/lib/firebase-admin', () => ({
  db: {
    collection: vi.fn().mockReturnValue({
      get: vi.fn().mockResolvedValue({ docs: [] }),
      add: vi.fn().mockResolvedValue({ id: 'new-project-id' }),
    })
  }
}))

describe('GET /api/projects', () => {
  it('returns empty array when no projects exist', async () => {
    const response = await GET()
    const data = await response.json()
    expect(data).toEqual([])
    expect(response.status).toBe(200)
  })
})
```

### 12.3 Coverage Enforcement in CI

Python: `pytest --cov-fail-under=90` causes a non-zero exit code → CI fails automatically.

Next.js (Vitest config in `vitest.config.ts`):
```typescript
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      thresholds: { lines: 90, functions: 90, branches: 85 },
    }
  }
})
```

---

## 13. Terraform — Infrastructure as Code

### 13.1 Resource Map

Every GCP resource is managed by Terraform. No manual console configuration.

| Resource | Terraform Resource | Module |
|---|---|---|
| GCP APIs (12 services) | `google_project_service` | `main.tf` |
| Service accounts (per function) | `google_service_account` | `iam` |
| IAM bindings | `google_project_iam_member` | `iam` |
| Cloud Storage bucket (weather data) | `google_storage_bucket` | `storage` |
| Cloud Storage bucket (satellite) | `google_storage_bucket` | `storage` |
| Cloud Storage bucket (function source) | `google_storage_bucket` | `storage` |
| GCS lifecycle rules | `google_storage_bucket_lifecycle_rule` | `storage` |
| Pub/Sub topics (5) | `google_pubsub_topic` | `pubsub` |
| Dead letter topic | `google_pubsub_topic` | `pubsub` |
| Cloud Functions × 5 (Python) | `google_cloudfunctions2_function` | `functions` |
| Cloud Scheduler jobs × 4 | `google_cloud_scheduler_job` | `scheduler` |
| Firestore database | `google_firestore_database` | `firestore` |
| Terraform state bucket | `google_storage_bucket` | `backend` (manual) |
| Firebase App Hosting | (Firebase CLI / manual for POC) | — |

### 13.2 Module Structure

```
terraform/
├── backend.tf                    # GCS remote state config
├── main.tf                       # providers, API enablement, module composition
├── variables.tf                  # project_id, region, env
├── outputs.tf                    # bucket names, function URLs
│
├── modules/
│   ├── iam/
│   │   ├── main.tf               # service accounts + IAM bindings per function
│   │   └── variables.tf
│   │
│   ├── storage/
│   │   ├── main.tf               # GCS buckets + lifecycle rules
│   │   └── variables.tf
│   │
│   ├── pubsub/
│   │   ├── main.tf               # topics + dead letter topic
│   │   └── variables.tf
│   │
│   ├── functions/
│   │   ├── main.tf               # all 5 Cloud Functions
│   │   ├── source.tf             # archive_file + GCS object per function
│   │   └── variables.tf
│   │
│   ├── scheduler/
│   │   ├── main.tf               # 4 Cloud Scheduler jobs
│   │   └── variables.tf
│   │
│   └── firestore/
│       ├── main.tf               # Firestore database resource
│       └── variables.tf
│
└── environments/
    ├── dev.tfvars                # project_id, env=dev, region
    └── prod.tfvars               # project_id, env=prod, region
```

### 13.3 Key Terraform Resources (Annotated)

**`main.tf` — API enablement (must run first, everything depends on it):**
```hcl
resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudfunctions.googleapis.com",
    "cloudscheduler.googleapis.com",
    "pubsub.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "eventarc.googleapis.com",
    "run.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "firebase.googleapis.com",
    "iam.googleapis.com",
    "secretmanager.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
```

**`modules/functions/main.tf` — Cloud Function (Python Gen 2, Pub/Sub triggered):**
```hcl
# Package and upload source code
data "archive_file" "weather_worker" {
  type        = "zip"
  source_dir  = "${path.root}/../functions/weather_worker"
  output_path = "/tmp/weather_worker_${var.env}.zip"
}

resource "google_storage_bucket_object" "weather_worker_source" {
  name   = "functions/weather-worker-${data.archive_file.weather_worker.output_md5}.zip"
  bucket = var.function_source_bucket
  source = data.archive_file.weather_worker.output_path
}

resource "google_cloudfunctions2_function" "weather_worker" {
  name     = "${var.env}-weather-worker"
  location = var.region

  build_config {
    runtime     = "python312"
    entry_point = "handle_message"
    source {
      storage_source {
        bucket = var.function_source_bucket
        object = google_storage_bucket_object.weather_worker_source.name
      }
    }
  }

  service_config {
    max_instance_count    = 100
    min_instance_count    = 0
    timeout_seconds       = 120
    memory                = "512Mi"
    service_account_email = var.weather_worker_sa_email
    environment_variables = {
      GCS_BUCKET_WEATHER  = var.weather_data_bucket_name
      FIRESTORE_PROJECT   = var.project_id
      ENV                 = var.env
    }
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic          = var.weather_refresh_topic_id
    retry_policy          = "RETRY_POLICY_RETRY"
    service_account_email = var.weather_worker_sa_email
  }

  depends_on = [
    google_project_iam_member.eventarc_sa_token_creator,
    google_project_service.required_apis,
  ]
}
```

**`modules/scheduler/main.tf`:**
```hcl
resource "google_cloud_scheduler_job" "hourly_weather" {
  name             = "${var.env}-hourly-weather-orchestrate"
  description      = "Triggers weather data refresh for all active projects"
  schedule         = "0 * * * *"
  time_zone        = "America/Los_Angeles"
  attempt_deadline = "60s"

  pubsub_target {
    topic_name = var.orchestrate_topic_id
    data       = base64encode(jsonencode({ type = "weather" }))
  }

  retry_config {
    retry_count = 1
  }
}

resource "google_cloud_scheduler_job" "daily_nwac" {
  name      = "${var.env}-daily-nwac-orchestrate"
  schedule  = "30 18 * * *"
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic_id
    data       = base64encode(jsonencode({ type = "nwac" }))
  }
}

resource "google_cloud_scheduler_job" "daily_snotel" {
  name      = "${var.env}-daily-snotel-orchestrate"
  schedule  = "0 7 * * *"
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic_id
    data       = base64encode(jsonencode({ type = "snotel" }))
  }
}

resource "google_cloud_scheduler_job" "weekly_satellite" {
  name      = "${var.env}-weekly-satellite-orchestrate"
  schedule  = "0 8 * * 0"
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic_id
    data       = base64encode(jsonencode({ type = "satellite" }))
  }
}
```

### 13.4 Terraform Workflow

```bash
# Initial setup (once, to create the state bucket)
gcloud storage buckets create gs://{project-id}-tfstate --location=us-west1

# Dev environment
cd terraform
terraform init -backend-config="bucket={project-id}-tfstate"
terraform plan -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars

# Production
terraform plan -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars

# Tear down dev
terraform destroy -var-file=environments/dev.tfvars
```

---

## 14. CI/CD Pipeline

### GitHub Actions Workflows

**`.github/workflows/test.yml`** — Runs on every PR and push to main:

```yaml
name: Tests

on:
  pull_request:
  push:
    branches: [main]

jobs:
  python-tests:
    name: Python Worker Tests (≥90% coverage)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: "pip"
      - run: pip install -r functions/requirements-dev.txt
      - run: pytest functions/
      - uses: actions/upload-artifact@v4
        with:
          name: python-coverage
          path: coverage.xml

  nextjs-tests:
    name: Next.js Tests (≥90% coverage)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
      - run: npm ci
      - run: npm run test:coverage
        env:
          VITEST_COVERAGE_THRESHOLD: "90"

  terraform-validate:
    name: Terraform Plan (Dev)
    runs-on: ubuntu-latest
    environment: dev
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.8.x"
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_DEV }}
      - run: terraform -chdir=terraform init
      - run: terraform -chdir=terraform validate
      - run: terraform -chdir=terraform plan -var-file=environments/dev.tfvars -no-color
```

**`.github/workflows/deploy.yml`** — Runs on merge to main:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy-infrastructure:
    name: Terraform Apply (Prod)
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
      - uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PROD }}
      - run: terraform -chdir=terraform init
      - run: terraform -chdir=terraform apply -var-file=environments/prod.tfvars -auto-approve

  # Firebase App Hosting handles Next.js deployment automatically
  # when it detects a push to the connected GitHub branch.
  # No additional deploy step needed for the Next.js app.
```

---

## 15. Repository Structure

```
mountain-weather/
│
├── app/                              # Next.js App Router pages
│   ├── layout.tsx                    # Root layout (header, fonts)
│   ├── page.tsx                      # Dashboard (/")
│   ├── projects/
│   │   ├── new/
│   │   │   └── page.tsx             # Create project
│   │   └── [id]/
│   │       ├── page.tsx             # Project detail
│   │       └── models/
│   │           └── page.tsx         # Full-screen model comparison
│   └── mountains/
│       ├── page.tsx                 # Browse mountains
│       └── [slug]/
│           └── page.tsx             # Mountain overview
│
├── api/                              # Route Handlers (Next.js /api/*)
│   ├── projects/
│   │   └── route.ts                 # GET (list), POST (create)
│   ├── projects/[id]/
│   │   ├── route.ts                 # GET, PATCH, DELETE
│   │   ├── weather/route.ts
│   │   ├── snapshots/route.ts
│   │   ├── nwac/route.ts
│   │   └── snotel/route.ts
│   ├── mountains/
│   │   └── route.ts
│   └── admin/
│       └── trigger-refresh/route.ts # Manual refresh trigger (dev/demo use)
│
├── components/                       # React components
│   ├── layout/
│   ├── dashboard/
│   ├── project/
│   ├── mountains/
│   └── shared/
│
├── lib/                              # Shared utilities (TypeScript)
│   ├── firebase-admin.ts             # Admin SDK singleton
│   ├── firebase-client.ts            # Client SDK
│   ├── storage.ts                    # Cloud Storage helpers
│   └── types.ts                      # Shared TypeScript interfaces
│
├── functions/                        # Python Cloud Functions
│   ├── shared/                       # Shared Python code
│   │   ├── __init__.py
│   │   ├── models.py                 # Pydantic models
│   │   ├── firestore_client.py
│   │   └── storage_client.py
│   │
│   ├── orchestrator/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── requirements.txt
│   │   └── tests/
│   │       ├── __init__.py
│   │       └── test_orchestrator.py
│   │
│   ├── weather_worker/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── open_meteo_client.py
│   │   ├── requirements.txt
│   │   └── tests/
│   │       ├── __init__.py
│   │       ├── test_main.py
│   │       └── test_open_meteo_client.py
│   │
│   ├── nwac_worker/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── nwac_client.py
│   │   ├── requirements.txt
│   │   └── tests/
│   │       ├── __init__.py
│   │       └── test_nwac_worker.py
│   │
│   ├── snotel_worker/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── requirements.txt
│   │   └── tests/
│   │       ├── __init__.py
│   │       └── test_snotel_worker.py
│   │
│   ├── satellite_worker/
│   │   ├── __init__.py
│   │   ├── main.py
│   │   ├── copernicus_client.py
│   │   ├── requirements.txt
│   │   └── tests/
│   │       ├── __init__.py
│   │       └── test_satellite_worker.py
│   │
│   ├── conftest.py                   # Shared pytest fixtures
│   ├── pyproject.toml                # pytest + coverage config
│   └── requirements-dev.txt          # pytest, pytest-cov, pytest-mock, etc.
│
├── terraform/                        # Terraform IaC
│   ├── backend.tf
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── modules/
│   │   ├── iam/
│   │   ├── storage/
│   │   ├── pubsub/
│   │   ├── functions/
│   │   ├── scheduler/
│   │   └── firestore/
│   └── environments/
│       ├── dev.tfvars
│       └── prod.tfvars
│
├── scripts/
│   └── seed-mountains.ts             # one-time script to populate mountains collection
│
├── .github/
│   └── workflows/
│       ├── test.yml
│       └── deploy.yml
│
├── .env.local.example                # template for local dev env vars
├── firebase.json                     # Firebase App Hosting config
├── next.config.ts
├── tailwind.config.ts
├── vitest.config.ts
├── package.json
└── README.md
```

---

## 16. Development Phases

### Phase 0 — Foundation (Week 1)

- [ ] GCP project creation and Firebase project setup
- [ ] Terraform backend (state bucket) and initial provider configuration
- [ ] GitHub repo setup, branch protection rules, GitHub Actions secrets
- [ ] `terraform apply` for core infrastructure: Pub/Sub topics, Cloud Scheduler jobs, Storage buckets, IAM service accounts
- [ ] Firebase App Hosting connected to GitHub repo
- [ ] Next.js project scaffolded and deploying to Firebase App Hosting (empty app, just confirms the deploy pipeline works)
- [ ] Firestore database initialized
- [ ] `scripts/seed-mountains.ts` written and run — populates the `mountains` collection with initial 10 peaks

### Phase 1 — Data Pipeline (Week 2)

- [ ] `shared/models.py` — Pydantic models for all data types, with tests
- [ ] `shared/firestore_client.py` — Firestore read/write helpers, with tests
- [ ] `shared/storage_client.py` — Cloud Storage read/write helpers, with tests
- [ ] `weather_worker/open_meteo_client.py` — Open-Meteo API client, with tests (≥90% coverage)
- [ ] `weather_worker/main.py` — full weather worker pipeline, with tests
- [ ] `orchestrator/main.py` — deduplication and fan-out, with tests
- [ ] Deploy weather worker and orchestrator to GCP via Terraform
- [ ] Manual test: trigger the orchestrator for a single mountain, verify data lands in Firestore and Cloud Storage
- [ ] Verify Cloud Scheduler → Pub/Sub → Orchestrator → WeatherWorker chain works end-to-end

### Phase 2 — NWAC, SNOTEL, Satellite (Week 2–3)

- [ ] `nwac_worker/nwac_client.py` — NWAC forecast fetcher and parser, with tests
- [ ] `nwac_worker/main.py` — NWAC worker pipeline, with tests
- [ ] `snotel_worker/main.py` — SNOTEL worker pipeline, with tests
- [ ] `satellite_worker/copernicus_client.py` — Copernicus API integration, with tests
- [ ] `satellite_worker/main.py` — satellite worker pipeline, with tests
- [ ] Deploy all workers, verify all four scheduled jobs fire correctly
- [ ] Confirm 90% coverage passes in CI for all Python workers

### Phase 3 — Next.js API Layer (Week 3)

- [ ] Firebase Admin SDK setup in Next.js
- [ ] All Route Handlers implemented: projects, weather, snapshots, nwac, snotel, mountains
- [ ] Route Handler tests with Vitest (≥90% coverage)
- [ ] `/api/admin/trigger-refresh` for demo use
- [ ] Manual end-to-end test: pin a mountain via API, trigger refresh, fetch weather via API

### Phase 4 — Dashboard & Core UI (Week 4)

- [ ] Dashboard page with project cards
- [ ] Create project form with mountain search
- [ ] Project detail layout with all section placeholders
- [ ] 7-day weather timeline (Recharts)
- [ ] NWAC avalanche panel with aspect/elevation rose
- [ ] SNOTEL snowpack panel with 30-day sparkline
- [ ] Satellite tile display

### Phase 5 — Signature Features (Week 5)

- [ ] Freezing Level Hero View (D3/SVG custom component) with time scrubber
- [ ] Multi-model comparison panel (HRRR vs GFS vs ECMWF)
- [ ] Forecast evolution timeline (snapshot history chart)
- [ ] Elevation band selector (Base / Mid / Summit tab switcher)

### Phase 6 — Polish & POC Readiness (Week 6)

- [ ] Responsive layout (mobile-friendly)
- [ ] Loading states, error boundaries, empty states
- [ ] Last-refreshed indicators on all panels
- [ ] Copy-link convenience button on project pages
- [ ] README with local dev setup instructions
- [ ] Final coverage check: Python ≥90%, Next.js ≥90%
- [ ] `terraform apply` to production environment
- [ ] Smoke test all features on production data
- [ ] POC demo-ready ✓

---

## 17. Open Questions for Detailed Plan

These are decisions not resolved in this seed plan that the detailed implementation plan should address:

**Data & API:**
1. NWAC data access method: JSON endpoint (preferred) vs HTML scraping (fallback). Need to confirm the current URL structure and any rate-limiting policies directly with NWAC or by inspection.
2. Open-Meteo Previous Runs API vs. our own snapshot storage for forecast evolution: the Previous Runs API would reduce Firestore storage needs but adds API dependency and has data availability limits. Decide which approach to implement.
3. Exact pressure-level-to-altitude mapping strategy for elevation bands. Need to validate that Open-Meteo's available pressure levels provide sufficient resolution for the three named elevation bands per mountain.
4. NWAC summer season handling: what data (if any) does NWAC publish in June–October? Does their forecast JSON endpoint return anything in summer, or only winter?

**Architecture:**
5. Cloud Storage access pattern: make weather-data bucket publicly readable for POC simplicity, or keep private and serve via Route Handler? Trade-off: simplicity vs. unnecessary public egress.
6. Firestore snapshot retention: implement via Firestore's native TTL field feature (simple) or a scheduled cleanup Cloud Function (more control). TTL is simpler for POC.
7. The `mountains` seed data: define the complete initial set of peaks and their metadata (coordinates, elevation bands, NWAC zone mapping, SNOTEL station mapping) before Phase 0. This is content work, not code.
8. Mapbox vs. Leaflet for the project creation map: Mapbox has better topographic tiles and a cleaner React SDK, but Leaflet is fully free. For the POC, Mapbox free tier (50k loads/month) is likely sufficient.

**Testing:**
9. Integration test strategy: the above outlines unit tests with mocks. Should we also write integration tests that hit the actual Open-Meteo API (in a test environment with a short expiry)? Useful for catching API schema changes, but slower and dependent on network. Decide on scope.
10. Firestore emulator: use Firebase's local Firestore emulator for integration tests that exercise Firestore reads/writes without hitting production? This is a significant quality improvement but adds setup complexity. Recommended for the detailed plan.

**UI/UX:**
11. Mobile layout priority: is the POC primarily desktop-focused (likely used on a laptop for trip planning) or should it be fully responsive from day one? Define breakpoints and mobile layout for Phase 6 polish.
12. Time zone display: all times in the UI should display in Pacific time (America/Los_Angeles). Confirm this is the desired UX, especially for users planning trips from other time zones.
13. Default elevation band on project detail: should the default view show Summit conditions or Base/Trailhead conditions? Summit is more interesting meteorologically but Base is more immediately relevant for departure planning.
14. NWAC danger scale colors: use the official NWAC/NAC color scheme (Green/Blue/Yellow/Orange/Red for 1–5) or adapt for colorblind accessibility? The official scheme has known accessibility issues. Consider using patterns + colors.

**Operational:**
15. Monitoring and alerting: Cloud Logging captures all worker logs. Should we set up Cloud Monitoring alerts for worker failure rates above a threshold? Useful even for POC to catch silent failures.
16. Cost controls: set GCP budget alerts at $10/month and $25/month thresholds to catch unexpected cost spikes during POC operation.
17. Dead-letter queue handling: messages that fail repeatedly land in the DLQ topic. For POC, just alert on DLQ message count. For production, build a retry/replay mechanism.

---

*End of Mountain Weather POC Seed Plan.*
*Version 1.0 — Generated June 2026.*
*Next step: use this document as input to create a sprint-level implementation plan with specific tickets, acceptance criteria, and time estimates.*
