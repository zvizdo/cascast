# P2 — NWAC / SNOTEL / Satellite Workers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Invoke the project `python-gcp-patterns` skill before writing any worker code and the `python-reviewer` agent at the verification gate.

**Goal:** Build the three remaining data-source workers — NWAC avalanche, SNOTEL snowpack, and Copernicus/Sentinel-2 satellite — each with its own HTTP client (verified API shapes), idempotent Pub/Sub-triggered `handle_message` entry point, Firestore writes, and per-project summary updates. Extend the P1 orchestrator with `nwac`/`snotel`/`satellite` fan-out branches and extend the P1 Terraform `functions` module (+ CDSE Secret Manager wiring) so all four scheduler jobs drive live workers. Deploy to dev and verify end-to-end with ≥90% pytest coverage.

**Architecture:** Three new Cloud Functions Gen2 (python312) under `functions/{nwac_worker,snotel_worker,satellite_worker}/`, each reusing P1's `functions/shared/` modules (Pydantic models §8, `config.py`, `firestore_client.py`, `pubsub_client.py`, `storage_client.py`). Each worker is split into a pure async HTTP client (`*_client.py`, fully unit-testable with `pytest-httpx`) and a thin `main.py` that deserializes the CloudEvent, calls the client, writes Firestore, and updates active-project summaries. The orchestrator (built in P1, parameterized over a list of active projects) gains three new `type` branches that dedup the relevant id across active projects and fan out one refresh message per unique id. Terraform's `functions` module (built in P1 as a list-driven module) gets three appended entries plus Secret-Manager-backed env vars for the satellite worker. No UI work (that is P4–P6).

**Tech Stack:** Python 3.12; `httpx` (async); Pydantic v2; `tenacity` (retry); `functions-framework` (`@cloud_event`); `firebase-admin`; `pytest` 8 + `pytest-httpx` + `pytest-asyncio` (`asyncio_mode=auto`) + `pytest-cov` (`--cov-fail-under=90`). Terraform 1.8 (google ~5.x) with `google_secret_manager_secret` + `_version` + IAM. All external APIs are no-auth except CDSE (OAuth2 client-credentials). HTTP is mocked in unit tests with `pytest-httpx`; saved `fixtures/*.json` back contract tests.

**Conventions (apply throughout):** snake_case Python ↔ camelCase Firestore via Pydantic aliases (contract §8). All HTTP via async `httpx.AsyncClient` with a descriptive `User-Agent` and `Accept: application/json`, wrapped in `tenacity` retry (exponential backoff, retry on `httpx.HTTPError` + 5xx). Check both HTTP status AND response body (external APIs return 200 with error/empty payloads). "Today, Pacific" means the calendar date in `America/Los_Angeles` (use `zoneinfo.ZoneInfo`). Idempotency is mandatory for the NWAC capture (spec §3) and the satellite "no newer scene" skip.

**References:** `docs/superpowers/specs/2026-06-14-mountain-weather-poc-design.md` (spec; esp. §3 NWAC capture, decision A5 satellite) and `docs/superpowers/specs/2026-06-14-interface-contract.md` (contract — **source of truth**). Section numbers below ("contract §5.2" etc.) refer to the contract. Cited contract sections used here: §2 (resource names / entry points / message schemas), §3 (`nwacForecasts`/`snotelData`/`satelliteCache` + `currentAvalancheSummary`/`currentSnowpackSummary`), §5.2 (NWAC VERIFIED), §5.3 (SNOTEL VERIFIED), §5.4 (Copernicus VERIFIED), §8 (Pydantic models), §10 (seed mountains), §12 (test conventions). The project `python-gcp-patterns` skill governs worker structure (CloudEvent deserialization, `firebase_admin` singleton, async httpx, tenacity, error handling, pytest patterns).

**Prerequisites:**
- **P1 complete.** P2 reuses and extends P1 artifacts. Specifically required from P1:
  - `functions/shared/models.py` — all Pydantic models in contract §8 (`NwacForecast`, `NwacDanger`, `NwacProblem`, `SnotelData`, `SnotelReading`, `SatelliteCache`).
  - `functions/shared/config.py` — `GCP_PROJECT`, `ENV`, `GCS_BUCKET_SATELLITE`, `topic_path()`, `require_env()` (from P0).
  - `functions/shared/firestore_client.py` — Firestore accessor (e.g. `get_db()`), an active-projects query helper (`status == "active"`), and document upsert helpers.
  - `functions/shared/pubsub_client.py` — `publish(topic_logical: str, payload: dict)`.
  - `functions/orchestrator/main.py` — orchestrator with `orchestrate(cloud_event)` entry point and an existing `type == "weather"` branch that loads active projects, dedups by mountain, and fans out (P2 modifies this file, does not rewrite it).
  - `terraform/modules/functions` — a **list-driven** functions module (each function defined by name/entry-point/topic/memory/timeout/max-instances), already containing `orchestrator`, `weather-worker`, `backfill-worker` (P2 appends three entries + adds CDSE secrets).
  - `functions/conftest.py` — fixtures `load_fixture`, `mock_db`, `mock_publisher`, `sample_mountain_doc`, `sample_active_project` (from P0) plus any P1 additions.
  - **If P1 differs from these names, adapt to the actual P1 names — the contract §2 names above are the assumed baseline.** Dependency note: this plan assumes P1 built the orchestrator and `functions` Terraform module as described; if not, that work must be reconciled first.
- `gcloud` authenticated as owner of `mountain-weatherman-app`; Terraform dev state from P0 present.
- A real CDSE OAuth client created; `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` values available to put into Secret Manager (Task 8).

**Exit criteria:**
- `cd functions && pytest` passes with coverage ≥90% across all functions (including the three new workers + extended orchestrator).
- All three clients parse the saved `fixtures/*.json` (contract tests) and handle summer / missing-day / no-scene edge cases.
- `terraform -chdir=terraform validate` passes; `terraform plan`/`apply` (dev) creates the three new functions + CDSE secret + IAM binding with no errors.
- All **4** scheduler jobs (`weather`, `nwac`, `snotel`, `satellite`) exist and, when fired, drive their workers; manually published `nwac-refresh` / `snotel-refresh` / `satellite-refresh` messages write `nwacForecasts/{zoneId}`, `snotelData/{stationId}`, `satelliteCache/{mountainId}` and update the matching project summaries.
- CI is green (Python coverage gate enforced).

---

## File structure created/modified in P2

| Path | Status | Responsibility |
|---|---|---|
| `functions/nwac_worker/__init__.py` | create | package marker |
| `functions/nwac_worker/nwac_client.py` | create | avalanche.org NAC API client (contract §5.2) |
| `functions/nwac_worker/main.py` | create | `handle_message` — idempotent capture + project summary (contract §2, §3) |
| `functions/nwac_worker/requirements.txt` | create | worker runtime deps |
| `functions/nwac_worker/tests/__init__.py` | create | test package marker |
| `functions/nwac_worker/tests/test_nwac_client.py` | create | client unit + contract tests |
| `functions/nwac_worker/tests/test_main.py` | create | entry-point tests |
| `functions/snotel_worker/__init__.py` | create | package marker |
| `functions/snotel_worker/snotel_client.py` | create | NRCS AWDB REST client (contract §5.3) |
| `functions/snotel_worker/main.py` | create | `handle_message` — write + project summary |
| `functions/snotel_worker/requirements.txt` | create | worker runtime deps |
| `functions/snotel_worker/tests/__init__.py` | create | test package marker |
| `functions/snotel_worker/tests/test_snotel_client.py` | create | client unit + contract tests |
| `functions/snotel_worker/tests/test_main.py` | create | entry-point tests |
| `functions/satellite_worker/__init__.py` | create | package marker |
| `functions/satellite_worker/copernicus_client.py` | create | CDSE OAuth + Catalog client (contract §5.4) |
| `functions/satellite_worker/main.py` | create | `handle_message` — write satelliteCache |
| `functions/satellite_worker/requirements.txt` | create | worker runtime deps |
| `functions/satellite_worker/tests/__init__.py` | create | test package marker |
| `functions/satellite_worker/tests/test_copernicus_client.py` | create | client unit + contract tests |
| `functions/satellite_worker/tests/test_main.py` | create | entry-point tests |
| `functions/orchestrator/main.py` | **modify** | add `nwac`/`snotel`/`satellite` fan-out branches |
| `functions/orchestrator/tests/test_main.py` | **modify** | add fan-out tests for the three types |
| `terraform/modules/functions/main.tf` | **modify** | append 3 functions + CDSE secret env wiring |
| `terraform/modules/functions/variables.tf` | **modify** | add CDSE secret id variables |
| `terraform/modules/functions/secrets.tf` | create | CDSE Secret Manager secret + version + IAM |
| `terraform/main.tf` | **modify** | pass CDSE secret values to the functions module |
| `terraform/variables.tf` | **modify** | declare `cdse_client_id` / `cdse_client_secret` |
| `fixtures/nwac_winter.json` | create | saved real NWAC winter forecast (contract test) |
| `fixtures/nwac_summer.json` | create | saved real NWAC summer summary (contract test) |
| `fixtures/snotel.json` | create | saved real SNOTEL data response (contract test) |
| `fixtures/copernicus_search.json` | create | saved real CDSE catalog search response (contract test) |

---

## Task 1: NWAC client (`nwac_client.py`) — TDD

**Files:**
- Create: `functions/nwac_worker/__init__.py`, `functions/nwac_worker/tests/__init__.py`, `functions/nwac_worker/requirements.txt`, `functions/nwac_worker/nwac_client.py`, `functions/nwac_worker/tests/test_nwac_client.py`
- Create (fixtures, inline below; real captures replace them in Task 9): `fixtures/nwac_winter.json`, `fixtures/nwac_summer.json`

- [ ] **Step 1: Package markers + requirements**

```python
# functions/nwac_worker/__init__.py
```
```python
# functions/nwac_worker/tests/__init__.py
```
```text
# functions/nwac_worker/requirements.txt
functions-framework==3.*
firebase-admin==6.5.0
google-cloud-pubsub==2.23.0
httpx==0.27.0
pydantic==2.8.2
tenacity==9.0.0
```

- [ ] **Step 2: Write the representative fixtures** (inline now; Task 9 overwrites with full real captures). Shapes per contract §5.2.

