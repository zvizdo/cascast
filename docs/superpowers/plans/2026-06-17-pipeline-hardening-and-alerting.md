# Pipeline Hardening & Native Log-Based Alerting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the data pipeline self-healing (backfill recoverable gaps within the 35-day window) and observable (email the operator on any pipeline issue), by hardening the five existing workers and adding Cloud Monitoring alerting in Terraform — no new compute.

**Architecture:** A shared `log_event()` emits single-line JSON to stdout (`severity` → LogEntry severity, rest → `jsonPayload`); workers emit `pipeline_success`/`pipeline_error` per mountain. Satellite gains a trailing-35-day scene backfill; SNOTEL banks per-day history. Terraform adds an email notification channel + a log-matched error alert + metric-absence alerts for the two high-cadence sources, and wires the existing DLQ alert to email. The operator email is **never committed** — it comes from `TF_VAR_alert_email`.

**Tech Stack:** Python 3.12 Cloud Functions Gen2 (functions-framework, pytest), Terraform (google provider, Cloud Monitoring/Logging), Pub/Sub, Firestore, GCS.

**Spec:** `docs/superpowers/specs/2026-06-17-pipeline-hardening-and-alerting-design.md`

**Conventions:**
- Python gate (run from `functions/`): `source .venv/bin/activate && pytest` (coverage ≥90).
- Per-file fast run: `pytest <path> -p no:cov -o addopts=""`.
- TDD: failing test first. Frequent commits. Match existing file style.
- Do NOT touch vendored `*/shared/*` copies (build artifacts) or run `stage-functions.sh` by hand.

---

### Task 1: Shared `log_event` structured-logging helper

**Files:**
- Create: `functions/shared/obs.py`
- Test: `functions/shared/tests/test_obs.py`

- [ ] **Step 1: Write the failing test**

```python
# functions/shared/tests/test_obs.py
import json

from shared import obs


def test_log_event_emits_single_json_line_with_severity_and_fields(capsys):
    obs.log_event("ERROR", "pipeline_error", source="weather", mountainId="mt-rainier", error="boom")
    out = capsys.readouterr().out.strip()
    assert "\n" not in out  # single line so Cloud Run parses it as one structured entry
    parsed = json.loads(out)
    assert parsed["severity"] == "ERROR"
    assert parsed["event"] == "pipeline_error"
    assert parsed["source"] == "weather"
    assert parsed["mountainId"] == "mt-rainier"
    assert parsed["error"] == "boom"


def test_log_event_success_minimal(capsys):
    obs.log_event("INFO", "pipeline_success", source="snotel", mountainId="mt-baker")
    parsed = json.loads(capsys.readouterr().out.strip())
    assert parsed == {
        "severity": "INFO",
        "event": "pipeline_success",
        "source": "snotel",
        "mountainId": "mt-baker",
    }
```

- [ ] **Step 2: Run test, verify it fails**

Run: `cd functions && source .venv/bin/activate && pytest shared/tests/test_obs.py -p no:cov -o addopts=""`
Expected: FAIL — `ModuleNotFoundError: No module named 'shared.obs'`.

- [ ] **Step 3: Implement the helper**

```python
# functions/shared/obs.py
"""Structured logging for Cloud Run / Cloud Functions Gen2.

Cloud Run parses a single-line JSON object on stdout: the top-level `severity`
field becomes the LogEntry severity and the remaining fields become jsonPayload.
This yields correct severity AND filterable fields with no logging-library setup.

`event` is the contract the Cloud Monitoring alert filters key on:
  - "pipeline_success" (INFO)  -> log-based success metrics / absence alerts
  - "pipeline_error"   (ERROR) -> the pipeline-error log-matched alert
"""
from __future__ import annotations

import json


def log_event(severity: str, event: str, **fields) -> None:
    print(json.dumps({"severity": severity, "event": event, **fields}))
```

- [ ] **Step 4: Run test, verify it passes**

Run: `cd functions && source .venv/bin/activate && pytest shared/tests/test_obs.py -p no:cov -o addopts=""`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add functions/shared/obs.py functions/shared/tests/test_obs.py
git commit -m "feat(pipeline): add shared log_event structured-logging helper"
```

---

### Task 2: Weather worker — pipeline_success / pipeline_error markers

**Files:**
- Modify: `functions/weather_worker/main.py`
- Test: `functions/weather_worker/tests/test_main.py`

- [ ] **Step 1: Write the failing tests** (append to `test_main.py`; reuse the file's existing mocking pattern for `fc`, `omc`, `sc`)

```python
import json as _json

import pytest

from weather_worker import main as wmain


def _find_event(capsys, event_name):
    for line in capsys.readouterr().out.splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = _json.loads(line)
        except ValueError:
            continue
        if obj.get("event") == event_name:
            return obj
    return None


def test_weather_emits_pipeline_success(monkeypatch, capsys):
    # Reuse this file's existing happy-path setup helpers/fixtures to drive a full
    # successful handle_message (mountain found, models available, writes succeed).
    _run_successful_weather(monkeypatch)  # helper already present / add per existing pattern
    evt = _find_event(capsys, "pipeline_success")
    assert evt is not None
    assert evt["severity"] == "INFO"
    assert evt["source"] == "weather"
    assert evt["mountainId"]


