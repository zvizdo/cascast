# Mountain Weatherman — Open Data Sources Research Reference

> **Purpose:** Neutral research reference for 12 open/free data sources relevant to WA/PNW
> Cascades mountaineering. No integration decisions here — those belong in a subsequent spec.
> Each source is assessed for data availability, access method, cadence, and feasibility.
>
> **Date:** 2026-06-15  
> **Scope:** Washington State / Pacific Northwest Cascade peaks  
> **Researched by:** 12 parallel agents, adversarially verified findings

---

## Template (applied to every source)

- **Overview** — what it is and why it matters for mountain planning  
- **Data types** — specific fields/variables available  
- **API / access** — endpoints, auth, response format  
- **Rate limits & terms** — call limits, registration, licensing  
- **Update cadence** — how often upstream data refreshes  
- **UI surface ideas** — 2–3 panel/widget ideas for the app  
- **Feasibility assessment** — complexity, caveats, risks

---

## Group 1 — Atmospheric & Hazard

### 1.1 AirNow API (EPA/NOAA — Air Quality)

**Overview**  
Free REST API operated by the U.S. EPA in partnership with NOAA, NPS, and 150+ state/local agencies.
Delivers near-real-time AQI observations and next-day forecasts from 2,500+ ground-level monitoring
stations. Wildfire smoke from WA/OR/CA fires is a major summer go/no-go factor for Cascade
mountaineers — this is the primary data source for that signal.

**Data types**

| Field | Type | Notes |
|---|---|---|
| `AQI` | int 0–500 | Overall air quality index |
| `Category.Number` | int 1–6 | 1=Good … 6=Hazardous |
| `Category.Name` | string | "Good", "Moderate", "Unhealthy for Sensitive Groups", "Unhealthy", "Very Unhealthy", "Hazardous" |
| `ParameterName` | string | "PM2.5", "PM10", "O3", "CO", "NO2", "SO2" |
| `DateObserved` | string `YYYY-MM-DD` | |
| `HourObserved` | int 0–23 | Local time |
| `ReportingArea` | string | e.g. "Seattle-Tacoma", "Wenatchee" |
| `Latitude` / `Longitude` | float | Monitoring station location |

One record per pollutant per reporting area. Current observations return 1–3 records per peak query
(one per active pollutant). Forecast responses add a `Discussion` narrative field for some areas.

**API / access**

- **Base URL:** `https://www.airnowapi.org/aq/`
- **Auth:** Free self-serve registration at `docs.airnowapi.org` → UUID API key via email
- **Key format:** `?API_KEY=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX` query param

Key endpoints:
```
# Current conditions by lat/lng (primary use)
GET /observation/latLong/current/?format=application/json
    &latitude={lat}&longitude={lng}&distance={miles}&API_KEY={key}

# Next-day forecast by lat/lng
GET /forecast/latLong/?format=application/json
    &latitude={lat}&longitude={lng}&date={YYYY-MM-DD}&distance={miles}&API_KEY={key}

# Historical observations
GET /observation/latLong/historical/?format=application/json
    &latitude={lat}&longitude={lng}&date={YYYY-MM-DDT{HH}-0000}&distance={miles}&API_KEY={key}
```

Example for Rainier area (50-mile radius):
```
GET https://www.airnowapi.org/aq/observation/latLong/current/
    ?format=application/json&latitude=46.852886&longitude=-121.760424
    &distance=50&API_KEY={key}
```

Response format: JSON array. Supports `application/json`, `text/csv`, `application/xml`.

**Rate limits & terms**

- 500 requests/hour per API key (per endpoint)
- Designed for point-in-time lookups; bulk DB population explicitly prohibited
- **License:** EPA Data License — U.S. government public domain, commercial use permitted
- **Attribution required:** credit "the appropriate source — federal, state, local, and tribal air
  quality agencies and the EPA AirNow program"
- Data is preliminary and unvalidated; must not be displayed as regulatory-grade
- For a hiking/planning app showing current AQI for informational purposes: **fully permitted use**

**Update cadence**

- Observations: **hourly** (new readings available 10–30 min past the hour)
- File products: twice per hour at :25 and :55
- Forecasts: once per day (published afternoon/evening prior day)
- Recommended poll interval for Mountain Weatherman: 1x/hour at :30 past; 1-hour TTL cache

**UI surface ideas**

1. **AQI Badge on peak cards:** Small colored chip (green/yellow/orange/red/purple/maroon) showing
   current AQI and category. Appears on dashboard cards during wildfire season.
2. **Smoke Alert Banner:** When PM2.5 AQI > 100, a dismissable banner on the project detail page:
   "Unhealthy air quality near [Peak] — wildfire smoke likely."
3. **24h AQI Sparkline:** Historical endpoint driving a trend line — is smoke clearing or worsening?

**Important caveat:** Nearest monitoring stations to Cascade peaks are valley towns 20–80 miles away
(Wenatchee, Bellingham, Yakima). Always surface `ReportingArea` name so users understand the data is
not a summit reading.

**Feasibility assessment**

✅ **Easy win.** Zero friction to integrate:
- Self-serve API key, email only
- Public domain data, commercial use permitted  
- lat/lng + distance endpoint maps directly to the app's per-peak model
- 500 req/hr >> 10 peaks × 1 req/hr
- Python wrapper available: `pyairnow 1.3.1` (Python 3.9–3.13, async support)
- Hourly cadence matches existing weather pipeline

No licensing risk. No reliability risk. The only caveat is geographic distance to monitoring stations,
which must be communicated in the UI.

---

### 1.2 NOAA Lightning Data

**Overview**  
Lightning strike data divides into three tiers with very different access models. **No single free
source provides precise real-time ground-based strike coordinates.** The commercial standard (Vaisala
NLDN) is inaccessible for a free consumer app. The most practical free path is the NWS Alerts API
(polygon-based thunderstorm warnings, zero auth) + SPC Convective Outlooks (day-of thunderstorm risk).
GOES-16/19 GLM satellite data is genuinely free and open but requires S3 access and NetCDF4 parsing,
and delivers only 8–14 km pixel resolution.

**Data types**

| Source | Fields | Precision | Access |
|---|---|---|---|
| **NWS Alerts API** | `event`, `headline`, `description`, `areaDesc`, `effective`, `expires`, polygon WKT | Threat polygon (~county) | Free, no key |
| **SPC Convective Outlooks** | `label` (TSTM/SLGT/ENH/MDT/HIGH), `label2`, `valid`, `expire`, `fill` (hex color) | Day-scale polygon | Free, no key |
| **GOES GLM (S3)** | `flash_lat`, `flash_lon`, `flash_time_offset_of_first_event`, `flash_energy`, `flash_area` | 8–14 km pixel | Free, AWS S3 |
| **Vaisala NLDN** | Strike lat/lon, time, polarity, peak current (kA), multiplicity | ~500 m | Commercial, not accessible |
| **Blitzortung.org** | Real-time crowdsourced strikes | ~1 km | Non-commercial only — prohibited |

**API / access**

NWS Alerts API (primary recommended approach):
```
# Active alerts at a lat/lng point
GET https://api.weather.gov/alerts/active?point={lat},{lon}
    &event=Severe+Thunderstorm+Warning

# Active alerts for WA state
GET https://api.weather.gov/alerts/active?area=WA
```
No API key. User-Agent header required (`"(MountainWeatherman, your@email.com)"`).
Response: GeoJSON FeatureCollection. No `lightning` event type — use "Severe Thunderstorm Warning"
and "Severe Thunderstorm Watch".

SPC Convective Outlook MapServer (ArcGIS REST):
```
# Day 1 categorical outlook, point intersection
GET https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/
    SPC_wx_outlks/MapServer/1/query
    ?geometry={lon},{lat}&geometryType=esriGeometryPoint
    &spatialRel=esriSpatialRelIntersects&inSR=4326&outFields=*&f=geojson
```
Returns `label` ("TSTM") and `label2` ("General Thunderstorms Risk") — display-ready text.

GOES GLM on AWS S3:
```
s3://noaa-goes19/GLM-L2-LCFA/{year}/{day_of_year}/{hour}/
```
NetCDF4 files, one per ~20 seconds. Requires Python `xarray`/`netCDF4` to parse, then spatial filter
on `flash_lat`/`flash_lon` within a radius of the peak.

**Rate limits & terms**

- NWS Alerts: no published hard limit; US government data, free
- SPC MapServer: no published rate limit; US government data, free
- GOES GLM on AWS: free NOAA Open Data Dissemination; no licensing restriction
- Blitzortung: commercial use **explicitly prohibited** — cannot be used in Mountain Weatherman
- Vaisala NLDN: commercial license required, no public pricing

**Update cadence**

- NWS Severe Thunderstorm Warnings: issued by local offices in real time; expire in 1–2 hours
- SPC Convective Outlooks: Day 1 issued ~5am PDT and updated 2–3× per day
- GOES GLM: one NetCDF4 file every ~20 seconds, 30–60 second S3 delivery latency

**UI surface ideas**

1. **Alert Banner (recommended):** Poll `api.weather.gov/alerts/active?point={lat},{lon}` every
   5 minutes. If "Severe Thunderstorm Warning" or "Watch" is active, show a red/orange banner with
   `headline` and `expires`. Zero dependencies, zero cost.
2. **SPC Storm Risk Badge:** Query SPC MapServer for the peak's coordinates. If `label == "TSTM"` or
   higher, show "General Thunderstorm Risk Today" in yellow, updated once per day. Single REST call.