```json
// fixtures/nwac_winter.json
{
  "id": 138000,
  "product_type": "forecast",
  "published_time": "2026-01-15T15:30:00+00:00",
  "expires_time": "2026-01-16T16:00:00+00:00",
  "forecast_zone": [{ "id": 1648, "name": "West Slopes South" }],
  "bottom_line": "<p>Heightened avalanche conditions on <strong>specific terrain</strong>. Watch for wind slabs.</p>",
  "hazard_discussion": "<p>New wind-loaded slabs sit on a weak interface near treeline.</p>",
  "weather_discussion": "<p>Cold NW flow with light snow continuing into tonight.</p>",
  "danger": [
    { "valid_day": "current", "lower": 2, "middle": 3, "upper": 3 },
    { "valid_day": "tomorrow", "lower": 1, "middle": 2, "upper": 3 }
  ],
  "forecast_avalanche_problems": [
    {
      "avalanche_problem_id": 5,
      "name": "Wind Slab",
      "likelihood": "likely",
      "size": ["1", "2"],
      "location": ["north upper", "northeast upper", "east middle"],
      "discussion": "<p>Recent wind has loaded leeward slopes.</p>",
      "problem_description": "Wind slabs near and above treeline."
    }
  ]
}
```
```json
// fixtures/nwac_summer.json
{
  "id": 139500,
  "product_type": "summary",
  "published_time": "2026-06-10T16:00:00+00:00",
  "expires_time": "2026-06-11T16:00:00+00:00",
  "forecast_zone": [{ "id": 1648, "name": "West Slopes South" }],
  "bottom_line": null,
  "hazard_discussion": null,
  "weather_discussion": null,
  "danger": [],
  "forecast_avalanche_problems": []
}
```

- [ ] **Step 3: Write the failing client tests**

```python
# functions/nwac_worker/tests/test_nwac_client.py
import httpx
import pytest

from nwac_worker import nwac_client


def test_aspect_rose_parses_location_with_rpartition():
    rose = nwac_client._aspect_rose(["north upper", "northeast upper", "east middle"])
    assert rose["upper"]["N"] is True
    assert rose["upper"]["NE"] is True
    assert rose["middle"]["E"] is True
    assert rose["upper"]["S"] is False
    assert rose["lower"]["N"] is False


def test_sanitize_html_strips_tags_and_collapses_whitespace():
    assert nwac_client._sanitize_html("<p>Hello <strong>world</strong>.</p>") == "Hello world."
    assert nwac_client._sanitize_html(None) is None


def test_parse_winter_forecast(load_fixture):
    fc = nwac_client.parse_product(load_fixture("nwac_winter.json"))
    assert fc.season == "winter"
    assert fc.productType == "forecast"
    assert fc.zoneId == "1648"
    assert fc.zoneName == "West Slopes South"
    assert fc.danger["current"].upper == 3
    assert fc.danger["current"].lower == 2
    assert fc.danger["tomorrow"].upper == 3
    assert fc.danger["tomorrow"].lower == 1
    assert len(fc.problems) == 1
    p = fc.problems[0]
    assert p.problemId == 5
    assert p.name == "Wind Slab"
    assert p.sizeMin == "1" and p.sizeMax == "2"
    assert p.aspects["upper"]["N"] is True
    assert "wind slabs" in fc.bottomLine.lower()
    assert "<p>" not in fc.bottomLine


def test_parse_summer_summary_detected_as_summer(load_fixture):
    fc = nwac_client.parse_product(load_fixture("nwac_summer.json"))
    assert fc.season == "summer"
    assert fc.productType == "summary"
    assert fc.problems == []
    assert fc.danger["current"].upper is None


@pytest.mark.asyncio
async def test_fetch_zone_map_builds_name_to_id(httpx_mock):
    httpx_mock.add_response(
        url="https://api.avalanche.org/v2/public/products/map-layer/NWAC",
        json={"features": [
            {"id": 1648, "properties": {"name": "West Slopes South"}},
            {"id": 1645, "properties": {"name": "Olympics"}},
        ]},
    )
    mapping = await nwac_client.fetch_zone_map()
    assert mapping["West Slopes South"] == 1648
    assert mapping["Olympics"] == 1645


@pytest.mark.asyncio
async def test_fetch_forecast_calls_product_endpoint(httpx_mock, load_fixture):
    httpx_mock.add_response(
        url="https://api.avalanche.org/v2/public/product?type=forecast&center_id=NWAC&zone_id=1648",
        json=load_fixture("nwac_winter.json"),
    )
    fc = await nwac_client.fetch_forecast("1648")
    assert fc.zoneId == "1648"
    assert fc.season == "winter"
    request = httpx_mock.get_requests()[0]
    assert request.headers["Accept"] == "application/json"
    assert "MountainWeatherman" in request.headers["User-Agent"]


@pytest.mark.asyncio
async def test_fetch_forecast_raises_on_http_error(httpx_mock):
    httpx_mock.add_response(status_code=500)
    with pytest.raises(httpx.HTTPStatusError):
        await nwac_client.fetch_forecast("1648")
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd functions && pytest nwac_worker/tests/test_nwac_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nwac_worker.nwac_client'`.

- [ ] **Step 5: Implement `functions/nwac_worker/nwac_client.py`**

```python
"""avalanche.org NAC API client (contract §5.2). No auth."""
from __future__ import annotations

import re
from html import unescape

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from shared.models import NwacDanger, NwacForecast, NwacProblem

BASE = "https://api.avalanche.org/v2/public"
MAP_LAYER_URL = f"{BASE}/products/map-layer/NWAC"
HEADERS = {
    "User-Agent": "MountainWeatherman/1.0 (mountain-weatherman-app; +https://avalanche.org)",
    "Accept": "application/json",
}
_TIMEOUT = httpx.Timeout(30.0)

# Aspect token -> compass key used in the rose (contract §5.2 aspect list).
_ASPECTS = {
    "north": "N", "northeast": "NE", "east": "E", "southeast": "SE",
    "south": "S", "southwest": "SW", "west": "W", "northwest": "NW",
}
_BANDS = ("lower", "middle", "upper")
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")

_retry = retry(
    retry=retry_if_exception_type(httpx.HTTPError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)


def _sanitize_html(value: str | None) -> str | None:
    """Strip HTML tags + collapse whitespace → plain text (contract §5.2)."""
    if value is None:
        return None
    text = _TAG_RE.sub(" ", value)
    text = unescape(text)
    return _WS_RE.sub(" ", text).strip()


def _empty_rose() -> dict:
    return {band: {code: False for code in _ASPECTS.values()} for band in _BANDS}


def _aspect_rose(location: list[str] | None) -> dict:
    """Flat ["{aspect} {elevation}"] → {band: {compass: bool}} via rpartition (contract §5.2)."""
    rose = _empty_rose()
    for entry in location or []:
        aspect_word, _, band = entry.lower().rpartition(" ")
        compass = _ASPECTS.get(aspect_word)
        if compass and band in rose:
            rose[band][compass] = True
    return rose


def _danger_for(entries: list[dict], valid_day: str) -> NwacDanger:
    for entry in entries:
        if entry.get("valid_day") == valid_day:
            return NwacDanger(
                upper=_rating(entry.get("upper")),
                middle=_rating(entry.get("middle")),
                lower=_rating(entry.get("lower")),
            )
    return NwacDanger(upper=None, middle=None, lower=None)


def _rating(value) -> int | None:
    """1-5 valid; -1/0/None mean 'no rating' → None (contract §5.2)."""
    if value is None:
        return None
    ivalue = int(value)
    return ivalue if 1 <= ivalue <= 5 else None


def _zone_info(payload: dict) -> tuple[str, str]:
    zones = payload.get("forecast_zone") or [{}]
    zone = zones[0]
    return str(zone.get("id", "")), str(zone.get("name", ""))


def parse_product(payload: dict) -> NwacForecast:
    """Parse a NAC product into the canonical NwacForecast (contract §5.2, §8)."""
    product_type = payload.get("product_type") or ""
    danger_entries = payload.get("danger") or []
    is_summer = product_type != "forecast" or not danger_entries
    zone_id, zone_name = _zone_info(payload)

    problems: list[NwacProblem] = []
    for raw in payload.get("forecast_avalanche_problems") or []:
        size = raw.get("size") or [None, None]
        problems.append(NwacProblem(
            problemId=int(raw.get("avalanche_problem_id")),
            name=raw.get("name") or "",
            likelihood=raw.get("likelihood"),
            sizeMin=str(size[0]) if size and size[0] is not None else None,
            sizeMax=str(size[1]) if len(size) > 1 and size[1] is not None else None,
            aspects=_aspect_rose(raw.get("location")),
            description=_sanitize_html(raw.get("problem_description") or raw.get("discussion")),
        ))

    return NwacForecast(
        zoneId=zone_id,
        zoneName=zone_name,
        productId=int(payload.get("id")),
        season="summer" if is_summer else "winter",
        productType=product_type,
        publishedTime=payload["published_time"],
        expiresTime=payload["expires_time"],
        forecastDate=str(payload.get("published_time", ""))[:10],
        danger={
            "current": _danger_for(danger_entries, "current"),
            "tomorrow": _danger_for(danger_entries, "tomorrow"),
        },
        problems=problems,
        bottomLine=_sanitize_html(payload.get("bottom_line")),
        hazardDiscussion=_sanitize_html(payload.get("hazard_discussion")),
        weatherDiscussion=_sanitize_html(payload.get("weather_discussion")),
    )


@_retry
async def fetch_zone_map() -> dict[str, int]:
    """GET map-layer once → {feature.properties.name: feature.id} (contract §5.2)."""
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.get(MAP_LAYER_URL)
        resp.raise_for_status()
        data = resp.json()
    return {
        f["properties"]["name"]: int(f["id"])
        for f in data.get("features", [])
        if f.get("properties", {}).get("name")
    }


@_retry
async def fetch_forecast(zone_id: str) -> NwacForecast:
    """GET the per-zone forecast product and parse it (contract §5.2)."""
    params = {"type": "forecast", "center_id": "NWAC", "zone_id": zone_id}
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.get(f"{BASE}/product", params=params)
        resp.raise_for_status()
        payload = resp.json()
    return parse_product(payload)
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd functions && pytest nwac_worker/tests/test_nwac_client.py -v`
Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add functions/nwac_worker/__init__.py functions/nwac_worker/tests/__init__.py functions/nwac_worker/requirements.txt functions/nwac_worker/nwac_client.py functions/nwac_worker/tests/test_nwac_client.py fixtures/nwac_winter.json fixtures/nwac_summer.json
git commit -m "feat(p2): NWAC NAC API client + contract tests"
```

---

## Task 2: NWAC worker entry point (`nwac_worker/main.py`) — TDD

**Files:**
- Create: `functions/nwac_worker/main.py`, `functions/nwac_worker/tests/test_main.py`

Behavior (spec §3, contract §2 + §3):
- `handle_message(cloud_event)` decodes `{ "zoneId": "1648" }` from the base64 CloudEvent payload.
- **Idempotent capture:** if `nwacForecasts/{zoneId}` already holds today's **published** forecast (`productType == "forecast"` AND `publishedTime` is today's Pacific date), no-op (skip fetch + writes).
- Else fetch via `nwac_client.fetch_forecast`, write `nwacForecasts/{zoneId}` (the `NwacForecast` + `fetchedAt`), and update `currentAvalancheSummary` (incl. `season`) on every active project whose mountain maps to this zone (`mountains/{...}.nwacZoneId == zoneId`).
- **Summer:** still write the summary doc once and update project summaries with `season == "summer"`; once written today it is treated as captured (the idempotency check matches on date even though `productType == "summary"` — see `_already_captured_today`).

- [ ] **Step 1: Write the failing entry-point tests**

```python
# functions/nwac_worker/tests/test_main.py
import base64
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from nwac_worker import main


