# P1 — Weather Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the weather data pipeline end-to-end in Python: shared Firestore/Storage/Pub-Sub clients, the canonical Pydantic models, an async Open-Meteo client (forecast + previous-runs), server-side tone/verdict + target-date summary derivation, the `weather_worker` (writes combined blob + `mountainConditions` + per-project `weatherSnapshots` + `currentSummary`), the `orchestrator` (urgency tiering + dedup + fan-out), and the `backfill_worker` (Previous Runs reconstruction). Wire the three functions into Terraform and deploy + verify the Scheduler→Pub/Sub→worker→Firestore/GCS path on real (dev) GCP. ≥90% pytest coverage throughout.

**Architecture:** Six Python Cloud Functions are planned overall (contract §1/§2); P1 ships **three**: `orchestrator`, `weather-worker`, `backfill-worker` (NWAC/SNOTEL/satellite arrive in P2). Cloud Scheduler publishes `{"type":"weather"}` to the `orchestrate` topic hourly; the orchestrator reads active projects (contract §3 index `status ASC, targetDateEnd ASC`), computes per-mountain max urgency, dedups, and publishes `weather-refresh` messages. The `weather-worker` fetches Open-Meteo, normalizes to a `CombinedForecastBlob` (contract §8), writes it to `${weather-data}/forecasts/{mountainId}/{YYYY-MM-DD}/{HHmm}-combined.json` (contract §4), upserts `mountainConditions/{mountainId}` (always), and for each active project referencing the mountain writes a `weatherSnapshot` (`source:"live"`, 30-day TTL) + updates `currentSummary` (tone/verdict from §6, using the latest `currentAvalancheSummary` danger if present). On project create the API publishes `backfill-refresh`; the `backfill-worker` sweeps the Previous Runs API (`_previous_dayN`, N=0..7) to reconstruct evolution snapshots (`source:"backfill"`). All HTTP is async `httpx` with `tenacity` retry; all external HTTP is mocked in tests with `pytest-httpx` against saved `fixtures/*.json`.

**Tech Stack:** Python 3.12; `functions-framework` 3.x (`@functions_framework.cloud_event`); Pydantic v2; `httpx` 0.27 (async); `tenacity` 9; `firebase-admin` 6.5 (Firestore); `google-cloud-pubsub` 2.x; `google-cloud-storage` 2.x; pytest 8 (`asyncio_mode=auto`), `pytest-httpx`, `pytest-mock`, `pytest-cov` (`--cov-fail-under=90`). Terraform 1.8 (google ~5.40) for the `functions` module (Gen2, python312). Reuses `functions/shared/config.py` and `functions/conftest.py` from P0.

**Python/GCP conventions** (apply throughout — see the project `python-gcp-patterns` skill, invoked at the verification gate): all Pub/Sub-triggered entry points use `@functions_framework.cloud_event`; the message JSON is base64 in `cloud_event.data["message"]["data"]`. `firebase_admin` is initialized once via a module-level singleton guard (`if not firebase_admin._apps: firebase_admin.initialize_app()`). Pydantic v2 with `ConfigDict(populate_by_name=True, extra="allow")` where dynamic keys appear (contract §8). Async fetches use a single `httpx.AsyncClient` per call; `tenacity` `@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2), reraise=True)`. Workers raise on unrecoverable errors so Pub/Sub retries → DLQ; they swallow per-model failures into "partial" status.

**References:** `docs/superpowers/specs/2026-06-14-mountain-weather-poc-design.md` (spec) and `docs/superpowers/specs/2026-06-14-interface-contract.md` (contract). Section numbers below (e.g. "contract §5.1") refer to the contract; spec sections are called out as "spec §3" etc. The tone scoring is ported from `prototype-ui/prototype-design-review/project/app/data.js` (the `summarize()` function, lines ~378-392).

**Prerequisites:**
- **P0 complete and merged.** Specifically: `functions/pyproject.toml` (pytest + `--cov-fail-under=90` + `live` marker + `asyncio_mode=auto`), `functions/requirements.txt` / `requirements-dev.txt`, `functions/conftest.py` (fixtures `load_fixture`, `mock_db`, `mock_publisher`, `mock_storage_client`, `sample_mountain_doc`, `sample_active_project`), `functions/shared/{__init__.py,config.py}` (with `GCP_PROJECT`, `ENV`, `GCS_BUCKET_WEATHER`, `topic_path()`, `require_env()`), the Terraform base (`terraform/main.tf` with `module "storage"`, `module "pubsub"`, `module "iam"` exporting `sa_emails`, `topic_ids`, bucket names), Firestore DB + TTL policy on `weatherSnapshots.expireAt`, and the `dev` Pub/Sub topics + DLQ.
- `gcloud` authenticated as owner of `mountain-weatherman-app`; `pip install -r functions/requirements-dev.txt` done.
- Network access to `api.open-meteo.com` for the one fixture-capture task (Task 14) and the pressure-level live spike (Task 6); both are `@pytest.mark.live` / one-time and excluded from CI by default.

**Exit criteria:**
- `cd functions && pytest` passes with coverage **≥90%** (the gate `--cov-fail-under=90` is enforced).
- The three new workers (`orchestrator/main.py`, `weather_worker/main.py`, `backfill_worker/main.py`) plus all `shared/*` and `weather_worker/*` modules have unit/contract tests; live tests are marked `@pytest.mark.live` and deselected by default.
- `fixtures/open_meteo_forecast.json` and `fixtures/open_meteo_previous_runs.json` exist (real trimmed responses) and the contract tests parse them green.
- `terraform -chdir=terraform validate` passes with the new `functions` module wired into `main.tf`.
- `terraform -chdir=terraform apply -var-file=environments/dev.tfvars` deploys the 3 Gen2 functions; a manual `weather-refresh` for `mt-rainier` produces a `combined.json` in GCS, a `mountainConditions/mt-rainier` doc, and (for the sample project) a `weatherSnapshot`.
- The pressure-level spike outcome (chosen hPa levels) is recorded in this plan (Task 6).

---

## File structure created/modified in P1

| Path | Status | Responsibility |
|---|---|---|
| `functions/shared/models.py` | Create | Canonical Pydantic v2 models (contract §8) — OM, ModelSeries, CombinedForecastBlob, summaries, NWAC/SNOTEL/Satellite |
| `functions/shared/firestore_client.py` | Create | Firestore read/write helpers (contract §3) |
| `functions/shared/storage_client.py` | Create | GCS blob write + path builder (contract §4) |
| `functions/shared/pubsub_client.py` | Create | Pub/Sub publish helper (contract §2) |
| `functions/shared/tests/test_models.py` | Create | Model validation / alias / dynamic-key tests |
| `functions/shared/tests/test_firestore_client.py` | Create | Firestore helper tests (mock_db) |
| `functions/shared/tests/test_storage_client.py` | Create | Storage helper tests (mock_storage_client) |
| `functions/shared/tests/test_pubsub_client.py` | Create | Pub/Sub helper tests (mock_publisher) |
| `functions/weather_worker/__init__.py` | Create | Package marker |
| `functions/weather_worker/open_meteo_client.py` | Create | Async Open-Meteo fetch + parse (contract §5.1) |
| `functions/weather_worker/tone.py` | Create | Tone scoring + verdict (ported from `data.js`; contract §6) |
| `functions/weather_worker/summary.py` | Create | Target-date summary derivation (contract §6) |
| `functions/weather_worker/main.py` | Create | `handle_message` weather pipeline entry point |
| `functions/weather_worker/requirements.txt` | Create | Worker runtime deps |
| `functions/weather_worker/tests/{__init__.py,test_open_meteo_client.py,test_tone.py,test_summary.py,test_main.py,test_pressure_levels_live.py}` | Create | Worker tests + live spike |
| `functions/orchestrator/__init__.py` | Create | Package marker |
| `functions/orchestrator/main.py` | Create | `orchestrate` entry point (tiering + dedup + fan-out) |
| `functions/orchestrator/requirements.txt` | Create | Worker runtime deps |
| `functions/orchestrator/tests/{__init__.py,test_main.py}` | Create | Orchestrator tests |
| `functions/backfill_worker/__init__.py` | Create | Package marker |
| `functions/backfill_worker/main.py` | Create | `handle_message` backfill entry point |
| `functions/backfill_worker/requirements.txt` | Create | Worker runtime deps |
| `functions/backfill_worker/tests/{__init__.py,test_main.py}` | Create | Backfill tests |
| `fixtures/open_meteo_forecast.json` | Create | Saved real trimmed multi-model forecast |
| `fixtures/open_meteo_previous_runs.json` | Create | Saved real trimmed previous-runs response |
| `terraform/modules/functions/{main.tf,variables.tf,outputs.tf}` | Create | Gen2 functions module (parameterized by `locals.functions`) |
| `terraform/main.tf` | Modify | Wire `module "functions"` |
| `terraform/outputs.tf` | Modify | Export function names/URIs |

---

## Task 1: Pydantic models (`functions/shared/models.py`)

**Files:**
- Create: `functions/shared/models.py`
- Test: `functions/shared/tests/test_models.py`

- [ ] **Step 1: Write the failing test** — `functions/shared/tests/test_models.py`

```python
import json
from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from shared.models import (
    OMHourly, OMResponse, OMError, ModelSeries, CombinedForecastBlob,
    ModelDaySummary, CurrentSummary, NwacDanger, NwacProblem, NwacForecast,
    SnotelReading, SnotelData, SatelliteCache,
)


def test_omhourly_allows_dynamic_suffixed_keys():
    h = OMHourly.model_validate({
        "time": ["2026-08-02T00:00", "2026-08-02T01:00"],
        "temperature_2m_gfs_seamless": [50.1, 49.0],
        "freezing_level_height_ecmwf_ifs025": [3200.0, 3250.0],
    })
    assert h.time == ["2026-08-02T00:00", "2026-08-02T01:00"]
    # extra="allow" keeps dynamic keys reachable via model_extra
    assert h.model_extra["temperature_2m_gfs_seamless"] == [50.1, 49.0]


def test_omresponse_parses_core_fields():
    r = OMResponse.model_validate({
        "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
        "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
        "hourly_units": {"temperature_2m": "°F"},
        "hourly": {"time": ["2026-08-02T00:00"], "temperature_2m_gfs_seamless": [50.0]},
    })
    assert r.timezone == "America/Los_Angeles"
    assert r.hourly.time == ["2026-08-02T00:00"]


def test_omerror_shape():
    e = OMError.model_validate({"error": True, "reason": "Cannot initialize HRRR"})
    assert e.error is True
    assert "HRRR" in e.reason


def test_modelseries_defaults_empty_and_accepts_nulls():
    s = ModelSeries(time=["2026-08-02T00:00"], temperature_2m=[50.0, None])
    assert s.available is True
    assert s.temperature_2m == [50.0, None]
    assert s.temp_summit_f == []  # default


def test_combinedforecastblob_camelcase_aliases_roundtrip():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier",
        timezone="America/Los_Angeles",
        fetchedAt=datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc),
        gfs=ModelSeries(time=["2026-08-02T12:00"]),
    )
    assert blob.mountain_id == "mt-rainier"
    dumped = blob.model_dump(by_alias=True)
    assert dumped["mountainId"] == "mt-rainier"
    assert "fetchedAt" in dumped
    # also constructible by python field name (populate_by_name=True)
    blob2 = CombinedForecastBlob(
        mountain_id="mt-baker", timezone="America/Los_Angeles",
        fetched_at=datetime(2026, 8, 2, 12, 0, tzinfo=timezone.utc),
    )
    assert blob2.mountain_id == "mt-baker"


def test_modeldaysummary_optional_fields():
    d = ModelDaySummary(available=False)
    assert d.available is False
    assert d.summitHighF is None


def test_currentsummary_requires_tone_and_verdict():
    cs = CurrentSummary(
        targetDateHigh=18.0, targetDateLow=4.0, targetDateWind=40.0,
        targetDatePrecip=0.0, freezingLevelFt=6500.0, precipType="none",
        summaryModel="gfs", tone="caution", verdict="Cold window holds before a front",
    )
    assert cs.tone == "caution"
    with pytest.raises(ValidationError):
        CurrentSummary(targetDateHigh=1, targetDateLow=1, targetDateWind=1,
                       targetDatePrecip=1, freezingLevelFt=1, precipType="none",
                       summaryModel="gfs")  # missing tone+verdict


def test_nwac_models_parse():
    f = NwacForecast(
        zoneId="1648", zoneName="West Slopes South", productId=1, season="winter",
        productType="forecast", publishedTime=datetime(2026, 2, 12, tzinfo=timezone.utc),
        expiresTime=datetime(2026, 2, 13, tzinfo=timezone.utc), forecastDate="2026-02-12",
        danger={"current": NwacDanger(upper=3, middle=3, lower=2).model_dump(),
                "tomorrow": NwacDanger(upper=4, middle=3, lower=2).model_dump()},
        problems=[NwacProblem(problemId=1, name="Wind Slab",
                              aspects={"upper": {"N": True}, "middle": {}, "lower": {}})],
    )
    assert f.zoneId == "1648"
    assert f.problems[0].name == "Wind Slab"


def test_snotel_and_satellite_models_parse():
    sd = SnotelData(
        stationId="679", stationTriplet="679:WA:SNTL", stationName="Paradise",
        elevationFt=5430.0, lat=46.78, lng=-121.74,
        current=SnotelReading(date="2026-02-12", snowDepthIn=112.0, sweIn=38.2),
        trend=[SnotelReading(date="2026-02-11", snowDepthIn=110.0, sweIn=37.9)],
    )
    assert sd.current.snowDepthIn == 112.0
    sc = SatelliteCache(
        mountainId="mt-rainier", tileUrlTemplate="https://tiles/{z}/{y}/{x}.jpg",
        tileSource="eox-s2cloudless", attribution="EOX",
        boundingBox={"north": 47.0, "south": 46.7, "east": -121.6, "west": -121.9},
    )
    assert sc.tileSource == "eox-s2cloudless"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd functions && pytest shared/tests/test_models.py -v -p no:cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.models'`. (`-p no:cov` skips the coverage gate while a single file is exercised.)

- [ ] **Step 3: Implement `functions/shared/models.py`** (verbatim from contract §8, complete)