3. **GOES GLM Lightning Indicator (V2):** Download latest GLM NetCDF4 files from S3, filter flashes
   within 50 km of peak, count in past 60 min. Show "Lightning Detected Nearby" with count. High
   engineering cost, 8–14 km imprecision, ~70% daytime detection. Not recommended for POC.

**Feasibility assessment**

✅ **NWS Alerts + SPC Outlook: Easy win.**  
Both are single REST GETs, zero auth, free, US gov public domain. Live test against Rainier
coordinates confirmed correct GeoJSON FeatureCollection response. Implement both for POC.

⚠️ **GOES GLM: Medium complexity, V2.**  
Free and open data, but requires: AWS SDK in Cloud Functions, NetCDF4 parsing, per-20s file polling,
spatial filtering. Engineering cost ~1–2 days. 8–14 km resolution means "lightning in general area,"
not "lightning at summit." Daytime detection drops to ~70% — worst during afternoon thunderstorm risk.

❌ **Vaisala NLDN / Blitzortung: Not viable.**  
Commercial license or explicitly prohibited for commercial use.

**Critical limitation:** The UI must clearly communicate "NWS Severe Thunderstorm Warning in effect"
not "Lightning detected at this location." No free source provides the latter.

---

### 1.3 PNSN Seismic & Volcanic Data

**Overview**  
The primary programmatic path for WA Cascades seismic/volcanic data is the **USGS ComCat FDSN Event
API** at `earthquake.usgs.gov/fdsnws/event/1/`. PNSN (Pacific Northwest Seismic Network) does NOT
offer its own developer API — it contributes data to the ANSS/ComCat catalog under network code `UW`.
The **USGS HANS Volcano API** provides a separate, simpler JSON feed for alert levels (GREEN/YELLOW/
ORANGE/RED) and narrative notices for all 5 WA Cascade volcanoes. Together, these two free APIs cover
the full volcanic seismic story without any licensing or auth requirement.

**Data types**

ComCat FDSN Event API (GeoJSON per earthquake):

| Field | Type | Notes |
|---|---|---|
| `mag` | float | Magnitude value |
| `magType` | string | ml, md, mw, mb, etc. |
| `time` | epoch ms | Origin time |
| `latitude` / `longitude` | float | Hypocenter |
| `depth` | float km | Depth below surface |
| `type` / `eventtype` | string | "earthquake", "volcanic eruption", "volcanic explosion", "ice quake", "snow avalanche", etc. |
| `net` | string | `UW` = PNSN for PNW events |
| `status` | string | "automatic" or "reviewed" |
| `sig` | int 0–1000 | USGS significance score |
| `place` | string | "5 km NW of Mount Rainier, WA" |

HANS Volcano API (per volcano):