def _event(payload: dict) -> SimpleNamespace:
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": encoded}})


@pytest.fixture
def winter_forecast(load_fixture):
    from nwac_worker import nwac_client
    return nwac_client.parse_product(load_fixture("nwac_winter.json"))


def test_already_captured_today_is_noop(monkeypatch, winter_forecast):
    today = datetime.now(main.PACIFIC).date().isoformat()
    existing = MagicMock()
    existing.exists = True
    existing.to_dict.return_value = {
        "productType": "forecast",
        "publishedTime": datetime(2026, 1, 15, 15, 30, tzinfo=timezone.utc),
        "forecastDate": today,
    }
    doc_ref = MagicMock()
    doc_ref.get.return_value = existing
    db = MagicMock()
    db.collection.return_value.document.return_value = doc_ref
    monkeypatch.setattr(main, "get_db", lambda: db)

    called = {"fetched": False}
    async def fake_fetch(zone_id):
        called["fetched"] = True
        return winter_forecast
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    main.handle_message(_event({"zoneId": "1648"}))

    assert called["fetched"] is False
    doc_ref.set.assert_not_called()


def test_fresh_capture_writes_forecast_and_summary(monkeypatch, winter_forecast):
    missing = MagicMock(); missing.exists = False
    forecast_ref = MagicMock(); forecast_ref.get.return_value = missing

    project_doc = MagicMock()
    project_doc.id = "proj-abc"
    project_ref = MagicMock(); project_doc.reference = project_ref

    db = MagicMock()
    db.collection.return_value.document.return_value = forecast_ref

    def stream_projects():
        return [project_doc]
    monkeypatch.setattr(main, "active_projects_for_zone", lambda zone_id: stream_projects())
    monkeypatch.setattr(main, "get_db", lambda: db)

    async def fake_fetch(zone_id):
        return winter_forecast
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    main.handle_message(_event({"zoneId": "1648"}))

    assert forecast_ref.set.called
    written = forecast_ref.set.call_args[0][0]
    assert written["zoneId"] == "1648"
    assert written["season"] == "winter"
    assert "fetchedAt" in written

    assert project_ref.set.called
    summary = project_ref.set.call_args[0][0]["currentAvalancheSummary"]
    assert summary["season"] == "winter"
    assert summary["dangerUpper"] == 3
    assert summary["dangerLower"] == 2


def test_summer_capture_records_summary(monkeypatch, load_fixture):
    from nwac_worker import nwac_client
    summer = nwac_client.parse_product(load_fixture("nwac_summer.json"))
    missing = MagicMock(); missing.exists = False
    forecast_ref = MagicMock(); forecast_ref.get.return_value = missing
    db = MagicMock()
    db.collection.return_value.document.return_value = forecast_ref

    project_doc = MagicMock(); project_doc.id = "p1"
    project_ref = MagicMock(); project_doc.reference = project_ref

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "active_projects_for_zone", lambda z: [project_doc])

    async def fake_fetch(z):
        return summer
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", fake_fetch)

    main.handle_message(_event({"zoneId": "1648"}))

    written = forecast_ref.set.call_args[0][0]
    assert written["season"] == "summer"
    summary = project_ref.set.call_args[0][0]["currentAvalancheSummary"]
    assert summary["season"] == "summer"
    assert summary["dangerUpper"] == -1  # no rating sentinel for summary


def test_decode_message_extracts_zone_id():
    assert main._decode(_event({"zoneId": "1648"})) == {"zoneId": "1648"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && pytest nwac_worker/tests/test_main.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'nwac_worker.main'`.

- [ ] **Step 3: Implement `functions/nwac_worker/main.py`**

```python
"""NWAC worker entry point — idempotent daily capture (spec §3, contract §2/§3)."""
from __future__ import annotations

import asyncio
import base64
import json
from datetime import datetime
from zoneinfo import ZoneInfo

import functions_framework

from shared.firestore_client import get_db
from nwac_worker import nwac_client

PACIFIC = ZoneInfo("America/Los_Angeles")
NO_RATING = -1  # Firestore sentinel for "no rating" (contract §3)


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode())


def _today_pacific() -> str:
    return datetime.now(PACIFIC).date().isoformat()


def _published_date_pacific(value) -> str:
    if isinstance(value, str):
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        dt = value
    return dt.astimezone(PACIFIC).date().isoformat()


def _already_captured_today(snapshot) -> bool:
    """True if today's published forecast (or today's summary) is already stored (spec §3)."""
    if not snapshot.exists:
        return False
    data = snapshot.to_dict() or {}
    published = data.get("publishedTime")
    if published is None:
        return False
    return _published_date_pacific(published) == _today_pacific()


def active_projects_for_zone(zone_id: str):
    """Active projects whose mountain maps to this NWAC zone (contract §3)."""
    db = get_db()
    mountain_ids = [
        m.id for m in db.collection("mountains").where("nwacZoneId", "==", zone_id).stream()
    ]
    if not mountain_ids:
        return []
    projects = []
    for chunk_start in range(0, len(mountain_ids), 10):
        chunk = mountain_ids[chunk_start:chunk_start + 10]
        query = (db.collection("projects")
                 .where("status", "==", "active")
                 .where("mountainId", "in", chunk))
        projects.extend(query.stream())
    return projects


def _summary_from(forecast) -> dict:
    current = forecast.danger["current"]
    return {
        "dangerUpper": current.upper if current.upper is not None else NO_RATING,
        "dangerMiddle": current.middle if current.middle is not None else NO_RATING,
        "dangerLower": current.lower if current.lower is not None else NO_RATING,
        "bottomLine": forecast.bottomLine or "",
        "forecastDate": forecast.forecastDate,
        "season": forecast.season,
        "updatedAt": datetime.now(tz=PACIFIC),
    }


@functions_framework.cloud_event
def handle_message(cloud_event) -> None:
    payload = _decode(cloud_event)
    zone_id = str(payload["zoneId"])
    db = get_db()
    doc_ref = db.collection("nwacForecasts").document(zone_id)

    if _already_captured_today(doc_ref.get()):
        print(f"nwac_worker: zone {zone_id} already captured today, skipping")
        return

    forecast = asyncio.run(nwac_client.fetch_forecast(zone_id))

    record = forecast.model_dump(by_alias=True)
    record["fetchedAt"] = datetime.now(tz=PACIFIC)
    doc_ref.set(record)

    summary = _summary_from(forecast)
    for project in active_projects_for_zone(zone_id):
        project.reference.set({"currentAvalancheSummary": summary}, merge=True)

    print(f"nwac_worker: captured zone {zone_id} ({forecast.season})")
```

> Note: `_summary_from` uses `NO_RATING` (-1) so summer summaries (all-`None` danger) write `-1`, matching `currentAvalancheSummary.danger*` semantics (contract §3: "-1=no rating").

- [ ] **Step 4: Run to verify it passes**

Run: `cd functions && pytest nwac_worker/tests/test_main.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add functions/nwac_worker/main.py functions/nwac_worker/tests/test_main.py
git commit -m "feat(p2): NWAC worker entry point — idempotent capture + project summary"
```

---

## Task 3: SNOTEL client (`snotel_client.py`) — TDD

**Files:**
- Create: `functions/snotel_worker/__init__.py`, `functions/snotel_worker/tests/__init__.py`, `functions/snotel_worker/requirements.txt`, `functions/snotel_worker/snotel_client.py`, `functions/snotel_worker/tests/test_snotel_client.py`
- Create: `fixtures/snotel.json` (inline now; Task 9 overwrites with full real capture)

Behavior (contract §5.3): AWDB REST `/services/v1/data` with triplet `{id}:WA:SNTL` (network `SNTL`), elements `WTEQ,SNWD,TMAX,TMIN,PREC`, `duration=DAILY`, 30-day window, `centralTendencyType=MEDIAN`, `returnFlags=false`. Align element series **by date** (not positional). `percentOfMedian = swe / median * 100` (guard median 0/None). PREC is cumulative → diff for daily accumulation. Station meta from `/services/v1/stations`.

- [ ] **Step 1: Package markers + requirements**

```python
# functions/snotel_worker/__init__.py
```
```python
# functions/snotel_worker/tests/__init__.py
```
```text
# functions/snotel_worker/requirements.txt
functions-framework==3.*
firebase-admin==6.5.0
google-cloud-pubsub==2.23.0
httpx==0.27.0
pydantic==2.8.2
tenacity==9.0.0
```

- [ ] **Step 2: Write the representative fixture** (contract §5.3; includes a missing day = null). Two-element array: `[0]` = the data response, `[1]` would be a stations response — but the data + stations endpoints are separate calls, so this fixture mirrors the **data** response; a separate `snotel_stations` key holds the stations response so one file backs both contract tests.

```json
// fixtures/snotel.json
{
  "data": [
    {
      "stationTriplet": "679:WA:SNTL",
      "data": [
        {
          "stationElement": { "elementCode": "WTEQ", "storedUnitCode": "in", "dataPrecision": 1 },
          "values": [
            { "date": "2026-06-08", "value": 22.4, "median": 18.0 },
            { "date": "2026-06-09", "value": 21.9, "median": 17.5 },
            { "date": "2026-06-10", "value": null, "median": 17.0 },
            { "date": "2026-06-11", "value": 20.8, "median": 16.4 }
          ]
        },
        {
          "stationElement": { "elementCode": "SNWD", "storedUnitCode": "in", "dataPrecision": 0 },
          "values": [
            { "date": "2026-06-08", "value": 96 },
            { "date": "2026-06-09", "value": 94 },
            { "date": "2026-06-10", "value": null },
            { "date": "2026-06-11", "value": 90 }
          ]
        },
        {
          "stationElement": { "elementCode": "TMAX", "storedUnitCode": "degF", "dataPrecision": 0 },
          "values": [
            { "date": "2026-06-11", "value": 48 }
          ]
        },
        {
          "stationElement": { "elementCode": "TMIN", "storedUnitCode": "degF", "dataPrecision": 0 },
          "values": [
            { "date": "2026-06-11", "value": 31 }
          ]
        },
        {
          "stationElement": { "elementCode": "PREC", "storedUnitCode": "in", "dataPrecision": 1 },
          "values": [
            { "date": "2026-06-08", "value": 60.0, "median": 55.0 },
            { "date": "2026-06-09", "value": 60.3, "median": 55.2 },
            { "date": "2026-06-10", "value": null, "median": 55.4 },
            { "date": "2026-06-11", "value": 60.8, "median": 55.6 }
          ]
        }
      ]
    }
  ],
  "stations": [
    {
      "stationTriplet": "679:WA:SNTL",
      "name": "Paradise",
      "elevation": 5120,
      "latitude": 46.7861,
      "longitude": -121.7472
    }
  ]
}
```

- [ ] **Step 3: Write the failing client tests**

```python
# functions/snotel_worker/tests/test_snotel_client.py
import httpx
import pytest

