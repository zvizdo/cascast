# Pipeline Observability, Alert Precision & Herd Resilience — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Classify every pipeline failure (`transient` vs `actionable`), page only on actionable failures, and re-tune the 39-mountain weather herd controls within the 120s worker budget — so a transient self-healing Open-Meteo outage no longer emails the user.

**Architecture:** The weather worker gains a precise error taxonomy (a new `OpenMeteoUnavailable` exception + non-blank error messages) and stamps an `errorClass` field on every `pipeline_error` log. A shared `obs.classify_exception` helper gives the other three workers the same field. A Terraform change points the `pipeline-worker-errors` alert at `errorClass="actionable"` only, and wires the retuned `WEATHER_FETCH_*` knobs onto the weather worker as declarative env vars.

**Tech Stack:** Python 3.12 Cloud Functions Gen2 (functions-framework, httpx, tenacity, Pydantic v2), pytest, Terraform 1.14 (google provider), Cloud Monitoring log-based alerts.

## Global Constraints

- Python via `uv`-managed 3.12 venv at `functions/.venv`; run gates from `functions/`.
- Test coverage **≥90%** is a hard gate: `cd functions && pytest` (`--cov-fail-under=90`, live tests deselected). TDD — failing test first.
- `terraform -chdir=terraform validate` must pass.
- **Single prod environment.** Deploy = `terraform -chdir=terraform plan -out=PLAN` then `apply PLAN` — never blind `-auto-approve` (deploy guard blocks it).
- **Deploy MUST export BOTH** `TF_VAR_alert_email="anzekravanja@gmail.com"` **AND** `TF_VAR_ga_measurement_id="G-P3C545NTG6"` — omitting either silently deletes the monitoring email channel / the live `GA_MEASUREMENT_ID` env. The email is passed via env var only, never committed.
- `shared/` is vendored into each function dir by Terraform (`stage-functions.sh`) at deploy — never run that script by hand and never commit vendored copies. Edit only the canonical `functions/shared/…`.
- Structured logs: `obs.log_event(severity, event, **fields)` prints one JSON line; `event` and now `errorClass` are the fields Cloud Monitoring filters key on.
- Worst-case weather fetch wall-clock must stay `< 120s` (weather-worker timeout): `JITTER + RETRY_ATTEMPTS×REQUEST_TIMEOUT + (RETRY_ATTEMPTS-1)×RETRY_WAIT_MAX`.
- Target gcloud at the project explicitly: `--project mountain-weatherman-app`.

## File Structure

- `functions/weather_worker/open_meteo_client.py` — add `OpenMeteoUnavailable`; wrap raw timeout/transport failures into it with a non-blank message; retune tuning-constant defaults. *(Task 1)*
- `functions/weather_worker/main.py` — classify caught `OpenMeteoError` into `errorClass`; non-blank `error`; outer catch-all for unexpected exceptions (ordering-safe). *(Task 2)*
- `functions/shared/obs.py` — add `classify_exception(exc)` + document `errorClass`. *(Task 3)*
- `functions/snotel_worker/main.py`, `functions/nwac_worker/main.py`, `functions/satellite_worker/main.py` — stamp `errorClass=obs.classify_exception(exc)` on their `pipeline_error` logs. *(Task 4)*
- `terraform/modules/monitoring/main.tf` — alert filter → `errorClass="actionable"`. *(Task 5)*
- `terraform/modules/functions/main.tf` — per-function `env` merge + weather-worker `WEATHER_FETCH_*`. *(Task 5)*
- Tests: `functions/weather_worker/tests/test_open_meteo_client.py`, `functions/weather_worker/tests/test_main.py`, `functions/shared/tests/test_obs.py`, `functions/{snotel,nwac,satellite}_worker/tests/test_main.py`.

---

### Task 1: `OpenMeteoUnavailable` + non-blank error wrapping + retuned defaults

**Files:**
- Modify: `functions/weather_worker/open_meteo_client.py`
- Test: `functions/weather_worker/tests/test_open_meteo_client.py`