def test_weather_emits_pipeline_error_before_reraise(monkeypatch, capsys):
    monkeypatch.setattr(wmain.fc, "get_mountain", lambda mid: {"timezone": "America/Los_Angeles", "elevations": {"summit": 4392}})

    def _boom(_m):
        raise wmain.omc.OpenMeteoError("upstream down")

    monkeypatch.setattr(wmain.omc, "fetch_forecast", lambda m: (_ for _ in ()).throw(wmain.omc.OpenMeteoError("down")))
    with pytest.raises(wmain.omc.OpenMeteoError):
        wmain.handle_message(_weather_event({"mountainId": "mt-rainier"}))  # use this file's event builder
    evt = _find_event(capsys, "pipeline_error")
    assert evt is not None and evt["severity"] == "ERROR" and evt["source"] == "weather"
```

> Implementer note: this file already has a successful-path test and an event builder. Factor the happy path into `_run_successful_weather`/reuse the existing builder rather than duplicating mocks. If `asyncio.run` wrapping makes the throw awkward, monkeypatch `wmain.omc.fetch_forecast` to a function that raises synchronously inside the `asyncio.run` call (the worker calls `asyncio.run(omc.fetch_forecast(...))`, so raise inside an async def).

- [ ] **Step 2: Run tests, verify they fail**

Run: `cd functions && source .venv/bin/activate && pytest weather_worker/tests/test_main.py -k "pipeline_" -p no:cov -o addopts=""`
Expected: FAIL — no `pipeline_success`/`pipeline_error` lines emitted yet.

- [ ] **Step 3: Implement** — add `from shared import obs` and three log lines.

Add import near the other `from shared import ...` lines:
```python
from shared import obs
```
In the `except omc.OpenMeteoError:` block (the fetch failure), make it bind and log before re-raise:
```python
    try:
        series_by_key = asyncio.run(omc.fetch_forecast(mountain))
    except omc.OpenMeteoError as exc:
        logging.error("weather fetch failed for mountain %s", mountain_id, exc_info=True)
        obs.log_event("ERROR", "pipeline_error", source="weather", mountainId=mountain_id, error=str(exc))
        raise  # let Pub/Sub retry -> DLQ
```
In the `status == "error"` branch, before raising:
```python
    if status == "error":
        logging.error("no usable models for mountain %s", mountain_id)
        obs.log_event("ERROR", "pipeline_error", source="weather", mountainId=mountain_id, error="no usable models")
        raise omc.OpenMeteoError(f"No usable models for {mountain_id}")