from snotel_worker import snotel_client


def test_index_values_by_date():
    values = [{"date": "2026-06-08", "value": 1.0}, {"date": "2026-06-09", "value": 2.0}]
    idx = snotel_client._index_by_date(values)
    assert idx["2026-06-08"] == {"value": 1.0, "median": None}
    assert idx["2026-06-09"]["value"] == 2.0


def test_percent_of_median_guards_zero_and_none():
    assert snotel_client._percent_of_median(18.0, 9.0) == 200.0
    assert snotel_client._percent_of_median(18.0, 0) is None
    assert snotel_client._percent_of_median(18.0, None) is None
    assert snotel_client._percent_of_median(None, 9.0) is None


def test_daily_precip_diffs_cumulative():
    # cumulative PREC by date → daily diff; first day yields None (no prior)
    series = {"2026-06-08": 60.0, "2026-06-09": 60.3, "2026-06-11": 60.8}
    daily = snotel_client._daily_precip(series, "2026-06-11", "2026-06-09")
    assert daily == pytest.approx(0.5)  # 60.8 - 60.3


def test_parse_data_builds_current_and_trend(load_fixture):
    fixture = load_fixture("snotel.json")
    station = snotel_client.parse_stations(fixture["stations"])["679:WA:SNTL"]
    data = snotel_client.parse_data(
        fixture["data"], station_id="679", station=station,
    )
    assert data.stationTriplet == "679:WA:SNTL"
    assert data.stationName == "Paradise"
    assert data.elevationFt == 5120
    # current = latest available date (2026-06-11)
    assert data.current.date == "2026-06-11"
    assert data.current.sweIn == 20.8
    assert data.current.snowDepthIn == 90
    assert data.current.sweMedianIn == 16.4
    assert data.current.percentOfMedian == pytest.approx(20.8 / 16.4 * 100)
    assert data.current.tempMaxF == 48
    assert data.current.tempMinF == 31
    # trend aligned by date, oldest→newest, missing day carries nulls
    assert [r.date for r in data.trend] == ["2026-06-08", "2026-06-09", "2026-06-10", "2026-06-11"]
    assert data.trend[2].sweIn is None  # 2026-06-10 missing


def test_parse_stations_resolves_meta(load_fixture):
    stations = snotel_client.parse_stations(load_fixture("snotel.json")["stations"])
    meta = stations["679:WA:SNTL"]
    assert meta["name"] == "Paradise"
    assert meta["lat"] == 46.7861
    assert meta["lng"] == -121.7472


@pytest.mark.asyncio
async def test_fetch_data_hits_rest_endpoint(httpx_mock, load_fixture):
    httpx_mock.add_response(
        url__regex=r".*/services/v1/data\?.*",
        json={"data": load_fixture("snotel.json")["data"]},
    )
    raw = await snotel_client.fetch_data("679", "679:WA:SNTL")
    assert raw[0]["stationTriplet"] == "679:WA:SNTL"
    request = httpx_mock.get_requests()[0]
    assert "stationTriplets=679%3AWA%3ASNTL" in str(request.url) or "679:WA:SNTL" in str(request.url)
    assert "elements=WTEQ%2CSNWD%2CTMAX%2CTMIN%2CPREC" in str(request.url) or "WTEQ,SNWD,TMAX,TMIN,PREC" in str(request.url)
    assert "centralTendencyType=MEDIAN" in str(request.url)


@pytest.mark.asyncio
async def test_fetch_raises_on_error(httpx_mock):
    httpx_mock.add_response(status_code=503)
    with pytest.raises(httpx.HTTPStatusError):
        await snotel_client.fetch_data("679", "679:WA:SNTL")
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd functions && pytest snotel_worker/tests/test_snotel_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'snotel_worker.snotel_client'`.

- [ ] **Step 5: Implement `functions/snotel_worker/snotel_client.py`**

```python
"""NRCS AWDB REST API client (contract §5.3). No auth."""
from __future__ import annotations

from datetime import date, timedelta

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from shared.models import SnotelData, SnotelReading

BASE = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1"
ELEMENTS = ["WTEQ", "SNWD", "TMAX", "TMIN", "PREC"]
WINDOW_DAYS = 30
HEADERS = {
    "User-Agent": "MountainWeatherman/1.0 (mountain-weatherman-app)",
    "Accept": "application/json",
}
_TIMEOUT = httpx.Timeout(45.0)  # gov servers can be slow

_retry = retry(
    retry=retry_if_exception_type(httpx.HTTPError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=15),
    reraise=True,
)


def _index_by_date(values: list[dict]) -> dict[str, dict]:
    """{date: {"value":..., "median":...}} (contract §5.3 — align by date, not zip)."""
    return {
        v["date"]: {"value": v.get("value"), "median": v.get("median")}
        for v in values
    }


def _percent_of_median(swe: float | None, median: float | None) -> float | None:
    if swe is None or not median:  # guards None and 0 (contract §5.3)
        return None
    return swe / median * 100


def _element_map(station_data: dict) -> dict[str, dict[str, dict]]:
    out: dict[str, dict[str, dict]] = {}
    for series in station_data.get("data", []):
        code = series["stationElement"]["elementCode"]
        out[code] = _index_by_date(series.get("values", []))
    return out


def _all_dates(elements: dict[str, dict[str, dict]]) -> list[str]:
    dates: set[str] = set()
    for series in elements.values():
        dates.update(series.keys())
    return sorted(dates)


def _daily_precip(prec_values: dict[str, float | None], day: str, prev_day: str | None) -> float | None:
    """Diff cumulative PREC vs the prior available day (contract §5.3)."""
    today = prec_values.get(day)
    if today is None or prev_day is None:
        return None
    prior = prec_values.get(prev_day)
    if prior is None:
        return None
    return round(today - prior, 2)


def parse_stations(stations: list[dict]) -> dict[str, dict]:
    """Stations response → {triplet: {name, elevationFt, lat, lng}} (contract §5.3)."""
    return {
        s["stationTriplet"]: {
            "name": s.get("name", ""),
            "elevationFt": float(s.get("elevation", 0) or 0),
            "lat": float(s.get("latitude", 0) or 0),
            "lng": float(s.get("longitude", 0) or 0),
        }
        for s in stations
    }


def parse_data(data: list[dict], station_id: str, station: dict) -> SnotelData:
    """Build current + 30-day trend, aligned by date (contract §5.3, §8)."""
    station_data = data[0] if data else {"stationTriplet": "", "data": []}
    triplet = station_data.get("stationTriplet", "")
    elements = _element_map(station_data)
    dates = _all_dates(elements)

    wteq = elements.get("WTEQ", {})
    snwd = elements.get("SNWD", {})
    tmax = elements.get("TMAX", {})
    tmin = elements.get("TMIN", {})
    prec_idx = {d: v["value"] for d, v in elements.get("PREC", {}).items()}

    trend: list[SnotelReading] = []
    for d in dates:
        trend.append(SnotelReading(
            date=d,
            snowDepthIn=snwd.get(d, {}).get("value"),
            sweIn=wteq.get(d, {}).get("value"),
        ))

    # current = latest date with any WTEQ/SNWD reading, else latest date overall
    current_date = next(
        (d for d in reversed(dates)
         if wteq.get(d, {}).get("value") is not None or snwd.get(d, {}).get("value") is not None),
        dates[-1] if dates else "",
    )
    idx = dates.index(current_date) if current_date in dates else -1
    prev_date = dates[idx - 1] if idx > 0 else None

    swe = wteq.get(current_date, {}).get("value")
    median = wteq.get(current_date, {}).get("median")
    current = SnotelReading(
        date=current_date,
        snowDepthIn=snwd.get(current_date, {}).get("value"),
        sweIn=swe,
        sweMedianIn=median,
        percentOfMedian=_percent_of_median(swe, median),
        tempMaxF=tmax.get(current_date, {}).get("value"),
        tempMinF=tmin.get(current_date, {}).get("value"),
        precipAccumIn=_daily_precip(prec_idx, current_date, prev_date),
    )

    return SnotelData(
        stationId=station_id,
        stationTriplet=triplet or f"{station_id}:WA:SNTL",
        stationName=station.get("name", ""),
        elevationFt=station.get("elevationFt", 0.0),
        lat=station.get("lat", 0.0),
        lng=station.get("lng", 0.0),
        current=current,
        trend=trend,
    )


def _window() -> tuple[str, str]:
    end = date.today()
    begin = end - timedelta(days=WINDOW_DAYS)
    return begin.isoformat(), end.isoformat()