**Interfaces:**
- Produces: `class OpenMeteoUnavailable(OpenMeteoError)` — raised by `fetch_forecast` when the primary (GFS+ECMWF) request fails with a non-`OpenMeteoError` exception (raw `asyncio.TimeoutError` / `httpx` error after retries). Its message is always non-empty. New default constants: `JITTER_SECONDS=20`, `REQUEST_TIMEOUT_SECONDS=18`, `RETRY_WAIT_MAX_SECONDS=6`, `RETRY_MAX_ATTEMPTS=4`.

- [ ] **Step 1: Write the failing test** — append to `functions/weather_worker/tests/test_open_meteo_client.py`:

```python
@pytest.mark.asyncio
async def test_primary_timeout_wraps_into_unavailable_with_nonblank_message(monkeypatch):
    # A raw asyncio.TimeoutError (what asyncio.wait_for raises when Open-Meteo hangs)
    # must surface as OpenMeteoUnavailable with a NON-BLANK message — reproduces the
    # 2026-07-03 error="" masking bug.
    async def _timeout(_client, _mountain, _models):
        raise asyncio.TimeoutError()

    monkeypatch.setattr(omc, "_get", _timeout)
    monkeypatch.setattr(omc, "JITTER_SECONDS", 0.0)

    with pytest.raises(omc.OpenMeteoUnavailable) as ei:
        await omc.fetch_forecast(MOUNTAIN)
    assert str(ei.value)  # non-blank
    assert isinstance(ei.value, omc.OpenMeteoError)  # still caught by the worker's handler


def test_retuned_defaults_fit_worker_timeout():
    budget = (
        omc.JITTER_SECONDS
        + omc.RETRY_MAX_ATTEMPTS * omc.REQUEST_TIMEOUT_SECONDS
        + (omc.RETRY_MAX_ATTEMPTS - 1) * omc.RETRY_WAIT_MAX_SECONDS
    )
    assert budget < 120  # worst-case wall-clock under the weather-worker timeout
    assert omc.JITTER_SECONDS == 20  # wider herd spread for 39 mountains
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd functions && source .venv/bin/activate && pytest weather_worker/tests/test_open_meteo_client.py::test_primary_timeout_wraps_into_unavailable_with_nonblank_message weather_worker/tests/test_open_meteo_client.py::test_retuned_defaults_fit_worker_timeout -p no:cov -o addopts="" -v`
Expected: FAIL — `AttributeError: module 'weather_worker.open_meteo_client' has no attribute 'OpenMeteoUnavailable'` and the defaults assertion fails (JITTER is 10).

- [ ] **Step 3: Add the exception class.** In `open_meteo_client.py`, after the `OpenMeteoThrottled` class (around line 72), add:

```python
class OpenMeteoUnavailable(OpenMeteoError):
    """Transient upstream failure after retries are exhausted: a connection/read
    timeout, transport error, or 5xx. Self-heals on the next scheduled run —
    distinct from a deterministic bad-params OpenMeteoError."""
```

- [ ] **Step 4: Retune the default constants.** Replace lines 56–59:

```python
JITTER_SECONDS = float(os.environ.get("WEATHER_FETCH_JITTER_SECONDS", "20"))
RETRY_MAX_ATTEMPTS = int(os.environ.get("WEATHER_FETCH_RETRY_ATTEMPTS", "4"))
RETRY_WAIT_MAX_SECONDS = float(os.environ.get("WEATHER_FETCH_RETRY_WAIT_MAX", "6"))
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("WEATHER_FETCH_TIMEOUT", "18"))
```

Also update the worst-case comment (lines ~53–55) to the new arithmetic:

```python
#   JITTER (20) + RETRY_MAX_ATTEMPTS*REQUEST_TIMEOUT (4*18) + (n-1)*RETRY_WAIT (3*6)
#   = 20 + 72 + 18 = 110s < 120s, even if every attempt stalls to its full timeout.
```

- [ ] **Step 5: Wrap the primary failure into `OpenMeteoUnavailable`.** In `fetch_forecast`, replace the existing block (currently lines ~238–240):