```python
from datetime import date, datetime  # noqa: F401  (date kept for downstream imports)

from pydantic import BaseModel, ConfigDict, Field


# ---- Open-Meteo (dynamic hourly keys) ----
class OMHourly(BaseModel):
    model_config = ConfigDict(extra="allow")  # temperature_2m_<model>, *_previous_dayN_<model>
    time: list[str]


class OMResponse(BaseModel):
    latitude: float
    longitude: float
    elevation: float
    utc_offset_seconds: int
    timezone: str
    hourly_units: dict = {}
    hourly: OMHourly


class OMError(BaseModel):
    error: bool
    reason: str


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
    freezing_level_height: list[float | None] = []  # feet (converted from meters)
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
    summitMaxWindMph: float | None = None
    summitPrecipIn: float | None = None
    freezingLevelFtNoon: float | None = None
    snowfallIn: float | None = None


class CurrentSummary(BaseModel):
    targetDateHigh: float | None
    targetDateLow: float | None
    targetDateWind: float | None
    targetDatePrecip: float | None
    freezingLevelFt: float | None
    precipType: str
    summaryModel: str
    tone: str            # "good" | "caution" | "alert"
    verdict: str         # editorial sentence


# ---- NWAC (imported by P2 nwac_worker) ----
class NwacDanger(BaseModel):
    upper: int | None
    middle: int | None
    lower: int | None


class NwacProblem(BaseModel):
    problemId: int
    name: str
    likelihood: str | None = None
    sizeMin: str | None = None
    sizeMax: str | None = None
    aspects: dict   # {"upper": {"N": bool, ...}, "middle": {...}, "lower": {...}}
    description: str | None = None


class NwacForecast(BaseModel):
    zoneId: str
    zoneName: str
    productId: int
    season: str
    productType: str
    publishedTime: datetime
    expiresTime: datetime
    forecastDate: str
    danger: dict   # {"current": NwacDanger, "tomorrow": NwacDanger}
    problems: list[NwacProblem] = []
    bottomLine: str | None = None
    hazardDiscussion: str | None = None
    weatherDiscussion: str | None = None


# ---- SNOTEL (imported by P2 snotel_worker) ----
class SnotelReading(BaseModel):
    date: str
    snowDepthIn: float | None = None
    sweIn: float | None = None
    sweMedianIn: float | None = None
    percentOfMedian: float | None = None
    tempMaxF: float | None = None
    tempMinF: float | None = None
    precipAccumIn: float | None = None


class SnotelData(BaseModel):
    stationId: str
    stationTriplet: str
    stationName: str
    elevationFt: float
    lat: float
    lng: float
    current: SnotelReading
    trend: list[SnotelReading]


# ---- Satellite (imported by P2 satellite_worker) ----
class SatelliteCache(BaseModel):
    mountainId: str
    latestImageDate: str | None = None
    cloudCoverPercent: float | None = None
    sceneId: str | None = None
    tileUrlTemplate: str
    tileSource: str
    attribution: str
    boundingBox: dict   # {north, south, east, west}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd functions && pytest shared/tests/test_models.py -v -p no:cov`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/models.py functions/shared/tests/test_models.py
git commit -m "feat(p1): canonical pydantic models (contract §8)"
```

---

## Task 2: Storage client (`functions/shared/storage_client.py`)

**Files:**
- Create: `functions/shared/storage_client.py`
- Test: `functions/shared/tests/test_storage_client.py`

- [ ] **Step 1: Write the failing test** — `functions/shared/tests/test_storage_client.py`

```python
from datetime import datetime, timezone
from unittest.mock import MagicMock

import shared.storage_client as sc


def test_blob_path_builder_uses_contract_layout():
    dt = datetime(2026, 8, 2, 9, 5, tzinfo=timezone.utc)
    # contract §4: forecasts/{mountainId}/{YYYY-MM-DD}/{HHmm}-combined.json
    assert sc.blob_path("mt-rainier", dt) == \
        "forecasts/mt-rainier/2026-08-02/0905-combined.json"


def test_write_combined_blob_uploads_json_to_weather_bucket(monkeypatch):
    monkeypatch.setenv("GCS_BUCKET_WEATHER", "mountain-weatherman-app-weather-data")
    fake_blob = MagicMock()
    fake_bucket = MagicMock()
    fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock()
    fake_client.bucket.return_value = fake_bucket
    monkeypatch.setattr(sc, "_client", lambda: fake_client)

    dt = datetime(2026, 8, 2, 9, 5, tzinfo=timezone.utc)
    path = sc.write_combined_blob("mt-rainier", dt, '{"mountainId":"mt-rainier"}')

    assert path == "forecasts/mt-rainier/2026-08-02/0905-combined.json"
    fake_client.bucket.assert_called_once_with("mountain-weatherman-app-weather-data")
    fake_bucket.blob.assert_called_once_with(path)
    fake_blob.upload_from_string.assert_called_once_with(
        '{"mountainId":"mt-rainier"}', content_type="application/json")


def test_write_combined_blob_accepts_dict_and_serializes(monkeypatch):
    monkeypatch.setenv("GCS_BUCKET_WEATHER", "bkt")
    fake_blob = MagicMock()
    fake_bucket = MagicMock(); fake_bucket.blob.return_value = fake_blob
    fake_client = MagicMock(); fake_client.bucket.return_value = fake_bucket
    monkeypatch.setattr(sc, "_client", lambda: fake_client)

    dt = datetime(2026, 8, 2, 0, 0, tzinfo=timezone.utc)
    sc.write_combined_blob("mt-baker", dt, {"mountainId": "mt-baker"})
    arg = fake_blob.upload_from_string.call_args.args[0]
    assert '"mountainId": "mt-baker"' in arg
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd functions && pytest shared/tests/test_storage_client.py -v -p no:cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.storage_client'`.

- [ ] **Step 3: Implement `functions/shared/storage_client.py`** (contract §4)

```python
import json
from datetime import datetime

from google.cloud import storage

from shared import config

_storage_client: storage.Client | None = None


def _client() -> storage.Client:
    """Lazily create a singleton GCS client (re-used across warm invocations)."""
    global _storage_client
    if _storage_client is None:
        _storage_client = storage.Client(project=config.GCP_PROJECT)
    return _storage_client


def blob_path(mountain_id: str, dt: datetime) -> str:
    """Combined-forecast object path per contract §4:
    forecasts/{mountainId}/{YYYY-MM-DD}/{HHmm}-combined.json
    """
    return (
        f"forecasts/{mountain_id}/"
        f"{dt.strftime('%Y-%m-%d')}/{dt.strftime('%H%M')}-combined.json"
    )


def write_combined_blob(mountain_id: str, dt: datetime, blob: str | dict) -> str:
    """Upload the combined.json blob to the PRIVATE weather-data bucket.

    Returns the object path (the value stored as forecastBlobPath).
    """
    payload = blob if isinstance(blob, str) else json.dumps(blob)
    path = blob_path(mountain_id, dt)
    bucket = config.GCS_BUCKET_WEATHER
    obj = _client().bucket(bucket).blob(path)
    obj.upload_from_string(payload, content_type="application/json")
    return path
```

> `config.GCS_BUCKET_WEATHER` is read at call time (the test sets it via env then the module reads `config.GCS_BUCKET_WEATHER`); because `config` resolves the bucket at import, the test relies on `monkeypatch.setenv` *before* import. Buckets are PRIVATE (uniform bucket-level access, contract §2) — no public ACLs are ever set here.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd functions && pytest shared/tests/test_storage_client.py -v -p no:cov`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/storage_client.py functions/shared/tests/test_storage_client.py
git commit -m "feat(p1): GCS storage client + path builder (contract §4)"
```

---

## Task 3: Pub/Sub client (`functions/shared/pubsub_client.py`)

**Files:**
- Create: `functions/shared/pubsub_client.py`
- Test: `functions/shared/tests/test_pubsub_client.py`

- [ ] **Step 1: Write the failing test** — `functions/shared/tests/test_pubsub_client.py`

```python
import json
from unittest.mock import MagicMock

import shared.pubsub_client as pc


def test_publish_encodes_json_to_bytes_and_returns_message_id(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT", "mountain-weatherman-app")
    monkeypatch.setenv("ENV", "dev")
    fake_future = MagicMock()
    fake_future.result.return_value = "msg-123"
    fake_publisher = MagicMock()
    fake_publisher.publish.return_value = fake_future
    fake_publisher.topic_path.return_value = (
        "projects/mountain-weatherman-app/topics/dev-weather-refresh")
    monkeypatch.setattr(pc, "_publisher", lambda: fake_publisher)

    msg_id = pc.publish("weather-refresh", {"mountainId": "mt-rainier", "reason": "manual"})

    assert msg_id == "msg-123"
    fake_publisher.topic_path.assert_called_once_with(
        "mountain-weatherman-app", "dev-weather-refresh")
    topic_arg, data_arg = fake_publisher.publish.call_args.args
    assert topic_arg == "projects/mountain-weatherman-app/topics/dev-weather-refresh"
    assert json.loads(data_arg.decode("utf-8")) == {
        "mountainId": "mt-rainier", "reason": "manual"}


def test_publish_builds_env_prefixed_topic(monkeypatch):
    monkeypatch.setenv("GCP_PROJECT", "p")
    monkeypatch.setenv("ENV", "prod")
    fake_future = MagicMock(); fake_future.result.return_value = "x"
    fake_publisher = MagicMock(); fake_publisher.publish.return_value = fake_future
    fake_publisher.topic_path.side_effect = lambda proj, topic: f"projects/{proj}/topics/{topic}"
    monkeypatch.setattr(pc, "_publisher", lambda: fake_publisher)

    pc.publish("backfill-refresh", {"projectId": "abc"})
    fake_publisher.topic_path.assert_called_once_with("p", "prod-backfill-refresh")
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd functions && pytest shared/tests/test_pubsub_client.py -v -p no:cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.pubsub_client'`.

- [ ] **Step 3: Implement `functions/shared/pubsub_client.py`** (contract §2)

```python
import json
import os

from google.cloud import pubsub_v1

from shared import config

_publisher_client: pubsub_v1.PublisherClient | None = None


def _publisher() -> pubsub_v1.PublisherClient:
    global _publisher_client
    if _publisher_client is None:
        _publisher_client = pubsub_v1.PublisherClient()
    return _publisher_client


def publish(logical_topic: str, message_dict: dict) -> str:
    """Publish a JSON message to the env-prefixed topic for `logical_topic`.

    e.g. logical_topic="weather-refresh" -> dev-weather-refresh.
    Returns the published message id. Raises on publish failure (caller retries).
    """
    env = os.environ.get("ENV", config.ENV)
    publisher = _publisher()
    topic = publisher.topic_path(config.GCP_PROJECT, f"{env}-{logical_topic}")
    data = json.dumps(message_dict).encode("utf-8")
    future = publisher.publish(topic, data)
    return future.result()
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd functions && pytest shared/tests/test_pubsub_client.py -v -p no:cov`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/pubsub_client.py functions/shared/tests/test_pubsub_client.py
git commit -m "feat(p1): pub/sub publish helper (contract §2)"
```

---

## Task 4: Firestore client (`functions/shared/firestore_client.py`)

**Files:**
- Create: `functions/shared/firestore_client.py`
- Test: `functions/shared/tests/test_firestore_client.py`

- [ ] **Step 1: Write the failing test** — `functions/shared/tests/test_firestore_client.py`

```python
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import shared.firestore_client as fc


def _doc(data, exists=True, id_="x"):
    d = MagicMock()
    d.exists = exists
    d.to_dict.return_value = data
    d.id = id_
    return d


def test_get_mountain_returns_dict_with_id(monkeypatch):
    snap = _doc({"slug": "mt-rainier", "timezone": "America/Los_Angeles"}, id_="mt-rainier")
    ref = MagicMock(); ref.get.return_value = snap
    coll = MagicMock(); coll.document.return_value = ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    m = fc.get_mountain("mt-rainier")
    db.collection.assert_called_once_with("mountains")
    coll.document.assert_called_once_with("mt-rainier")
    assert m["id"] == "mt-rainier"
    assert m["timezone"] == "America/Los_Angeles"


def test_get_mountain_missing_returns_none(monkeypatch):
    ref = MagicMock(); ref.get.return_value = _doc(None, exists=False)
    coll = MagicMock(); coll.document.return_value = ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)
    assert fc.get_mountain("nope") is None


def test_get_active_projects_queries_status_and_target_end(monkeypatch):
    snaps = [_doc({"mountainId": "mt-rainier", "status": "active"}, id_="p1")]
    query = MagicMock(); query.stream.return_value = iter(snaps)
    coll = MagicMock(); coll.where.return_value = query; query.where.return_value = query
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    projs = fc.get_active_projects()
    db.collection.assert_called_once_with("projects")
    # two filters: status == active AND targetDateEnd >= today (contract §3 index)
    assert coll.where.call_count == 1
    assert query.where.call_count == 1
    assert projs[0]["id"] == "p1"


def test_projects_for_mountain_filters_active_set(monkeypatch):
    snaps = [
        _doc({"mountainId": "mt-rainier"}, id_="p1"),
        _doc({"mountainId": "mt-baker"}, id_="p2"),
        _doc({"mountainId": "mt-rainier"}, id_="p3"),
    ]
    query = MagicMock(); query.stream.return_value = iter(snaps)
    coll = MagicMock(); coll.where.return_value = query; query.where.return_value = query
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    out = fc.projects_for_mountain("mt-rainier")
    assert {p["id"] for p in out} == {"p1", "p3"}


def test_upsert_mountain_conditions_merges_doc(monkeypatch):
    ref = MagicMock()
    coll = MagicMock(); coll.document.return_value = ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    fc.upsert_mountain_conditions("mt-rainier", "forecasts/x.json", {"tone": "good"})
    db.collection.assert_called_once_with("mountainConditions")
    coll.document.assert_called_once_with("mt-rainier")
    payload, kwargs = ref.set.call_args.args[0], ref.set.call_args.kwargs
    assert payload["mountainId"] == "mt-rainier"
    assert payload["forecastBlobPath"] == "forecasts/x.json"
    assert payload["currentSummary"] == {"tone": "good"}
    assert "updatedAt" in payload
    assert kwargs == {"merge": True}


def test_write_weather_snapshot_sets_expire_at_30d(monkeypatch):
    add_ref = MagicMock()
    subcoll = MagicMock(); subcoll.add.return_value = (None, add_ref)
    proj_ref = MagicMock(); proj_ref.collection.return_value = subcoll
    coll = MagicMock(); coll.document.return_value = proj_ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    before = datetime.now(timezone.utc)
    fc.write_weather_snapshot(
        "p1", target_date="2026-08-02", blob_path="forecasts/x.json",
        source="live", models={"gfs": {"available": True}})
    db.collection.assert_called_once_with("projects")
    proj_ref.collection.assert_called_once_with("weatherSnapshots")
    payload = subcoll.add.call_args.args[0]
    assert payload["source"] == "live"
    assert payload["targetDate"] == "2026-08-02"
    assert payload["forecastBlobPath"] == "forecasts/x.json"
    assert payload["models"] == {"gfs": {"available": True}}
    # expireAt ~ now + 30 days (contract §3 TTL)
    delta = payload["expireAt"] - before
    assert timedelta(days=29, hours=23) < delta < timedelta(days=30, hours=1)


def test_update_current_summary_merges_into_project(monkeypatch):
    ref = MagicMock()
    coll = MagicMock(); coll.document.return_value = ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    fc.update_current_summary("p1", {"tone": "alert", "verdict": "High wind shuts the summit down"})
    payload, kwargs = ref.set.call_args.args[0], ref.set.call_args.kwargs
    assert payload["currentSummary"]["tone"] == "alert"
    assert "updatedAt" in payload["currentSummary"]
    assert kwargs == {"merge": True}


def test_set_project_refresh_status_writes_status_and_timestamp(monkeypatch):
    ref = MagicMock()
    coll = MagicMock(); coll.document.return_value = ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    fc.set_project_refresh_status("p1", "partial")
    payload, kwargs = ref.set.call_args.args[0], ref.set.call_args.kwargs
    assert payload["lastRefreshStatus"] == "partial"
    assert "lastRefreshedAt" in payload
    assert kwargs == {"merge": True}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd functions && pytest shared/tests/test_firestore_client.py -v -p no:cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.firestore_client'`.

- [ ] **Step 3: Implement `functions/shared/firestore_client.py`** (contract §3)