@_retry
async def fetch_data(station_id: str, triplet: str) -> list[dict]:
    begin, end = _window()
    params = {
        "stationTriplets": triplet,
        "elements": ",".join(ELEMENTS),
        "duration": "DAILY",
        "beginDate": begin,
        "endDate": end,
        "centralTendencyType": "MEDIAN",
        "returnFlags": "false",
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.get(f"{BASE}/data", params=params)
        resp.raise_for_status()
        body = resp.json()
    return body["data"] if isinstance(body, dict) and "data" in body else body


@_retry
async def fetch_station(triplet: str) -> dict:
    params = {"stationTriplets": triplet, "activeOnly": "true"}
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.get(f"{BASE}/stations", params=params)
        resp.raise_for_status()
        body = resp.json()
    stations = body["stations"] if isinstance(body, dict) and "stations" in body else body
    return parse_stations(stations).get(triplet, {"name": "", "elevationFt": 0.0, "lat": 0.0, "lng": 0.0})
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd functions && pytest snotel_worker/tests/test_snotel_client.py -v`
Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add functions/snotel_worker/__init__.py functions/snotel_worker/tests/__init__.py functions/snotel_worker/requirements.txt functions/snotel_worker/snotel_client.py functions/snotel_worker/tests/test_snotel_client.py fixtures/snotel.json
git commit -m "feat(p2): SNOTEL AWDB REST client + contract tests"
```

---

## Task 4: SNOTEL worker entry point (`snotel_worker/main.py`) — TDD

**Files:**
- Create: `functions/snotel_worker/main.py`, `functions/snotel_worker/tests/test_main.py`

Behavior (contract §2 + §3): decode `{ "stationId": "679" }`; resolve triplet (look up the station's mountains to get `snotelStationTriplet`, else default `{id}:WA:SNTL`); fetch station meta + data; write `snotelData/{stationId}`; update `currentSnowpackSummary` on every active project referencing the station (`mountains/{...}.snotelStationId == stationId`).

- [ ] **Step 1: Write the failing entry-point tests**

```python
# functions/snotel_worker/tests/test_main.py
import base64
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from snotel_worker import main


def _event(payload: dict) -> SimpleNamespace:
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": encoded}})


@pytest.fixture
def snotel_data(load_fixture):
    from snotel_worker import snotel_client
    fixture = load_fixture("snotel.json")
    station = snotel_client.parse_stations(fixture["stations"])["679:WA:SNTL"]
    return snotel_client.parse_data(fixture["data"], station_id="679", station=station)


def test_handle_message_writes_data_and_summary(monkeypatch, snotel_data):
    station_ref = MagicMock()
    db = MagicMock()
    db.collection.return_value.document.return_value = station_ref

    project_doc = MagicMock(); project_doc.id = "proj-1"
    project_ref = MagicMock(); project_doc.reference = project_ref

    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "resolve_triplet", lambda sid: "679:WA:SNTL")
    monkeypatch.setattr(main, "active_projects_for_station", lambda sid: [project_doc])

    async def fake_station(triplet):
        return {"name": "Paradise", "elevationFt": 5120, "lat": 46.7861, "lng": -121.7472}
    async def fake_data(sid, triplet):
        # return the raw list the client.parse_data expects
        from snotel_worker import snotel_client
        return snotel_client.parse_data.__wrapped__ if False else _RAW
    # simpler: monkeypatch the high-level fetch_snotel
    monkeypatch.setattr(main, "fetch_snotel", lambda sid, triplet: snotel_data)

    main.handle_message(_event({"stationId": "679"}))

    assert station_ref.set.called
    written = station_ref.set.call_args[0][0]
    assert written["stationId"] == "679"
    assert "fetchedAt" in written

    summary = project_ref.set.call_args[0][0]["currentSnowpackSummary"]
    assert summary["snowDepthIn"] == 90
    assert summary["sweIn"] == 20.8
    assert summary["stationName"] == "Paradise"
    assert summary["percentOfMedian"] == pytest.approx(20.8 / 16.4 * 100)


_RAW = []  # placeholder; not used because fetch_snotel is monkeypatched


def test_decode_extracts_station_id():
    assert main._decode(_event({"stationId": "679"})) == {"stationId": "679"}
```

> The test monkeypatches `main.fetch_snotel` (a thin async-orchestrating helper) so it returns the already-parsed `SnotelData`, keeping the entry-point test focused on Firestore writes. The client itself is covered in Task 3.

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && pytest snotel_worker/tests/test_main.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'snotel_worker.main'`.

- [ ] **Step 3: Implement `functions/snotel_worker/main.py`**

```python
"""SNOTEL worker entry point (contract §2/§3)."""
from __future__ import annotations

import asyncio
import base64
import json
from datetime import datetime
from zoneinfo import ZoneInfo

import functions_framework

from shared.firestore_client import get_db
from shared.models import SnotelData
from snotel_worker import snotel_client

PACIFIC = ZoneInfo("America/Los_Angeles")


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode())


def resolve_triplet(station_id: str) -> str:
    """Look up a mountain referencing this station for its triplet; else default WA SNTL."""
    db = get_db()
    docs = list(db.collection("mountains")
                .where("snotelStationId", "==", station_id).limit(1).stream())
    if docs:
        triplet = (docs[0].to_dict() or {}).get("snotelStationTriplet")
        if triplet:
            return triplet
    return f"{station_id}:WA:SNTL"


def active_projects_for_station(station_id: str):
    db = get_db()
    mountain_ids = [
        m.id for m in db.collection("mountains")
        .where("snotelStationId", "==", station_id).stream()
    ]
    if not mountain_ids:
        return []
    projects = []
    for start in range(0, len(mountain_ids), 10):
        chunk = mountain_ids[start:start + 10]
        projects.extend(
            db.collection("projects")
            .where("status", "==", "active")
            .where("mountainId", "in", chunk).stream()
        )
    return projects


def fetch_snotel(station_id: str, triplet: str) -> SnotelData:
    """Fetch station meta + data and parse into SnotelData (sync wrapper over async client)."""
    async def _run() -> SnotelData:
        station = await snotel_client.fetch_station(triplet)
        raw = await snotel_client.fetch_data(station_id, triplet)
        return snotel_client.parse_data(raw, station_id=station_id, station=station)
    return asyncio.run(_run())


def _summary_from(data: SnotelData) -> dict:
    return {
        "snowDepthIn": data.current.snowDepthIn,
        "sweIn": data.current.sweIn,
        "percentOfMedian": data.current.percentOfMedian,
        "stationName": data.stationName,
        "updatedAt": datetime.now(tz=PACIFIC),
    }


@functions_framework.cloud_event
def handle_message(cloud_event) -> None:
    payload = _decode(cloud_event)
    station_id = str(payload["stationId"])
    triplet = resolve_triplet(station_id)

    data = fetch_snotel(station_id, triplet)

    db = get_db()
    record = data.model_dump(by_alias=True)
    record["fetchedAt"] = datetime.now(tz=PACIFIC)
    db.collection("snotelData").document(station_id).set(record)

    summary = _summary_from(data)
    for project in active_projects_for_station(station_id):
        project.reference.set({"currentSnowpackSummary": summary}, merge=True)

    print(f"snotel_worker: wrote station {station_id}")
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd functions && pytest snotel_worker/tests/test_main.py -v`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add functions/snotel_worker/main.py functions/snotel_worker/tests/test_main.py
git commit -m "feat(p2): SNOTEL worker entry point — write + project summary"
```

---

## Task 5: Copernicus client (`copernicus_client.py`) — TDD

**Files:**
- Create: `functions/satellite_worker/__init__.py`, `functions/satellite_worker/tests/__init__.py`, `functions/satellite_worker/requirements.txt`, `functions/satellite_worker/copernicus_client.py`, `functions/satellite_worker/tests/test_copernicus_client.py`
- Create: `fixtures/copernicus_search.json` (inline now; Task 9 overwrites with full real capture)

Behavior (contract §5.4, spec A5): OAuth2 client-credentials token (cache until `exp`); bbox from mountain lat/lng (±~0.08°); Catalog `POST /catalog/v1/search` with cql2 `eo:cloud_cover < 70`, `sortby datetime desc`, `limit 1` → `latestImageDate` + `cloudCoverPercent` + `sceneId`. Build the EOX s2cloudless XYZ tile template (`tileSource = "eox-s2cloudless"`, `{z}/{y}/{x}` order) + attribution. Secrets `CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET` from env.

- [ ] **Step 1: Package markers + requirements**

```python
# functions/satellite_worker/__init__.py
```
```python
# functions/satellite_worker/tests/__init__.py
```
```text
# functions/satellite_worker/requirements.txt
functions-framework==3.*
firebase-admin==6.5.0
google-cloud-pubsub==2.23.0
httpx==0.27.0
pydantic==2.8.2
tenacity==9.0.0
```

- [ ] **Step 2: Write the representative fixture** (contract §5.4 catalog response shape)

```json
// fixtures/copernicus_search.json
{
  "type": "FeatureCollection",
  "features": [
    {
      "id": "S2B_MSIL2A_20260609T190919_N0510_R056_T10TET_20260609T221512",
      "properties": {
        "datetime": "2026-06-09T19:09:19Z",
        "eo:cloud_cover": 12.4
      }
    }
  ]
}
```

- [ ] **Step 3: Write the failing client tests**

```python
# functions/satellite_worker/tests/test_copernicus_client.py
import time

import httpx
import pytest

from satellite_worker import copernicus_client as cc


@pytest.fixture(autouse=True)
def _creds(monkeypatch):
    monkeypatch.setenv("CDSE_CLIENT_ID", "test-id")
    monkeypatch.setenv("CDSE_CLIENT_SECRET", "test-secret")
    cc._reset_token_cache()  # ensure no cross-test token leakage
    yield
    cc._reset_token_cache()


def test_bbox_from_latlng():
    bbox = cc.bbox_for(46.8517, -121.7603)
    assert bbox["west"] == pytest.approx(-121.8403, abs=1e-3)
    assert bbox["east"] == pytest.approx(-121.6803, abs=1e-3)
    assert bbox["south"] == pytest.approx(46.7717, abs=1e-3)
    assert bbox["north"] == pytest.approx(46.9317, abs=1e-3)


def test_eox_tile_template_is_zyx():
    tpl = cc.eox_tile_template()
    assert "{z}/{y}/{x}" in tpl
    assert tpl.endswith(".jpg")


def test_parse_search_extracts_latest_scene(load_fixture):
    scene = cc.parse_search(load_fixture("copernicus_search.json"))
    assert scene["sceneId"].startswith("S2B_MSIL2A_20260609")
    assert scene["latestImageDate"] == "2026-06-09"
    assert scene["cloudCoverPercent"] == 12.4


def test_parse_search_no_scene_returns_none():
    assert cc.parse_search({"type": "FeatureCollection", "features": []}) is None


@pytest.mark.asyncio
async def test_token_is_cached_until_expiry(httpx_mock):
    httpx_mock.add_response(
        url=cc.TOKEN_URL,
        json={"access_token": "jwt-abc", "expires_in": 600},
    )
    t1 = await cc.get_token()
    t2 = await cc.get_token()
    assert t1 == t2 == "jwt-abc"
    # only ONE token request despite two calls (cached until exp)
    assert len(httpx_mock.get_requests(url=cc.TOKEN_URL)) == 1


@pytest.mark.asyncio
async def test_token_refetched_after_expiry(httpx_mock, monkeypatch):
    httpx_mock.add_response(url=cc.TOKEN_URL, json={"access_token": "jwt-1", "expires_in": 600})
    httpx_mock.add_response(url=cc.TOKEN_URL, json={"access_token": "jwt-2", "expires_in": 600})
    now = [1000.0]
    monkeypatch.setattr(cc.time, "monotonic", lambda: now[0])
    t1 = await cc.get_token()
    now[0] += 10_000  # well past 600s (minus skew)
    t2 = await cc.get_token()
    assert t1 == "jwt-1" and t2 == "jwt-2"


@pytest.mark.asyncio
async def test_search_scene_posts_cql2(httpx_mock, load_fixture):
    httpx_mock.add_response(url=cc.TOKEN_URL, json={"access_token": "jwt", "expires_in": 600})
    httpx_mock.add_response(url=cc.SEARCH_URL, json=load_fixture("copernicus_search.json"))
    scene = await cc.search_latest_scene(bbox=cc.bbox_for(46.85, -121.76))
    assert scene["latestImageDate"] == "2026-06-09"
    body = httpx_mock.get_requests(url=cc.SEARCH_URL)[0].read().decode()
    assert "eo:cloud_cover" in body
    assert "cql2-json" in body
    assert "sentinel-2-l2a" in body
```

- [ ] **Step 4: Run to verify it fails**

Run: `cd functions && pytest satellite_worker/tests/test_copernicus_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'satellite_worker.copernicus_client'`.

- [ ] **Step 5: Implement `functions/satellite_worker/copernicus_client.py`**

```python
"""Copernicus / Sentinel-2 client (contract §5.4, spec A5)."""
from __future__ import annotations

import time

import httpx
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from shared.config import require_env

TOKEN_URL = "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token"
SEARCH_URL = "https://sh.dataspace.copernicus.eu/catalog/v1/search"
EOX_TEMPLATE = "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg"
EOX_ATTRIBUTION = (
    "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH "
    "(Contains modified Copernicus Sentinel data)"
)
BBOX_DELTA = 0.08          # degrees (~±9 km)
CLOUD_THRESHOLD = 70       # eo:cloud_cover < 70 (contract §5.4)
TOKEN_SKEW = 60            # refresh this many seconds before exp
HEADERS = {"User-Agent": "MountainWeatherman/1.0 (mountain-weatherman-app)"}
_TIMEOUT = httpx.Timeout(30.0)

# Module-level token cache: (access_token, monotonic_expiry).
_token_cache: tuple[str, float] | None = None

_retry = retry(
    retry=retry_if_exception_type(httpx.HTTPError),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)


def _reset_token_cache() -> None:  # test helper
    global _token_cache
    _token_cache = None


def bbox_for(lat: float, lng: float) -> dict:
    return {
        "west": lng - BBOX_DELTA,
        "east": lng + BBOX_DELTA,
        "south": lat - BBOX_DELTA,
        "north": lat + BBOX_DELTA,
    }


def eox_tile_template() -> str:
    return EOX_TEMPLATE


@_retry
async def get_token() -> str:
    """OAuth2 client-credentials token, cached until exp (contract §5.4)."""
    global _token_cache
    if _token_cache is not None and _token_cache[1] > time.monotonic():
        return _token_cache[0]
    data = {
        "grant_type": "client_credentials",
        "client_id": require_env("CDSE_CLIENT_ID"),
        "client_secret": require_env("CDSE_CLIENT_SECRET"),
    }
    async with httpx.AsyncClient(timeout=_TIMEOUT, headers=HEADERS) as client:
        resp = await client.post(TOKEN_URL, data=data)
        resp.raise_for_status()
        body = resp.json()
    token = body["access_token"]
    expiry = time.monotonic() + max(body.get("expires_in", 600) - TOKEN_SKEW, 0)
    _token_cache = (token, expiry)
    return token


def parse_search(payload: dict) -> dict | None:
    """First (latest) feature → scene metadata, or None when no scene (contract §5.4)."""
    features = payload.get("features") or []
    if not features:
        return None
    feature = features[0]
    props = feature.get("properties", {})
    dt = props.get("datetime", "")
    return {
        "sceneId": feature.get("id", ""),
        "latestImageDate": dt[:10],
        "cloudCoverPercent": props.get("eo:cloud_cover"),
    }


def _search_body(bbox: dict) -> dict:
    return {
        "bbox": [bbox["west"], bbox["south"], bbox["east"], bbox["north"]],
        "datetime": "2015-06-23T00:00:00Z/..",
        "collections": ["sentinel-2-l2a"],
        "limit": 1,
        "sortby": [{"field": "properties.datetime", "direction": "desc"}],
        "filter": {"op": "lt", "args": [{"property": "eo:cloud_cover"}, CLOUD_THRESHOLD]},
        "filter-lang": "cql2-json",
    }


@_retry
async def search_latest_scene(bbox: dict) -> dict | None:
    token = await get_token()
    headers = {**HEADERS, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(SEARCH_URL, headers=headers, json=_search_body(bbox))
        resp.raise_for_status()
        payload = resp.json()
    return parse_search(payload)
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd functions && pytest satellite_worker/tests/test_copernicus_client.py -v`
Expected: 8 passed.

- [ ] **Step 7: Commit**

```bash
git add functions/satellite_worker/__init__.py functions/satellite_worker/tests/__init__.py functions/satellite_worker/requirements.txt functions/satellite_worker/copernicus_client.py functions/satellite_worker/tests/test_copernicus_client.py fixtures/copernicus_search.json
git commit -m "feat(p2): Copernicus CDSE OAuth + Catalog client + EOX tiles + contract tests"
```

---

## Task 6: Satellite worker entry point (`satellite_worker/main.py`) — TDD

**Files:**
- Create: `functions/satellite_worker/main.py`, `functions/satellite_worker/tests/test_main.py`

Behavior (contract §2/§3, spec A5): decode `{ "mountainId": "mt-rainier" }`; load the mountain (lat/lng); compute bbox; get scene metadata via the client; **skip write if no newer scene** (existing `satelliteCache/{mountainId}.latestImageDate` ≥ new date); else write `satelliteCache/{mountainId}` (EOX tile template + `tileSource` + attribution + scene date/cloud + bbox).

- [ ] **Step 1: Write the failing entry-point tests**

```python
# functions/satellite_worker/tests/test_main.py
import base64
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from satellite_worker import main


def _event(payload: dict) -> SimpleNamespace:
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": encoded}})


def _db_with_mountain(existing_cache=None):
    mountain_doc = MagicMock()
    mountain_doc.exists = True
    mountain_doc.to_dict.return_value = {"lat": 46.8517, "lng": -121.7603, "slug": "mt-rainier"}

    cache_doc = MagicMock()
    cache_doc.exists = existing_cache is not None
    cache_doc.to_dict.return_value = existing_cache or {}
    cache_ref = MagicMock()
    cache_ref.get.return_value = cache_doc

    db = MagicMock()

    def collection(name):
        col = MagicMock()
        if name == "mountains":
            col.document.return_value.get.return_value = mountain_doc
        else:  # satelliteCache
            col.document.return_value = cache_ref
        return col

    db.collection.side_effect = collection
    return db, cache_ref


def test_writes_cache_for_new_scene(monkeypatch):
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(
        main, "fetch_scene",
        lambda bbox: {"sceneId": "S2X", "latestImageDate": "2026-06-09", "cloudCoverPercent": 12.4},
    )

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert cache_ref.set.called
    written = cache_ref.set.call_args[0][0]
    assert written["mountainId"] == "mt-rainier"
    assert written["latestImageDate"] == "2026-06-09"
    assert written["cloudCoverPercent"] == 12.4
    assert written["tileSource"] == "eox-s2cloudless"
    assert "{z}/{y}/{x}" in written["tileUrlTemplate"]
    assert written["boundingBox"]["north"] > written["boundingBox"]["south"]


def test_skips_when_no_newer_scene(monkeypatch):
    db, cache_ref = _db_with_mountain(existing_cache={"latestImageDate": "2026-06-09"})
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(
        main, "fetch_scene",
        lambda bbox: {"sceneId": "S2X", "latestImageDate": "2026-06-09", "cloudCoverPercent": 5.0},
    )

    main.handle_message(_event({"mountainId": "mt-rainier"}))
    cache_ref.set.assert_not_called()


def test_no_scene_found_is_noop(monkeypatch):
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: None)

    main.handle_message(_event({"mountainId": "mt-rainier"}))
    cache_ref.set.assert_not_called()


def test_decode_extracts_mountain_id():
    assert main._decode(_event({"mountainId": "mt-rainier"})) == {"mountainId": "mt-rainier"}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && pytest satellite_worker/tests/test_main.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'satellite_worker.main'`.

- [ ] **Step 3: Implement `functions/satellite_worker/main.py`**

```python
"""Satellite worker entry point (contract §2/§3, spec A5)."""
from __future__ import annotations

import asyncio
import base64
import json
from datetime import datetime
from zoneinfo import ZoneInfo

import functions_framework

from shared.firestore_client import get_db
from shared.models import SatelliteCache
from satellite_worker import copernicus_client as cc

PACIFIC = ZoneInfo("America/Los_Angeles")


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode())


def fetch_scene(bbox: dict) -> dict | None:
    """Sync wrapper: catalog search for the latest <70%-cloud scene (contract §5.4)."""
    return asyncio.run(cc.search_latest_scene(bbox))


def _is_newer(new_date: str | None, existing_date: str | None) -> bool:
    if not new_date:
        return False
    if not existing_date:
        return True
    return new_date > existing_date


@functions_framework.cloud_event
def handle_message(cloud_event) -> None:
    payload = _decode(cloud_event)
    mountain_id = str(payload["mountainId"])
    db = get_db()

    mountain_snap = db.collection("mountains").document(mountain_id).get()
    if not mountain_snap.exists:
        print(f"satellite_worker: mountain {mountain_id} not found, skipping")
        return
    mountain = mountain_snap.to_dict()
    bbox = cc.bbox_for(mountain["lat"], mountain["lng"])

    scene = fetch_scene(bbox)
    if scene is None:
        print(f"satellite_worker: no scene for {mountain_id}, skipping")
        return

    cache_ref = db.collection("satelliteCache").document(mountain_id)
    existing = cache_ref.get()
    existing_date = (existing.to_dict() or {}).get("latestImageDate") if existing.exists else None
    if not _is_newer(scene["latestImageDate"], existing_date):
        print(f"satellite_worker: no newer scene for {mountain_id}, skipping")
        return

    cache = SatelliteCache(
        mountainId=mountain_id,
        latestImageDate=scene["latestImageDate"],
        cloudCoverPercent=scene["cloudCoverPercent"],
        sceneId=scene["sceneId"],
        tileUrlTemplate=cc.eox_tile_template(),
        tileSource="eox-s2cloudless",
        attribution=cc.EOX_ATTRIBUTION,
        boundingBox=bbox,
    )
    record = cache.model_dump(by_alias=True)
    record["updatedAt"] = datetime.now(tz=PACIFIC)
    cache_ref.set(record)
    print(f"satellite_worker: wrote {mountain_id} scene {scene['latestImageDate']}")
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd functions && pytest satellite_worker/tests/test_main.py -v`
Expected: 4 passed.

- [ ] **Step 5: Commit**

```bash
git add functions/satellite_worker/main.py functions/satellite_worker/tests/test_main.py
git commit -m "feat(p2): satellite worker entry point — write satelliteCache with newer-scene skip"
```

---

## Task 7: Extend the orchestrator (`orchestrator/main.py`) — TDD

**Files:**
- Modify: `functions/orchestrator/main.py`
- Modify: `functions/orchestrator/tests/test_main.py`

Behavior (contract §2, spec §3): the orchestrator already handles `type == "weather"` (P1). Add three branches that load active projects, dedup the relevant id, and publish one refresh per unique id:
- `type == "nwac"` → dedup `mountains/{...}.nwacZoneId` across active projects → publish `nwac-refresh` `{"zoneId": ...}` per unique zone. (Runs under the 15-min morning capture window; workers self-gate idempotently.)
- `type == "snotel"` → dedup `snotelStationId` → publish `snotel-refresh` `{"stationId": ...}` per unique station.
- `type == "satellite"` → dedup `mountainId` → publish `satellite-refresh` `{"mountainId": ...}` per unique mountain.
- Empty active-projects set → no publishes.

> **Do not rewrite P1's `weather` branch.** Add new branches only, and reuse P1's existing helpers (active-projects loader, `publish`). The code below shows the *additions*; adapt names to the actual P1 file.

- [ ] **Step 1: Add the failing fan-out tests** (append to the existing test module)

```python
# functions/orchestrator/tests/test_main.py  (additions)
import base64
import json
from types import SimpleNamespace
from unittest.mock import MagicMock, call

from orchestrator import main


def _event(payload: dict) -> SimpleNamespace:
    encoded = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": encoded}})


def _mountain(doc_id, **fields):
    doc = MagicMock(); doc.id = doc_id
    doc.to_dict.return_value = fields
    return doc


def _project(mountain_id):
    doc = MagicMock()
    doc.to_dict.return_value = {"mountainId": mountain_id, "status": "active"}
    return doc


def test_nwac_fanout_dedups_zone(monkeypatch):
    # two active projects on two mountains that share zone 1648
    projects = [_project("mt-rainier"), _project("mt-st-helens")]
    mountains = {
        "mt-rainier": _mountain("mt-rainier", nwacZoneId="1648", snotelStationId="679"),
        "mt-st-helens": _mountain("mt-st-helens", nwacZoneId="1648", snotelStationId="553"),
    }
    monkeypatch.setattr(main, "load_active_projects", lambda: projects)
    monkeypatch.setattr(main, "load_mountain", lambda mid: mountains[mid])
    published = []
    monkeypatch.setattr(main, "publish", lambda topic, payload: published.append((topic, payload)))

    main.orchestrate(_event({"type": "nwac"}))

    assert published == [("nwac-refresh", {"zoneId": "1648"})]


def test_snotel_fanout_dedups_station(monkeypatch):
    projects = [_project("mt-baker"), _project("mt-shuksan")]
    mountains = {
        "mt-baker": _mountain("mt-baker", nwacZoneId="1646", snotelStationId="909"),
        "mt-shuksan": _mountain("mt-shuksan", nwacZoneId="1646", snotelStationId="909"),
    }
    monkeypatch.setattr(main, "load_active_projects", lambda: projects)
    monkeypatch.setattr(main, "load_mountain", lambda mid: mountains[mid])
    published = []
    monkeypatch.setattr(main, "publish", lambda topic, payload: published.append((topic, payload)))

    main.orchestrate(_event({"type": "snotel"}))

    assert published == [("snotel-refresh", {"stationId": "909"})]


def test_satellite_fanout_per_mountain(monkeypatch):
    projects = [_project("mt-baker"), _project("mt-baker"), _project("mt-hood")]
    mountains = {
        "mt-baker": _mountain("mt-baker", nwacZoneId="1646", snotelStationId="909"),
        "mt-hood": _mountain("mt-hood", nwacZoneId="1657", snotelStationId="651"),
    }
    monkeypatch.setattr(main, "load_active_projects", lambda: projects)
    monkeypatch.setattr(main, "load_mountain", lambda mid: mountains[mid])
    published = []
    monkeypatch.setattr(main, "publish", lambda topic, payload: published.append((topic, payload)))

    main.orchestrate(_event({"type": "satellite"}))

    assert sorted(published) == [
        ("satellite-refresh", {"mountainId": "mt-baker"}),
        ("satellite-refresh", {"mountainId": "mt-hood"}),
    ]


def test_empty_projects_no_publishes(monkeypatch):
    monkeypatch.setattr(main, "load_active_projects", lambda: [])
    published = []
    monkeypatch.setattr(main, "publish", lambda topic, payload: published.append((topic, payload)))
    for t in ("nwac", "snotel", "satellite"):
        main.orchestrate(_event({"type": t}))
    assert published == []
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd functions && pytest orchestrator/tests/test_main.py -k "fanout or empty_projects" -v`
Expected: FAIL — branches for `nwac`/`snotel`/`satellite` not handled (e.g. `KeyError`/no publishes / `AttributeError` if helpers absent).

- [ ] **Step 3: Add the three branches to `functions/orchestrator/main.py`**

Insert into the existing dispatch in `orchestrate` (alongside the P1 `weather` branch). If P1 named helpers differently, reuse those; otherwise add the helpers shown.

```python
# --- add near the top-level helpers (reuse P1 equivalents if present) ---
def load_mountain(mountain_id):
    """Load a mountain doc by id (reuses get_db)."""
    from shared.firestore_client import get_db
    return get_db().collection("mountains").document(mountain_id).get()


def _unique_field_over_projects(projects, field: str) -> list[str]:
    """Dedup a mountain field (e.g. nwacZoneId) across active projects, preserving order."""
    seen: list[str] = []
    for project in projects:
        mountain_id = (project.to_dict() or {}).get("mountainId")
        if not mountain_id:
            continue
        snap = load_mountain(mountain_id)
        value = (snap.to_dict() or {}).get(field) if snap.exists else None
        if value and value not in seen:
            seen.append(value)
    return seen


def _unique_mountains(projects) -> list[str]:
    seen: list[str] = []
    for project in projects:
        mountain_id = (project.to_dict() or {}).get("mountainId")
        if mountain_id and mountain_id not in seen:
            seen.append(mountain_id)
    return seen


# --- inside orchestrate(cloud_event), after the existing weather branch ---
    elif msg_type == "nwac":
        projects = load_active_projects()
        for zone_id in _unique_field_over_projects(projects, "nwacZoneId"):
            publish("nwac-refresh", {"zoneId": zone_id})

    elif msg_type == "snotel":
        projects = load_active_projects()
        for station_id in _unique_field_over_projects(projects, "snotelStationId"):
            publish("snotel-refresh", {"stationId": station_id})

    elif msg_type == "satellite":
        projects = load_active_projects()
        for mountain_id in _unique_mountains(projects):
            publish("satellite-refresh", {"mountainId": mountain_id})
```

> `load_active_projects` and `publish` are P1 helpers. `publish(topic_logical, payload)` resolves the full topic path via `shared.config.topic_path` and base64-encodes the JSON (P1). If P1's `publish` signature differs, adapt the calls — the **logical** topic names are `nwac-refresh` / `snotel-refresh` / `satellite-refresh` (contract §2).

- [ ] **Step 4: Run to verify it passes (and P1 weather tests still green)**

Run: `cd functions && pytest orchestrator/tests/test_main.py -v`
Expected: all orchestrator tests pass (new fan-out + empty + the pre-existing P1 weather tests).

- [ ] **Step 5: Commit**

```bash
git add functions/orchestrator/main.py functions/orchestrator/tests/test_main.py
git commit -m "feat(p2): orchestrator nwac/snotel/satellite fan-out with dedup"
```

---

## Task 8: Extend Terraform `functions` module + CDSE secrets

**Files:**
- Modify: `terraform/modules/functions/main.tf`, `terraform/modules/functions/variables.tf`
- Create: `terraform/modules/functions/secrets.tf`
- Modify: `terraform/main.tf`, `terraform/variables.tf`

> P1 built `modules/functions` as a list/map-driven module (one `google_cloudfunctions2_function` per entry, keyed by name with entry-point/topic/memory/timeout/max-instances). P2 **appends three entries** and wires CDSE secrets for the satellite worker. The exact local variable name (`var.functions` / `local.functions`) depends on P1 — adapt to it; the three appended entries must match contract §2.

- [ ] **Step 1: Append the three function definitions** to the module's functions list/map (per contract §2 — name → entry point → trigger topic → mem → timeout → max inst). Example shape if the module takes a `functions` map variable; otherwise add equivalently to P1's local list:

```hcl
# terraform/modules/functions/main.tf  (append to the existing functions definition)
# NWAC worker — 256Mi / 60s / max 5
# SNOTEL worker — 256Mi / 60s / max 10
# Satellite worker — 512Mi / 300s / max 5 (+ CDSE secret env)
#
# If P1 defined `local.functions = { ... }`, append:
#   "nwac-worker"      = { entry_point = "handle_message", topic = "nwac-refresh",      memory = "256Mi", timeout = 60,  max_instances = 5,  service_account = module.iam... , secrets = [] }
#   "snotel-worker"    = { entry_point = "handle_message", topic = "snotel-refresh",    memory = "256Mi", timeout = 60,  max_instances = 10, service_account = module.iam... , secrets = [] }
#   "satellite-worker" = { entry_point = "handle_message", topic = "satellite-refresh", memory = "512Mi", timeout = 300, max_instances = 5,  service_account = module.iam... , secrets = ["CDSE_CLIENT_ID","CDSE_CLIENT_SECRET"] }
#
# The per-function resource block must render secret_environment_variables for any
# entry whose `secrets` is non-empty:
#
#   dynamic "secret_environment_variables" {
#     for_each = toset(lookup(each.value, "secrets", []))
#     content {
#       key        = secret_environment_variables.value
#       project_id = var.project_id
#       secret     = lower(replace(secret_environment_variables.value, "_", "-"))  # CDSE_CLIENT_ID -> cdse-client-id
#       version    = "latest"
#     }
#   }
```

> The exact rendering depends on P1's loop. The required outcome: three new `google_cloudfunctions2_function` resources named `${var.env}-nwac-worker`, `${var.env}-snotel-worker`, `${var.env}-satellite-worker`, each triggered by its `${var.env}-{topic}` Pub/Sub topic via Eventarc, with the source zip from the P1 source bucket, running entry point `handle_message`, and the satellite worker carrying the two CDSE secret env vars.

- [ ] **Step 2: Create `terraform/modules/functions/secrets.tf`** (CDSE Secret Manager + IAM accessor for the satellite SA)

```hcl
# terraform/modules/functions/secrets.tf
resource "google_secret_manager_secret" "cdse_client_id" {
  secret_id = "cdse-client-id"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "cdse_client_id" {
  secret      = google_secret_manager_secret.cdse_client_id.id
  secret_data = var.cdse_client_id
}

resource "google_secret_manager_secret" "cdse_client_secret" {
  secret_id = "cdse-client-secret"
  replication { auto {} }
}

resource "google_secret_manager_secret_version" "cdse_client_secret" {
  secret      = google_secret_manager_secret.cdse_client_secret.id
  secret_data = var.cdse_client_secret
}

# Grant the satellite worker SA read access to both secrets.
resource "google_secret_manager_secret_iam_member" "satellite_id" {
  secret_id = google_secret_manager_secret.cdse_client_id.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.satellite_sa_email}"
}

resource "google_secret_manager_secret_iam_member" "satellite_secret" {
  secret_id = google_secret_manager_secret.cdse_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.satellite_sa_email}"
}
```

- [ ] **Step 3: Add variables to `terraform/modules/functions/variables.tf`**

```hcl
variable "cdse_client_id" {
  type      = string
  sensitive = true
}
variable "cdse_client_secret" {
  type      = string
  sensitive = true
}
variable "satellite_sa_email" {
  type = string
}
```

- [ ] **Step 4: Wire the values in `terraform/main.tf`** (module "functions" call) and declare top-level vars in `terraform/variables.tf`

```hcl
# terraform/variables.tf  (add)
variable "cdse_client_id"     { type = string, sensitive = true, default = "" }
variable "cdse_client_secret" { type = string, sensitive = true, default = "" }
```
```hcl
# terraform/main.tf  (extend the existing module "functions" block)
module "functions" {
  # ... existing P1 args ...
  cdse_client_id     = var.cdse_client_id
  cdse_client_secret = var.cdse_client_secret
  satellite_sa_email = module.iam.sa_emails["satellite-worker"]
}
```

> Provide the secret values at apply time (do not commit them): `-var="cdse_client_id=..." -var="cdse_client_secret=..."` or a gitignored `*.auto.tfvars`. Defaults are empty so `validate`/`plan` work without them.

- [ ] **Step 5: Validate**

Run:
```bash
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 6: Commit**

```bash
git add terraform/modules/functions/ terraform/main.tf terraform/variables.tf
git commit -m "feat(p2): terraform — nwac/snotel/satellite functions + CDSE Secret Manager"
```

---

## Task 9: Capture real fixtures

**Files:**
- Overwrite: `fixtures/nwac_winter.json`, `fixtures/nwac_summer.json`, `fixtures/snotel.json`, `fixtures/copernicus_search.json`

Replace the inline representative fixtures with **full real captures** so the contract tests guard against schema drift. Re-run the test suite after each capture to confirm the parsers still pass against real data.

- [ ] **Step 1: Capture NWAC winter** (use a zone that is in season; West Slopes South = 1648). If captured in summer, capture from the prior season's archived product or hand-verify against the documented winter shape, then keep the inline winter fixture as the canonical winter contract test.

Run:
```bash
curl -s -H "User-Agent: MountainWeatherman/1.0" -H "Accept: application/json" \
  "https://api.avalanche.org/v2/public/product?type=forecast&center_id=NWAC&zone_id=1648" \
  -o fixtures/nwac_winter.json
```
Expected: a JSON product. If `product_type == "summary"` (off-season), keep the inline winter fixture and document that the live winter capture is deferred until the season returns.

- [ ] **Step 2: Capture NWAC summer** (today, 2026-06-14, NWAC is off-season → summary)

Run:
```bash
curl -s -H "User-Agent: MountainWeatherman/1.0" -H "Accept: application/json" \
  "https://api.avalanche.org/v2/public/product?type=forecast&center_id=NWAC&zone_id=1648" \
  -o fixtures/nwac_summer.json
```
Expected: `product_type: "summary"`, empty `danger`/`forecast_avalanche_problems`.

- [ ] **Step 3: Capture SNOTEL** (Paradise 679; 30-day window; combine data + stations into the fixture's `data`/`stations` keys)

Run:
```bash
END=$(date +%F); BEGIN=$(date -v-30d +%F 2>/dev/null || date -d '-30 days' +%F)
curl -s "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=679:WA:SNTL&elements=WTEQ,SNWD,TMAX,TMIN,PREC&duration=DAILY&beginDate=${BEGIN}&endDate=${END}&centralTendencyType=MEDIAN&returnFlags=false" -o /tmp/snotel_data.json
curl -s "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/stations?stationTriplets=679:WA:SNTL&activeOnly=true" -o /tmp/snotel_stations.json
```
Then assemble `fixtures/snotel.json` as `{"data": <contents of /tmp/snotel_data.json>, "stations": <contents of /tmp/snotel_stations.json>}` (the response arrays unwrapped to lists if the API wraps them under `data`/`stations`). Expected: WTEQ/SNWD/PREC series with `median` on WTEQ/PREC.

- [ ] **Step 4: Capture Copernicus catalog search** (requires a real token; do NOT commit the token)

Run:
```bash
TOKEN=$(curl -s -X POST "https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token" \
  -d "grant_type=client_credentials&client_id=${CDSE_CLIENT_ID}&client_secret=${CDSE_CLIENT_SECRET}" | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])")