```python
    if isinstance(primary, Exception):
        # Both GFS and ECMWF gone is unrecoverable for this fetch -> caller decides.
        raise primary if isinstance(primary, OpenMeteoError) else OpenMeteoError(str(primary))
```

with:

```python
    if isinstance(primary, Exception):
        # Both GFS and ECMWF gone is unrecoverable for this fetch -> caller decides.
        # A raw timeout/transport error (str() often empty) becomes an explicit,
        # NON-BLANK OpenMeteoUnavailable so the failure cause is never masked.
        if isinstance(primary, OpenMeteoError):
            raise primary
        raise OpenMeteoUnavailable(str(primary) or repr(primary))
```

- [ ] **Step 6: Run the new tests + the full open_meteo suite (no regressions)**

Run: `cd functions && source .venv/bin/activate && pytest weather_worker/tests/test_open_meteo_client.py -p no:cov -o addopts="" -v`
Expected: PASS — all tests, including the two new ones. (The existing `test_attempt_is_hard_bounded_by_timeout_and_retried` still raises `asyncio.TimeoutError` because it exercises `_get`, not `fetch_forecast`.)

- [ ] **Step 7: Commit**

```bash
git add functions/weather_worker/open_meteo_client.py functions/weather_worker/tests/test_open_meteo_client.py
git commit -m "feat(weather): OpenMeteoUnavailable + non-blank timeout wrap; retune herd defaults"
```

---

### Task 2: Error classification in `weather_worker/main.py`

**Files:**
- Modify: `functions/weather_worker/main.py`
- Test: `functions/weather_worker/tests/test_main.py`

**Interfaces:**
- Consumes: `omc.OpenMeteoUnavailable`, `omc.OpenMeteoThrottled`, `omc.OpenMeteoError` (Task 1).
- Produces: every `pipeline_error` log from the weather worker carries a non-blank `error` and an `errorClass` of `"transient"` (upstream unavailable / throttle / no-usable-models) or `"actionable"` (bad-params / unexpected exception). Internal helper `_handle(mountain_id: str) -> None`.

- [ ] **Step 1: Write the failing tests** — append to `functions/weather_worker/tests/test_main.py`:

```python
def test_pipeline_error_timeout_is_transient(patched, monkeypatch, capsys):
    async def _boom(_mountain):
        raise main.omc.OpenMeteoUnavailable("read timeout")
    monkeypatch.setattr(main.omc, "fetch_forecast", _boom)
    with pytest.raises(main.omc.OpenMeteoUnavailable):
        main.handle_message(_event({"mountainId": "mt-rainier"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"
    assert evt["error"] == "read timeout"  # non-blank


def test_pipeline_error_throttle_is_transient(patched, monkeypatch, capsys):
    async def _boom(_mountain):
        raise main.omc.OpenMeteoThrottled("Too many concurrent requests")
    monkeypatch.setattr(main.omc, "fetch_forecast", _boom)
    with pytest.raises(main.omc.OpenMeteoThrottled):
        main.handle_message(_event({"mountainId": "mt-rainier"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"


def test_pipeline_error_bad_params_is_actionable(patched, monkeypatch, capsys):
    async def _boom(_mountain):
        raise main.omc.OpenMeteoError("Invalid timezone")
    monkeypatch.setattr(main.omc, "fetch_forecast", _boom)
    with pytest.raises(main.omc.OpenMeteoError):
        main.handle_message(_event({"mountainId": "mt-rainier"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "actionable"


def test_pipeline_error_no_usable_models_is_transient(patched, monkeypatch, capsys):
    unavailable = ModelSeries(available=False)
    monkeypatch.setattr(main.omc, "fetch_forecast", AsyncMock(return_value={
        "hrrr": unavailable, "gfs": unavailable, "ecmwf": unavailable}))
    with pytest.raises(main.omc.OpenMeteoError):
        main.handle_message(_event({"mountainId": "mt-rainier"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"
    assert evt["error"]  # non-blank


def test_unexpected_exception_logs_actionable(patched, monkeypatch, capsys):
    # Unknown mountain -> ValueError inside _handle -> caught by the actionable catch-all.
    with pytest.raises(ValueError, match="Unknown mountain"):
        main.handle_message(_event({"mountainId": "nope"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt is not None
    assert evt["errorClass"] == "actionable"
    assert evt["error"]  # non-blank
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd functions && source .venv/bin/activate && pytest weather_worker/tests/test_main.py -k "errorClass or transient or actionable or no_usable_models or unexpected_exception" -p no:cov -o addopts="" -v`
Expected: FAIL — `KeyError: 'errorClass'` (field not yet emitted) / no `pipeline_error` for the unknown-mountain case.