```
At the very end of `handle_message`, after `fc.write_mountain_snapshot(...)`:
```python
    obs.log_event("INFO", "pipeline_success", source="weather", mountainId=mountain_id)
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `cd functions && source .venv/bin/activate && pytest weather_worker/tests/test_main.py -p no:cov -o addopts=""`
Expected: PASS (existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add functions/weather_worker/main.py functions/weather_worker/tests/test_main.py
git commit -m "feat(pipeline): weather worker emits pipeline_success/error markers"
```

---

### Task 3: NWAC worker — wrap fetch, emit markers

**Files:**
- Modify: `functions/nwac_worker/main.py`
- Test: `functions/nwac_worker/tests/test_main.py`

- [ ] **Step 1: Write the failing tests** (append; reuse this file's event builder + db/fetch mocks)

```python
import json as _json
import pytest
from nwac_worker import main as nmain


def _find_event(capsys, name):
    for line in capsys.readouterr().out.splitlines():
        line = line.strip()
        if line.startswith("{"):
            try:
                o = _json.loads(line)
            except ValueError:
                continue
            if o.get("event") == name:
                return o
    return None


def test_nwac_emits_success_on_capture(monkeypatch, capsys):
    _run_successful_nwac(monkeypatch)  # reuse existing capture happy-path setup
    evt = _find_event(capsys, "pipeline_success")
    assert evt and evt["source"] == "nwac" and evt["severity"] == "INFO"


def test_nwac_emits_error_before_reraise(monkeypatch, capsys):
    # mountain found w/ zone, not captured today, fetch raises
    _setup_nwac_uncaptured(monkeypatch)  # reuse/adapt existing helpers
    async def _boom(zone):
        raise RuntimeError("avalanche.org 503")
    monkeypatch.setattr(nmain.nwac_client, "fetch_forecast", _boom)
    with pytest.raises(RuntimeError):
        nmain.handle_message(_nwac_event({"mountainId": "mt-baker"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt and evt["source"] == "nwac" and evt["severity"] == "ERROR"
```

- [ ] **Step 2: Run, verify fail.** `pytest nwac_worker/tests/test_main.py -k "emits" -p no:cov -o addopts=""` → FAIL.

- [ ] **Step 3: Implement** — add `from shared import obs`; wrap the fetch; success at end.

```python
from shared import obs
```
Replace the fetch + write tail of `handle_message`:
```python
    try:
        forecast = asyncio.run(nwac_client.fetch_forecast(zone_id))
    except Exception as exc:
        obs.log_event("ERROR", "pipeline_error", source="nwac", mountainId=mountain["id"], error=str(exc))
        raise  # let Pub/Sub retry -> DLQ

    record = forecast.model_dump(by_alias=True)
    record["fetchedAt"] = datetime.now(tz=PACIFIC)
    doc_ref.set(record)

    history_key = record.get("forecastDate") or _today_pacific()
    fc.append_history("nwacForecasts", zone_id, history_key, record)

    obs.log_event("INFO", "pipeline_success", source="nwac", mountainId=mountain["id"])
    print(f"nwac_worker: captured zone {zone_id} ({forecast.season})")
```

- [ ] **Step 4: Run, verify pass.** `pytest nwac_worker/tests/test_main.py -p no:cov -o addopts=""` → PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/nwac_worker/main.py functions/nwac_worker/tests/test_main.py
git commit -m "feat(pipeline): nwac worker emits pipeline_success/error markers"
```

---

### Task 4: SNOTEL worker — 35-day window, per-day history, markers

**Files:**
- Modify: `functions/snotel_worker/snotel_client.py` (`WINDOW_DAYS` 30 → 35)
- Modify: `functions/snotel_worker/main.py`
- Test: `functions/snotel_worker/tests/test_main.py`, `functions/snotel_worker/tests/test_snotel_client.py`

- [ ] **Step 1: Write failing tests**

In `test_snotel_client.py` (append):
```python
def test_window_is_35_days():
    from snotel_worker import snotel_client as sc
    assert sc.WINDOW_DAYS == 35
```

In `test_main.py` (append; reuse existing event builder + mocks). The key new behavior: history is banked **per reading date** across `[*trend, current]`, idempotent by date, and a success marker is emitted.
```python
import json as _json
from unittest.mock import MagicMock
from snotel_worker import main as smain
from shared.models import SnotelData, SnotelReading


def _snotel_data():
    rd = lambda d: SnotelReading(date=d, sweIn=10.0, snowDepthIn=20.0)
    return SnotelData(
        stationId="909", stationTriplet="909:WA:SNTL", stationName="Paradise",
        elevationFt=5400, lat=46.78, lng=-121.74,
        current=rd("2026-06-17"), trend=[rd("2026-06-15"), rd("2026-06-16"), rd("2026-06-17")],
    )


def test_snotel_banks_per_day_history(monkeypatch, capsys):
    mountain = {"id": "mt-rainier", "snotelStationId": "909", "snotelStationTriplet": "909:WA:SNTL"}
    monkeypatch.setattr(smain.fc, "get_mountain", lambda mid: mountain)
    monkeypatch.setattr(smain, "fetch_snotel", lambda sid, trip: _snotel_data())
    db = MagicMock()
    monkeypatch.setattr(smain, "get_db", lambda: db)
    appended = []
    monkeypatch.setattr(smain.fc, "append_history", lambda coll, mid, key, rec: appended.append((coll, mid, key)))

    smain.handle_message(_snotel_event({"mountainId": "mt-rainier"}))  # reuse this file's builder

    keys = {k for (_c, _m, k) in appended}
    assert keys == {"2026-06-15", "2026-06-16", "2026-06-17"}  # one history doc per reading date
    assert all(c == "snotelData" and m == "mt-rainier" for (c, m, _k) in appended)
    out = capsys.readouterr().out
    assert any('"event": "pipeline_success"' in l and '"source": "snotel"' in l for l in out.splitlines())
```

- [ ] **Step 2: Run, verify fail.** `pytest snotel_worker/tests/ -k "35_days or per_day" -p no:cov -o addopts=""` → FAIL.

- [ ] **Step 3: Implement**

In `snotel_client.py`: `WINDOW_DAYS = 35`.

In `main.py`, add `from shared import obs`, wrap the fetch, and replace the single-history append with a per-reading loop:
```python
    try:
        data = fetch_snotel(station_id, triplet)
    except Exception as exc:
        obs.log_event("ERROR", "pipeline_error", source="snotel", mountainId=mountain["id"], error=str(exc))
        raise

    record = data.model_dump(by_alias=True)
    record["fetchedAt"] = datetime.now(tz=PACIFIC)
    get_db().collection("snotelData").document(mountain["id"]).set(record)

    # Bank ONE idempotent history doc per reading date across the window, so a
    # previously-missed day fills in on any later successful run (self-healing).
    station_meta = {
        "stationId": record["stationId"], "stationTriplet": record["stationTriplet"],
        "stationName": record["stationName"], "elevationFt": record["elevationFt"],
        "lat": record["lat"], "lng": record["lng"],
    }
    readings = {r["date"]: r for r in record["trend"]}
    readings[record["current"]["date"]] = record["current"]
    for day, reading in readings.items():
        fc.append_history("snotelData", mountain["id"], day, {**station_meta, "reading": reading})

    obs.log_event("INFO", "pipeline_success", source="snotel", mountainId=mountain["id"])
    print(f"snotel_worker: wrote snotelData/{mountain['id']} (station {station_id})")
```
Remove the old `date_key = ...` / single `fc.append_history(...)` lines.

- [ ] **Step 4: Run, verify pass.** `pytest snotel_worker/tests/ -p no:cov -o addopts=""` → PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/snotel_worker/main.py functions/snotel_worker/snotel_client.py functions/snotel_worker/tests/
git commit -m "feat(pipeline): snotel 35-day window + per-day idempotent history + markers"
```

---

### Task 5: Satellite client — `parse_scenes` + windowed recent-scenes search

**Files:**
- Modify: `functions/satellite_worker/copernicus_client.py`
- Test: `functions/satellite_worker/tests/test_copernicus_client.py`

- [ ] **Step 1: Write failing tests** (append)

```python
def test_parse_scenes_returns_all_under_threshold(load_fixture):
    scenes = cc.parse_scenes(load_fixture("copernicus_search.json"))
    assert isinstance(scenes, list) and len(scenes) >= 1
    # newest-first; all under the 70% cloud threshold
    assert all(s["cloudCoverPercent"] is None or s["cloudCoverPercent"] < cc.CLOUD_THRESHOLD for s in scenes)
    assert scenes[0]["latestImageDate"] == "2026-06-13"


def test_parse_search_still_returns_newest(load_fixture):
    # parse_search must remain == parse_scenes[0]
    payload = load_fixture("copernicus_search.json")
    assert cc.parse_search(payload) == cc.parse_scenes(payload)[0]


def test_window_search_body_uses_trailing_window():
    body = cc._search_body({"west": -1, "south": -1, "east": 1, "north": 1}, start="2026-05-13", limit=40)
    assert body["datetime"].startswith("2026-05-13T00:00:00Z/")
    assert body["limit"] == 40


def test_default_search_body_is_open_ended():
    body = cc._search_body({"west": -1, "south": -1, "east": 1, "north": 1})
    assert body["datetime"].startswith("2015-06-23T00:00:00Z/")
    assert body["limit"] == cc.SEARCH_LIMIT
```

- [ ] **Step 2: Run, verify fail.** `pytest satellite_worker/tests/test_copernicus_client.py -k "parse_scenes or search_body or still_returns" -p no:cov -o addopts=""` → FAIL.

- [ ] **Step 3: Implement**

Add near the top imports: `from datetime import date, timedelta`. Add constants:
```python
WINDOW_DAYS = 35           # trailing backfill window (matches 35-day retention)
WINDOW_SEARCH_LIMIT = 40   # page size for the windowed backfill search (revisit ~5d)
```
Refactor `parse_search` to delegate to a new `parse_scenes`:
```python
def parse_scenes(payload: dict) -> list[dict]:
    """All features under the cloud threshold, newest-first (CDSE returns descending
    datetime; cloud filter applied client-side — server-side filters return HTTP 400)."""
    scenes: list[dict] = []
    for feature in payload.get("features") or []:
        props = feature.get("properties", {})
        cloud = props.get("eo:cloud_cover")
        if cloud is not None and cloud >= CLOUD_THRESHOLD:
            continue
        dt = props.get("datetime", "")
        scenes.append({
            "sceneId": feature.get("id", ""),
            "latestImageDate": dt[:10],
            "cloudCoverPercent": cloud,
        })
    return scenes


def parse_search(payload: dict) -> dict | None:
    """Newest feature under the cloud threshold (the latest scene), else None."""
    scenes = parse_scenes(payload)
    return scenes[0] if scenes else None
```
Parametrize `_search_body`:
```python
def _search_body(bbox: dict, start: str = "2015-06-23", limit: int = SEARCH_LIMIT) -> dict:
    return {
        "bbox": [bbox["west"], bbox["south"], bbox["east"], bbox["north"]],
        "datetime": f"{start}T00:00:00Z/..",
        "collections": ["sentinel-2-l2a"],
        "limit": limit,
    }
```
Add a windowed search (keep `search_latest_scene` open-ended/unchanged so the "latest" display never regresses to None for long-clouded peaks):
```python
@_retry
async def search_recent_scenes(bbox: dict) -> list[dict]:
    """All <70%-cloud scenes in the trailing WINDOW_DAYS (newest-first) — drives backfill."""
    start = (date.today() - timedelta(days=WINDOW_DAYS)).isoformat()
    token = await get_token()
    headers = {**HEADERS, "Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
        resp = await client.post(SEARCH_URL, headers=headers, json=_search_body(bbox, start=start, limit=WINDOW_SEARCH_LIMIT))
        resp.raise_for_status()
        payload = resp.json()
    return parse_scenes(payload)
```

- [ ] **Step 4: Run, verify pass.** `pytest satellite_worker/tests/test_copernicus_client.py -p no:cov -o addopts=""` → PASS (existing + new).

- [ ] **Step 5: Commit**

```bash
git add functions/satellite_worker/copernicus_client.py functions/satellite_worker/tests/test_copernicus_client.py
git commit -m "feat(pipeline): copernicus parse_scenes + trailing-window recent-scenes search"
```

---

### Task 6: Satellite worker — trailing-window backfill + visible (alertable) errors

**Files:**
- Modify: `functions/satellite_worker/main.py`
- Test: `functions/satellite_worker/tests/test_main.py`

This is the core self-heal. Behavior: the newest scene still drives the "latest" doc/`scene.jpg`/metadata (unchanged). Additionally, for each older in-window scene-date NOT already in history, render+store it, capped at `MAX_BACKFILL_RENDERS`. All `print()` become `obs.log_event(...)`; swallowed CDSE/render failures now emit `severity=ERROR event="pipeline_error"`.

- [ ] **Step 1: Extend the test db mock + write failing tests**

First extend `_db_with_mountain` so the satelliteCache document supports `.collection("history").document(<date>).get().exists`:
```python
def _db_with_mountain(existing_cache=None, history_dates=()):
    mountain_doc = MagicMock()
    mountain_doc.exists = True
    mountain_doc.to_dict.return_value = {"lat": 46.8517, "lng": -121.7603, "slug": "mt-rainier"}

    cache_doc = MagicMock()
    cache_doc.exists = existing_cache is not None
    cache_doc.to_dict.return_value = existing_cache or {}
    cache_ref = MagicMock()
    cache_ref.get.return_value = cache_doc

    def history_doc(date):
        d = MagicMock()
        hist = MagicMock()
        hist.exists = date in history_dates
        d.get.return_value = hist
        return d
    history_col = MagicMock()
    history_col.document.side_effect = history_doc
    cache_ref.collection.return_value = history_col

    db = MagicMock()
    def collection(name):
        col = MagicMock()
        if name == "mountains":
            col.document.return_value.get.return_value = mountain_doc
        else:
            col.document.return_value = cache_ref
        return col
    db.collection.side_effect = collection
    return db, cache_ref
```
Then add tests:
```python
def test_backfill_renders_only_missing_in_window(monkeypatch):
    db, cache_ref = _db_with_mountain(existing_cache=None, history_dates={"2026-06-08"})
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: {"sceneId": "S2N", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0})
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: "p")
    monkeypatch.setattr(main, "render_scene_image", lambda bbox, date: b"IMG")
    # window: newest (13, =latest), 08 (already have), 03 (missing -> render)
    monkeypatch.setattr(main.cc, "search_recent_scenes", lambda bbox: [
        {"sceneId": "S2N", "latestImageDate": "2026-06-13", "cloudCoverPercent": 5.0},
        {"sceneId": "S2A", "latestImageDate": "2026-06-08", "cloudCoverPercent": 8.0},
        {"sceneId": "S2B", "latestImageDate": "2026-06-03", "cloudCoverPercent": 9.0},
    ])
    appended, imgs = [], []
    monkeypatch.setattr(main, "append_history", lambda coll, mid, key, rec: appended.append(key))
    monkeypatch.setattr(main, "write_satellite_image_history", lambda mid, date, jpeg: imgs.append(date) or "p")

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    # newest (13) written via the existing latest path; backfill renders ONLY 03 (08 already in history)
    assert "2026-06-03" in appended and "2026-06-08" not in appended
    assert "2026-06-13" in appended  # latest path still appends its own history
    assert imgs.count("2026-06-03") == 1


def test_backfill_respects_render_cap(monkeypatch, capsys):
    db, cache_ref = _db_with_mountain(existing_cache=None, history_dates=set())
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: {"sceneId": "S2N", "latestImageDate": "2026-06-30", "cloudCoverPercent": 1.0})
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    monkeypatch.setattr(main, "write_satellite_image", lambda mid, jpeg: "p")
    monkeypatch.setattr(main, "render_scene_image", lambda bbox, date: b"IMG")
    older = [{"sceneId": f"S{i}", "latestImageDate": f"2026-06-{i:02d}", "cloudCoverPercent": 2.0} for i in (25, 20, 15, 10, 5, 1)]
    monkeypatch.setattr(main.cc, "search_recent_scenes", lambda bbox: [
        {"sceneId": "S2N", "latestImageDate": "2026-06-30", "cloudCoverPercent": 1.0}, *older])
    rendered = []
    monkeypatch.setattr(main, "write_satellite_image_history", lambda mid, date, jpeg: rendered.append(date) or "p")
    monkeypatch.setattr(main, "append_history", lambda *a, **k: None)

    main.handle_message(_event({"mountainId": "mt-rainier"}))

    assert len(rendered) == main.MAX_BACKFILL_RENDERS  # capped
    assert any('"event": "pipeline_backfill_capped"' in l for l in capsys.readouterr().out.splitlines())


def test_no_scene_skips_backfill(monkeypatch):
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: None)
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    called = {"n": 0}
    monkeypatch.setattr(main.cc, "search_recent_scenes", lambda bbox: called.update(n=called["n"] + 1) or [])
    main.handle_message(_event({"mountainId": "mt-rainier"}))
    assert called["n"] == 0  # CDSE down => no backfill attempt


def test_cdse_error_emits_pipeline_error(monkeypatch, capsys):
    db, cache_ref = _db_with_mountain(existing_cache=None)
    monkeypatch.setattr(main, "get_db", lambda: db)
    monkeypatch.setattr(main, "fetch_scene", lambda bbox: (_ for _ in ()).throw(RuntimeError("CDSE 401")))
    monkeypatch.setattr(main, "write_satellite_metadata", lambda mid, rec: "p")
    main.handle_message(_event({"mountainId": "mt-rainier"}))  # must not raise
    lines = capsys.readouterr().out.splitlines()
    assert any('"event": "pipeline_error"' in l and '"source": "satellite"' in l for l in lines)
```

- [ ] **Step 2: Run, verify fail.** `pytest satellite_worker/tests/test_main.py -k "backfill or pipeline_error or skips_backfill" -p no:cov -o addopts=""` → FAIL (existing tests must still be runnable).

- [ ] **Step 3: Implement** — `main.py`

Add imports: `from shared import obs`, and ensure `from satellite_worker import copernicus_client as cc` is already present (it is). Add a module constant:
```python
MAX_BACKFILL_RENDERS = 4   # bound CDSE Processing-API cost per run
```
Replace every `print(...)` in `handle_message` / `fetch_scene` paths with `obs.log_event(...)`:
- CDSE lookup failure (`except Exception as exc:` around `fetch_scene`):
  ```python
      obs.log_event("ERROR", "pipeline_error", source="satellite", mountainId=mountain_id, error=f"CDSE lookup failed: {exc}")
  ```
- render failure (latest path): same `pipeline_error` with `error=f"latest render failed: {exc}"`.
- terminal write: `obs.log_event("INFO", "pipeline_success", source="satellite", mountainId=mountain_id, scene=record["latestImageDate"])`.
- mountain-not-found early return: `obs.log_event("WARNING", "pipeline_skip", source="satellite", mountainId=mountain_id, reason="mountain not found")`.

After the existing latest-scene write + `append_history(...)` (inside `if scene is not None:`), add the backfill block:
```python
    if scene is not None:
        _backfill_window(db, mountain_id, bbox, record, newest_date=scene["latestImageDate"])
```
And add the helper:
```python
def _backfill_window(db, mountain_id, bbox, base_record, newest_date) -> None:
    """Render+store any <70%-cloud scene-date in the trailing window not already in
    history (idempotent, capped). Self-heals gaps from prior failed runs."""
    try:
        recent = cc.search_recent_scenes(bbox)
    except Exception as exc:
        obs.log_event("ERROR", "pipeline_error", source="satellite", mountainId=mountain_id, error=f"window search failed: {exc}")
        return
    hist_col = db.collection("satelliteCache").document(mountain_id).collection("history")
    seen, rendered, dropped = set(), 0, []
    for s in recent:
        d = s["latestImageDate"]
        if d == newest_date or d in seen:
            continue
        seen.add(d)
        if hist_col.document(d).get().exists:
            continue
        if rendered >= MAX_BACKFILL_RENDERS:
            dropped.append(d)
            continue
        try:
            jpeg = render_scene_image(bbox, d)
            write_satellite_image_history(mountain_id, d, jpeg)
            rec = {
                **base_record,
                "latestImageDate": d,
                "cloudCoverPercent": s["cloudCoverPercent"],
                "sceneId": s["sceneId"],
                "attribution": f"Contains modified Copernicus Sentinel-2 data {d[:4]}, "
                               "processed by Sentinel Hub (Copernicus Data Space Ecosystem)",
            }
            append_history("satelliteCache", mountain_id, d, rec)
            rendered += 1
        except Exception as exc:
            obs.log_event("ERROR", "pipeline_error", source="satellite", mountainId=mountain_id, error=f"backfill render {d} failed: {exc}")
    if dropped:
        obs.log_event("WARNING", "pipeline_backfill_capped", source="satellite", mountainId=mountain_id, dropped=dropped)
```

- [ ] **Step 4: Run, verify pass.** `pytest satellite_worker/tests/test_main.py -p no:cov -o addopts=""` → PASS (all old + new).

- [ ] **Step 5: Commit**

```bash
git add functions/satellite_worker/main.py functions/satellite_worker/tests/test_main.py
git commit -m "feat(pipeline): satellite trailing-window backfill + alertable error logs"
```

---

### Task 7: Python full gate

- [ ] **Step 1: Run the full Python gate**

Run: `cd functions && source .venv/bin/activate && rm -f .coverage && pytest`
Expected: PASS, coverage ≥90 (`--cov-fail-under=90`). New `shared/obs.py` is fully covered by Task 1; worker branches covered by Tasks 2–6.

- [ ] **Step 2: If coverage dipped** on any worker error branch, add the missing-branch test (e.g. snotel/nwac `pipeline_error` path) rather than lowering the bar. Re-run.

- [ ] **Step 3: Commit** (only if any test was added)

```bash
git add functions/
git commit -m "test(pipeline): cover worker error/success branches to hold 90% gate"
```

---

### Task 8: Terraform — email channel, log-matched error alert, success metrics, absence alerts

**Files:**
- Modify: `terraform/variables.tf` (root `alert_email` var)
- Modify: `terraform/main.tf` (pass `alert_email` into `module.monitoring`)
- Modify: `terraform/modules/monitoring/variables.tf`
- Modify: `terraform/modules/monitoring/main.tf`

No real email anywhere. `alert_email` defaults to `""`; supplied via `TF_VAR_alert_email`.

- [ ] **Step 1: Root variable** — append to `terraform/variables.tf`:
```hcl
variable "alert_email" {
  type        = string
  default     = ""
  description = "Operator email for pipeline alerts. Supply via TF_VAR_alert_email; never commit a real address."
}
```

- [ ] **Step 2: Pass it into monitoring** — in `terraform/main.tf`, add to the `module "monitoring"` block:
```hcl
  alert_email     = var.alert_email
```

- [ ] **Step 3: Module variable** — append to `terraform/modules/monitoring/variables.tf`:
```hcl
variable "alert_email" {
  type        = string
  default     = ""
  description = "Operator email for pipeline alerts (empty = no channel/notifications)."
}
```

- [ ] **Step 4: Module resources** — in `terraform/modules/monitoring/main.tf`:

(a) Email channel + channel list local (channel created only when an email is supplied):
```hcl
# Email notification channel — supplied via TF_VAR_alert_email (never committed).
resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email == "" ? 0 : 1
  project      = var.project_id
  display_name = "pipeline-alerts-email"
  type         = "email"
  labels       = { email_address = var.alert_email }
}