curl -s -X POST "https://sh.dataspace.copernicus.eu/catalog/v1/search" \
  -H "Authorization: Bearer ${TOKEN}" -H "Content-Type: application/json" \
  -d '{"bbox":[-121.84,46.77,-121.68,46.93],"datetime":"2015-06-23T00:00:00Z/..","collections":["sentinel-2-l2a"],"limit":1,"sortby":[{"field":"properties.datetime","direction":"desc"}],"filter":{"op":"lt","args":[{"property":"eo:cloud_cover"},70]},"filter-lang":"cql2-json"}' \
  -o fixtures/copernicus_search.json
```
Expected: a `FeatureCollection` with one feature carrying `properties.datetime` + `eo:cloud_cover`.

- [ ] **Step 5: Re-run all contract tests against the real captures**

Run: `cd functions && pytest -k "client" -v`
Expected: all client/contract tests pass against the real fixtures. If a parser breaks, fix the parser (not the fixture) and re-commit.

- [ ] **Step 6: Commit**

```bash
git add fixtures/nwac_winter.json fixtures/nwac_summer.json fixtures/snotel.json fixtures/copernicus_search.json
git commit -m "test(p2): capture real NWAC/SNOTEL/Copernicus fixtures for contract tests"
```

---

## Task 10: Deploy + verify (dev)

- [ ] **Step 1: Full local gate**

Run: `cd functions && pytest`
Expected: all tests pass; `Required test coverage of 90% reached`. Exit code 0.

- [ ] **Step 2: Terraform plan + apply (dev)** (pass CDSE secrets at apply time)

Run:
```bash
terraform -chdir=terraform init
terraform -chdir=terraform plan -var-file=environments/dev.tfvars \
  -var="cdse_client_id=$CDSE_CLIENT_ID" -var="cdse_client_secret=$CDSE_CLIENT_SECRET"