- [ ] **Step 3: Refactor `handle_message` into an ordering-safe wrapper + `_handle`.** Replace the current `handle_message` (lines ~46–96) with:

```python
@functions_framework.cloud_event
def handle_message(cloud_event):
    msg = _decode(cloud_event)
    mountain_id = msg["mountainId"]
    try:
        _handle(mountain_id)
    except omc.OpenMeteoError:
        raise  # already logged with its errorClass inside _handle
    except Exception as exc:
        # Any unexpected exception is a real bug -> actionable + reaches DLQ.
        obs.log_event(
            "ERROR", "pipeline_error", source="weather", mountainId=mountain_id,
            error=str(exc) or repr(exc), errorClass="actionable",
        )
        raise


def _handle(mountain_id: str) -> None:
    mountain = fc.get_mountain(mountain_id)
    if mountain is None:
        raise ValueError(f"Unknown mountain: {mountain_id}")

    # Fetch. A total failure (no GFS/ECMWF) raises OpenMeteoError.
    try:
        series_by_key = asyncio.run(omc.fetch_forecast(mountain))
    except omc.OpenMeteoError as exc:
        # Transient (self-heals) vs actionable (bad params) drives the alert.
        error_class = "transient" if isinstance(
            exc, (omc.OpenMeteoUnavailable, omc.OpenMeteoThrottled)) else "actionable"
        logging.error("weather fetch failed for mountain %s", mountain_id, exc_info=True)
        obs.log_event(
            "ERROR", "pipeline_error", source="weather", mountainId=mountain_id,
            error=str(exc) or repr(exc), errorClass=error_class,
        )
        raise  # let Pub/Sub retry -> DLQ

    status = _refresh_status(series_by_key)
    if status == "error":
        # GFS+ECMWF both missing -> upstream data gap that self-heals. Transient.
        logging.error("no usable models for mountain %s", mountain_id)
        obs.log_event(
            "ERROR", "pipeline_error", source="weather", mountainId=mountain_id,
            error="no usable models", errorClass="transient",
        )
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

    # mountainConditions is browse-only: always summarize TODAY's conditions.
    browse_target = fetched_at.date().isoformat()
    cond_summary = _summary_for(blob, browse_target, summit_ft, nwac_danger=None)
    fc.upsert_mountain_conditions(mountain_id, blob_path, cond_summary.model_dump())

    # One per-mountain forecast snapshot (powers forecast-evolution).
    models = summ.all_model_summaries_by_day(blob)
    fc.write_mountain_snapshot(mountain_id, blob_path=blob_path, models=models)

    obs.log_event("INFO", "pipeline_success", source="weather", mountainId=mountain_id)
```

Leave `_decode`, `_refresh_status`, and `_summary_for` unchanged.

- [ ] **Step 4: Run the new + existing main tests**

Run: `cd functions && source .venv/bin/activate && pytest weather_worker/tests/test_main.py -p no:cov -o addopts="" -v`
Expected: PASS — the five new tests plus all existing ones (`test_all_models_fail_no_blob_and_raises`, `test_unknown_mountain_raises`, `test_weather_emits_pipeline_error_before_reraise`, etc. still hold; the `error` field for `OpenMeteoError("Invalid timezone")` is unchanged and now also carries `errorClass="actionable"`).

- [ ] **Step 5: Commit**

```bash
git add functions/weather_worker/main.py functions/weather_worker/tests/test_main.py
git commit -m "feat(weather): classify pipeline errors as transient vs actionable"
```

---

### Task 3: `classify_exception` in `shared/obs.py`