locals {
  alert_channels = var.alert_email == "" ? [] : [google_monitoring_notification_channel.email[0].id]
}
```

(b) Wire the EXISTING `dlq` policy to the channel — add inside `resource "google_monitoring_alert_policy" "dlq"`:
```hcl
  notification_channels = local.alert_channels
```

(c) Log-matched error alert (any worker, rate-limited):
```hcl
# Any worker that logs event="pipeline_error" (incl. satellite, which degrades
# gracefully but now logs ERROR). Rate-limited so an outage doesn't flood the inbox.
resource "google_monitoring_alert_policy" "pipeline_errors" {
  project      = var.project_id
  display_name = "pipeline-worker-errors"
  combiner     = "OR"
  conditions {
    display_name = "worker logged pipeline_error"
    condition_matched_log {
      filter = "jsonPayload.event=\"pipeline_error\" severity>=ERROR"
    }
  }
  alert_strategy {
    notification_rate_limit { period = "300s" } # required for condition_matched_log; ~1 email / 5 min
  }
  notification_channels = local.alert_channels
}
```

(d) Log-based success metrics (DELTA counters):
```hcl
resource "google_logging_metric" "weather_success" {
  project = var.project_id
  name    = "pipeline_success_weather"
  filter  = "jsonPayload.event=\"pipeline_success\" jsonPayload.source=\"weather\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_logging_metric" "snotel_success" {
  project = var.project_id
  name    = "pipeline_success_snotel"
  filter  = "jsonPayload.event=\"pipeline_success\" jsonPayload.source=\"snotel\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}
```

(e) Metric-absence alerts (weather hourly → 3h; snotel daily → 23h, under the 23.5h cap). REDUCE_SUM collapses per-revision series into one so absence = "no success anywhere":
```hcl
resource "google_monitoring_alert_policy" "weather_stale" {
  project      = var.project_id
  display_name = "weather-pipeline-stale"
  combiner     = "OR"
  conditions {
    display_name = "no weather pipeline_success"
    condition_absent {
      filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.weather_success.name}\" resource.type=\"cloud_run_revision\""
      duration = "10800s" # 3h (hourly cadence)
      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_COUNT"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger { count = 1 }
    }
  }
  notification_channels = local.alert_channels
}

resource "google_monitoring_alert_policy" "snotel_stale" {
  project      = var.project_id
  display_name = "snotel-pipeline-stale"
  combiner     = "OR"
  conditions {
    display_name = "no snotel pipeline_success"
    condition_absent {
      filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.snotel_success.name}\" resource.type=\"cloud_run_revision\""
      duration = "82800s" # 23h (daily cadence; under the 23.5h absence cap)
      aggregations {
        alignment_period     = "3600s"
        per_series_aligner   = "ALIGN_COUNT"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger { count = 1 }
    }
  }
  notification_channels = local.alert_channels
}
```

- [ ] **Step 5: Validate**

Run: `terraform -chdir=terraform validate`
Expected: `Success! The configuration is valid.`

Run a no-email plan (must not error; channel count 0):
Run: `terraform -chdir=terraform plan -out=/tmp/PLAN.tfplan`
Expected: plan shows added `google_monitoring_alert_policy.pipeline_errors`, `.weather_stale`, `.snotel_stale`, both `google_logging_metric.*_success`, a change to `google_monitoring_alert_policy.dlq` (notification_channels), and NO function/Firestore/bucket destroys. With `TF_VAR_alert_email` unset the email channel shows 0 instances.

- [ ] **Step 6: Commit**

```bash
git add terraform/variables.tf terraform/main.tf terraform/modules/monitoring/variables.tf terraform/modules/monitoring/main.tf
git commit -m "feat(alerting): email channel + pipeline-error log alert + success-absence alerts"
```

---

### Task 9: python-reviewer pass + fixes

- [ ] **Step 1:** Dispatch the `python-reviewer` subagent on the worker diffs (Tasks 2–6) — focus: error handling (errors logged before re-raise; satellite stays graceful), idempotency of per-day/backfill history, tenacity untouched, test quality.
- [ ] **Step 2:** Apply any blocking fixes; re-run the affected worker tests + the full Python gate (`pytest`).
- [ ] **Step 3:** Commit fixes: `git commit -am "fix(pipeline): address python-reviewer feedback"` (only if changes made).

---

### Task 10: Live verification (deploy + observe)

Deploy is plan-then-apply (never `-auto-approve`). The operator email is provided only at apply time via the environment — it is never written to a file.

- [ ] **Step 1: Deploy** (operator supplies their own email in their shell, not committed):
```bash
export TF_VAR_alert_email="<operator-email>"   # operator runs this; NOT stored in repo
terraform -chdir=terraform plan -out=/tmp/PLAN.tfplan
terraform -chdir=terraform apply /tmp/PLAN.tfplan
```
Expected: ~restage of the 5 function source zips (markers/backfill code) + new monitoring resources + DLQ policy change. No Firestore/bucket destroys.

- [ ] **Step 2: Confirm structured logs + severity.** Trigger one mountain per source and check Cloud Logging:
```bash
gcloud pubsub topics publish weather-refresh --project mountain-weatherman-app --message '{"mountainId":"mt-rainier"}'
gcloud pubsub topics publish satellite-refresh --project mountain-weatherman-app --message '{"mountainId":"mt-rainier"}'
gcloud logging read 'jsonPayload.event="pipeline_success"' --project mountain-weatherman-app --limit 5 --freshness 10m
gcloud logging read 'jsonPayload.event="pipeline_error"'   --project mountain-weatherman-app --limit 5 --freshness 10m
```
Expected: `pipeline_success` entries with `severity=INFO` and `source`/`mountainId`; any failures appear as `severity=ERROR` `pipeline_error` (verify the satellite path in particular — previously silent).

- [ ] **Step 3: Confirm satellite backfill self-heal.** For a peak with recent Sentinel-2 coverage, after the satellite trigger, list dated history objects and Firestore history docs:
```bash
gsutil ls gs://mountain-weatherman-app-satellite-tiles/history/mt-rainier/ | tail
```
Expected: more than one dated `*.jpg` when the trailing window has multiple clear scenes (older missing dates filled, capped at 4/run). Re-running the trigger must NOT duplicate or re-render already-present dates (idempotent).

- [ ] **Step 4: Confirm alerting wiring in Monitoring.** Verify the email channel exists, the three policies reference it, and the DLQ policy is now wired:
```bash
gcloud alpha monitoring channels list --project mountain-weatherman-app --filter 'type="email"'
gcloud alpha monitoring policies list --project mountain-weatherman-app --format='table(displayName,enabled,notificationChannels)'
```
Expected: `pipeline-alerts-email` channel present; `pipeline-worker-errors`, `weather-pipeline-stale`, `snotel-pipeline-stale`, `refresh-dlq-backlog` all list the email channel. Confirm the absence policies' metric filters match real series (the `pipeline_success_*` log-based metrics show data in Metrics Explorer after Step 2); if `resource.type` differs from `cloud_run_revision`, correct the absence filters and re-apply.

- [ ] **Step 5:** Final full gate sweep: `cd functions && pytest` green; `terraform -chdir=terraform validate` clean. Report results.

---

## Self-review notes (author)

- **Spec coverage:** §2 matrix → Tasks 4 (snotel), 5–6 (satellite), 2–3 (weather/nwac alert-only). §3.1 helper → Task 1. §3.2 satellite → Tasks 5–6. §3.3 snotel → Task 4. §3.4 isolation/logging → Tasks 2–6. §4 alerting → Task 8. §5 testing → Tasks 7, 9, 10. §6 risks (23.5h cap, render cap, catalog limit, vendoring) → encoded in Tasks 5/6/8.
- **Email never committed:** required-var-via-`TF_VAR_alert_email`, channel gated on non-empty, no real address in any tracked file (Task 8) — verified in plan/spec/test code (placeholders only).
- **Type/name consistency:** `obs.log_event(severity, event, **fields)`; events `pipeline_success`/`pipeline_error`/`pipeline_backfill_capped`/`pipeline_skip`; `cc.parse_scenes`/`cc.search_recent_scenes`/`cc._search_body(bbox, start, limit)`; `MAX_BACKFILL_RENDERS`; metrics `pipeline_success_weather`/`pipeline_success_snotel` referenced consistently in absence filters.