terraform -chdir=terraform apply -var-file=environments/dev.tfvars \
  -var="cdse_client_id=$CDSE_CLIENT_ID" -var="cdse_client_secret=$CDSE_CLIENT_SECRET"
```
Expected: plan creates 3 new Cloud Functions (`dev-nwac-worker`, `dev-snotel-worker`, `dev-satellite-worker`), 2 Secret Manager secrets + versions, 2 IAM bindings; apply completes with no errors.

- [ ] **Step 3: Confirm all 4 scheduler jobs exist**

Run: `gcloud scheduler jobs list --location=us-west1 --project=mountain-weatherman-app --filter="name~dev-" --format="value(name)"`
Expected: lists `dev-weather-orchestrate`, `dev-nwac-orchestrate`, `dev-snotel-orchestrate`, `dev-satellite-orchestrate`.

- [ ] **Step 4: Fire each scheduler job manually and confirm it runs**

Run:
```bash
for j in nwac snotel satellite; do gcloud scheduler jobs run dev-${j}-orchestrate --location=us-west1 --project=mountain-weatherman-app; done
```
Expected: each returns success; orchestrator logs show fan-out publishes (none if no active projects — then publish refreshes directly in Step 5).

- [ ] **Step 5: Manually publish refreshes and verify Firestore docs**

Run:
```bash
gcloud pubsub topics publish dev-nwac-refresh --project=mountain-weatherman-app --message='{"zoneId":"1648"}'
gcloud pubsub topics publish dev-snotel-refresh --project=mountain-weatherman-app --message='{"stationId":"679"}'
gcloud pubsub topics publish dev-satellite-refresh --project=mountain-weatherman-app --message='{"mountainId":"mt-rainier"}'
```
Then verify (after ~30s):
```bash
gcloud firestore documents list "projects/mountain-weatherman-app/databases/(default)/documents/nwacForecasts" --project=mountain-weatherman-app
gcloud firestore documents list "projects/mountain-weatherman-app/databases/(default)/documents/snotelData" --project=mountain-weatherman-app
gcloud firestore documents list "projects/mountain-weatherman-app/databases/(default)/documents/satelliteCache" --project=mountain-weatherman-app
```
Expected: `nwacForecasts/1648`, `snotelData/679`, `satelliteCache/mt-rainier` present. Check worker logs:
```bash
gcloud functions logs read dev-nwac-worker --region=us-west1 --project=mountain-weatherman-app --limit=20
```
Expected: "captured zone 1648 …" / "wrote station 679" / "wrote mt-rainier scene …".

- [ ] **Step 6: Confirm CI green (≥90% coverage)**

Push the branch / open a PR; confirm the `python` CI job passes with the coverage gate enforced.
Expected: green check on the PR.

- [ ] **Step 7: Final commit / merge**

```bash
git add -A
git commit -m "chore(p2): NWAC/SNOTEL/satellite workers complete — deployed + verified"
```

---

## Verification gate (P2 done when all true)
- `cd functions && pytest` ✓ coverage ≥90% (all four workers + orchestrator) ✓
- All three clients parse real `fixtures/*.json` ✓; summer / missing-day / no-scene edge cases covered ✓
- `terraform validate` ✓ · `plan`/`apply` (dev) creates 3 functions + 2 CDSE secrets + IAM ✓
- All 4 scheduler jobs exist and fire ✓
- Manual `nwac/snotel/satellite-refresh` publishes write `nwacForecasts/{zoneId}`, `snotelData/{stationId}`, `satelliteCache/{mountainId}` and update project summaries ✓
- NWAC second fire of the same zone same day is a no-op (idempotent capture) ✓
- CI green ✓ · `python-reviewer` agent run with no blocking findings ✓

## Rollback / notes
- `terraform -chdir=terraform destroy -target=module.functions ...` removes the three workers + secrets without touching base infra; or `terraform apply` after reverting the appended entries.
- Secret values are never committed; rotate via `gcloud secrets versions add cdse-client-id --data-file=-`.
- **Open risk — off-season NWAC:** on 2026-06-14 NWAC is in summer (all zones return `product_type:"summary"`). The live winter capture (Task 9 Step 1) is therefore deferred until the season returns; the inline winter fixture (verified against the documented §5.2 winter shape) backs the winter contract test in the meantime. This is a known gap, not a blocker.
- **Open risk — Copernicus token in CI:** the live token capture (Task 9 Step 4) needs real CDSE creds; CI uses the saved fixture only (token + search are mocked in unit tests), so CI never needs the secret. Live smoke tests against CDSE are opt-in (`@pytest.mark.live`, deselected by default per contract §12) and can be added later.
- **Dependency note:** this plan assumes P1 delivered `functions/shared/*`, the orchestrator with `load_active_projects`/`publish` helpers + a `weather` branch, and a list-driven `terraform/modules/functions`. If P1's names differ, adapt the imports/helper calls and the Terraform functions-list append accordingly — the contract §2 resource names, entry points, and message schemas are authoritative.
- **EOX tile note:** the s2cloudless template uses `{z}/{y}/{x}` (TMS/EOX order, contract §5.4) — the frontend tile layer must account for this when wiring the map in P4.
```