**Files:**
- Modify: `functions/shared/obs.py`
- Test: `functions/shared/tests/test_obs.py`

**Interfaces:**
- Produces: `obs.classify_exception(exc: BaseException) -> str` returning `"transient"` for timeout/connection/transport-shaped exceptions, else `"actionable"`. Used by the snotel/nwac/satellite workers (Task 4).

- [ ] **Step 1: Write the failing test** — append to `functions/shared/tests/test_obs.py`:

```python
import asyncio


def test_classify_exception_timeout_is_transient():
    assert obs.classify_exception(asyncio.TimeoutError()) == "transient"
    assert obs.classify_exception(TimeoutError()) == "transient"


def test_classify_exception_connection_is_transient():
    assert obs.classify_exception(ConnectionError("reset")) == "transient"

    class ReadTimeout(Exception):
        pass

    class ConnectError(Exception):
        pass

    assert obs.classify_exception(ReadTimeout()) == "transient"   # name marker "timeout"
    assert obs.classify_exception(ConnectError()) == "transient"   # name marker "connect"


def test_classify_exception_other_is_actionable():
    assert obs.classify_exception(ValueError("bad field")) == "actionable"
    assert obs.classify_exception(KeyError("missing")) == "actionable"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd functions && source .venv/bin/activate && pytest shared/tests/test_obs.py -p no:cov -o addopts="" -v`
Expected: FAIL — `AttributeError: module 'shared.obs' has no attribute 'classify_exception'`.

- [ ] **Step 3: Implement.** In `functions/shared/obs.py`, add `import asyncio` at the top (after `import json`), extend the module docstring's field contract, and add the function:

```python
# Exception-type name substrings that mark a TRANSIENT upstream failure (a
# connection/read timeout or transport error from httpx/requests) without this
# module needing to import those libraries.
_TRANSIENT_NAME_MARKERS = (
    "timeout", "connect", "transport", "readerror", "writeerror",
    "networkerror", "poolerror", "remoteprotocol",
)


def classify_exception(exc: BaseException) -> str:
    """Best-effort error class for the alert: "transient" (self-heals on the next
    scheduled run — timeouts, connection/transport errors) or "actionable" (a real
    problem worth paging). The weather worker classifies precisely via its own
    OpenMeteo exception taxonomy; the other workers use this heuristic default,
    which errs toward "actionable" for anything unrecognized."""
    if isinstance(exc, (asyncio.TimeoutError, TimeoutError, ConnectionError)):
        return "transient"
    name = type(exc).__name__.lower()
    if any(marker in name for marker in _TRANSIENT_NAME_MARKERS):
        return "transient"
    return "actionable"
```