```python
from datetime import date, datetime, timedelta, timezone

import firebase_admin
from firebase_admin import firestore

_db_client = None

SNAPSHOT_TTL_DAYS = 30


def _db():
    """Singleton Firestore client (init firebase_admin once per warm instance)."""
    global _db_client
    if _db_client is None:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        _db_client = firestore.client()
    return _db_client


def _with_id(snap) -> dict:
    data = snap.to_dict() or {}
    data["id"] = snap.id
    return data


def get_mountain(slug: str) -> dict | None:
    """Read mountains/{slug}; returns the doc dict (with `id`) or None."""
    snap = _db().collection("mountains").document(slug).get()
    if not snap.exists:
        return None
    return _with_id(snap)


def get_active_projects(today: str | None = None) -> list[dict]:
    """Active projects whose window has not fully passed:
    status == "active" AND targetDateEnd >= today (contract §3 composite index).
    `today` is an ISO date string (defaults to UTC today); ISO date strings sort
    lexicographically so the >= comparison is correct.
    """
    today = today or date.today().isoformat()
    q = (
        _db()
        .collection("projects")
        .where("status", "==", "active")
        .where("targetDateEnd", ">=", today)
    )
    return [_with_id(s) for s in q.stream()]


def projects_for_mountain(mountain_id: str, today: str | None = None) -> list[dict]:
    """Active projects referencing a given mountain (filtered client-side from
    the active set so we reuse the single composite index)."""
    return [p for p in get_active_projects(today) if p.get("mountainId") == mountain_id]


def upsert_mountain_conditions(
    mountain_id: str, forecast_blob_path: str, current_summary: dict
) -> None:
    """Write mountainConditions/{mountainId} (browse, current-only). Always called
    by the weather worker (contract §3 / spec §4)."""
    _db().collection("mountainConditions").document(mountain_id).set(
        {
            "mountainId": mountain_id,
            "forecastBlobPath": forecast_blob_path,
            "currentSummary": current_summary,
            "updatedAt": datetime.now(timezone.utc),
        },
        merge=True,
    )


def write_weather_snapshot(
    project_id: str,
    target_date: str,
    blob_path: str,
    source: str,
    models: dict,
) -> str:
    """Append a weatherSnapshot under a project with a 30-day TTL (expireAt).
    Returns the new snapshot id."""
    now = datetime.now(timezone.utc)
    payload = {
        "fetchedAt": now,
        "targetDate": target_date,
        "forecastBlobPath": blob_path,
        "source": source,
        "expireAt": now + timedelta(days=SNAPSHOT_TTL_DAYS),
        "models": models,
    }
    _, ref = (
        _db()
        .collection("projects")
        .document(project_id)
        .collection("weatherSnapshots")
        .add(payload)
    )
    return ref.id


def update_current_summary(project_id: str, current_summary: dict) -> None:
    """Merge currentSummary onto projects/{id} (stamps updatedAt)."""
    summary = {**current_summary, "updatedAt": datetime.now(timezone.utc)}
    _db().collection("projects").document(project_id).set(
        {"currentSummary": summary}, merge=True
    )


def set_project_refresh_status(project_id: str, status: str) -> None:
    """Set lastRefreshStatus ("ok"|"error"|"partial"|"pending") + lastRefreshedAt."""
    _db().collection("projects").document(project_id).set(
        {"lastRefreshStatus": status, "lastRefreshedAt": datetime.now(timezone.utc)},
        merge=True,
    )
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd functions && pytest shared/tests/test_firestore_client.py -v -p no:cov`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/firestore_client.py functions/shared/tests/test_firestore_client.py
git commit -m "feat(p1): firestore helpers (contract §3)"
```

---

## Task 5: Open-Meteo client (`functions/weather_worker/open_meteo_client.py`)

**Files:**
- Create: `functions/weather_worker/__init__.py`, `functions/weather_worker/open_meteo_client.py`, `functions/weather_worker/tests/__init__.py`, `functions/weather_worker/requirements.txt`
- Test: `functions/weather_worker/tests/test_open_meteo_client.py`

- [ ] **Step 1: Create package files**

```python
# functions/weather_worker/__init__.py
```
```python
# functions/weather_worker/tests/__init__.py
```
```text
# functions/weather_worker/requirements.txt
functions-framework==3.*
firebase-admin==6.5.0
google-cloud-pubsub==2.23.0
google-cloud-storage==2.18.0
httpx==0.27.0
pydantic==2.8.2
tenacity==9.0.0
```

- [ ] **Step 2: Write the failing test** — `functions/weather_worker/tests/test_open_meteo_client.py`

The inline JSON below is a representative trimmed multi-model response (3 hourly steps; HRRR fetched separately). Real captured data lands in `fixtures/open_meteo_forecast.json` in Task 14; this inline body keeps the unit test self-contained.

```python
import math

import httpx
import pytest

from weather_worker import open_meteo_client as omc

MOUNTAIN = {
    "slug": "mt-rainier", "lat": 46.8517, "lng": -121.7603,
    "elevations": {"base": 5420, "mid": 10188, "summit": 14410},
    "timezone": "America/Los_Angeles",
}

# Combined gfs_seamless,ecmwf_ifs025 response (snake_case + _model suffixes).
MULTI_BODY = {
    "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
    "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
    "hourly_units": {"temperature_2m": "°F", "freezing_level_height": "m"},
    "hourly": {
        "time": ["2026-08-02T00:00", "2026-08-02T01:00", "2026-08-02T12:00"],
        "temperature_2m_gfs_seamless": [50.0, 49.0, 60.0],
        "temperature_2m_ecmwf_ifs025": [51.0, 50.0, 61.0],
        "apparent_temperature_gfs_seamless": [48.0, 47.0, 58.0],
        "apparent_temperature_ecmwf_ifs025": [49.0, 48.0, 59.0],
        "wind_speed_10m_gfs_seamless": [10.0, 12.0, 8.0],
        "wind_speed_10m_ecmwf_ifs025": [9.0, 11.0, 7.0],
        "wind_gusts_10m_gfs_seamless": [18.0, 22.0, 14.0],
        "wind_gusts_10m_ecmwf_ifs025": [17.0, 21.0, 13.0],
        "wind_direction_10m_gfs_seamless": [220, 230, 200],
        "wind_direction_10m_ecmwf_ifs025": [225, 235, 205],
        "precipitation_gfs_seamless": [0.0, 0.0, 0.01],
        "precipitation_ecmwf_ifs025": [0.0, 0.0, 0.02],
        "precipitation_probability_gfs_seamless": [5, 5, 20],
        "precipitation_probability_ecmwf_ifs025": [4, 6, 22],
        "snowfall_gfs_seamless": [0.0, 0.0, 0.0],
        "snowfall_ecmwf_ifs025": [0.0, 0.0, 0.0],
        "freezing_level_height_gfs_seamless": [3000.0, 3050.0, 3500.0],
        "freezing_level_height_ecmwf_ifs025": [3100.0, 3150.0, 3600.0],
        "cloud_cover_gfs_seamless": [10, 12, 30],
        "cloud_cover_ecmwf_ifs025": [8, 10, 28],
        "visibility_gfs_seamless": [24000, 24000, 20000],
        "visibility_ecmwf_ifs025": [24000, 24000, 20000],
        "weather_code_gfs_seamless": [0, 1, 2],
        "weather_code_ecmwf_ifs025": [0, 1, 2],
        # pressure-level temps (°F): base≈925, mid≈850, summit≈700 hPa
        "temperature_925hPa_gfs_seamless": [55.0, 54.0, 64.0],
        "temperature_925hPa_ecmwf_ifs025": [56.0, 55.0, 65.0],
        "temperature_850hPa_gfs_seamless": [44.0, 43.0, 53.0],
        "temperature_850hPa_ecmwf_ifs025": [45.0, 44.0, 54.0],
        "temperature_700hPa_gfs_seamless": [30.0, 29.0, 38.0],
        "temperature_700hPa_ecmwf_ifs025": [31.0, 30.0, 39.0],
    },
}

# Separate gfs_hrrr response (single model -> NO suffix per contract §5.1).
HRRR_BODY = {
    "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
    "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
    "hourly_units": {"temperature_2m": "°F"},
    "hourly": {
        "time": ["2026-08-02T00:00", "2026-08-02T01:00", "2026-08-02T12:00"],
        "temperature_2m": [50.5, 49.5, 60.5],
        "apparent_temperature": [48.5, 47.5, 58.5],
        "wind_speed_10m": [11.0, 13.0, 9.0],
        "wind_gusts_10m": [19.0, 23.0, 15.0],
        "wind_direction_10m": [221, 231, 201],
        "precipitation": [0.0, 0.0, 0.0],
        "precipitation_probability": [5, 5, 18],
        "snowfall": [0.0, 0.0, 0.0],
        "freezing_level_height": [3010.0, 3060.0, 3510.0],
        "cloud_cover": [9, 11, 29],
        "visibility": [24000, 24000, 20000],
        "weather_code": [0, 1, 2],
        "temperature_925hPa": [55.5, 54.5, 64.5],
        "temperature_850hPa": [44.5, 43.5, 53.5],
        "temperature_700hPa": [30.5, 29.5, 38.5],
    },
}


@pytest.mark.asyncio
async def test_fetch_returns_three_model_series(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)

    result = await omc.fetch_forecast(MOUNTAIN)

    assert set(result.keys()) == {"hrrr", "gfs", "ecmwf"}
    assert result["gfs"].available is True
    assert result["ecmwf"].available is True
    assert result["hrrr"].available is True
    # snake_case vars de-suffixed into ModelSeries
    assert result["gfs"].temperature_2m == [50.0, 49.0, 60.0]
    assert result["ecmwf"].wind_gusts_10m == [17.0, 21.0, 13.0]
    assert result["hrrr"].temperature_2m == [50.5, 49.5, 60.5]