| Field | Notes |
|---|---|
| `alertLevel` | NORMAL / ADVISORY / WATCH / WARNING |
| `colorCode` | GREEN / YELLOW / ORANGE / RED |
| `volcano_name` | "Mount Rainier" |
| `nvews_threat` | "Very High Threat" (Rainier's NVEWS tier) |
| `newest_notice_url` | Link to latest narrative VONA notice |

WA Cascade volcano IDs for HANS: Rainier=`wa6`, Baker=`wa2`, Adams=`wa1`, St Helens=`wa4`,
Glacier Peak=`wa3`.

**API / access**

ComCat FDSN Event API — no auth, no key:
```
# Recent M≥0 earthquakes within 30 km of Rainier (last 30 days)
GET https://earthquake.usgs.gov/fdsnws/event/1/query
    ?format=geojson
    &latitude=46.853&longitude=-121.76
    &maxradiuskm=30
    &minmagnitude=0
    &starttime=YYYY-MM-DD
    &endtime=YYYY-MM-DD
    &contributor=uw   # PNSN-attributed events
    &orderby=time

# Count only (cheaper)
GET https://earthquake.usgs.gov/fdsnws/event/1/count
    ?format=geojson&latitude=46.853&longitude=-121.76&maxradiuskm=30&minmagnitude=0
```

HANS Volcano API — no auth, no key:
```
# All monitored volcanoes with current alert/color
GET https://volcanoes.usgs.gov/hans-public/api/volcano/getMonitoredVolcanoes

# Single volcano
GET https://volcanoes.usgs.gov/hans-public/api/volcano/getVolcano/wa6

# Latest narrative notice (seismic summary text)
GET https://volcanoes.usgs.gov/hans-public/api/volcano/newestForVolcano/wa6
```

Pre-filtered real-time feeds (earthquake.usgs.gov/earthquakes/feed/v1.0/):
- Past hour: updated every minute
- Past day/7 days: updated every minute
- Past 30 days: updated every 15 minutes

**Rate limits & terms**

- ComCat: US gov public domain; max 20,000 results per query; HTTP 429 if rate exceeded (exact
  numeric threshold not published; generous for non-continuous polling)
- HANS: US gov public domain; no published rate limit
- **ShakeAlert:** NOT publicly accessible — requires a formal USGS ShakeAlert Pilot License
  Agreement. No public JSON/REST API. Do NOT attempt to integrate without a USGS license.
- ComCat server-side cache: 60 seconds — polling more frequently returns no new data
- PNSN has no proprietary API; PNSN data flows through ComCat (`net=UW`)

**Update cadence**

- Automatic earthquake locations: available within minutes of event
- Reviewed (human-verified) locations: hours to days after event
- Rainier baseline: ~9–10 earthquakes/month (magnitudes -1 to 2); swarms can produce 1,000+ events
  in days (e.g. July 2025: 1,350 events in one swarm)
- HANS alert level: updated when USGS issues a Volcano Observatory Notice (VONA); months between
  updates during normal periods; potentially daily during elevated activity
- Real-time feeds: updated every 1 minute (past hour/day/7d) or every 15 min (past 30d)

**UI surface ideas**

1. **Volcano Seismic Status Chip:** Pull HANS `getVolcano/{id}` + `newestForVolcano/{id}`. Show
   alert color, date of last notice, one-sentence summary from notice text. Update daily. Applies
   to all 5 WA Cascade peaks in the app.
2. **Recent Seismicity Panel:** ComCat query for M≥0 within 20–30 km of summit, past 30 days. Show
   event count, largest magnitude, depth range, time of most recent event. Swarm alert badge if
   count in past 7 days significantly exceeds 30-day baseline.
3. **Notable Events Feed:** Filter for M≥2.0 events near each peak. Show most recent 3–5 as a
   scrollable list with magnitude, depth, time, distance from summit.

**Feasibility assessment**

✅ **High feasibility.** Two complementary free APIs, both fully public, no auth, well-documented,
used by hundreds of apps. ComCat gives per-earthquake structured data; HANS gives alert level + narrative
text. The combination covers the complete volcanic seismic story for all 5 WA peaks.

Cache ComCat in Firestore for 1 hour; HANS alert level for 24 hours (1 hour during elevated activity).
Data volume is low — Rainier averages ~10 events/month under normal conditions.

Tremor count data (episodic tremor and slip, volcanic tremor) is NOT available as a structured API
field — appears only in narrative VONA text. ShakeAlert requires a USGS license. These are the only
two functional gaps.

---

## Group 2 — Snow & Terrain

### 2.1 MODIS MOD10A1 Snow Cover (NASA)

**Overview**  
MOD10A1 v061 (MODIS/Terra Snow Cover Daily L3 Global 500m) is a free NASA dataset produced daily at
500 m resolution from the Terra satellite, continuously available since 2000-02-24. It is the primary
free daily snow cover product for the WA Cascades. The fundamental limitation in this geography is
cloud cover: the maritime Pacific Northwest has very high cloud frequency, and MOD10A1 maps only
cloud-free pixels. Peer-reviewed studies evaluating MOD10A1 over the Pacific Northwest found cloud
cover is the primary limitation, with many winter/spring scenes entirely cloud-obscured over the
Cascades. Useful for weekly snow context and historical comparison, not reliable as a daily snow
line estimate.

**Data types**

Key Science Data Sets (SDS) in each HDF-EOS2 file (500 m pixels):

| Field | Values | Notes |
|---|---|---|
| `NDSI_Snow_Cover` | 0–100 | Normalized Difference Snow Index; >40 indicates snow. Special: 250=Cloud, 239=Ocean, 237=Inland water, 255=Fill |
| `NDSI_Snow_Cover_Basic_QA` | 0=Best, 1=Good, 2=Ok | First-pass quality filter |
| `NDSI_Snow_Cover_Algorithm_Flags_QA` | 8-bit flags | Algorithm screening results |
| `Snow_Albedo_Daily_Tile` | 1–100% | Snow albedo; degraded in complex terrain like Cascades |
| `NDSI` | 0–10000 | Raw pre-screening NDSI (multiply ×0.0001 for actual value) |

Tile geometry: Sinusoidal projection, ~2400×2400 pixels. WA Cascades: primarily tile **h09v04**.
One overpass per day; Terra crosses WA ~10:30 AM local solar time.

**API / access**

Three routes with different auth requirements:

**Route 1 — NASA GIBS WMTS (map tiles, NO auth):**  
Pre-rendered PNG tiles for visual overlays. Cannot extract numeric NDSI values — visualization only.
```
# REST template (no auth)
https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/
  MODIS_Terra_L3_NDSI_Snow_Cover_Daily/default/
  {YYYY-MM-DD}/GoogleMapsCompatible/{Z}/{Y}/{X}.png

# 8-day composite (better for maritime climates)
MODIS_Terra_L3_Snow_Extent_8Day
```
GetCapabilities: `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/wmts.cgi?SERVICE=WMTS&REQUEST=GetCapabilities`  
Access constraints: none. Fees: none.

**Route 2 — AppEEARS API (quantitative extraction, requires free NASA Earthdata Login):**  
Async batch extraction to CSV or GeoTIFF. Submit task → poll status → download result.
```
POST https://appeears.earthdatacloud.nasa.gov/api/task
Authorization: Bearer {token from /api/login}

Body: {
  "task_type": "point",
  "product": "MOD10A1.061",
  "layers": ["NDSI_Snow_Cover", "NDSI_Snow_Cover_Basic_QA"],
  "coordinates": [{"latitude": 46.853, "longitude": -121.76, "id": "rainier"}],
  "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD"
}
```

**Route 3 — Direct download (free NASA Earthdata Login):**  
`https://n5eil01u.ecs.nsidc.org/MOST/MOD10A1.061/{YYYY.MM.DD}/...`  
HDF-EOS2 format; requires GDAL conversion to GeoTIFF/WGS84.

**Rate limits & terms**

- GIBS WMTS: no documented rate limit; designed for high-volume web map tile serving. No auth.
- AppEEARS: HTTP 429 on overload; implement exponential backoff; no published per-user limit
- **License:** NASA Earth science data is open and free with no licensing restrictions
- **Citation required:** `DOI 10.5067/MODIS/MOD10A1.061`, Hall & Riggs (2021)
- Free NASA Earthdata Login required for AppEEARS and direct download (NOT for GIBS)

**Update cadence**

- Satellite overpass: once per day, ~10:30 AM local solar time over WA Cascades
- Standard L3 product: 1–5 days latency after acquisition
- Near-real-time (NRT) via LANCE: ~3 hours after overpass (less quality-processed)
- GIBS NRT tiles: ~3 hours after overpass; standard L3 tiles: 1–5 days
- Cloud gap-filling caveat: In the maritime Cascades, cloud cover can obscure MODIS on the majority
  of winter/spring days; useful clear-sky data frequency may be only 20–40% of days. The 8-day
  composite product (MOD10A2 / layer `MODIS_Terra_L3_Snow_Extent_8Day`) substantially improves
  coverage and is recommended over the daily product for Mountain Weatherman's weekly refresh cadence.

**UI surface ideas**

1. **GIBS Snow Map Tile Overlay (zero effort):** Add a WMTS layer over the peak map using
   `MODIS_Terra_L3_NDSI_Snow_Cover_Daily` — colored snow extent overlay at 500 m resolution, no
   backend required. Use the 8-day composite as fallback when daily is all-cloud.
2. **AppEEARS Summit Snow Badge (weekly):** Backend job submits point request for each peak's
   summit coordinates, requesting `NDSI_Snow_Cover` over the past 30 days. Drive a "Snow on summit"
   indicator showing the most recent cloud-free observation date and coverage.
3. **Cloud-free date indicator:** Always show acquisition date alongside any MODIS snow display.
   "Last clear satellite pass: 6 days ago." Honest about the cloud limitation.

**Feasibility assessment**

✅ **GIBS tile overlay: Easy win.** Zero auth, zero backend, add one tile layer URL to map. 

⚠️ **AppEEARS quantitative extraction: Medium complexity.** Requires free NASA Earthdata Login
(automatable via Secret Manager), async batch job, GeoTIFF/CSV parsing. Similar complexity to
existing CDSE Sentinel Hub integration. Worth doing if numeric NDSI values per peak are needed.

⚠️ **Terra operational risk:** Terra satellite is past design life; in Lights-Out-Operations mode
since July 2023. Data gaps are possible. Aqua/MYD10A1 is a parallel product with identical fields
(network code MYD vs MOD) and should be considered as a complementary/fallback source.

The cloud cover limitation in maritime PNW is the dominant practical constraint — plan for a "no
cloud-free data available" state in the UI for many winter/spring days.

---

### 2.2 Landsat Collection 2 Level-2 (USGS/NASA)

**Overview**  
Landsat 8 and 9 (L8/L9) are joint USGS/NASA satellites carrying OLI (9 optical bands) and TIRS (2
thermal infrared bands). Collection 2 Level-2 (C2L2) provides atmospherically-corrected surface
reflectance (SR) and surface temperature (ST) products. The unique value-add over the already-
integrated Sentinel-2 is the **TIRS thermal band** — Sentinel-2 has no thermal capability, whereas
Landsat TIRS enables land surface temperature retrieval at the summit/glacier. Everything else
(visible imagery, snow detection, NDSI) Sentinel-2 does better or equivalently at 10 m vs. Landsat's
30 m resolution with faster 5-day vs. 8-day revisit. Data is U.S. public domain; permanently free.

**Data types**

Surface Reflectance (C2L2-SR) — OLI Bands 1–7, 30 m resolution:
- B1 Coastal/Aerosol (0.43–0.45 µm), B2 Blue (0.45–0.51 µm), B3 Green (0.53–0.59 µm)
- B4 Red (0.64–0.67 µm), B5 NIR (0.85–0.88 µm), B6 SWIR1 (1.57–1.65 µm), B7 SWIR2 (2.11–2.29 µm)
- Scale: `SR = DN × 0.0000275 − 0.2` (valid range 0–1)

Surface Temperature (C2L2-ST) — TIRS Band 10 (10.6–11.2 µm), 30 m (natively 100 m):
- Scale: `ST = DN × 0.00341802 + 149.0` (Kelvin)
- Absolute accuracy: Band 10 bias −0.3 K, RMSD ~0.5 K
- L9 TIRS-2 has hardware fix for stray-light artifact present in L8

Level-3 derived products (already computed by USGS, free):
- **Fractional Snow Covered Area (fSCA):** per-pixel % snow, 30 m, 1984–present
- Dynamic Surface Water Extent (DSWE)
- Burned Area

File format: Cloud-Optimized GeoTIFF (COG), unsigned 16-bit integer.

**API / access**

Three access paths:

**Path 1 — USGS STAC API (recommended):**
```
# Scene discovery (no M2M approval needed)
GET https://landsatlook.usgs.gov/stac-server/collections
    # Collections: landsat-c2l2-sr, landsat-c2l2-st

# Spatial/temporal search
POST https://landsatlook.usgs.gov/stac-server/search
Body: {
  "collections": ["landsat-c2l2-st"],
  "bbox": [-122.1, 46.7, -121.4, 47.1],
  "datetime": "2026-06-01/2026-06-15",
  "query": {"eo:cloud_cover": {"lt": 30}}
}
```
STAC metadata queries are free; actual file downloads come from S3 (requester-pays).

**Path 2 — AWS S3 (requester-pays):**
```
s3://usgs-landsat/collection02/{level}/{projection}/{sensor}/{year}/{path}/{row}/{product_id}/
```
Requires `--request-payer requester`. Egress: ~$0.09/GB; single scene ~$0.10–0.18.
SNS notification: `arn:aws:sns:us-west-2:673253540267:public-c2-notify-v2`

**Path 3 — USGS M2M REST API:**  
Requires free USGS EROS account + explicit M2M access approval (not instant). Authentication via
username/password → bearer token (~2h expiry). More heavyweight than STAC for this use case.

**Rate limits & terms**

- STAC API at landsatlook.usgs.gov: no rate limit documented for metadata queries
- S3 requester-pays: standard AWS egress pricing (~$0.09/GB); no rate limit
- **License:** USGS explicitly states Landsat data is "in the public domain... Permission is not
  required for use." No restrictions on redistribution or commercial use. Attribution requested.
- GEE (Google Earth Engine) has full Landsat C2 archive but ToS prohibit commercial use without
  commercial license

**Update cadence**

- Combined L8 + L9 revisit: ~8 days at mid-latitudes (L8 and L9 are offset by 8 days)
- Landsat 9 C2L2 products: ~3 days latency after acquisition
- Landsat 8 C2L2: Tier assignment takes 14–16 days, then Level-2 within 24–72 hours
  (L8 is NOT viable for near-real-time use)
- Cloud cover in PNW Cascades: same maritime limitation as MODIS — winter/spring clear scenes
  may be 4–8+ weeks apart per peak
- Historical archive back to 1982 (Landsat 4/5 TM)

**UI surface ideas**

1. **Thermal Surface Temperature Panel:** Display land surface temperature (°F, converted from
   Kelvin) at the summit bounding box from the most recent cloud-free Landsat 9 scene. Directly
   relevant for assessing snow/ice surface conditions vs. air temperature from models. Complement
   the existing FreezingLevelHero. Always show scene date and staleness.
2. **fSCA Historical Snowpack Chart:** The L3 fSCA product (1984–present, free from USGS) enables
   a "% snow covered this week vs. historical median" sparkline — snowpack anomaly context with no
   extra computation needed.
3. **NDSI Timeline:** Combined Landsat + Sentinel-2 NDSI values across a season for denser temporal
   sampling (Sentinel: 10m/5d; Landsat: 30m/8d; together ~2.3d average revisit).

**Feasibility assessment**

⚠️ **Medium complexity, but thermal band is genuinely unique.**  
Sentinel-2 cannot provide thermal data; this is Landsat's sole differentiator for Mountain
Weatherman. STAC + S3 is the cleanest access path, avoiding M2M approval overhead. Cost is negligible
(~$0.10–0.18/scene; ~10 peaks × 1–2 scenes/month = under $0.50/month).

The existing `satellite_worker` already handles GCS upload, OAuth flows, and per-scene image
processing — extending it to pull one TIRS band from the USGS STAC API and compute mean surface
temperature for a bounding box is ~1–2 days of engineering work.

Cloud cover is the dominant operational constraint (same as MODIS). Use as an opportunistic data
layer — display when a recent clear-sky scene exists, with clear date/staleness labeling.

---

## Group 3 — Hydrology

### 3.1 USGS Water Data API (Stream Gauges)

**Overview**  
USGS National Water Information System (NWIS) provides real-time and historical streamflow, gage
height, water temperature, and precipitation from thousands of automated monitoring stations. For
Mountain Weatherman, stream gauge data is a **river-crossing and approach-route safety signal** —
swollen rivers (e.g., Carbon River on Rainier's Carbon Glacier approach, Nooksack on Baker's
approaches) are a common mountaineering hazard during snowmelt events and storms. Data is free with
no API key required for basic use, updates at 15-minute intervals, and is in the U.S. public domain.

**Important:** As of 2026, USGS is mid-migration from legacy `waterservices.usgs.gov` to a new
OGC-compliant API at `api.waterdata.usgs.gov`. WaterWatch (the flood/drought context layer) was
**decommissioned February 26, 2026**. The legacy API is expected to begin degrading ~August 2026
with full decommission ~Q1 2027.

**Data types**

| Parameter Code | Name | Units |
|---|---|---|
| `00060` | Discharge (streamflow) | ft³/s (cfs) |
| `00065` | Gage height | ft |
| `00010` | Water temperature | °C |
| `00045` | Precipitation total | inches |
| `63680` | Turbidity | FNU (Formazin Nephelometric Units) |

Not all parameters at every site. Most Cascade approach gauges measure `00060` and `00065` as
primary parameters.

**Key WA Cascade approach gauges identified:**

| Mountain / Route | Gauge | Site ID |
|---|---|---|
| Rainier (Carbon Glacier) | Carbon River Near Fairfax, WA | 12094000 |
| Baker (north approaches) | Nooksack River at Deming, WA | 12210500 |
| Adams (Cispus approach) | Cispus River AB Yellowjacket Cr near Randle, WA | 14231900 |
| Adams (White Salmon approach) | White Salmon River near Underwood, WA | 14123500 |

Note: Ohanapecosh River (Rainier east) and Cowlitz River (Adams south) site IDs not retrieved —
verify via `maps.waterdata.usgs.gov` before implementation.

**API / access**

New OGC API (use this — future-proof):
```
# Latest single reading per gauge
GET https://api.waterdata.usgs.gov/ogcapi/v0/collections/latest-continuous/items
    ?monitoringLocationNumber=12094000&parameterCode=00060&f=json

# Time series (last 7 days)
GET https://api.waterdata.usgs.gov/ogcapi/v0/collections/continuous/items
    ?monitoringLocationNumber=12094000&parameterCode=00060&f=json

# Annual peak flows (flood stage reference)
GET https://api.waterdata.usgs.gov/ogcapi/v0/collections/peaks/items
    ?monitoringLocationNumber=12094000&f=json

# Free API key signup (1,000 req/hr tier)
https://api.waterdata.usgs.gov/signup
```
Response: GeoJSON FeatureCollection (flat, one feature per observation). Fields: `monitoring_location_number`,
`monitoring_location_name`, `parameter_code`, `unit_of_measure`, `value`, `time`, `approval_status`
("Provisional"/"Approved"), `geometry` (lat/lon).

Legacy API (still functional, decommission ~2027):
```
GET https://waterservices.usgs.gov/nwis/iv/
    ?sites=12094000&parameterCd=00060&period=PT2H&format=json
```
No key required. Complex nested WaterML JSON schema.

**Rate limits & terms**

- Without API key: ~50 req/hr (per IP); with free API key: 1,000 req/hr
- Free API key signup at `api.waterdata.usgs.gov/signup` (managed via api.data.gov)
- **License:** U.S. government public domain under 17 U.S.C. § 105. Free to use commercially.
- Attribution requested: "Data provided by the U.S. Geological Survey"
- Real-time data is labeled "Provisional, subject to revision" — acceptable for a safety-context
  app where timeliness matters more than archival precision

**Update cadence**

- Continuous (IV) values: **15-minute intervals** from automated sensors
- Data typically available within 1–4 hours of collection (satellite-relay gauges transmit every 4h;
  cellular gauges faster)
- Daily values: once per day (aggregated from instantaneous)
- `latest-continuous` endpoint: single most-recent reading per site/parameter

**UI surface ideas**

1. **Approach River Status Tile:** Current streamflow (cfs) and gage height (ft) for the nearest
   approach gauge with a colored status indicator: normal / elevated / flood stage. Example: Carbon
   River (12094000) for Rainier Carbon Glacier route.
2. **48h Flow Sparkline:** Past 48 hours of streamflow as an inline SVG — visually obvious whether
   flow is rising (snowmelt/rain) or falling (clearing). Pairs with existing hand-built SVG approach.
3. **Crossing Advisory Label:** Text label derived from gage height vs. historical peak thresholds:
   "River crossing: Safe / Caution / Dangerous / Impassable."

**Feasibility assessment**

✅ **High feasibility. Medium-high integration priority.**  
The new OGC API is production-ready, returning clean GeoJSON FeatureCollections. The `latest-continuous`
endpoint gives exactly one reading per site per call — minimal overhead. Cache in Firestore (same
pattern as `snotelData`), refresh every 15–30 minutes. Get a free API key to stay within rate limits
when fanning out across 10 peaks.

Only significant gap: WaterWatch flood/drought context (percentile flows by day-of-year) was
decommissioned Feb 26, 2026. Its replacement statistics are now in WDFN Monitoring Location Pages
but no machine-readable percentile-flow API has been announced yet. For flood stage context, use the
annual peaks collection or NWS flood stage values instead.

---

## Group 4 — Route & Trail

### 4.1 OpenStreetMap (Overpass API) & OpenBeta

**Overview**  
The original Mountain Project API shut down permanently in late 2020 after acquisition by onX Maps;
no new API keys are being issued. The open-data community replacement is **OpenBeta** — a CC0-licensed
climbing route database with a public GraphQL API. For trail and peak data, the **Overpass API** is
the most practical free path: it queries live OSM data in real time via structured QL queries, returns
GeoJSON, requires no auth, and WA peak nodes (Rainier, Baker, Adams, etc.) are confirmed in OSM with
elevation, wikidata IDs, and prominence. Waymarked Trails is a thin OSM derivative with sparse WA
coverage — not recommended as a primary source.

**Data types**

Overpass API — OSM peak nodes (`natural=peak` or `natural=volcano`):
- `name`, `ele` (elevation in meters), `prominence`, `alt_name`, `wikidata`, `gnis:feature_id`
- Mount Rainier confirmed: node 1744903493, lat 46.8522, lon -121.7575, `natural=volcano`,
  `ele=4392m`, `alt_name=Tahoma`, `prominence=4037m`, `wikidata=Q194057`

Overpass API — hiking route relations (`type=route, route=hiking`):
- `name`, `network` (iwn/nwn/rwn/lwn), `ref`, `operator`, `description`, `website`
- Member ways carry `sac_scale` tag:
  `hiking → mountain_hiking → demanding_mountain_hiking → alpine_hiking → demanding_alpine_hiking → difficult_alpine_hiking`

OpenBeta GraphQL — climbing route objects:
- `areaName`, `metadata.lat`, `metadata.lng`, climb names, grades (YDS/French/UIAA/Ewbanks),
  `type` (sport/trad/boulder/alpine), `fa` (first ascent name), route description, protection notes
- License: CC0 (public domain)
- Does NOT yet contain tick/ascent records — route metadata only

**API / access**

Overpass API — no auth, no key:
```
# WA peaks query
[out:json][timeout:25];
(
  node["natural"="peak"](47.0,-124.7,49.0,-116.9);
  node["natural"="volcano"](47.0,-124.7,49.0,-116.9);
);
out body;

# Hiking routes near a peak (with geometry)
[out:json][timeout:25];
relation["route"="hiking"](46.7,-122.2,47.1,-121.3);
out geom;

# POST or GET to:
https://overpass-api.de/api/interpreter   # primary
https://overpass.osm.ch/api/interpreter   # mirror
```
Interactive builder: `https://overpass-turbo.eu/`

OpenBeta GraphQL — no auth, no key:
```
# POST to https://api.openbeta.io
{
  areas(filter: { area_name: { match: "Washington" } }) {
    areaName
    metadata { lat lng }
    children { areaName }
  }
}
```

**Rate limits & terms**

- Overpass: guideline of <10,000 queries/day and <1 GB/day. HTTP 429 on overload (confirmed during
  research). Cache results; include `User-Agent` or `Referer` header identifying the app.
- **OSM License:** ODbL (Open Database License). **Attribution required:** `© OpenStreetMap contributors`
  with link to `openstreetmap.org/copyright`. ODbL share-alike applies to derived databases; display
  use just requires attribution.
- OpenBeta: no published rate limits. CC0 license — public domain, no attribution required (but
  attribution to OpenBeta is good practice).
- Mountain Project: API permanently shut down. Zero access path.
- Waymarked Trails: OSM/ODbL (same attribution); sparse WA coverage confirmed by live test
  returning empty array for WA bounding box — skip as primary source.

**Update cadence**

- Overpass: reflects live OSM data; database updated continuously from OSM minutely diffs (1–2
  minutes behind live edits). Timestamp in responses: `"2026-06-16T04:32:00Z"` confirmed.
- OpenBeta: community-contributed, updated as contributors add/edit climbs. No stated sync cadence.
- OSM Cascade technical route coverage: Peak nodes and major hiking approaches are present. Specific
  glacier/technical routes (Disappointment Cleaver, Coleman Glacier Headwall) may be absent or
  mapped only as generic foot/hiking ways without climbing-specific tags.

**UI surface ideas**

1. **Peak Locator Enrichment:** Overpass query for `natural=peak|volcano` in WA bbox to populate
   peak metadata (name, elevation, prominence, wikidata ID for Wikipedia photos/descriptions).
   Confirmed working for all major WA Cascade peaks.
2. **Trail Approach Overlay:** Overpass `route=hiking` relation query within radius of a peak;
   filter `sac_scale >= alpine_hiking` for technical approaches. Convert to GeoJSON via `osmtogeojson`
   and render on map layer.
3. **OpenBeta Route Listing:** Query `api.openbeta.io` for route names, grades, and GPS coords
   near each peak. Render as map markers or sortable list. Note: alpine/mountaineering glacier
   routes may not be in OpenBeta (rock-climbing focused database) — probe coverage before building.

**Feasibility assessment**

✅ **Overpass API: High feasibility.** Free, unauthenticated, live OSM data. Peak nodes for all WA
major summits confirmed. Hiking approach route relations present. 10,000 query/day budget is ample;
cache peak data in Firestore and refresh weekly.

✅ **OpenBeta: Medium-high feasibility.** Free, CC0, public GraphQL endpoint. Route metadata
available. WA alpine coverage is uncertain — explore schema before building a dependency. Worth a
proof-of-concept query to assess Cascade completeness.

❌ **Mountain Project: Zero feasibility.** API permanently terminated.

⚠️ **Waymarked Trails: Low value.** OSM derivative with sparse WA coverage (live test returned empty).
Use Overpass directly instead.

---

### 4.2 NPS Trail & Permit Data

**Overview**  
Two distinct NPS systems are relevant: (1) the NPS Data API at `developer.nps.gov` provides park
alerts, visitor centers, campgrounds, and webcam metadata via a clean REST/JSON API — the `/alerts`
endpoint is the highest-value integration for mountaineers; (2) NPS ArcGIS geospatial feature services
at `mapservices.nps.gov` provide trail alignments and parking lot polygons without requiring an API
key. Real-time permit availability for MORA climbing permits is NOT in any official API — it lives
behind an undocumented endpoint on Recreation.gov (reverse-engineered by the community).

**Data types**

NPS Data API — `/alerts` endpoint fields:
- `id`, `title`, `description` (full narrative), `category` (Danger/Closure/Caution/Information)
- `url`, `parkCode` (mora/noca/olym), `lastIndexedDate`

NPS ArcGIS Trails FeatureServer (42 fields per trail segment):
- `TRLNAME`, `TRLSTATUS` (Open/Closed), `TRLSURFACE`, `TRLTYPE`, `TRLCLASS`, `TRLUSE`
- `OPENTOPUBLIC`, `SEASONAL`, `SEASDESC`, `ISEXTANT`, `ACCESSNOTES`
- `UNITCODE` (e.g. "mora"), `UNITNAME`, `Shape__Length`

NPS ArcGIS Parking Lots FeatureServer (37 fields per lot):
- `LOTNAME`, `LOTTYPE`, `OPENTOPUBLIC`, `SEASONAL`, `SEASDESC`, `ACCESSNOTES`, `UNITCODE`

RIDB API — permit entrance metadata:
- `FacilityID`, `FacilityName`, `FacilityTypeDescription`, `Reservable`, `StayLimit`
- `PermitEntranceName`, `District`, `Zone`, `PermitEntranceAccessible`
- MORA climbing/wilderness permit facilityId: **4675317**
- **No real-time availability data** in official RIDB API

**API / access**

NPS Data API — free API key (`developer.nps.gov/api/v1/`):
```
# Active closures/hazards for MORA, NOCA, OLYM
GET https://developer.nps.gov/api/v1/alerts
    ?parkCode=mora,noca,olym&limit=50
    Headers: X-Api-Key: {key}
```
Register at `https://www.nps.gov/subjects/developer/get-started.htm`. Key delivered in ~1 hour.

NPS ArcGIS — no auth required:
```
# MORA trails (GeoJSON)
GET https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/
    NPS_Public_Trails/FeatureServer/0/query
    ?where=UNITCODE='mora'&outFields=*&f=geojson

# MORA parking lots
GET https://mapservices.nps.gov/arcgis/rest/services/NationalDatasets/
    NPS_Public_ParkingLots_Geographic/FeatureServer/0/query
    ?where=UNITCODE='mora'&outFields=*&f=geojson
```
Also available as bulk download at `https://public-nps.opendata.arcgis.com/`

RIDB API — free API key:
```
# MORA permit facility
GET https://ridb.recreation.gov/api/v1/facilities/4675317
    ?apikey={key}

# Permit entrances for MORA
GET https://ridb.recreation.gov/api/v1/facilities/4675317/permitentrances
    ?apikey={key}
```

**Rate limits & terms**

- NPS Data API: 1,000 req/hour; response headers `X-RateLimit-Limit` and `X-RateLimit-Remaining`;
  HTTP 429 if exceeded
- NPS ArcGIS: no published rate limit; US gov public domain
- RIDB: 50 req/minute; Creative Commons Attribution; attribute as "Data Source: Recreation.gov"
- NPS data is US government public domain. No commercial restrictions.
- NPS API key must be kept private; prohibition on misrepresenting NPS affiliation

**Update cadence**

- NPS Alerts API: **2-hour refresh cadence** (confirmed in changelog); up to 2h latency after a
  park ranger posts a closure
- NPS ArcGIS trails/parking: changes infrequently (new construction, seasonal updates). Fields
  `EDITDATE` and `SOURCEDATE` per record for freshness assessment. Not suitable for real-time status.
- RIDB facility metadata: static reference data; updated when agencies modify permit systems (seasonal)
- Road/trailhead closure status: NOT available via any official API. Status appears on NPS Alerts
  when rangers manually create alert entries — inconsistent coverage. For definitive road conditions,
  link to `nps.gov/mora/planyourvisit/road-status.htm` directly.

**UI surface ideas**

1. **Park Alerts Panel:** Pull `/alerts?parkCode=mora,noca,olym` and display active closures/dangers.
   Color-code: Danger=red, Closure=orange, Caution=yellow, Information=blue. Badge count on dashboard
   cards when closures are active for a peak's park.
2. **Trailhead Status (from ArcGIS):** `TRLSTATUS`, `OPENTOPUBLIC`, `SEASONAL`, `SEASDESC` fields
   for approach trail to each peak. Cache daily — changes are infrequent.
3. **Permit Widget:** For Rainier projects, show "Wilderness/climbing permit required. Reservations
   via Recreation.gov — check availability" with deep-link to `recreation.gov/permits/4675317`.
   Mention the 2/3 reservation vs 1/3 walk-up quota and reservation window (opens April 25, closes
   2 days before trip).

**Feasibility assessment**

✅ **NPS Alerts API: High feasibility.** Highest-value integration — closures and hazards are exactly
what mountaineers need. Free API key, 1,000 req/hr, clean JSON, park codes well-defined.

✅ **NPS ArcGIS geospatial: Medium feasibility.** No key needed, but ArcGIS query syntax required.
Data is static inventory — best for one-time import to build a local trail/parking lookup table
rather than live polling.

⚠️ **RIDB permit metadata: Medium feasibility.** Free key, returns facility reference data and
entrance zones. No real-time availability. Best used for deep-linking to Recreation.gov rather than
displaying slot counts.

❌ **Real-time permit availability: Low feasibility.** Undocumented Recreation.gov endpoint;
unreliable as a production dependency. Surface a direct link to Recreation.gov instead.

❌ **Road/trailhead closure via API: Not feasible.** No dedicated machine-readable road status
API. NPS Alerts partially covers this when rangers post formal alerts; otherwise deep-link to the
NPS park road status page.

---

### 4.3 USFS Road & Permit Data

**Overview**  
The USDA Forest Service publishes extensive open geospatial data through the Enterprise Data Warehouse
(EDW) ArcGIS REST services at `apps.fs.usda.gov/arcx/rest/services/EDW` — 153+ MapServer services
updated daily, requiring no authentication. Roads, trails, wilderness boundaries, MVUM designations,
and recreation sites (with closure dates) are all queryable via standard ArcGIS REST API.
WA Cascade wilderness permits (Glacier Peak, Goat Rocks, Pasayten, etc.) are **free self-issue at
trailheads** — no online reservation system, no RIDB record for routine permits. The notable exception
is the **Mt. Adams Climbing Activity Pass** ($20/person above 7,000 ft, May–Sept), bookable via
Recreation.gov. Emergency closures for PNW Region 6 do NOT have a confirmed public REST endpoint —
a known gap.

**Data types**

EDW Roads (`EDW_RoadBasic_01`):
- `route_status`, `oper_maint_level` (1–5), `surface_type`, `functional_class`, `openforuseto`
- Layer 0: all NFS roads; Layer 1: roads **closed to motorized uses** (separate layer)

EDW Trails (`EDW_TrailNFSPublish_01`):
- 117 fields including trail class, surface type, tread width, grade, accessibility status
- Per-use-type fields: hiker, pack saddle, bicycle, motorcycle, ATV, e-bike (classes 1/2/3), snowmobile
- `admin_org`, `managing_org`, `special_management_area`

EDW Wilderness (`EDW_Wilderness_01`):
- `wildernessname`, `areaid`, `gis_acres`, `boundarystatus` — polygon geometry

EDW MVUM Roads (`EDW_MVUM_01`):
- `Symbol` (1=all vehicles yearlong, 2=all vehicles seasonal, 3=highway-legal only, 4=highway-legal
  seasonal), per-vehicle-type boolean fields, date-open fields
- `ForestName` (e.g. "Mt. Baker-Snoqualmie National Forest")

EDW Recreation Sites with Closures (`EDW_InfraRecreationSites_01`):
- `CLOSURE_REASON`, `UNIT_CLOSURE_DESCRIPTION`, `UNIT_CLOSURE_START_DATE`, `UNIT_CLOSURE_END_DATE`
- `ALERTS_DESCRIPTION`, `ALERTS_START_DATE`, `ALERTS_END_DATE`
- Point layer; covers campgrounds, trailheads, picnic areas

**API / access**

All EDW services — no auth required, GeoJSON output:
```
# Roads (all NFS roads)
GET https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RoadBasic_01/MapServer/0/query
    ?f=geojson&where=1=1
    &geometry={xmin:-122.1,ymin:47.5,xmax:-121.0,ymax:48.9}
    &geometryType=esriGeometryEnvelope
    &spatialRel=esriSpatialRelIntersects

# Roads closed to motorized use
/EDW/EDW_RoadBasic_01/MapServer/1/query?f=geojson&...

# Trails
/EDW/EDW_TrailNFSPublish_01/MapServer/0/query?f=geojson&...

# Wilderness boundaries by name
/EDW/EDW_Wilderness_01/MapServer/0/query
    ?where=wildernessname='Glacier Peak Wilderness'&f=geojson

# MVUM road access by forest
/EDW/EDW_MVUM_01/MapServer/1/query
    ?where=ForestName='Mt. Baker-Snoqualmie National Forest'&f=geojson

# Recreation sites with active closures (bounding box + date filter)
/EDW/EDW_InfraRecreationSites_01/MapServer/0/query
    ?where=UNIT_CLOSURE_END_DATE>CURRENT_TIMESTAMP&f=geojson&...
```
Max 2,000 records per request. Supports GeoJSON, JSON, PBF.

RIDB (Mt. Adams Climbing Pass):
```
GET https://ridb.recreation.gov/api/v1/facilities?query=Adams&state=WA
    &apikey={key}
# Climbing Activity Pass
https://www.recreation.gov/activitypass/4280e9ae-d010-11ea-8e82-82c0c22bed90
```

FSGeodata Clearinghouse (bulk downloads):  
`https://data.fs.usda.gov/geodata/edw/` — static snapshots in File GDB, Shapefile, GeoPackage,
GeoJSON, CSV formats.

**Rate limits & terms**

- EDW ArcGIS: no published rate limit. Read-only use.
- **License:** USFS follows U.S. Open Data Policy (OMB M-13-13): government data is open by default,
  public domain. Standard "no warranty" disclaimer applies.
- RIDB: Creative Commons Attribution; 50 req/minute; attribute "Data Source: Recreation.gov"

**Update cadence**

- Roads and Trails (EDW): **daily updates** from forest SDE geodatabases
- Wilderness boundaries: infrequent (congressional designations; months to years between changes)
- MVUM: updated unit-by-unit as administrative units publish revisions; no fixed cadence
- Recreation Sites / closures: no stated cadence; presumed weekly or event-driven
- Fire Perimeters: near-real-time during active fire season
- **R6 PNW Emergency Closures:** NO confirmed public REST endpoint. Closures visible only via
  an ArcGIS Online web viewer (`usfs.maps.arcgis.com`); backing FeatureService URL not publicly
  documented. This is a known gap — fall back to a direct link to the web viewer.

**UI surface ideas**

1. **Road/Trail Status Banner:** Query `EDW_RoadBasic_01/MapServer/1` with mountain bounding box
   to detect closed road segments. Surface "N road segments currently closed near [peak]" warning.
2. **MVUM Vehicle Access Badge:** For a given trailhead approach road, show the MVUM symbol code
   ("All vehicles year-round" / "Highway-legal vehicles only / seasonal") — directly answers
   "can I drive to the trailhead?"
3. **Wilderness Boundary Overlay:** Query `EDW_Wilderness_01` by `wildernessname` for a polygon.
   Show `gis_acres` and `wildernessname` in an info card.
4. **Trailhead Closure Alerts:** `EDW_InfraRecreationSites_01` filtered by bounding box +
   `UNIT_CLOSURE_END_DATE > CURRENT_TIMESTAMP`. Fields `CLOSURE_REASON` and `UNIT_CLOSURE_DESCRIPTION`
   provide human-readable text.
5. **Mt. Adams Climbing Pass:** RIDB `GET /facilities?query=Adams&state=WA` finds the facility to
   deep-link to Recreation.gov. Display "$20/person above 7,000 ft, May–Sept."

**Feasibility assessment**

✅ **EDW Roads, Trails, Wilderness, MVUM, Recreation Sites: High feasibility.** Proven queryable REST
endpoints, daily updates, no auth, GeoJSON output, public domain. WA Cascades bounding box queries
practical. These five layers collectively cover road access, trail status, permit zones, and
trailhead closures.

⚠️ **RIDB permit metadata: Medium feasibility.** Useful for Mt. Adams Climbing Pass deep-linking
and finding facility IDs. Wilderness areas using free self-issue permits (Glacier Peak, Pasayten,
Goat Rocks) have no RIDB records for routine permits — best handled with static structured content
per peak.

❌ **R6 PNW Emergency Closure API: Not feasible via documented endpoint.** Use `EDW_InfraRecreationSites_01`
closure fields as a partial substitute; link users to the USFS PNW web viewer for emergency orders.

---

### 4.4 WTA (Washington Trails Association) Data

**Overview**  
WTA (wta.org) operates a database of 4,000+ hike listings and 280,000+ community-submitted trip
reports for Washington trails, with particular value for human-reported snow levels, road access
conditions, and wildflower/wildlife observations. The database includes coverage of major Cascade
peaks and their approaches. However, **WTA has no public API**, actively blocks automated HTTP
requests with HTTP 403 responses, and its Terms of Service prohibit systematic data reproduction.
Integration without a formal WTA partnership is not feasible for a production app.

**Data types**

Trip reports contain (in HTML, not structured API fields):
- Date (YYYY-MM-DD in URL), trail/hike name, author username
- Condition tags: bugs, snow, trail conditions, road conditions, wildflowers
- Snow level (freetext narrative — not a discrete numeric field)
- Road conditions (passability notes, freetext)
- Trail conditions (downed trees, washouts, erosion — freetext)
- Photos, helpfulness vote count

Hike listing metadata (also HTML):
- Mileage, elevation gain, highest point, star rating
- Features: Summits, Lakes, Ridges/Passes, Wildlife, Wildflowers
- Required pass/permit flag, dog/kid-friendly, accessibility

Mountain Weatherman coverage note: WTA is hiking-centric. Technical climbing routes (Rainier
Disappointment Cleaver, Baker Coleman Glacier) are largely absent as structured entries. Condition
data relevant to climbers (crevasse status, fixed lines, bergschrund) does not exist as structured
fields.

**API / access**

**No public API exists.** Confirmed by multiple independent developer projects:
- `github.com/marcusprice/mywta`: "Scraping the WTA website is the only option since the WTA has
  no API available."
- `github.com/jimmygle/wta-scraper`: relies entirely on HTML scraping
- No RSS feeds, no JSON endpoints, no GraphQL

URL patterns for scraping (for reference only):
```
# Hike listing
https://www.wta.org/go-hiking/hikes/{hike-slug}

# Trip reports for a hike
https://www.wta.org/go-hiking/hikes/{hike-slug}/@@related_tripreport_listing
```
Both URLs return HTTP 403 Forbidden when accessed by automated tools (confirmed during research).
Browser-level session cookies or user-agent spoofing required to bypass — technically fragile and
ToS-violating.

**Rate limits & terms**

WTA Terms of Service (`wta.org/our-work/about/terms-of-service`):
- Content may be used "solely for internal informational purposes" — personal, non-transferable
- "No part of this website or its Content may be reproduced or transmitted in any form"
- Commercial or systematic data extraction requires a formal licensing agreement with WTA

The site returns HTTP 403 for many automated requests — active technical enforcement beyond just ToS.

**Update cadence**

Community-submitted, fully asynchronous. No guaranteed update frequency.
- Popular trails: multiple reports per week during hiking season (May–October)
- Alpine/mountaineering objectives (Rainier, Baker, Adams): sporadic; sometimes daily during peak
  season, sometimes 1–2 week gaps
- Off-season: significantly reduced coverage
- No "last updated" timestamp on hike listing pages; freshness inferred from most recent report date

**UI surface ideas**

Given the ToS restrictions and HTTP 403 blocking, direct integration is not feasible. Better paths:

1. **Deep-link to WTA:** Show a "Recent Trip Reports" link per mountain pointing to
   `wta.org/go-hiking/hikes/{slug}/@@related_tripreport_listing`. Respects ToS, adds user value
   with zero technical risk.
2. **User note field:** Allow Mountain Weatherman users to paste or summarize WTA trip reports as
   freeform notes in the existing project notes section. User is the agent; app is not crawling.
3. **Partnership outreach:** Contact WTA (website@wta.org) about a formal data integration for
   condition metadata. WTA has an existing relationship with Hiking Project, suggesting openness
   to third-party partnerships.

**Feasibility assessment**

❌ **Low feasibility for automated integration.** Hard blockers:
1. No public API (confirmed by multiple independent developers)
2. HTTP 403 blocks automated requests (confirmed during research)
3. ToS prohibits data reproduction — legal risk for a production app
4. No structured machine-readable format for trip reports
5. WTA database is hiking-centric; mountaineering conditions data is absent as structured fields
6. Asynchronous updates with no freshness guarantee — unreliable for real-time conditions

**Recommended path:** Surface a direct WTA deep-link per mountain in the UI (zero scraping).
If WTA data becomes a priority, pursue a formal partnership agreement. Do not build automated
integration without explicit WTA permission.

---

## Group 5 — Community & Real-time

### 5.1 Summit Registers & Climb Logs

**Overview**  
Five sources were evaluated for open climb record and summit register data. The overall picture is
constrained: the two richest tick databases (Mountain Project, Strava leaderboards) have shut down or
heavily restricted public API access. The most actionable open-data paths are **OpenBeta** (CC0 route
database, public GraphQL API) and **Peakbagger** (HTML scraping of aggregate ascent counts — simple
but legally gray). None of the five sources provide structured "conditions + party size + summit
success" fields in a machine-readable open format — those fields live exclusively in free-text trip
report narratives.

**Data types**

| Source | Available structured fields | Status |
|---|---|---|
| **Mountain Project** | date, route, tick type, star rating, freetext notes, route lat/lon/grade | API shut down (2020) |
| **OpenBeta** | route name, grade (YDS/French/UIAA/Ewbanks), type (sport/trad/boulder/alpine), FA name, description, coordinates, MP cross-ref ID | Public GraphQL, CC0 |
| **Peakbagger** | aggregate ascent count per peak, ascent dates (HTML only), seasonal patterns | HTML scraping only |
| **Summitpost** | Trip report narrative, date, route, party (freetext HTML) | No API, no structured fields |
| **Strava Segments** | `effort_count`, `athlete_count`, `star_count`, segment lat/lon/distance/grade | Public API; leaderboard deprecated |
| **Cascade Climbers** | Trip report forum posts (phpBB, freetext only) | No API |

**API / access**

OpenBeta GraphQL — no auth, CC0:
```
# POST to https://api.openbeta.io
{
  areas(filter: { area_name: { match: "Washington" } }) {
    areaName
    metadata { lat lng }
    climbs {
      name
      grades { yds }
      type { alpine trad sport }
      fa
    }
  }
}
```

Strava API — OAuth2 required:
```
# Discover segments near a peak (no leaderboard)
GET https://www.strava.com/api/v3/segments/explore
    ?bounds={lat},{lng},{lat},{lng}&activity_type=hiking
    Authorization: Bearer {access_token}

# Segment stats (no leaderboard)
GET https://www.strava.com/api/v3/segments/{id}
    # Returns: effort_count, athlete_count, star_count
    # Does NOT return: leaderboard, per-athlete data
```
Strava leaderboard endpoint (`/segments/{id}/leaderboard`) unavailable to standard developers since
June 2020. As of June 2026, Standard Tier developers must hold a Strava subscription (~$80/yr).

Peakbagger — HTML scraping only:
```
https://www.peakbagger.com/Peak.aspx?pid={peak_id}
```
Open-source scraper: `github.com/dreamiurg/peakbagger-cli` (2s delay between requests).

Mountain Project: endpoints (`/data/get-ticks`, `/data/get-routes`) return 404. No access path.

**Rate limits & terms**

- OpenBeta: no published rate limits; CC0 license; contact `hello@openbeta.io` for high-volume use
- Strava: 100 req/15min, 1,000 req/day (standard); ~$80/yr subscription required from June 2026
- Peakbagger: no published rate limits; no explicit scraping policy; community norm = 2s delay.
  Commercial use requires explicit permission from the site founder.
- Mountain Project: N/A
- Summitpost/Cascade Climbers: no API; user-generated content with implicit copyright

**Update cadence**

- OpenBeta: volunteer-contributed; WA alpine route completeness may lag rock climbing areas
- Strava: effort_count/athlete_count update in real time as athletes log activities
- Peakbagger: user-contributed ascents logged in real time; total ascent count updates live

**UI surface ideas**

1. **OpenBeta Route Lookup:** Query `api.openbeta.io` for routes near each WA peak — names, grades,
   type, FA info. Enrich project detail pages with approach/route context. Fully free, CC0.
2. **Strava Effort Count Badge:** `GET /segments/explore` to find hiking/alpine segments near each
   peak; `GET /segments/{id}` for `effort_count` (total attempts ever) and `athlete_count` (unique
   climbers). Surface as "3,412 Strava efforts logged on this route." Requires OAuth app + Strava
   subscription.
3. **Peakbagger Ascent Count:** Scrape the publicly visible aggregate ascent count per peak from
   Peakbagger peak pages. Show "1,247 logged ascents on Peakbagger." Single request per peak,
   weekly refresh. Low risk at this volume; legal status is gray for commercial use.
4. **Trip Report Deep-links:** Deep-link to `cascadeclimbers.com/forum/forum/3-route-reports/` and
   `summitpost.org/mountain/rock/{peak-name}` — curated external links per peak, no scraping.

**Feasibility assessment**

✅ **OpenBeta: Low effort, clean.** Public GraphQL, CC0, no auth. Best path for route metadata
enrichment. Alpine/mountaineering coverage for WA Cascades uncertain — probe before building.

⚠️ **Strava segment stats: Medium effort.** OAuth registration required; leaderboard restricted
since 2020; subscription required from June 2026. `effort_count` and `athlete_count` are the only
aggregate fields surviving the restrictions. Useful as a "route popularity" signal.

⚠️ **Peakbagger ascent count: Low effort but legally gray.** No official API; HTML scraping with
2s delay; commercial use requires permission. A weekly fetch of 10 peak pages is low-risk in practice.

❌ **Mountain Project: Dead end.** API permanently terminated.

❌ **Summitpost / Cascade Climbers: Unstructured only.** No API; NLP on messy HTML with no
reliability guarantee. Link out rather than ingest.

**Key limitation:** No open source provides structured "conditions + party size + summit success"
fields. That data lives only in free-text trip reports requiring NLP to extract.

---

### 5.2 Mountain Webcams

**Overview**  
Public webcam feeds covering WA Cascade peaks come from four distinct source categories with very
different integration profiles. **Government sources (NPS, WSDOT, USGS) provide direct, accessible
JPEG endpoints**; ski resort webcams use commercial streaming platforms without publicly accessible
direct image URLs. NPS Mount Rainier has the richest public webcam coverage of any WA peak, including
a Camp Muir camera at 10,100 ft — the highest webcam in the Cascade Range. No verified government
webcam exists on or near Glacier Peak or Mt. Adams.

**Data types**

| Source | Camera | Direct JPEG URL | Refresh | Auth |
|---|---|---|---|---|
| NPS MORA | Longmire | `nps.gov/webcams-mora/longmire.jpg` | 60s | None |
| NPS MORA | Paradise Mountain | `nps.gov/webcams-mora/mountain.jpg` | 60s | None |
| NPS MORA | Paradise East | `nps.gov/webcams-mora/east.jpg` | 60s | None |
| NPS MORA | Paradise West | `nps.gov/webcams-mora/west.jpg` | 60s | None |
| NPS MORA | Paradise Visitor Center | `nps.gov/webcams-mora/gh.jpg` | 60s | None |
| NPS MORA | Tatoosh Range | `nps.gov/webcams-mora/tatoosh.jpg` | 60s | None |
| NPS MORA | **Camp Muir (10,100 ft)** | `nps.gov/webcams-mora/muir.jpg` | 60s | None |
| NPS MORA | Air Quality | `nps.gov/featurecontent/ard/webcams/images/moralarge.jpg` | 15 min | None |
| NPS MORA | Sunrise (seasonal) | Down winter; summer 2026 active | 60s | None |
| USGS CVO | **St. Helens / Johnston Ridge** | `volcanoes.usgs.gov/vsc/captures/st_helens/jro-webcam.jpg` | 5 min | None |
| WSDOT | Stevens Pass East | `images.wsdot.wa.gov/nc/002vc06458.jpg` | 15 min | See API |
| WSDOT | Stevens Pass West | `images.wsdot.wa.gov/nc/002vc06430.jpg` | 15 min | See API |
| WSDOT | White Pass (US-12) | `images.wsdot.wa.gov/sc/012vc15095.jpg` | 15 min | See API |
| WSDOT | Sherman Pass (SR-20) | `images.wsdot.wa.gov/rweather/shermanpass_medium.jpg` | 15 min | See API |

NPS webcam images are U.S. Government works, public domain. USGS Johnston Ridge marked explicitly
"Public Domain" on USGS media page. WSDOT is Washington State government work product.

WSDOT Camera object fields (from `GetCamerasAsJson` API):
- `CameraID`, `CameraLocation` (Description, Direction, Latitude, Longitude, MilePost, RoadName)
- `CameraOwner`, `ImageURL`, `ImageWidth`, `ImageHeight`, `IsActive`, `Title`, `Description`, `Region`

Also: `GetMountainPassConditions` endpoint covers 15 WA passes including Snoqualmie, Stevens,
White Pass, Sherman.

**API / access**

NPS Webcams — no auth, direct JPEG:
```
# Example: Camp Muir, cache-bust on each fetch
GET https://www.nps.gov/webcams-mora/muir.jpg?t={timestamp}
```
No rate limit documented. NPS data is public domain.

WSDOT Traveler Information API — free AccessCode:
```
# All cameras (returns JSON array with ImageURL per camera)
GET http://wsdot.wa.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/
    GetCamerasAsJson?AccessCode={code}

# Single camera by ID
GET http://www.wsdot.gov/Traffic/api/HighwayCameras/HighwayCamerasREST.svc/
    GetCameraAsJson?AccessCode={code}&CameraID={id}

# Mountain pass road conditions (text + temperature)
GET https://wsdot.wa.gov/Traffic/api/MountainPassConditions/
    MountainPassConditionsREST.svc/GetMountainPassConditionsAsJson?AccessCode={code}
```
Register at `https://wsdot.wa.gov/traffic/api/` — provide email, receive AccessCode. Free.

USGS Johnston Ridge — direct JPEG, no auth:
```
GET https://volcanoes.usgs.gov/vsc/captures/st_helens/jro-webcam.jpg
```

Ski resorts — NOT available as direct JPEG:
- Crystal Mountain: Roundshot commercial PTZ platform, embedded player only
- White Pass: Brown Rice Media commercial player (`player.brownrice.com/embed/...`)
- Stevens Pass: commercial platform (site erroring at time of research)
- Mt Baker Ski Area: webcam page returning 404

**Rate limits & terms**

- NPS: no rate limits documented. Public domain; no explicit hotlink policy found.
- USGS: no rate limits; explicitly public domain.
- WSDOT: no rate limits documented; free AccessCode required. State government work product.
- Ski resorts: commercial streaming players — **do NOT hotlink without resort permission**.
  Show deep-links to resort webcam pages instead.

**Update cadence**

- NPS MORA (most cameras): **60-second refresh** (confirmed for Camp Muir)
- NPS Air Quality cams: **15 minutes**
- NPS Sunrise cams: seasonal (inactive winter)
- USGS Johnston Ridge: **5 minutes** (explicitly stated on USGS media page)
- WSDOT highway cameras: **~15 minutes** (Snoqualmie Pass documented; others similar)
- Ski resort cameras: live streaming video (no static JPEG snapshots to poll)

**UI surface ideas**

1. **Rainier Camera Strip:** Embed the 7 direct NPS JPEG URLs as a horizontally scrollable image
   row on the Rainier project detail page. Poll every 60 seconds with cache-bust. Camp Muir at
   10,100 ft is uniquely valuable for summit-condition visibility.
2. **WSDOT Approach Pass Cameras:** After WSDOT API registration, query cameras near each peak
   by StateRoute + MilePost range. Show 2–3 highway-approach cameras per mountain (US-2 for
   Baker/Stevens, US-12 for Adams/White Pass, I-90 for Snoqualmie). `ImageURL` field gives the
   direct JPEG.
3. **USGS St. Helens Camera:** Single `<img>` pointing to the Johnston Ridge JPEG with 5-min
   poll. USGS public domain, explicitly labeled.
4. **Seasonal Availability State:** NPS Sunrise cameras are offline in winter. Surface a "camera
   offline (seasonal)" state with a metadata flag to avoid broken image renders.
5. **GCS Proxy (production approach):** Server-side fetch NPS/WSDOT/USGS images on cadence and
   write to GCS, then serve via existing API route pattern. Avoids hotlink detection and domain
   changes over time — consistent with the existing satellite image pipeline.

**Feasibility assessment**

✅ **NPS MORA webcams: Easy win.** 7+ verified direct JPEG URLs, public domain, 60s cadence.
Highest-quality mountain webcam coverage for any WA peak. Zero integration risk.

✅ **USGS St. Helens (Johnston Ridge): Easy win.** Single JPEG, public domain, 5-min refresh.
No API key, no overhead.

✅ **WSDOT Highway Cameras: Low-medium effort.** Free registration, well-documented REST JSON,
covers all major Cascade highway passes. Best source for approach-road situational awareness.
Image URL format: `images.wsdot.wa.gov/[region]/[id].jpg` — stable per camera ID.

❌ **Crystal Mountain / White Pass / Stevens Pass / Mt Baker Ski Resort cameras: Do not hotlink.**
Commercial streaming platforms; no direct JPEG endpoints; ToS unclear for third-party embedding.
Show deep-links to resort webcam pages only.

⚠️ **Coverage gaps:** No verified government webcam exists on or near Glacier Peak or Mt. Adams.
Trout Lake private webcam near Adams is inappropriate to hotlink without permission. Surface a
"no webcam available" state for these peaks.

---

## Summary Table

| Source | Group | Feasibility | Priority | Key Constraint |
|---|---|---|---|---|
| AirNow API | Atmos/Hazard | ✅ High | High | Valley stations only, not summit |
| NWS Alerts (lightning) | Atmos/Hazard | ✅ High | High | Polygon warnings, not strike coordinates |
| GOES GLM (lightning) | Atmos/Hazard | ⚠️ Medium | V2 | NetCDF4 + S3 complexity; 8–14 km resolution |
| PNSN / USGS ComCat | Atmos/Hazard | ✅ High | High | ShakeAlert requires license; tremor = freetext |
| USGS HANS Volcano | Atmos/Hazard | ✅ High | High | Alert level only; daily update cadence |
| MODIS Snow (GIBS tiles) | Snow/Terrain | ✅ High | Medium | Visual tiles only; cloud masking in PNW |
| MODIS Snow (AppEEARS) | Snow/Terrain | ⚠️ Medium | Medium | Async batch; cloud masking in PNW |
| Landsat TIRS (thermal) | Snow/Terrain | ⚠️ Medium | Medium | 8-day revisit; cloud gaps; STAC + S3 |
| USGS Water Data (OGC) | Hydrology | ✅ High | High | WaterWatch decommissioned Feb 2026 |
| Overpass API (OSM) | Route/Trail | ✅ High | Medium | Attribution required; technical routes sparse |
| OpenBeta (GraphQL) | Route/Trail | ✅ High | Medium | Alpine coverage for WA uncertain |
| NPS Alerts API | Route/Trail | ✅ High | High | 2h refresh cadence |
| NPS ArcGIS (trails/lots) | Route/Trail | ✅ Medium | Medium | ArcGIS query syntax; static inventory |
| RIDB / Recreation.gov | Route/Trail | ⚠️ Medium | Medium | No real-time permit availability |
| USFS EDW (roads/trails) | Route/Trail | ✅ High | High | R6 emergency closures: no REST endpoint |
| WTA | Route/Trail | ❌ Low | —  | No API; ToS blocks; HTTP 403 |
| OpenBeta (climb logs) | Community | ✅ High | Medium | Route metadata only, no tick records |
| Strava segments | Community | ⚠️ Medium | Low | Leaderboard restricted; subscription required |
| Peakbagger (scraping) | Community | ⚠️ Medium | Low | Legal gray area; aggregate count only |
| NPS MORA webcams | Community | ✅ High | High | Rainier only; Glacier Peak/Adams: no coverage |
| WSDOT cameras | Community | ✅ High | High | Approach passes; free registration |
| USGS St. Helens cam | Community | ✅ High | Medium | Single camera; St. Helens only |
| Ski resort webcams | Community | ❌ Low | — | Commercial players; no direct JPEG |

---

## Open Questions for Integration Spec

1. **PNSN tremor data:** How to surface volcanic tremor without parsing narrative VONA text? Could
   a periodic NLP pass on `newestForVolcano/{id}` extract a structured tremor signal reliably enough
   for a safety-informational display?

2. **WaterWatch replacement:** The decommissioned WaterWatch provided day-of-year percentile flow
   context (is today's flow high vs. historical?). WDFN Monitoring Location Pages now host this
   data but no machine-readable API has been announced. Should we use the annual peaks collection
   to compute historical percentiles ourselves?

3. **MODIS vs. VIIRS:** Terra satellite is past design life (LOOps since July 2023). Should we also
   integrate VIIRS (VNP10A1) on Suomi-NPP/NOAA-20 as a parallel/fallback snow cover source? Same
   500 m resolution, more reliable operational status.

4. **OpenBeta alpine coverage:** What is the actual WA Cascade mountaineering route completeness in
   OpenBeta? A proof-of-concept GraphQL query for each of the 10 app peaks should answer this before
   integration work begins.

5. **WSDOT Mountain Pass Conditions:** The `GetMountainPassConditionsAsJson` endpoint returns
   structured road condition text for 15 WA passes. This is a richer signal than just the camera
   image — worth including in the USFS road data integration?

6. **NPS NOCA webcam:** North Cascades (Newhalem/Picket Range) camera is confirmed but routed
   through the NPS Air Quality network. Direct JPEG URL needs to be extracted from the page source
   of `nps.gov/subjects/air/webcams.htm?site=noca` before integration.

7. **Glacier Peak and Adams webcam gap:** No verified public webcam exists near either peak. Are
   there private or commercial options worth pursuing (e.g., NWAC weather stations with cameras)?

---

*Sources for each data source are listed with the individual source sections above. 107 web pages
fetched and analyzed across 12 research agents.*