Update the docstring line listing fields to note:
`  - "errorClass"       ("transient"|"actionable") on pipeline_error -> alert filter`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd functions && source .venv/bin/activate && pytest shared/tests/test_obs.py -p no:cov -o addopts="" -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/obs.py functions/shared/tests/test_obs.py
git commit -m "feat(shared): obs.classify_exception for transient vs actionable errors"
```

---

### Task 4: Stamp `errorClass` on snotel / nwac / satellite error logs

**Files:**
- Modify: `functions/snotel_worker/main.py`, `functions/nwac_worker/main.py`, `functions/satellite_worker/main.py`
- Test: `functions/snotel_worker/tests/test_main.py`, `functions/nwac_worker/tests/test_main.py`, `functions/satellite_worker/tests/test_main.py`

**Interfaces:**
- Consumes: `obs.classify_exception` (Task 3). All three workers already `from shared import obs`.

- [ ] **Step 1: Write the failing tests.** In each worker's `tests/test_main.py`, add a test asserting the primary-fetch failure log carries `errorClass`. Use each file's existing fixtures/mocking style; the assertions to add:

`functions/snotel_worker/tests/test_main.py`:

```python
def test_snotel_pipeline_error_has_errorclass(monkeypatch, capsys):
    # Reuse this file's existing patching of get_mountain/get_db + _event helper.
    import snotel_worker.main as sm
    monkeypatch.setattr(sm, "fetch_snotel", MagicMock(side_effect=TimeoutError("read timeout")))
    # ... arrange a valid mountain with a SNOTEL triplet per the existing fixture ...
    with pytest.raises(TimeoutError):
        sm.handle_message(_event({"mountainId": "mt-baker"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"
```

`functions/nwac_worker/tests/test_main.py`:

```python
def test_nwac_pipeline_error_has_errorclass(monkeypatch, capsys):
    import nwac_worker.main as nm
    monkeypatch.setattr(nm.nwac_client, "fetch_forecast",
                        AsyncMock(side_effect=TimeoutError("read timeout")))
    # ... arrange a valid mountain with an NWAC zone + not-already-captured per fixture ...
    with pytest.raises(TimeoutError):
        nm.handle_message(_event({"mountainId": "mt-baker"}))
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"
```

`functions/satellite_worker/tests/test_main.py`:

```python
def test_satellite_pipeline_error_has_errorclass(monkeypatch, capsys):
    import satellite_worker.main as satm
    monkeypatch.setattr(satm, "fetch_scene", MagicMock(side_effect=TimeoutError("read timeout")))
    # ... arrange the existing mountain-doc mock so handle_message reaches fetch_scene ...
    satm.handle_message(_event({"mountainId": "mt-baker"}))  # satellite degrades, no raise
    evt = _find_event(capsys, "pipeline_error")
    assert evt["errorClass"] == "transient"
```

> If a `_find_event` helper does not already exist in a given test file, copy the one from `functions/weather_worker/tests/test_main.py` (lines 17–26). Match each file's existing event-construction and mocking conventions rather than inventing new ones.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd functions && source .venv/bin/activate && pytest snotel_worker/tests/test_main.py nwac_worker/tests/test_main.py satellite_worker/tests/test_main.py -k errorclass -p no:cov -o addopts="" -v`
Expected: FAIL — `KeyError: 'errorClass'`.

- [ ] **Step 3: Add `errorClass` to each worker's `pipeline_error` log.**

`functions/snotel_worker/main.py` (line ~53) — change:

```python
        obs.log_event("ERROR", "pipeline_error", source="snotel", mountainId=mountain["id"], error=str(exc))
```
to:
```python
        obs.log_event("ERROR", "pipeline_error", source="snotel", mountainId=mountain["id"],
                      error=str(exc) or repr(exc), errorClass=obs.classify_exception(exc))
```

`functions/nwac_worker/main.py` (line ~77) — change:

```python
        obs.log_event("ERROR", "pipeline_error", source="nwac", mountainId=mountain["id"], error=str(exc))
```
to:
```python
        obs.log_event("ERROR", "pipeline_error", source="nwac", mountainId=mountain["id"],
                      error=str(exc) or repr(exc), errorClass=obs.classify_exception(exc))
```

`functions/satellite_worker/main.py` — update **all four** `pipeline_error` calls (lines ~64, ~78, ~115, ~143) to add `errorClass=obs.classify_exception(exc)` and use `str(exc) or repr(exc)` in the message. Example for line ~64:

```python
        obs.log_event("ERROR", "pipeline_error", source="satellite", mountainId=mountain_id,
                      error=f"CDSE lookup failed: {exc}", errorClass=obs.classify_exception(exc))
```

Apply the same `errorClass=obs.classify_exception(exc)` addition to the `latest render failed` (~78), `window search failed` (~115), and `backfill render {d} failed` (~143) logs, keeping each existing message string.

- [ ] **Step 4: Run the worker test suites (new + existing)**

Run: `cd functions && source .venv/bin/activate && pytest snotel_worker/tests/test_main.py nwac_worker/tests/test_main.py satellite_worker/tests/test_main.py -p no:cov -o addopts="" -v`
Expected: PASS — new `errorClass` tests plus all existing tests.

- [ ] **Step 5: Commit**

```bash
git add functions/snotel_worker/main.py functions/nwac_worker/main.py functions/satellite_worker/main.py \
        functions/snotel_worker/tests/test_main.py functions/nwac_worker/tests/test_main.py functions/satellite_worker/tests/test_main.py
git commit -m "feat(workers): stamp errorClass on snotel/nwac/satellite pipeline errors"
```

---

### Task 5: Terraform — actionable-only alert + declarative weather knobs

**Files:**
- Modify: `terraform/modules/monitoring/main.tf`
- Modify: `terraform/modules/functions/main.tf`

**Interfaces:**
- Consumes: the `errorClass` field now present on all workers' `pipeline_error` logs (Tasks 2 & 4) and the `WEATHER_FETCH_*` env-tunable knobs (Task 1).

- [ ] **Step 1: Point the alert at actionable errors only.** In `terraform/modules/monitoring/main.tf`, change the `pipeline_errors` policy filter (line ~64) from:

```hcl
      filter = "jsonPayload.event=\"pipeline_error\" severity>=ERROR"
```
to:
```hcl
      filter = "jsonPayload.event=\"pipeline_error\" jsonPayload.errorClass=\"actionable\" severity>=ERROR"
```

And update the resource comment (lines ~55–56) to:

```hcl
# Any worker that logs event="pipeline_error" with errorClass="actionable" (a real
# bug / bad-params). Transient upstream failures (errorClass="transient") self-heal
# and are covered by the *-pipeline-stale absence alerts, so they do NOT page.
```

- [ ] **Step 2: Add a per-function `env` merge + weather-worker knobs.** In `terraform/modules/functions/main.tf`, in the `weather-worker` entry of the `functions` local (after line 20, `max_instances = 100`), add:

```hcl
      env = {
        WEATHER_FETCH_JITTER_SECONDS = "20"
        WEATHER_FETCH_TIMEOUT        = "18"
        WEATHER_FETCH_RETRY_WAIT_MAX = "6"
        WEATHER_FETCH_RETRY_ATTEMPTS = "4"
      }
```

Then change the service-config env assignment (line 120) from:

```hcl
    environment_variables = local.shared_env
```
to:
```hcl
    environment_variables = merge(local.shared_env, lookup(each.value, "env", {}))
```

- [ ] **Step 3: Validate**

Run: `terraform -chdir=terraform validate`
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
git add terraform/modules/monitoring/main.tf terraform/modules/functions/main.tf
git commit -m "feat(infra): alert on actionable errors only; wire weather herd knobs"
```

---

### Task 6: Full gates, live deploy & post-deploy verification

**Files:** none (deploy + verification only)

**Interfaces:** Consumes all prior tasks. This task performs the actual live deploy to the single prod environment and verifies success.

- [ ] **Step 1: Run the full Python gate (coverage ≥90%)**

Run: `cd functions && source .venv/bin/activate && pytest`
Expected: PASS, `--cov-fail-under=90` satisfied. (If a stale `.coverage` from the earlier `-p no:cov` runs interferes, delete it first: `rm -f functions/.coverage`.)

- [ ] **Step 2: Terraform validate + confirm working tree is committed**

Run:
```bash
terraform -chdir=terraform validate
git -C /Users/anzekravanja/Projects/mountain-weatherman-app status --short
```
Expected: `Success!` and a **clean** working tree (deploy builds the working tree — uncommitted code would ship untracked; everything must be committed on the branch first).

- [ ] **Step 3: Plan the deploy (with BOTH required TF_VARs)**

Run:
```bash
TF_VAR_alert_email="anzekravanja@gmail.com" TF_VAR_ga_measurement_id="G-P3C545NTG6" \
  terraform -chdir=terraform plan -out=/tmp/pipeline-fix.tfplan
```
Expected: a plan that **changes** (not destroys) the 5 function source objects + `weather-worker` service (new env vars) + the `pipeline_errors` alert policy filter. **Abort if** the plan shows `module.web…GA_MEASUREMENT_ID … -> null` or any `module.monitoring…` notification-channel **deletion** — that means a `TF_VAR_` was missing. Read the plan and confirm: weather-worker gains `WEATHER_FETCH_*`, and the alert filter gains `errorClass="actionable"`.

- [ ] **Step 4: Apply**

Run: `terraform -chdir=terraform apply /tmp/pipeline-fix.tfplan`
Expected: `Apply complete!` with no errors.

- [ ] **Step 5: Verify functions are healthy & the alert filter updated**

Run:
```bash
gcloud functions list --project mountain-weatherman-app --v2 --format="table(name,state)"
gcloud monitoring policies list --project mountain-weatherman-app \
  --filter='displayName="pipeline-worker-errors"' \
  --format="value(conditions[0].conditionMatchedLog.filter)"
```
Expected: all 5 functions `ACTIVE`; the printed filter contains `jsonPayload.errorClass="actionable"`.

- [ ] **Step 6: Live smoke — confirm real messages + errorClass in logs**

Trigger one weather refresh and inspect the resulting logs:
```bash
gcloud pubsub topics publish weather-refresh --project mountain-weatherman-app \
  --message='{"mountainId":"mt-rainier"}'
sleep 45
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="weather-worker" AND (jsonPayload.event="pipeline_success" OR jsonPayload.event="pipeline_error")' \
  --project mountain-weatherman-app --freshness=5m --limit=5 \
  --format="table(timestamp,jsonPayload.event,jsonPayload.errorClass,jsonPayload.error)"
```
Expected: a `pipeline_success` for `mt-rainier` (the happy path after the Open-Meteo outage recovered). **If** any `pipeline_error` appears, it now shows a **non-blank** `error` and a populated `errorClass` — confirming the masking bug is fixed. Blank `error` or missing `errorClass` = the deploy did not take; investigate before claiming done.

- [ ] **Step 7: Confirm no transient-error regressions in the wider pipeline**

Run:
```bash
gcloud logging read 'resource.type="cloud_run_revision" AND jsonPayload.event="pipeline_error" AND NOT (jsonPayload.errorClass="transient" OR jsonPayload.errorClass="actionable")' \
  --project mountain-weatherman-app --freshness=1h --limit=5 \
  --format="value(resource.labels.service_name,jsonPayload.error)"
```
Expected: **empty** — every `pipeline_error` emitted post-deploy carries an `errorClass` (no un-classified errors that would slip past the alert filter). Older pre-deploy errors may still show; focus on entries after the apply timestamp.

- [ ] **Step 8: Final commit (deploy record)** — only if any step produced tracked changes (e.g. a coverage or lockfile artifact); otherwise skip. Do not commit `.tfplan` (it lives in `/tmp`).

---

## Self-Review

**Spec coverage:**
- Error taxonomy (transient/actionable) → Tasks 1–4. ✓
- Fix A (never blank, always classified) → Task 1 (non-blank wrap) + Task 2 (weather classify) + Task 3 (shared helper) + Task 4 (other workers). ✓
- Fix B (actionable-only alert) → Task 5 Step 1. ✓
- Fix C (herd retune + Terraform env) → Task 1 (defaults) + Task 5 Step 2. ✓
- Ordering constraint (no double-logging) → Task 2 Step 3 (`except omc.OpenMeteoError: raise` ahead of the catch-all; no-usable-models pre-logged). ✓
- TDD + ≥90% coverage gate → each task is test-first; Task 6 Step 1 runs the full coverage gate. ✓
- Live deploy + verify success (user's explicit requirement) → Task 6 Steps 3–7. ✓
- Deploy gotchas (both TF_VARs, plan-then-apply, committed tree) → Global Constraints + Task 6 Steps 2–3. ✓

**Placeholder scan:** All code steps show concrete code. Task 4's per-worker tests intentionally defer to each file's existing fixture style (the arrangement differs per worker) but give the exact assertion + mocking target — acceptable, as the fixtures already exist and inventing divergent ones would be wrong.

**Type consistency:** `OpenMeteoUnavailable` (Task 1) used identically in Task 2. `classify_exception` (Task 3) called with the same signature in Task 4. `errorClass` field name consistent across Tasks 2, 4, 5. Env var names (`WEATHER_FETCH_JITTER_SECONDS`, `_TIMEOUT`, `_RETRY_WAIT_MAX`, `_RETRY_ATTEMPTS`) match the `os.environ.get` keys in `open_meteo_client.py`. ✓