@pytest.mark.asyncio
async def test_freezing_level_converted_meters_to_feet(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    result = await omc.fetch_forecast(MOUNTAIN)
    assert math.isclose(result["gfs"].freezing_level_height[0], 3000.0 * 3.28084, rel_tol=1e-6)


@pytest.mark.asyncio
async def test_pressure_band_temps_mapped_to_temp_fields(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    result = await omc.fetch_forecast(MOUNTAIN)
    assert result["gfs"].temp_base_f == [55.0, 54.0, 64.0]    # 925 hPa
    assert result["gfs"].temp_mid_f == [44.0, 43.0, 53.0]     # 850 hPa
    assert result["gfs"].temp_summit_f == [30.0, 29.0, 38.0]  # 700 hPa


@pytest.mark.asyncio
async def test_hrrr_failure_does_not_kill_other_models(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    # HRRR outside-CONUS / outage -> HTTP 400 {error, reason}
    httpx_mock.add_response(
        url=_match("gfs_hrrr"), status_code=400,
        json={"error": True, "reason": "No data is available for this location"})

    result = await omc.fetch_forecast(MOUNTAIN)
    assert result["gfs"].available is True
    assert result["ecmwf"].available is True
    assert result["hrrr"].available is False


@pytest.mark.asyncio
async def test_http_400_on_primary_call_raises(httpx_mock):
    httpx_mock.add_response(
        url=_match("gfs_seamless,ecmwf_ifs025"), status_code=400,
        json={"error": True, "reason": "Invalid timezone"})
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    with pytest.raises(omc.OpenMeteoError, match="Invalid timezone"):
        await omc.fetch_forecast(MOUNTAIN)


@pytest.mark.asyncio
async def test_request_uses_imperial_units_and_timezone(httpx_mock):
    httpx_mock.add_response(url=_match("gfs_seamless,ecmwf_ifs025"), json=MULTI_BODY)
    httpx_mock.add_response(url=_match("gfs_hrrr"), json=HRRR_BODY)
    await omc.fetch_forecast(MOUNTAIN)
    primary = [r for r in httpx_mock.get_requests()
               if "gfs_seamless,ecmwf_ifs025" in str(r.url)][0]
    q = primary.url.params
    assert q["temperature_unit"] == "fahrenheit"
    assert q["wind_speed_unit"] == "mph"
    assert q["precipitation_unit"] == "inch"
    assert q["timezone"] == "America/Los_Angeles"
    assert q["forecast_days"] == "7"


def test_contract_fixture_parses(load_fixture):
    """Contract test: the saved real response (Task 14) parses into ModelSeries."""
    body = load_fixture("open_meteo_forecast.json")
    series = omc.parse_models(body, models=("gfs_seamless", "ecmwf_ifs025"))
    assert "gfs_seamless" in series
    assert len(series["gfs_seamless"].time) > 0


def _match(model_substr):
    """httpx_mock URL matcher: any open-meteo forecast URL containing model_substr."""
    import re
    return re.compile(r"https://api\.open-meteo\.com/v1/forecast.*"
                      + re.escape(model_substr).replace(",", "%2C") + r".*")
```

> Note: `httpx_mock` matches the `models=` query value where commas are URL-encoded as `%2C`. If `pytest-httpx` in the pinned version matches against the decoded URL, drop the `.replace(",", "%2C")`. Adjust the matcher once during Step 4 if the first run reports "no matching response".

- [ ] **Step 3: Run it to verify it fails**

Run: `cd functions && pytest weather_worker/tests/test_open_meteo_client.py -v -p no:cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'weather_worker.open_meteo_client'` (and the `load_fixture` contract test errors because `fixtures/open_meteo_forecast.json` does not exist yet — it is created in Task 14; mark it `@pytest.mark.skip(reason="fixture captured in Task 14")` until then, or run with `-k "not contract_fixture"`).

- [ ] **Step 4: Implement `functions/weather_worker/open_meteo_client.py`** (contract §5.1)

```python
import asyncio

import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from shared.models import ModelSeries

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
METERS_TO_FEET = 3.28084

# Open-Meteo model ids (contract §5.1)
HRRR = "gfs_hrrr"
GFS = "gfs_seamless"
ECMWF = "ecmwf_ifs025"

# Surface hourly vars (contract §5.1)
HOURLY_VARS = [
    "temperature_2m", "apparent_temperature", "wind_speed_10m", "wind_gusts_10m",
    "wind_direction_10m", "precipitation", "precipitation_probability", "snowfall",
    "freezing_level_height", "cloud_cover", "visibility", "weather_code",
]

# Pressure-level band temps -> ModelSeries.temp_{band}_f (spike-confirmed levels, Task 6)
BAND_HPA = {"temp_base_f": "925", "temp_mid_f": "850", "temp_summit_f": "700"}
PRESSURE_VARS = [f"temperature_{lvl}hPa" for lvl in BAND_HPA.values()]

ALL_HOURLY = HOURLY_VARS + PRESSURE_VARS


class OpenMeteoError(RuntimeError):
    """Raised when Open-Meteo returns an error body (HTTP 400 {error, reason})."""


def _params(mountain: dict, models: tuple[str, ...]) -> dict:
    return {
        "latitude": mountain["lat"],
        "longitude": mountain["lng"],
        "hourly": ",".join(ALL_HOURLY),
        "models": ",".join(models),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": mountain["timezone"],
        "forecast_days": 7,
    }


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2), reraise=True)
async def _get(client: httpx.AsyncClient, mountain: dict, models: tuple[str, ...]) -> dict:
    resp = await client.get(FORECAST_URL, params=_params(mountain, models))
    body = resp.json()
    # Open-Meteo signals errors with HTTP 400 AND {"error": true, "reason": "..."}
    if resp.status_code >= 400 or (isinstance(body, dict) and body.get("error")):
        reason = body.get("reason", f"HTTP {resp.status_code}") if isinstance(body, dict) \
            else f"HTTP {resp.status_code}"
        raise OpenMeteoError(reason)
    return body


def _suffix(model: str, multi: bool) -> str:
    """Key suffix: '_<model>' when ≥2 models requested, '' for a single model."""
    return f"_{model}" if multi else ""


def parse_models(body: dict, models: tuple[str, ...]) -> dict[str, ModelSeries]:
    """Split a (possibly multi-model) Open-Meteo body into one ModelSeries per model.
    Surface vars are copied as-is except freezing_level_height (m→ft); pressure-level
    band temps are mapped into temp_base/mid/summit_f.
    """
    hourly = body["hourly"]
    time = hourly["time"]
    multi = len(models) >= 2
    out: dict[str, ModelSeries] = {}
    for model in models:
        sfx = _suffix(model, multi)
        data: dict = {"available": True, "time": time}
        for var in HOURLY_VARS:
            values = hourly.get(f"{var}{sfx}", [])
            if var == "freezing_level_height":
                values = [None if v is None else v * METERS_TO_FEET for v in values]
            data[var] = values
        for field, lvl in BAND_HPA.items():
            data[field] = hourly.get(f"temperature_{lvl}hPa{sfx}", [])
        out[model] = ModelSeries.model_validate(data)
    return out


async def fetch_forecast(mountain: dict) -> dict[str, ModelSeries]:
    """Fetch all three models, keyed 'hrrr'|'gfs'|'ecmwf'.

    Two requests (contract §5.1 gotcha): one for gfs_seamless,ecmwf_ifs025 and a
    SEPARATE one for gfs_hrrr, so HRRR failure / non-CONUS doesn't kill the others.
    A failed/unavailable HRRR yields ModelSeries(available=False).
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        primary_task = _get(client, mountain, (GFS, ECMWF))
        hrrr_task = _get(client, mountain, (HRRR,))
        results = await asyncio.gather(primary_task, hrrr_task, return_exceptions=True)
    primary, hrrr = results

    if isinstance(primary, Exception):
        # Both GFS and ECMWF gone is unrecoverable for this fetch -> caller decides.
        raise primary if isinstance(primary, OpenMeteoError) else OpenMeteoError(str(primary))

    series = parse_models(primary, (GFS, ECMWF))
    out = {"gfs": series[GFS], "ecmwf": series[ECMWF]}

    if isinstance(hrrr, Exception):
        out["hrrr"] = ModelSeries(available=False)
    else:
        out["hrrr"] = parse_models(hrrr, (HRRR,))[HRRR]
    return out
```

> The `parse_models` for HRRR uses a single-model body (no suffix), matching contract §5.1's "one model → no suffix." The `_match` test helper and `httpx_mock` register two responses; `asyncio.gather` issues both.

- [ ] **Step 5: Run it to verify it passes**

Run: `cd functions && pytest weather_worker/tests/test_open_meteo_client.py -v -p no:cov -k "not contract_fixture"`
Expected: 6 passed (the contract-fixture test stays skipped/deselected until Task 14, after which it passes).

- [ ] **Step 6: Commit**

```bash
git add functions/weather_worker/__init__.py functions/weather_worker/open_meteo_client.py \
        functions/weather_worker/tests/__init__.py functions/weather_worker/requirements.txt \
        functions/weather_worker/tests/test_open_meteo_client.py
git commit -m "feat(p1): async open-meteo client (contract §5.1)"
```

---

## Task 6: Pressure-level validation spike (live test + recorded outcome)

**Files:**
- Create: `functions/weather_worker/tests/test_pressure_levels_live.py`

This is a documented spike: a `@pytest.mark.live` test that hits the real Open-Meteo API for Mt Rainier and asserts that `geopotential_height_{level}hPa` resolves to sensible band altitudes near the three Rainier bands (base 5,420 ft, mid 10,188 ft, summit 14,410 ft). The outcome (the chosen hPa levels) is recorded below and is what Task 5's `BAND_HPA` uses.

- [ ] **Step 1: Write the live spike test** — `functions/weather_worker/tests/test_pressure_levels_live.py`

```python
import httpx
import pytest

RAINIER = {"lat": 46.8517, "lng": -121.7603, "timezone": "America/Los_Angeles",
           "bands_ft": {"base": 5420, "mid": 10188, "summit": 14410}}
M_TO_FT = 3.28084


@pytest.mark.live
def test_geopotential_heights_bracket_rainier_bands():
    """Spike: confirm 925/850/700 hPa geopotential heights bracket Rainier's bands.
    Records the chosen levels; not run in CI (-m 'not live')."""
    params = {
        "latitude": RAINIER["lat"], "longitude": RAINIER["lng"],
        "hourly": "geopotential_height_925hPa,geopotential_height_850hPa,"
                  "geopotential_height_700hPa,geopotential_height_500hPa",
        "models": "gfs_seamless", "timezone": RAINIER["timezone"], "forecast_days": 1,
    }
    body = httpx.get("https://api.open-meteo.com/v1/forecast", params=params, timeout=30).json()
    h = body["hourly"]
    gp = {lvl: h[f"geopotential_height_{lvl}hPa"][0] * M_TO_FT
          for lvl in ("925", "850", "700", "500")}
    # 925 hPa ≈ ~2,500 ft (near base), 850 hPa ≈ ~5,000 ft (above base/below mid),
    # 700 hPa ≈ ~10,000 ft (near mid/summit), 500 hPa ≈ ~18,000 ft (above summit).
    assert gp["925"] < gp["850"] < gp["700"] < gp["500"]
    assert 1500 < gp["925"] < 4000
    assert 8000 < gp["700"] < 12000
    print("RAINIER geopotential heights (ft):", gp)
```

- [ ] **Step 2: Run the spike (once, locally, opt-in)**

Run: `cd functions && pytest weather_worker/tests/test_pressure_levels_live.py -v -p no:cov -m live -s`
Expected: 1 passed; the printed heights are recorded below.

- [ ] **Step 3: Record the outcome in this plan** (fill the numbers from the run; the decision is fixed regardless of minor seasonal variation)

> **Spike outcome (recorded — run 2026-06-14, `gfs_seamless`, hour[0]):** Rainier geopotential
> heights confirm the standard pressure levels map cleanly to the three display bands.
> Measured heights (ft): **925 hPa = 2,788.7 ft · 850 hPa = 5,150.9 ft · 700 hPa = 10,426.5 ft · 500 hPa = 19,219.2 ft**
> (strictly increasing; 925 in [1500,4000] and 700 in [8000,12000] as asserted). **Chosen levels (used in `open_meteo_client.BAND_HPA`):**
> - **base → 925 hPa** (≈ 2,789 ft surface-pressure level; closest standard level to Paradise/base; the warmest band proxy)
> - **mid → 850 hPa** (≈ 5,151 ft)
> - **summit → 700 hPa** (≈ 10,427 ft — the closest standard level to the upper mountain; 500 hPa ≈ 19,219 ft overshoots the 14,410 ft summit, so 700 hPa is the best fit)
>
> The bands are **approximate** per spec §2 #3 (display "approximate elevation per band"). We do **not** interpolate between levels in the POC — we map each band to its nearest standard pressure level. This matches contract §5.1 ("base≈925hPa, mid≈850hPa, summit≈700hPa") and is the level set hard-coded in Task 5.

- [ ] **Step 4: Confirm the default run excludes the live test**

Run: `cd functions && pytest weather_worker/tests/test_pressure_levels_live.py -v -p no:cov`
Expected: 1 deselected (0 collected to run) — `-m "not live"` from `pyproject.toml` excludes it.

- [ ] **Step 5: Commit**

```bash
git add functions/weather_worker/tests/test_pressure_levels_live.py docs/superpowers/plans/2026-06-14-p1-weather-pipeline.md
git commit -m "test(p1): pressure-level validation spike + recorded hPa levels"
```

---

## Task 7: Tone + verdict (`functions/weather_worker/tone.py`)

The scoring is ported **exactly** from `prototype-ui/prototype-design-review/project/app/data.js` `summarize()` (the `score`/`tone` block, lines ~378-392):

```js
const score = (day.maxWind > 45 ? 2 : day.maxWind > 32 ? 1 : 0)
  + (day.maxGust > 55 ? 1 : 0)
  + (day.precip > 0.1 ? 2 : day.pop > 50 ? 1 : 0)
  + (nwac.today.high >= 4 ? 2 : nwac.today.high === 3 ? 1 : 0)
  + (day.high < 10 ? 1 : 0);
const tone = score >= 4 ? "alert" : score >= 2 ? "caution" : "good";
```

Inputs map to our derived target-date summary: `maxWind`→`summitMaxWindMph` (note: in the prototype `maxWind` is sustained and `maxGust` is the gust; our `ModelDaySummary.summitMaxWindMph` is the **max gust** per contract §6, so we pass gust as both `max_wind` and `max_gust` — see assumption note), `precip`→`summitPrecipIn`, `pop` is not stored on `ModelDaySummary`, so the `pop > 50` branch is dropped (precip>0.1 still scores), `nwac.today.high`→ the NWAC `dangerUpper` for the summit band (may be `None`), `high`→`summitHighF`.

**Files:**
- Create: `functions/weather_worker/tone.py`
- Test: `functions/weather_worker/tests/test_tone.py`

- [ ] **Step 1: Write the failing test** — `functions/weather_worker/tests/test_tone.py`

```python
import pytest

from weather_worker import tone


def test_good_when_calm_warm_dry_no_danger():
    assert tone.score_tone(max_wind=15, max_gust=25, precip=0.0,
                           nwac_danger=1, high_f=25) == ("good", 0)


def test_caution_at_score_2_from_moderate_wind_and_danger3():
    # wind 35>32 -> 1 ; danger 3 -> 1 ; total 2 -> caution
    label, s = tone.score_tone(max_wind=35, max_gust=40, precip=0.0,
                               nwac_danger=3, high_f=25)
    assert (label, s) == ("caution", 2)


def test_alert_at_score_4_high_wind_precip_danger():
    # wind 50>45 -> 2 ; precip 0.2>0.1 -> 2 ; total 4 -> alert
    label, s = tone.score_tone(max_wind=50, max_gust=40, precip=0.2,
                               nwac_danger=None, high_f=25)
    assert (label, s) == ("alert", 4)


def test_gust_and_cold_each_add_one():
    # gust 60>55 -> 1 ; cold high 5<10 -> 1 ; total 2 -> caution
    label, s = tone.score_tone(max_wind=20, max_gust=60, precip=0.0,
                               nwac_danger=0, high_f=5)
    assert (label, s) == ("caution", 2)


def test_danger4_scores_two():
    label, s = tone.score_tone(max_wind=10, max_gust=10, precip=0.0,
                               nwac_danger=4, high_f=25)
    assert s == 2 and label == "caution"


def test_none_danger_treated_as_no_contribution():
    label, s = tone.score_tone(max_wind=10, max_gust=10, precip=0.0,
                               nwac_danger=None, high_f=25)
    assert (label, s) == ("good", 0)


@pytest.mark.parametrize("score_in,expected", [(0, "good"), (1, "good"),
                                               (2, "caution"), (3, "caution"),
                                               (4, "alert"), (6, "alert")])
def test_bucket_thresholds(score_in, expected):
    assert tone.bucket(score_in) == expected


def test_verdict_alert_high_wind():
    v = tone.verdict("alert", max_wind=55, max_gust=70, precip=0.0,
                     nwac_danger=3, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "High wind shuts the summit down"


def test_verdict_alert_avalanche_when_danger_dominant():
    v = tone.verdict("alert", max_wind=20, max_gust=30, precip=0.0,
                     nwac_danger=4, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Considerable avalanche danger above treeline"


def test_verdict_caution_incoming_precip():
    v = tone.verdict("caution", max_wind=20, max_gust=30, precip=0.15,
                     nwac_danger=2, high_f=20, freezing_level_ft=8000, summit_ft=14410)
    assert v == "Precipitation moving through the window"


def test_verdict_good_cold_clear():
    v = tone.verdict("good", max_wind=12, max_gust=20, precip=0.0,
                     nwac_danger=1, high_f=8, freezing_level_ft=6000, summit_ft=14410)
    assert v == "Cold window holds before a front"


def test_verdict_good_default():
    v = tone.verdict("good", max_wind=12, max_gust=20, precip=0.0,
                     nwac_danger=1, high_f=30, freezing_level_ft=6000, summit_ft=14410)
    assert v == "Favorable window on the summit"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd functions && pytest weather_worker/tests/test_tone.py -v -p no:cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'weather_worker.tone'`.

- [ ] **Step 3: Implement `functions/weather_worker/tone.py`** (contract §6, ported from `data.js`)

```python
"""Server-side condition tone + verdict (contract §6).

Scoring is ported verbatim from the Cirque prototype's data.js summarize():
    score = (maxWind>45?2:maxWind>32?1:0) + (maxGust>55?1:0)
          + (precip>0.1?2:pop>50?1:0) + (danger>=4?2:danger==3?1:0)
          + (high<10?1:0)
    tone  = score>=4 ? alert : score>=2 ? caution : good
The `pop>50` branch is dropped (POC ModelDaySummary has no pop); precip still scores.
"""


def bucket(score: int) -> str:
    """Map a raw score to a tone label (Cirque Favorable/Marginal/Hazardous)."""
    if score >= 4:
        return "alert"
    if score >= 2:
        return "caution"
    return "good"


def score_tone(
    max_wind: float,
    max_gust: float,
    precip: float,
    nwac_danger: int | None,
    high_f: float,
) -> tuple[str, int]:
    """Return (tone_label, raw_score). nwac_danger may be None (no rating)."""
    danger = nwac_danger if nwac_danger is not None else 0
    score = 0
    score += 2 if max_wind > 45 else 1 if max_wind > 32 else 0
    score += 1 if max_gust > 55 else 0
    score += 2 if precip > 0.1 else 0
    score += 2 if danger >= 4 else 1 if danger == 3 else 0
    score += 1 if high_f < 10 else 0
    return bucket(score), score


def verdict(
    tone: str,
    max_wind: float,
    max_gust: float,
    precip: float,
    nwac_danger: int | None,
    high_f: float,
    freezing_level_ft: float,
    summit_ft: float,
) -> str:
    """Deterministic editorial sentence templated from tone + dominant driver."""
    danger = nwac_danger if nwac_danger is not None else 0
    if tone == "alert":
        if max_wind > 45 or max_gust > 55:
            return "High wind shuts the summit down"
        if danger >= 4:
            return "Considerable avalanche danger above treeline"
        if precip > 0.1:
            return "Storm system dominates the window"
        return "Hazardous conditions on the summit"
    if tone == "caution":
        if precip > 0.05:
            return "Precipitation moving through the window"
        if max_wind > 32 or max_gust > 55:
            return "Gusty winds aloft to watch"
        if danger == 3:
            return "Considerable avalanche danger to manage"
        if high_f < 10:
            return "Cold but workable on the summit"
        return "Marginal window — watch the trend"
    # good
    if high_f < 10:
        return "Cold window holds before a front"
    if freezing_level_ft < summit_ft:
        return "Favorable window on the summit"
    return "Favorable window on the summit"
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd functions && pytest weather_worker/tests/test_tone.py -v -p no:cov`
Expected: all passed (12 tests incl. parametrize cases).

- [ ] **Step 5: Commit**

```bash
git add functions/weather_worker/tone.py functions/weather_worker/tests/test_tone.py
git commit -m "feat(p1): tone scoring + verdict (ported from data.js, contract §6)"
```

---

## Task 8: Summary derivation (`functions/weather_worker/summary.py`)

**Files:**
- Create: `functions/weather_worker/summary.py`
- Test: `functions/weather_worker/tests/test_summary.py`

- [ ] **Step 1: Write the failing test** — `functions/weather_worker/tests/test_summary.py`

```python
import math

from shared.models import CombinedForecastBlob, ModelSeries
from weather_worker import summary


def _series():
    # two days; target = 2026-08-02 has hours at 00:00, 12:00, 18:00
    return ModelSeries(
        time=["2026-08-01T12:00", "2026-08-02T00:00", "2026-08-02T12:00", "2026-08-02T18:00"],
        temperature_2m=[40.0, 10.0, 30.0, 20.0],
        wind_gusts_10m=[20.0, 35.0, 50.0, 25.0],
        precipitation=[0.0, 0.1, 0.2, 0.0],
        snowfall=[0.0, 1.0, 2.0, 0.0],
        freezing_level_height=[6000.0, 5000.0, 7000.0, 6500.0],
        temp_summit_f=[15.0, 8.0, 22.0, 18.0],
    )


def test_model_day_summary_target_date_aggregates():
    s = summary.model_day_summary(_series(), "2026-08-02")
    assert s.available is True
    assert s.summitHighF == 22.0           # max temp_summit_f on target day
    assert s.summitLowF == 8.0             # min
    assert s.summitMaxWindMph == 50.0      # max gust
    assert math.isclose(s.summitPrecipIn, 0.2, rel_tol=1e-6)  # sum
    assert s.freezingLevelFtNoon == 7000.0 # value at 12:00 local
    assert math.isclose(s.snowfallIn, 3.0, rel_tol=1e-6)      # sum


def test_model_day_summary_falls_back_to_2m_when_no_summit_band():
    s = ModelSeries(time=["2026-08-02T12:00"], temperature_2m=[30.0],
                    wind_gusts_10m=[10.0], precipitation=[0.0], snowfall=[0.0],
                    freezing_level_height=[7000.0])
    out = summary.model_day_summary(s, "2026-08-02")
    assert out.summitHighF == 30.0  # uses temperature_2m fallback


def test_model_day_summary_unavailable_when_no_data():
    s = ModelSeries(available=False)
    out = summary.model_day_summary(s, "2026-08-02")
    assert out.available is False


def test_model_day_summary_no_hours_for_target_unavailable():
    out = summary.model_day_summary(_series(), "2030-01-01")
    assert out.available is False


def test_summary_model_precedence_prefers_hrrr():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-02T00:00:00Z",
        hrrr=_series(), gfs=_series(), ecmwf=_series())
    model, _ = summary.choose_summary_model(blob, "2026-08-02")
    assert model == "hrrr"


def test_summary_model_precedence_skips_unavailable_hrrr():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-02T00:00:00Z",
        hrrr=ModelSeries(available=False), gfs=_series(), ecmwf=_series())
    model, _ = summary.choose_summary_model(blob, "2026-08-02")
    assert model == "gfs"


def test_precip_type_snow_when_below_freezing_and_snowfall():
    assert summary.precip_type(precip=0.2, snowfall=2.0,
                               freezing_level_ft=5000, summit_ft=14410) == "snow"


def test_precip_type_rain_when_freezing_above_summit():
    assert summary.precip_type(precip=0.2, snowfall=0.0,
                               freezing_level_ft=15000, summit_ft=14410) == "rain"


def test_precip_type_mixed_near_summit():
    assert summary.precip_type(precip=0.2, snowfall=0.0,
                               freezing_level_ft=14300, summit_ft=14410) == "mixed"


def test_precip_type_none_when_dry():
    assert summary.precip_type(precip=0.0, snowfall=0.0,
                               freezing_level_ft=6000, summit_ft=14410) == "none"


def test_build_current_summary_uses_chosen_model_and_precip_type():
    blob = CombinedForecastBlob(
        mountainId="mt-rainier", timezone="America/Los_Angeles",
        fetchedAt="2026-08-02T00:00:00Z", gfs=_series())
    cs = summary.build_current_summary(blob, "2026-08-02", summit_ft=14410,
                                       tone="caution", verdict="x")
    assert cs.summaryModel == "gfs"
    assert cs.targetDateHigh == 22.0
    assert cs.precipType == "snow"   # freezing 7000 < summit, snowfall present
    assert cs.tone == "caution"
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd functions && pytest weather_worker/tests/test_summary.py -v -p no:cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'weather_worker.summary'`.

- [ ] **Step 3: Implement `functions/weather_worker/summary.py`** (contract §6)

```python
"""Target-date summary derivation (contract §6)."""

from shared.models import CombinedForecastBlob, CurrentSummary, ModelDaySummary, ModelSeries

MIXED_BAND_FT = 500  # freezing level within ±500 ft of summit -> mixed


def _hours_on(series: ModelSeries, target_date: str) -> list[int]:
    """Indices of series.time entries on the target ISO date (YYYY-MM-DD prefix)."""
    return [i for i, t in enumerate(series.time) if t[:10] == target_date]


def _summit_temps(series: ModelSeries, idxs: list[int]) -> list[float]:
    """Prefer the resolved summit-band temp; fall back to 2m if the band is empty."""
    band = series.temp_summit_f
    src = band if any(band) else series.temperature_2m
    return [src[i] for i in idxs if i < len(src) and src[i] is not None]


def _noon_index(series: ModelSeries, idxs: list[int]) -> int:
    for i in idxs:
        if series.time[i][11:16] == "12:00":
            return i
    return idxs[0]


def _sum(values: list[float | None], idxs: list[int]) -> float:
    return round(sum(values[i] for i in idxs if i < len(values) and values[i] is not None), 3)


def model_day_summary(series: ModelSeries, target_date: str) -> ModelDaySummary:
    """Per-model summary for the target date (contract §3 weatherSnapshots.models)."""
    if not series.available:
        return ModelDaySummary(available=False)
    idxs = _hours_on(series, target_date)
    if not idxs:
        return ModelDaySummary(available=False)
    temps = _summit_temps(series, idxs)
    gusts = [series.wind_gusts_10m[i] for i in idxs
             if i < len(series.wind_gusts_10m) and series.wind_gusts_10m[i] is not None]
    noon = _noon_index(series, idxs)
    fl = series.freezing_level_height
    return ModelDaySummary(
        available=True,
        summitHighF=max(temps) if temps else None,
        summitLowF=min(temps) if temps else None,
        summitMaxWindMph=max(gusts) if gusts else None,
        summitPrecipIn=_sum(series.precipitation, idxs),
        freezingLevelFtNoon=fl[noon] if noon < len(fl) else None,
        snowfallIn=_sum(series.snowfall, idxs),
    )


def all_model_summaries(blob: CombinedForecastBlob, target_date: str) -> dict:
    """ModelDaySummary for each of hrrr/gfs/ecmwf, as plain dicts for Firestore."""
    out = {}
    for key in ("hrrr", "gfs", "ecmwf"):
        series = getattr(blob, key)
        s = model_day_summary(series, target_date) if series else ModelDaySummary(available=False)
        out[key] = s.model_dump()
    return out


def choose_summary_model(blob: CombinedForecastBlob, target_date: str) -> tuple[str, ModelDaySummary]:
    """Precedence HRRR -> GFS -> ECMWF, first with data for the target date (contract §6)."""
    for key in ("hrrr", "gfs", "ecmwf"):
        series = getattr(blob, key)
        if series is None:
            continue
        s = model_day_summary(series, target_date)
        if s.available:
            return key, s
    return "gfs", ModelDaySummary(available=False)


def precip_type(precip: float, snowfall: float, freezing_level_ft: float, summit_ft: float) -> str:
    """contract §6: snow / rain / mixed / none from precip + freezing level vs summit."""
    if precip <= 0 and snowfall <= 0:
        return "none"
    if abs(freezing_level_ft - summit_ft) <= MIXED_BAND_FT:
        return "mixed"
    if snowfall > 0 and freezing_level_ft < summit_ft:
        return "snow"
    if freezing_level_ft > summit_ft:
        return "rain"
    return "snow"


def build_current_summary(
    blob: CombinedForecastBlob, target_date: str, summit_ft: float, tone: str, verdict: str
) -> CurrentSummary:
    """Assemble currentSummary from the chosen model + tone/verdict (contract §3/§6/§8)."""
    model, day = choose_summary_model(blob, target_date)
    fl = day.freezingLevelFtNoon if day.freezingLevelFtNoon is not None else 0.0
    return CurrentSummary(
        targetDateHigh=day.summitHighF,
        targetDateLow=day.summitLowF,
        targetDateWind=day.summitMaxWindMph,
        targetDatePrecip=day.summitPrecipIn,
        freezingLevelFt=day.freezingLevelFtNoon,
        precipType=precip_type(day.summitPrecipIn or 0.0, day.snowfallIn or 0.0, fl, summit_ft),
        summaryModel=model,
        tone=tone,
        verdict=verdict,
    )
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd functions && pytest weather_worker/tests/test_summary.py -v -p no:cov`
Expected: 11 passed.

- [ ] **Step 5: Commit**

```bash
git add functions/weather_worker/summary.py functions/weather_worker/tests/test_summary.py
git commit -m "feat(p1): target-date summary derivation (contract §6)"
```

---

## Task 9: Weather worker entry point (`functions/weather_worker/main.py`)

**Files:**
- Create: `functions/weather_worker/main.py`
- Test: `functions/weather_worker/tests/test_main.py`

- [ ] **Step 1: Write the failing test** — `functions/weather_worker/tests/test_main.py`

```python
import base64
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from shared.models import ModelSeries
from weather_worker import main


def _event(payload: dict):
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": data}})


def _good_series():
    return ModelSeries(
        time=["2026-08-02T00:00", "2026-08-02T12:00"],
        temperature_2m=[10.0, 25.0], wind_gusts_10m=[20.0, 30.0],
        precipitation=[0.0, 0.0], snowfall=[0.0, 0.0],
        freezing_level_height=[6000.0, 6500.0], temp_summit_f=[8.0, 20.0])


@pytest.fixture
def patched(monkeypatch):
    """Patch every external collaborator the worker touches."""
    m = SimpleNamespace()
    m.get_mountain = MagicMock(return_value={
        "id": "mt-rainier", "slug": "mt-rainier", "lat": 46.85, "lng": -121.76,
        "timezone": "America/Los_Angeles",
        "elevations": {"base": 5420, "mid": 10188, "summit": 14410}})
    m.projects_for_mountain = MagicMock(return_value=[
        {"id": "p1", "mountainId": "mt-rainier", "targetDateStart": "2026-08-02",
         "currentAvalancheSummary": {"dangerUpper": 3}}])
    m.write_combined_blob = MagicMock(return_value="forecasts/mt-rainier/2026-08-02/0000-combined.json")
    m.upsert_mountain_conditions = MagicMock()
    m.write_weather_snapshot = MagicMock(return_value="snap1")
    m.update_current_summary = MagicMock()
    m.set_project_refresh_status = MagicMock()
    monkeypatch.setattr(main.fc, "get_mountain", m.get_mountain)
    monkeypatch.setattr(main.fc, "projects_for_mountain", m.projects_for_mountain)
    monkeypatch.setattr(main.sc, "write_combined_blob", m.write_combined_blob)
    monkeypatch.setattr(main.fc, "upsert_mountain_conditions", m.upsert_mountain_conditions)
    monkeypatch.setattr(main.fc, "write_weather_snapshot", m.write_weather_snapshot)
    monkeypatch.setattr(main.fc, "update_current_summary", m.update_current_summary)
    monkeypatch.setattr(main.fc, "set_project_refresh_status", m.set_project_refresh_status)
    return m


def test_happy_path_writes_blob_conditions_snapshot_summary(patched, monkeypatch):
    monkeypatch.setattr(main.omc, "fetch_forecast", AsyncMock(return_value={
        "hrrr": _good_series(), "gfs": _good_series(), "ecmwf": _good_series()}))

    main.handle_message(_event({"mountainId": "mt-rainier", "reason": "manual"}))

    patched.write_combined_blob.assert_called_once()
    patched.upsert_mountain_conditions.assert_called_once()
    patched.write_weather_snapshot.assert_called_once()
    assert patched.write_weather_snapshot.call_args.kwargs["source"] == "live"
    patched.update_current_summary.assert_called_once()
    patched.set_project_refresh_status.assert_called_once_with("p1", "ok")


def test_one_model_fail_marks_partial(patched, monkeypatch):
    from shared.models import ModelSeries as MS
    monkeypatch.setattr(main.omc, "fetch_forecast", AsyncMock(return_value={
        "hrrr": MS(available=False), "gfs": _good_series(), "ecmwf": _good_series()}))

    main.handle_message(_event({"mountainId": "mt-rainier", "reason": "scheduled"}))

    patched.upsert_mountain_conditions.assert_called_once()  # still writes
    patched.set_project_refresh_status.assert_called_once_with("p1", "partial")


def test_all_models_fail_marks_error_and_no_blob(patched, monkeypatch):
    monkeypatch.setattr(main.omc, "fetch_forecast",
                        AsyncMock(side_effect=main.omc.OpenMeteoError("Invalid timezone")))

    with pytest.raises(main.omc.OpenMeteoError):
        main.handle_message(_event({"mountainId": "mt-rainier", "reason": "scheduled"}))

    patched.write_combined_blob.assert_not_called()
    patched.upsert_mountain_conditions.assert_not_called()
    patched.set_project_refresh_status.assert_called_once_with("p1", "error")


def test_no_projects_still_writes_mountain_conditions(patched, monkeypatch):
    patched.projects_for_mountain.return_value = []
    monkeypatch.setattr(main.omc, "fetch_forecast", AsyncMock(return_value={
        "hrrr": _good_series(), "gfs": _good_series(), "ecmwf": _good_series()}))

    main.handle_message(_event({"mountainId": "mt-rainier", "reason": "scheduled"}))

    patched.write_combined_blob.assert_called_once()
    patched.upsert_mountain_conditions.assert_called_once()
    patched.write_weather_snapshot.assert_not_called()
    patched.update_current_summary.assert_not_called()


def test_unknown_mountain_raises(patched):
    patched.get_mountain.return_value = None
    with pytest.raises(ValueError, match="Unknown mountain"):
        main.handle_message(_event({"mountainId": "nope", "reason": "manual"}))
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd functions && pytest weather_worker/tests/test_main.py -v -p no:cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'weather_worker.main'`.

- [ ] **Step 3: Implement `functions/weather_worker/main.py`**

```python
"""weather_worker entry point: handle_message (Pub/Sub CloudEvent).

Pipeline (spec §4): fetch mountain -> fetch Open-Meteo -> build CombinedForecastBlob
-> write blob to GCS -> ALWAYS upsert mountainConditions -> for each active project
referencing the mountain, write a live weatherSnapshot + update currentSummary
(tone/verdict using the project's latest currentAvalancheSummary danger if present)
+ set lastRefreshStatus.

Status rules:
- all 3 models unavailable / fetch raised  -> "error", no blob, re-raise (Pub/Sub retry -> DLQ)
- some (but not all) models unavailable     -> "partial" (blob + conditions still written)
- all models available                       -> "ok"
"""

import asyncio
import base64
import json
from datetime import datetime, timezone

import functions_framework

from shared import firestore_client as fc
from shared import storage_client as sc
from shared.models import CombinedForecastBlob
from weather_worker import open_meteo_client as omc
from weather_worker import summary as summ
from weather_worker import tone as tn

MODEL_KEYS = ("hrrr", "gfs", "ecmwf")


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def _refresh_status(series_by_key: dict) -> str:
    available = [series_by_key[k].available for k in MODEL_KEYS]
    if not any(available):
        return "error"
    if all(available):
        return "ok"
    return "partial"


@functions_framework.cloud_event
def handle_message(cloud_event):
    msg = _decode(cloud_event)
    mountain_id = msg["mountainId"]

    mountain = fc.get_mountain(mountain_id)
    if mountain is None:
        raise ValueError(f"Unknown mountain: {mountain_id}")

    projects = fc.projects_for_mountain(mountain_id)

    # Fetch. A total failure (no GFS/ECMWF) raises OpenMeteoError.
    try:
        series_by_key = asyncio.run(omc.fetch_forecast(mountain))
    except omc.OpenMeteoError:
        for p in projects:
            fc.set_project_refresh_status(p["id"], "error")
        raise  # let Pub/Sub retry -> DLQ

    status = _refresh_status(series_by_key)
    if status == "error":
        # GFS+ECMWF both missing -> treat as a hard error, write nothing.
        for p in projects:
            fc.set_project_refresh_status(p["id"], "error")
        raise omc.OpenMeteoError(f"No usable models for {mountain_id}")

    fetched_at = datetime.now(timezone.utc)
    blob = CombinedForecastBlob(
        mountainId=mountain_id,
        timezone=mountain["timezone"],
        fetchedAt=fetched_at,
        hrrr=series_by_key["hrrr"],
        gfs=series_by_key["gfs"],
        ecmwf=series_by_key["ecmwf"],
    )
    blob_path = sc.write_combined_blob(
        mountain_id, fetched_at, blob.model_dump(by_alias=True, mode="json")
    )

    summit_ft = mountain["elevations"]["summit"]

    # mountainConditions is browse-only; it needs a current summary too. Use the
    # nearest target date if a project exists, else "today" so browse is non-empty.
    default_target = (
        projects[0]["targetDateStart"] if projects else fetched_at.date().isoformat()
    )
    cond_summary = _summary_for(blob, default_target, summit_ft, nwac_danger=None)
    fc.upsert_mountain_conditions(mountain_id, blob_path, cond_summary.model_dump())

    for p in projects:
        target = p["targetDateStart"]
        danger = _danger_for(p)
        cs = _summary_for(blob, target, summit_ft, nwac_danger=danger)
        models = summ.all_model_summaries(blob, target)
        fc.write_weather_snapshot(
            p["id"], target_date=target, blob_path=blob_path, source="live", models=models
        )
        fc.update_current_summary(p["id"], cs.model_dump())
        fc.set_project_refresh_status(p["id"], status)


def _danger_for(project: dict) -> int | None:
    """Latest summit-band NWAC danger from the project's currentAvalancheSummary."""
    av = project.get("currentAvalancheSummary")
    if not av:
        return None
    return av.get("dangerUpper")


def _summary_for(blob, target_date, summit_ft, nwac_danger):
    _, day = summ.choose_summary_model(blob, target_date)
    label, _ = tn.score_tone(
        max_wind=day.summitMaxWindMph or 0.0,
        max_gust=day.summitMaxWindMph or 0.0,
        precip=day.summitPrecipIn or 0.0,
        nwac_danger=nwac_danger,
        high_f=day.summitHighF if day.summitHighF is not None else 50.0,
    )
    v = tn.verdict(
        label,
        max_wind=day.summitMaxWindMph or 0.0,
        max_gust=day.summitMaxWindMph or 0.0,
        precip=day.summitPrecipIn or 0.0,
        nwac_danger=nwac_danger,
        high_f=day.summitHighF if day.summitHighF is not None else 50.0,
        freezing_level_ft=day.freezingLevelFtNoon or 0.0,
        summit_ft=summit_ft,
    )
    return summ.build_current_summary(blob, target_date, summit_ft, tone=label, verdict=v)
```

> Per contract §6 our `ModelDaySummary.summitMaxWindMph` is the **max gust**; the prototype's tone formula uses both `maxWind` (sustained) and `maxGust`. Since we only persist the gust, we pass it for both `max_wind` and `max_gust` (documented assumption — see header note). This is intentionally conservative (a high gust can score both the wind and gust branches), matching the "Hazardous" feel of the approved prototype.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd functions && pytest weather_worker/tests/test_main.py -v -p no:cov`
Expected: 5 passed.

- [ ] **Step 5: Run the whole weather_worker package with the coverage gate**

Run: `cd functions && pytest weather_worker/ -k "not contract_fixture and not live"`
Expected: all passed, coverage ≥90% on `weather_worker/*` (the live + fixture tests are excluded).

- [ ] **Step 6: Commit**

```bash
git add functions/weather_worker/main.py functions/weather_worker/tests/test_main.py
git commit -m "feat(p1): weather worker pipeline entry point (spec §4)"
```

---

## Task 10: Orchestrator (`functions/orchestrator/main.py`)

**Files:**
- Create: `functions/orchestrator/__init__.py`, `functions/orchestrator/main.py`, `functions/orchestrator/requirements.txt`, `functions/orchestrator/tests/__init__.py`
- Test: `functions/orchestrator/tests/test_main.py`

- [ ] **Step 1: Create package files**

```python
# functions/orchestrator/__init__.py
```
```python
# functions/orchestrator/tests/__init__.py
```
```text
# functions/orchestrator/requirements.txt
functions-framework==3.*
firebase-admin==6.5.0
google-cloud-pubsub==2.23.0
pydantic==2.8.2
```

- [ ] **Step 2: Write the failing test** — `functions/orchestrator/tests/test_main.py`

```python
import base64
import json
from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from orchestrator import main


def _event(payload: dict):
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": data}})


def _proj(mountain_id, days_out):
    start = (date(2026, 6, 14) + timedelta(days=days_out)).isoformat()
    return {"id": f"p-{mountain_id}-{days_out}", "mountainId": mountain_id,
            "targetDateStart": start, "status": "active"}


@pytest.fixture
def patched(monkeypatch):
    s = SimpleNamespace()
    s.publish = MagicMock(return_value="msg")
    s.get_active_projects = MagicMock(return_value=[])
    s.mountains = MagicMock(return_value=[{"id": f"m{i}"} for i in range(10)])
    monkeypatch.setattr(main.pc, "publish", s.publish)
    monkeypatch.setattr(main.fc, "get_active_projects", s.get_active_projects)
    monkeypatch.setattr(main.fc, "all_mountain_ids", s.mountains)
    monkeypatch.setattr(main, "_now", lambda: SimpleNamespace(
        date=lambda: date(2026, 6, 14), hour=0))
    monkeypatch.setenv("BROWSE_REFRESH_MODE", "lazy")  # disable browse fan-out by default
    return s


def test_urgency_hourly_within_48h(patched, monkeypatch):
    # target 1 day out -> hourly tier -> publish on any hour
    patched.get_active_projects.return_value = [_proj("mt-rainier", 1)]
    main.orchestrate(_event({"type": "weather"}))
    published = [c.args[1]["mountainId"] for c in patched.publish.call_args_list]
    assert published == ["mt-rainier"]


def test_dedup_same_mountain_multiple_projects(patched):
    patched.get_active_projects.return_value = [
        _proj("mt-rainier", 1), _proj("mt-rainier", 5)]
    main.orchestrate(_event({"type": "weather"}))
    published = [c.args[1]["mountainId"] for c in patched.publish.call_args_list]
    assert published == ["mt-rainier"]  # deduped to one


def test_6h_tier_only_publishes_on_6h_hours(patched, monkeypatch):
    patched.get_active_projects.return_value = [_proj("mt-baker", 4)]  # 48h-7d
    # hour 0 -> publish
    monkeypatch.setattr(main, "_now", lambda: SimpleNamespace(date=lambda: date(2026, 6, 14), hour=0))
    main.orchestrate(_event({"type": "weather"}))
    assert patched.publish.call_count == 1
    patched.publish.reset_mock()
    # hour 3 -> no publish (not a 6h tick)
    monkeypatch.setattr(main, "_now", lambda: SimpleNamespace(date=lambda: date(2026, 6, 14), hour=3))
    main.orchestrate(_event({"type": "weather"}))
    assert patched.publish.call_count == 0


def test_daily_tier_only_publishes_at_hour_0(patched, monkeypatch):
    patched.get_active_projects.return_value = [_proj("glacier-peak", 10)]  # 7-14d
    monkeypatch.setattr(main, "_now", lambda: SimpleNamespace(date=lambda: date(2026, 6, 14), hour=0))
    main.orchestrate(_event({"type": "weather"}))
    assert patched.publish.call_count == 1
    patched.publish.reset_mock()
    monkeypatch.setattr(main, "_now", lambda: SimpleNamespace(date=lambda: date(2026, 6, 14), hour=6))
    main.orchestrate(_event({"type": "weather"}))
    assert patched.publish.call_count == 0


def test_empty_projects_no_publish_when_lazy(patched):
    patched.get_active_projects.return_value = []
    main.orchestrate(_event({"type": "weather"}))
    assert patched.publish.call_count == 0


def test_browse_fanout_when_scheduled_every_6h(patched, monkeypatch):
    monkeypatch.setenv("BROWSE_REFRESH_MODE", "scheduled")
    patched.get_active_projects.return_value = []
    monkeypatch.setattr(main, "_now", lambda: SimpleNamespace(date=lambda: date(2026, 6, 14), hour=6))
    main.orchestrate(_event({"type": "weather"}))
    published = {c.args[1]["mountainId"] for c in patched.publish.call_args_list}
    assert published == {f"m{i}" for i in range(10)}  # all 10 browse mountains


def test_browse_fanout_skipped_off_6h(patched, monkeypatch):
    monkeypatch.setenv("BROWSE_REFRESH_MODE", "scheduled")
    patched.get_active_projects.return_value = []
    monkeypatch.setattr(main, "_now", lambda: SimpleNamespace(date=lambda: date(2026, 6, 14), hour=1))
    main.orchestrate(_event({"type": "weather"}))
    assert patched.publish.call_count == 0


def test_reason_is_scheduled(patched):
    patched.get_active_projects.return_value = [_proj("mt-rainier", 1)]
    main.orchestrate(_event({"type": "weather"}))
    assert patched.publish.call_args.args[1]["reason"] == "scheduled"


def test_non_weather_type_is_stub_noop_in_p1(patched):
    # nwac/snotel/satellite fan-out arrives in P2 -> P1 stub does not publish
    main.orchestrate(_event({"type": "nwac"}))
    assert patched.publish.call_count == 0
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd functions && pytest orchestrator/tests/test_main.py -v -p no:cov`
Expected: FAIL — `ModuleNotFoundError: No module named 'orchestrator.main'`.

- [ ] **Step 4: Implement `functions/orchestrator/main.py`** (spec §3 tiers; contract §2)

This requires one small addition to `shared/firestore_client.py`: an `all_mountain_ids()` helper for the browse fan-out. Add it now (TDD: covered by the orchestrator tests via the patched `main.fc.all_mountain_ids`, and add a direct unit test):

Append to `functions/shared/firestore_client.py`:

```python
def all_mountain_ids() -> list[str]:
    """All seed mountain ids (for scheduled browse fan-out, spec §4)."""
    return [s.id for s in _db().collection("mountains").stream()]
```

Add to `functions/shared/tests/test_firestore_client.py`:

```python
def test_all_mountain_ids_lists_doc_ids(monkeypatch):
    snaps = [_doc({}, id_="mt-rainier"), _doc({}, id_="mt-baker")]
    coll = MagicMock(); coll.stream.return_value = iter(snaps)
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)
    assert fc.all_mountain_ids() == ["mt-rainier", "mt-baker"]
```

Now `functions/orchestrator/main.py`:

```python
"""orchestrator entry point: orchestrate (Pub/Sub CloudEvent from Cloud Scheduler).

For type=="weather" (spec §3 urgency tiers):
  - For each active project, classify urgency by days until targetDateStart:
      <=2 days  -> hourly  (publish every tick)
      <=7 days  -> 6h      (publish at local hours 0/6/12/18)
      <=14 days -> daily   (publish at local hour 0)
      >14 days  -> skip
  - Take the MAX urgency per mountain, dedup mountain ids, and only publish for
    mountains whose tier fires this tick (self-gated by current local hour).
  - When BROWSE_REFRESH_MODE=="scheduled", ALSO add every seed mountain on the 6h
    cycle (POC browse refresh, spec §4). Dedup against the pinned set.
type in {nwac, snotel, satellite}: STUB (fan-out added in P2) -> no-op.
"""

import base64
import json
import os
from datetime import date, datetime
from zoneinfo import ZoneInfo

import functions_framework

from shared import firestore_client as fc
from shared import pubsub_client as pc

LOCAL_TZ = ZoneInfo("America/Los_Angeles")

# urgency tier -> the local hours on which it publishes
HOURLY = "hourly"
SIXH = "6h"
DAILY = "daily"
SKIP = "skip"
SIX_HOUR_TICKS = {0, 6, 12, 18}


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def _now() -> datetime:
    return datetime.now(LOCAL_TZ)


def _tier(days_out: int) -> str:
    if days_out <= 2:
        return HOURLY
    if days_out <= 7:
        return SIXH
    if days_out <= 14:
        return DAILY
    return SKIP


def _fires(tier: str, hour: int) -> bool:
    if tier == HOURLY:
        return True
    if tier == SIXH:
        return hour in SIX_HOUR_TICKS
    if tier == DAILY:
        return hour == 0
    return False


def _most_urgent(a: str, b: str) -> str:
    order = {HOURLY: 3, SIXH: 2, DAILY: 1, SKIP: 0}
    return a if order[a] >= order[b] else b


@functions_framework.cloud_event
def orchestrate(cloud_event):
    msg = _decode(cloud_event)
    if msg.get("type") != "weather":
        # P2: nwac/snotel/satellite fan-out. STUB in P1 — intentionally a no-op.
        return

    now = _now()
    today = now.date()
    hour = now.hour

    # 1) per-mountain max urgency from active projects
    tiers: dict[str, str] = {}
    for p in fc.get_active_projects():
        mid = p.get("mountainId")
        if not mid:
            continue
        days_out = (date.fromisoformat(p["targetDateStart"]) - today).days
        t = _tier(days_out)
        if t == SKIP:
            continue
        tiers[mid] = _most_urgent(tiers.get(mid, SKIP), t)

    to_publish: set[str] = {mid for mid, t in tiers.items() if _fires(t, hour)}

    # 2) scheduled browse fan-out: all seed mountains on the 6h cycle (spec §4)
    if os.environ.get("BROWSE_REFRESH_MODE", "scheduled") == "scheduled" and hour in SIX_HOUR_TICKS:
        to_publish.update(fc.all_mountain_ids())

    # 3) dedup + publish
    for mountain_id in sorted(to_publish):
        pc.publish("weather-refresh", {"mountainId": mountain_id, "reason": "scheduled"})
```

> The orchestrator test patches `main._now` and `main.fc.all_mountain_ids`; `sorted(to_publish)` makes published order deterministic for assertions. The `test_browse_fanout_*` tests rely on `all_mountain_ids` returning `m0..m9`.

- [ ] **Step 5: Run it to verify it passes**

Run: `cd functions && pytest orchestrator/tests/test_main.py functions/shared/tests/test_firestore_client.py -v -p no:cov` *(use `shared/tests/...` path from inside `functions/`)*

Run (corrected from the `functions/` cwd): `cd functions && pytest orchestrator/tests/test_main.py shared/tests/test_firestore_client.py -v -p no:cov`
Expected: 9 orchestrator + 10 firestore = 19 passed.

- [ ] **Step 6: Commit**

```bash
git add functions/orchestrator/ functions/shared/firestore_client.py functions/shared/tests/test_firestore_client.py
git commit -m "feat(p1): orchestrator urgency tiering + dedup + browse fan-out (spec §3/§4)"
```

---

## Task 11: Backfill worker (`functions/backfill_worker/main.py`)

**Files:**
- Create: `functions/backfill_worker/__init__.py`, `functions/backfill_worker/main.py`, `functions/backfill_worker/requirements.txt`, `functions/backfill_worker/tests/__init__.py`
- Test: `functions/backfill_worker/tests/test_main.py`

- [ ] **Step 1: Create package files**

```python
# functions/backfill_worker/__init__.py
```
```python
# functions/backfill_worker/tests/__init__.py
```
```text
# functions/backfill_worker/requirements.txt
functions-framework==3.*
firebase-admin==6.5.0
google-cloud-storage==2.18.0
httpx==0.27.0
pydantic==2.8.2
tenacity==9.0.0
```

- [ ] **Step 2: Write the failing test** — `functions/backfill_worker/tests/test_main.py`

The Previous Runs response keys are suffixed `_previous_dayN_{model}` (contract §5.1). The inline body has the target timestamp present across two `_previous_day` offsets; real captured data lands in `fixtures/open_meteo_previous_runs.json` (Task 14).

```python
import base64
import json
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from backfill_worker import main


def _event(payload: dict):
    data = base64.b64encode(json.dumps(payload).encode()).decode()
    return SimpleNamespace(data={"message": {"data": data}})


# Trimmed previous-runs body: target date 2026-08-02, two daily offsets present.
PREV_BODY = {
    "latitude": 46.85, "longitude": -121.76, "elevation": 1500.0,
    "utc_offset_seconds": -25200, "timezone": "America/Los_Angeles",
    "hourly_units": {"temperature_2m": "°F", "freezing_level_height": "m"},
    "hourly": {
        "time": ["2026-08-02T00:00", "2026-08-02T12:00"],
        # day0 (today's run) and day1 (yesterday's run) for gfs_seamless
        "temperature_2m_previous_day0_gfs_seamless": [10.0, 24.0],
        "temperature_2m_previous_day1_gfs_seamless": [11.0, 26.0],
        "wind_gusts_10m_previous_day0_gfs_seamless": [20.0, 30.0],
        "wind_gusts_10m_previous_day1_gfs_seamless": [22.0, 33.0],
        "precipitation_previous_day0_gfs_seamless": [0.0, 0.0],
        "precipitation_previous_day1_gfs_seamless": [0.0, 0.0],
        "snowfall_previous_day0_gfs_seamless": [0.0, 0.0],
        "snowfall_previous_day1_gfs_seamless": [0.0, 0.0],
        "freezing_level_height_previous_day0_gfs_seamless": [6000.0, 6500.0],
        "freezing_level_height_previous_day1_gfs_seamless": [6100.0, 6600.0],
        "temperature_700hPa_previous_day0_gfs_seamless": [8.0, 20.0],
        "temperature_700hPa_previous_day1_gfs_seamless": [9.0, 22.0],
    },
}


@pytest.fixture
def patched(monkeypatch):
    s = SimpleNamespace()
    s.get_mountain = MagicMock(return_value={
        "id": "mt-rainier", "lat": 46.85, "lng": -121.76,
        "timezone": "America/Los_Angeles",
        "elevations": {"base": 5420, "mid": 10188, "summit": 14410}})
    s.write_weather_snapshot = MagicMock(return_value="snap")
    monkeypatch.setattr(main.fc, "get_mountain", s.get_mountain)
    monkeypatch.setattr(main.fc, "write_weather_snapshot", s.write_weather_snapshot)
    return s


def test_backfill_writes_snapshots_with_source_backfill(patched, httpx_mock):
    import re
    httpx_mock.add_response(
        url=re.compile(r"https://previous-runs-api\.open-meteo\.com/.*"), json=PREV_BODY)

    main.handle_message(_event({
        "projectId": "p1", "mountainId": "mt-rainier", "targetDate": "2026-08-02"}))

    assert patched.write_weather_snapshot.call_count >= 1
    for call in patched.write_weather_snapshot.call_args_list:
        assert call.kwargs["source"] == "backfill"
        assert call.kwargs["target_date"] == "2026-08-02"


def test_backfill_reconstructs_target_day_summary(patched, httpx_mock):
    import re
    httpx_mock.add_response(
        url=re.compile(r"https://previous-runs-api\.open-meteo\.com/.*"), json=PREV_BODY)
    main.handle_message(_event({
        "projectId": "p1", "mountainId": "mt-rainier", "targetDate": "2026-08-02"}))
    # the day0 snapshot's gfs summit high comes from temp_700hPa day0 = max(8,20)=20
    first = patched.write_weather_snapshot.call_args_list[0]
    models = first.kwargs["models"]
    assert models["gfs"]["available"] is True
    assert models["gfs"]["summitHighF"] == 20.0


def test_unknown_mountain_raises(patched):
    patched.get_mountain.return_value = None
    with pytest.raises(ValueError, match="Unknown mountain"):
        main.handle_message(_event({
            "projectId": "p1", "mountainId": "nope", "targetDate": "2026-08-02"}))


def test_contract_fixture_parses(load_fixture, patched, httpx_mock):
    """Contract test against the saved real previous-runs response (Task 14)."""
    import re
    body = load_fixture("open_meteo_previous_runs.json")
    httpx_mock.add_response(
        url=re.compile(r"https://previous-runs-api\.open-meteo\.com/.*"), json=body)
    main.handle_message(_event({
        "projectId": "p1", "mountainId": "mt-rainier", "targetDate": "2026-08-02"}))
    assert patched.write_weather_snapshot.called
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd functions && pytest backfill_worker/tests/test_main.py -v -p no:cov -k "not contract_fixture"`
Expected: FAIL — `ModuleNotFoundError: No module named 'backfill_worker.main'`.

- [ ] **Step 4: Implement `functions/backfill_worker/main.py`** (contract §5.1 Previous Runs)

```python
"""backfill_worker entry point: handle_message ({projectId, mountainId, targetDate}).

On project create the API publishes backfill-refresh. We call the Open-Meteo Previous
Runs API and sweep _previous_dayN (N=0..7) to reconstruct what each model predicted
for the target date over the past several days, writing weatherSnapshots with
source="backfill" (each carries a 30-day TTL via firestore_client). Backfill is
partial and model-dependent (≈full GFS/ECMWF history, ≈2 days HRRR) per spec §5.
"""

import asyncio
import base64
import json

import functions_framework
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from shared import firestore_client as fc
from shared.models import ModelDaySummary, ModelSeries

PREVIOUS_RUNS_URL = "https://previous-runs-api.open-meteo.com/v1/forecast"
METERS_TO_FEET = 3.28084
MAX_PREVIOUS_DAY = 7  # sweep N=0..7 (contract §5.1)

# We reconstruct the three models; HRRR usually has only ~2 days of history.
PREV_MODELS = {"hrrr": "gfs_hrrr", "gfs": "gfs_seamless", "ecmwf": "ecmwf_ifs025"}
SUMMARY_VARS = [
    "temperature_2m", "wind_gusts_10m", "precipitation", "snowfall",
    "freezing_level_height", "temperature_700hPa",
]


class BackfillError(RuntimeError):
    pass


def _decode(cloud_event) -> dict:
    raw = cloud_event.data["message"]["data"]
    return json.loads(base64.b64decode(raw).decode("utf-8"))


def _params(mountain: dict) -> dict:
    hourly = []
    for n in range(MAX_PREVIOUS_DAY + 1):
        for var in SUMMARY_VARS:
            hourly.append(f"{var}_previous_day{n}")
    return {
        "latitude": mountain["lat"],
        "longitude": mountain["lng"],
        "hourly": ",".join(hourly),
        "models": ",".join(PREV_MODELS.values()),
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "precipitation_unit": "inch",
        "timezone": mountain["timezone"],
        "forecast_days": 7,
        "past_days": 7,
    }


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=2), reraise=True)
async def _get(mountain: dict) -> dict:
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.get(PREVIOUS_RUNS_URL, params=_params(mountain))
    body = resp.json()
    if resp.status_code >= 400 or (isinstance(body, dict) and body.get("error")):
        reason = body.get("reason", f"HTTP {resp.status_code}") if isinstance(body, dict) \
            else f"HTTP {resp.status_code}"
        raise BackfillError(reason)
    return body


def _series_for(hourly: dict, model_api_id: str, multi: bool, day: int, target_date: str) -> ModelSeries:
    """Build a ModelSeries for one model + one previous-day offset, target-date only."""
    sfx_model = f"_{model_api_id}" if multi else ""
    time = hourly["time"]
    idxs = [i for i, t in enumerate(time) if t[:10] == target_date]

    def col(var):
        key = f"{var}_previous_day{day}{sfx_model}"
        vals = hourly.get(key)
        if vals is None:
            return None
        return [vals[i] for i in idxs]

    temps_2m = col("temperature_2m")
    temps_700 = col("temperature_700hPa")
    fl = col("freezing_level_height")
    if temps_2m is None and temps_700 is None:
        return ModelSeries(available=False)
    target_times = [time[i] for i in idxs]
    return ModelSeries(
        available=True,
        time=target_times,
        temperature_2m=temps_2m or [],
        wind_gusts_10m=col("wind_gusts_10m") or [],
        precipitation=col("precipitation") or [],
        snowfall=col("snowfall") or [],
        freezing_level_height=[None if v is None else v * METERS_TO_FEET for v in (fl or [])],
        temp_summit_f=temps_700 or [],
    )


def _day_summary(series: ModelSeries) -> ModelDaySummary:
    # Local import to reuse the canonical derivation without a circular import.
    from weather_worker import summary as summ
    if not series.available or not series.time:
        return ModelDaySummary(available=False)
    return summ.model_day_summary(series, series.time[0][:10])


@functions_framework.cloud_event
def handle_message(cloud_event):
    msg = _decode(cloud_event)
    mountain_id = msg["mountainId"]
    project_id = msg["projectId"]
    target_date = msg["targetDate"]

    mountain = fc.get_mountain(mountain_id)
    if mountain is None:
        raise ValueError(f"Unknown mountain: {mountain_id}")

    body = asyncio.run(_get(mountain))
    hourly = body["hourly"]
    multi = len(PREV_MODELS) >= 2

    wrote = 0
    for day in range(MAX_PREVIOUS_DAY + 1):
        models: dict = {}
        any_available = False
        for key, api_id in PREV_MODELS.items():
            series = _series_for(hourly, api_id, multi, day, target_date)
            summary = _day_summary(series)
            models[key] = summary.model_dump()
            any_available = any_available or summary.available
        if not any_available:
            continue  # no model had this offset's target data (e.g. HRRR beyond ~2 days)
        fc.write_weather_snapshot(
            project_id, target_date=target_date, blob_path="",
            source="backfill", models=models,
        )
        wrote += 1

    if wrote == 0:
        raise BackfillError(f"No backfill data reconstructed for {mountain_id} {target_date}")
```

> Backfill snapshots have `forecastBlobPath=""` (the reconstructed point has no combined blob; it is summary-only — the evolution chart reads `models.*`). Each still gets `source="backfill"` + a 30-day TTL via `write_weather_snapshot`. The day-0 offset = the most recent run; day-7 = the oldest, giving the evolution curve.

- [ ] **Step 5: Run it to verify it passes**

Run: `cd functions && pytest backfill_worker/tests/test_main.py -v -p no:cov -k "not contract_fixture"`
Expected: 3 passed (contract-fixture test passes after Task 14).

- [ ] **Step 6: Commit**

```bash
git add functions/backfill_worker/
git commit -m "feat(p1): backfill worker via previous-runs api (contract §5.1)"
```

---

## Task 12: Terraform `functions` module + wiring

**Files:**
- Create: `terraform/modules/functions/{variables.tf,main.tf,outputs.tf}`
- Modify: `terraform/main.tf`, `terraform/outputs.tf`

- [ ] **Step 1: Create `terraform/modules/functions/variables.tf`**

```hcl
variable "project_id"    { type = string }
variable "region"        { type = string }
variable "env"           { type = string }
variable "source_bucket" { type = string }
variable "sa_emails"     { type = map(string) }   # from module.iam.sa_emails
variable "topic_ids"     { type = map(string) }   # from module.pubsub.topic_ids (logical -> id)
variable "dlq_topic_id"  { type = string }
variable "weather_bucket"   { type = string }
variable "satellite_bucket" { type = string }
variable "topic_paths"   { type = map(string) }   # logical -> full topic path for env vars
```

- [ ] **Step 2: Create `terraform/modules/functions/main.tf`** (Gen2 python312; parameterized by `locals.functions`)

```hcl
locals {
  # P1 seeds three functions; P2 appends nwac/snotel/satellite to this map.
  functions = {
    orchestrator = {
      entry_point   = "orchestrate"
      source_dir    = "${path.root}/../functions/orchestrator"
      trigger_topic = "orchestrate"
      sa_key        = "orchestrator"
      memory        = "256Mi"
      timeout       = 60
      max_instances = 3
    }
    weather-worker = {
      entry_point   = "handle_message"
      source_dir    = "${path.root}/../functions/weather_worker"
      trigger_topic = "weather-refresh"
      sa_key        = "weather-worker"
      memory        = "512Mi"
      timeout       = 120
      max_instances = 100
    }
    backfill-worker = {
      entry_point   = "handle_message"
      source_dir    = "${path.root}/../functions/backfill_worker"
      trigger_topic = "backfill-refresh"
      sa_key        = "backfill-worker"
      memory        = "512Mi"
      timeout       = 300
      max_instances = 10
    }
  }

  shared_env = {
    GCP_PROJECT          = var.project_id
    ENV                  = var.env
    GCS_BUCKET_WEATHER   = var.weather_bucket
    GCS_BUCKET_SATELLITE = var.satellite_bucket
    TOPIC_WEATHER_REFRESH   = var.topic_paths["weather-refresh"]
    TOPIC_BACKFILL_REFRESH  = var.topic_paths["backfill-refresh"]
    TOPIC_NWAC_REFRESH      = var.topic_paths["nwac-refresh"]
    TOPIC_SNOTEL_REFRESH    = var.topic_paths["snotel-refresh"]
    TOPIC_SATELLITE_REFRESH = var.topic_paths["satellite-refresh"]
    BROWSE_REFRESH_MODE     = "scheduled"
  }
}

# Bundle each function's source (its own dir + the shared/ package).
data "archive_file" "src" {
  for_each    = local.functions
  type        = "zip"
  output_path = "${path.module}/build/${each.key}.zip"

  source_dir = each.value.source_dir
  # NOTE: each function dir must vendor shared/ at deploy time. The deploy step
  # (Task 13) syncs functions/shared into each function dir before apply, OR the
  # build uses a prepared staging dir. See Task 13 Step 1.
}

resource "google_storage_bucket_object" "src" {
  for_each = local.functions
  name     = "sources/${var.env}/${each.key}/${data.archive_file.src[each.key].output_md5}.zip"
  bucket   = var.source_bucket
  source   = data.archive_file.src[each.key].output_path
}

resource "google_cloudfunctions2_function" "fn" {
  for_each = local.functions
  name     = "${var.env}-${each.key}"
  location = var.region

  build_config {
    runtime     = "python312"
    entry_point = each.value.entry_point
    source {
      storage_source {
        bucket = var.source_bucket
        object = google_storage_bucket_object.src[each.key].name
      }
    }
  }

  service_config {
    available_memory      = each.value.memory
    timeout_seconds       = each.value.timeout
    max_instance_count    = each.value.max_instances
    service_account_email = var.sa_emails[each.value.sa_key]
    environment_variables = local.shared_env
  }

  event_trigger {
    trigger_region = var.region
    event_type     = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic   = var.topic_ids[each.value.trigger_topic]
    retry_policy   = "RETRY_POLICY_RETRY"
    service_account_email = var.sa_emails[each.value.sa_key]
  }
}

# Route undeliverable messages to the DLQ via each trigger subscription.
# Gen2 creates the push subscription; attach the DLQ + max delivery attempts.
resource "google_pubsub_subscription" "dlq_attach" {
  for_each = local.functions
  name     = "${var.env}-${each.key}-dlq-bind"
  topic    = var.topic_ids[each.value.trigger_topic]
  # A separate pull subscription is NOT the trigger sub; this records intent.
  # The Gen2 trigger subscription's dead_letter_policy is set out-of-band in
  # Task 13 via gcloud (the provider does not expose the auto-created sub).
  dead_letter_policy {
    dead_letter_topic     = var.dlq_topic_id
    max_delivery_attempts = 5
  }
  ack_deadline_seconds = 60
}
```

> **DLQ note:** Gen2 event triggers auto-create their push subscription, which Terraform does not directly manage. The `dlq_attach` subscription above documents the DLQ intent; the actual dead-letter binding on the trigger subscription is applied in Task 13 Step 5 via `gcloud pubsub subscriptions update` (idempotent). This matches P0's DLQ topic + monitoring alert (spec §2 #15-17).

- [ ] **Step 3: Create `terraform/modules/functions/outputs.tf`**

```hcl
output "function_names" {
  value = { for k, f in google_cloudfunctions2_function.fn : k => f.name }
}
output "function_uris" {
  value = { for k, f in google_cloudfunctions2_function.fn : k => f.service_config[0].uri }
}
```

- [ ] **Step 4: Wire `module "functions"` into `terraform/main.tf`** — append after `module "monitoring"`:

```hcl
locals {
  topic_paths = {
    for k in ["orchestrate", "weather-refresh", "backfill-refresh",
              "nwac-refresh", "snotel-refresh", "satellite-refresh"] :
    k => "projects/${var.project_id}/topics/${var.env}-${k}"
  }
}

module "functions" {
  source           = "./modules/functions"
  project_id       = var.project_id
  region           = var.region
  env              = var.env
  source_bucket    = module.storage.source_bucket_name
  weather_bucket   = module.storage.weather_bucket_name
  satellite_bucket = module.storage.satellite_bucket_name
  sa_emails        = module.iam.sa_emails
  topic_ids        = module.pubsub.topic_ids
  dlq_topic_id     = module.pubsub.dlq_topic_id
  topic_paths      = local.topic_paths
  depends_on       = [google_project_service.required_apis]
}
```

- [ ] **Step 5: Add outputs to `terraform/outputs.tf`** — append:

```hcl
output "function_names" { value = module.functions.function_names }
```

> **Provider note:** the `archive` provider is needed for `archive_file`. Add it to `terraform/backend.tf` `required_providers`:
> ```hcl
> archive = { source = "hashicorp/archive", version = "~> 2.4" }
> ```

- [ ] **Step 6: Validate Terraform**

Run:
```bash
terraform -chdir=terraform init -backend=false
terraform -chdir=terraform validate
```
Expected: `Success! The configuration is valid.`

> If `validate` fails because `data.archive_file` cannot find a populated `source_dir` (shared/ not yet vendored), validation still passes (archive is evaluated at plan/apply, not validate). If a plan is attempted before Task 13's vendoring step, expect an archive error — that is why vendoring is Task 13 Step 1.

- [ ] **Step 7: Commit**

```bash
git add terraform/modules/functions/ terraform/main.tf terraform/outputs.tf terraform/backend.tf
git commit -m "feat(p1): terraform functions module (orchestrator, weather, backfill)"
```

---

## Task 13: Deploy 3 functions to dev + E2E verification

> **Pre-flight reminder:** run the full Python gate first — `cd functions && pytest` must be green (coverage ≥90%) before deploying.

- [ ] **Step 1: Vendor `shared/` into each function dir (deploy packaging)**

Gen2 source zips are per-function; each function imports `from shared import ...`, so `shared/` must live inside each deployed dir. Sync it (idempotent; do not commit the copies — add `functions/*/shared/` to `.gitignore`):

```bash
for fn in orchestrator weather_worker backfill_worker; do
  rsync -a --delete functions/shared/ "functions/$fn/shared/"
done
```
Expected: each function dir now contains a `shared/` copy. (weather_worker additionally imports its own `tone.py`/`summary.py`/`open_meteo_client.py`, already local; backfill_worker imports `weather_worker.summary` — vendor that too:)
```bash
rsync -a functions/weather_worker/summary.py functions/weather_worker/open_meteo_client.py \
      "functions/backfill_worker/weather_worker/"  # create pkg dir with __init__.py
```
> Simpler alternative (recommended): set the function's requirements to install the shared code, OR keep a single staging dir. For the POC the rsync vendoring above is sufficient; document the chosen approach in the README. Ensure each vendored `weather_worker/` has an `__init__.py`.

- [ ] **Step 2: Plan against dev**

Run:
```bash
terraform -chdir=terraform init
terraform -chdir=terraform plan -var-file=environments/dev.tfvars
```
Expected: a plan that creates 3 `google_cloudfunctions2_function` resources (`dev-orchestrator`, `dev-weather-worker`, `dev-backfill-worker`), 3 source objects, and the DLQ-attach subscriptions. No errors.

- [ ] **Step 3: Apply to dev**

Run: `terraform -chdir=terraform apply -var-file=environments/dev.tfvars`
Expected: apply completes; `terraform output function_names` lists the three.

- [ ] **Step 4: Confirm functions are deployed**

Run: `gcloud functions list --gen2 --project mountain-weatherman-app --regions us-west1 --format="value(name,state)"`
Expected: `dev-orchestrator ACTIVE`, `dev-weather-worker ACTIVE`, `dev-backfill-worker ACTIVE`.

- [ ] **Step 5: Bind the DLQ to the trigger subscriptions (idempotent)**

Run:
```bash
for fn in dev-weather-worker dev-backfill-worker dev-orchestrator; do
  SUB=$(gcloud pubsub subscriptions list --project mountain-weatherman-app \
        --filter="name~eventarc AND pushConfig.pushEndpoint~$fn" --format="value(name)" | head -n1)
  [ -n "$SUB" ] && gcloud pubsub subscriptions update "$SUB" \
    --dead-letter-topic="projects/mountain-weatherman-app/topics/dev-refresh-dlq" \
    --max-delivery-attempts=5 --project mountain-weatherman-app || echo "no sub for $fn yet"
done
```
Expected: each existing trigger subscription updated with the DLQ; missing ones print a skip note.

- [ ] **Step 6: Ensure a sample project + mountains exist (from P0 seed)**

Run: `gcloud firestore documents list "projects/mountain-weatherman-app/databases/(default)/documents/projects" --format="value(name)" | head`
Expected: at least `sample-rainier` (seeded in P0 Task 8). If absent, re-run `npm run seed:mountains` and create one sample project doc.

- [ ] **Step 7: Manually publish a weather-refresh for mt-rainier**

Run:
```bash
gcloud pubsub topics publish dev-weather-refresh --project mountain-weatherman-app \
  --message='{"mountainId":"mt-rainier","reason":"manual"}'
```
Expected: a published message id. Wait ~30s for the worker to run.

- [ ] **Step 8: Verify a combined.json landed in GCS**

Run:
```bash
gsutil ls "gs://mountain-weatherman-app-weather-data/forecasts/mt-rainier/**/*-combined.json"
```
Expected: at least one object path. Spot-check: `gsutil cat <path> | python -c "import sys,json; d=json.load(sys.stdin); print(d['mountainId'], list(d.keys()))"` → `mt-rainier ['mountainId', 'timezone', 'fetchedAt', 'hrrr', 'gfs', 'ecmwf']`.

- [ ] **Step 9: Verify mountainConditions/mt-rainier exists**

Run:
```bash
gcloud firestore documents describe \
  "projects/mountain-weatherman-app/databases/(default)/documents/mountainConditions/mt-rainier" \
  --format="value(fields.forecastBlobPath.stringValue)"
```
Expected: a `forecasts/mt-rainier/.../*-combined.json` path. (If the CLI subcommand differs by version, confirm in the Firebase console.)

- [ ] **Step 10: Verify a weatherSnapshot exists for the sample project**

Run:
```bash
gcloud firestore documents list \
  "projects/mountain-weatherman-app/databases/(default)/documents/projects/sample-rainier/weatherSnapshots" \
  --format="value(name)" | head
```
Expected: at least one snapshot doc. Confirm in the console that its `source == "live"` and `models.gfs.available == true`.

- [ ] **Step 11: Verify the worker logs are clean**

Run: `gcloud functions logs read dev-weather-worker --gen2 --region us-west1 --project mountain-weatherman-app --limit 30`
Expected: a successful invocation, no tracebacks.

- [ ] **Step 12: Commit any deploy-support changes (.gitignore, README note)**

```bash
git add .gitignore README.md
git commit -m "chore(p1): deploy packaging notes + shared vendoring gitignore"
```

---

## Task 14: Capture real Open-Meteo fixtures

**Files:**
- Create: `fixtures/open_meteo_forecast.json`, `fixtures/open_meteo_previous_runs.json`

- [ ] **Step 1: Capture a trimmed real multi-model forecast** for Mt Rainier

Run:
```bash
mkdir -p fixtures
curl -s "https://api.open-meteo.com/v1/forecast?latitude=46.8517&longitude=-121.7603&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,wind_direction_10m,precipitation,precipitation_probability,snowfall,freezing_level_height,cloud_cover,visibility,weather_code,temperature_925hPa,temperature_850hPa,temperature_700hPa&models=gfs_seamless,ecmwf_ifs025&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles&forecast_days=7" \
  | python -c "import sys,json; d=json.load(sys.stdin); d['hourly']={k:(v[:24] if isinstance(v,list) else v) for k,v in d['hourly'].items()}; json.dump(d, open('fixtures/open_meteo_forecast.json','w'), indent=2)"
```
Expected: `fixtures/open_meteo_forecast.json` written, trimmed to the first 24 hourly steps. Keys are `{var}_gfs_seamless` / `{var}_ecmwf_ifs025` (multi-model suffixes per contract §5.1).

- [ ] **Step 2: Capture a trimmed real previous-runs response**

Run:
```bash
curl -s "https://previous-runs-api.open-meteo.com/v1/forecast?latitude=46.8517&longitude=-121.7603&hourly=temperature_2m_previous_day0,temperature_2m_previous_day1,wind_gusts_10m_previous_day0,wind_gusts_10m_previous_day1,precipitation_previous_day0,precipitation_previous_day1,snowfall_previous_day0,snowfall_previous_day1,freezing_level_height_previous_day0,freezing_level_height_previous_day1&models=gfs_seamless,ecmwf_ifs025&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch&timezone=America%2FLos_Angeles&forecast_days=2&past_days=2" \
  | python -c "import sys,json; d=json.load(sys.stdin); d['hourly']={k:(v[:48] if isinstance(v,list) else v) for k,v in d['hourly'].items()}; json.dump(d, open('fixtures/open_meteo_previous_runs.json','w'), indent=2)"
```
Expected: `fixtures/open_meteo_previous_runs.json` written. Keys are `{var}_previous_dayN_gfs_seamless` etc.

> **Capture deviation (recorded):** the original curl included `temperature_700hPa_previous_day0,temperature_700hPa_previous_day1`,
> but the previous-runs API rejects pressure-level variables with the `_previous_dayN` suffix:
> `"Data corrupted ... Cannot initialize SurfacePressureAndHeightVariable ... from invalid String value temperature_700hPa_previous_day0"`.
> The pressure-level previous-day temps are therefore dropped from the previous-runs capture (surface vars only).
> Backfill (Task 11) uses surface vars for the historical evolution chart, so this does not affect the contract test.

- [ ] **Step 3: Un-skip the contract-fixture tests and confirm they pass**

Remove the `@pytest.mark.skip` / `-k "not contract_fixture"` guards from Task 5 and Task 11. The previous-runs contract test uses a fixed `targetDate` — pick an ISO date present in the captured `time` array (read it from the fixture) and set the test's `targetDate` accordingly, or relax the assertion to "≥1 snapshot written for any date present."

Run: `cd functions && pytest weather_worker/tests/test_open_meteo_client.py::test_contract_fixture_parses backfill_worker/tests/test_main.py::test_contract_fixture_parses -v -p no:cov`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add fixtures/open_meteo_forecast.json fixtures/open_meteo_previous_runs.json \
        functions/weather_worker/tests/test_open_meteo_client.py functions/backfill_worker/tests/test_main.py
git commit -m "test(p1): capture real open-meteo forecast + previous-runs fixtures"
```

---

## Verification gate (P1 done when all true)

- [ ] **Full Python suite + coverage gate green:** `cd functions && pytest`
  Expected: all tests pass; coverage **≥90%** (`--cov-fail-under=90` from `pyproject.toml`); live tests deselected (`-m "not live"`).
- [ ] **The pressure-level spike has been run once** and its outcome (chosen hPa levels: base 925 / mid 850 / summit 700) is recorded in Task 6.
- [ ] **Fixtures exist** and the two contract-fixture tests pass: `fixtures/open_meteo_forecast.json`, `fixtures/open_meteo_previous_runs.json`.
- [ ] **Terraform valid:** `terraform -chdir=terraform validate` → `Success!`.
- [ ] **Three functions deployed to dev:** `gcloud functions list --gen2 ...` shows `dev-orchestrator`, `dev-weather-worker`, `dev-backfill-worker` ACTIVE.
- [ ] **E2E proven (Task 13):** a manual `weather-refresh` for `mt-rainier` produced (a) a `combined.json` in `gs://…-weather-data/forecasts/mt-rainier/…`, (b) `mountainConditions/mt-rainier` with a `forecastBlobPath`, and (c) a `weatherSnapshot` under `sample-rainier` with `source="live"`.
- [ ] **Worker logs clean** for the manual run.
- [ ] **Invoke `python-reviewer`** (project agent) on `functions/weather_worker/`, `functions/orchestrator/`, `functions/backfill_worker/`, and `functions/shared/` and address findings (async correctness, firebase_admin singleton, tenacity, Pydantic v2, test quality).

## Rollback / notes

- **Rollback:** `terraform -chdir=terraform apply -var-file=environments/dev.tfvars` with `module "functions"` commented out removes the three functions; the P0 base (topics, buckets, scheduler) stays. The scheduler `weather` job will then publish to a topic whose worker is gone — harmless (messages expire / DLQ).
- **Open risks / assumptions:**
  1. **Tone formula `maxWind` vs `maxGust`:** contract §6/§8 persist only `summitMaxWindMph` (the **max gust**, contract §6). The ported `data.js` tone formula uses both sustained `maxWind` and `maxGust`. **Assumption:** we pass the gust for both inputs (documented in Task 9). This is slightly more conservative than the prototype; if exact parity is required, P1 can additionally persist `summitMaxSustainedWindMph` — out of scope for the contract as written.
  2. **`pop` branch dropped:** the prototype tone score has a `pop > 50` fallback; `ModelDaySummary` (contract §3/§8) has no `pop` field, so that branch is omitted (precip>0.1 still scores). Documented in Task 7.
  3. **Browse `mountainConditions` target date:** with no pinned project, `mountainConditions.currentSummary` is computed for "today" so browse pages are non-empty; tone there uses `nwac_danger=None` (NWAC is wired in P2). Acceptable for the browse "current glance."
  4. **Backfill `forecastBlobPath=""`:** backfill snapshots are summary-only (no combined blob). The evolution chart consumes `models.*`; `forecastBlobPath` is empty by design. Contract §3 lists `forecastBlobPath` on snapshots without requiring it non-empty.
  5. **Deploy packaging (shared/ vendoring):** Gen2 per-function zips require `shared/` (and, for backfill, `weather_worker.summary`) vendored into each function dir at deploy time (Task 13 Step 1). Not committed; gitignored. A cleaner long-term option (a shared private package or a monolithic source dir) is deferred.
  6. **DLQ on Gen2 triggers:** the auto-created trigger subscription's dead-letter policy is set out-of-band via `gcloud` (Task 13 Step 5) because the provider does not expose the auto-created subscription. The DLQ topic + alert already exist from P0.
  7. **`httpx_mock` URL matching** of comma-encoded `models=` may need a one-line matcher tweak on first run (noted in Task 5).
- **Deferred to P2:** the orchestrator's `nwac`/`snotel`/`satellite` fan-out branches (currently a no-op stub), and the `nwac_worker`/`snotel_worker`/`satellite_worker` functions appended to `locals.functions` in the Terraform module.
- **Attribution:** "Weather data by Open-Meteo.com" (CC BY 4.0) must ship in the UI footer (P6); recorded here for traceability.
```