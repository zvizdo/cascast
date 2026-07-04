# Pipeline observability, alert precision & herd resilience — Design

**Date:** 2026-07-03
**Status:** Approved (brainstorming) — ready for implementation plan
**Author:** debugging session (root-caused from live GCP logs)

## Problem

On 2026-07-03 the user received several email alerts. Investigation of live GCP
logs found the `weather-worker` produced ~4,470 `pipeline_error` events in the
day (vs. ~1/day for the prior two weeks) in **two distinct ~2-hour bursts**
(~04:00–06:00 and ~00:00–02:00 UTC), with clean, successful runs in between.

Root cause (confirmed, not inferred):

1. **Transient upstream outage.** `api.open-meteo.com` was intermittently
   hanging — reproduced independently from a local machine: DNS resolves, TCP
   connects, TLS ClientHello is sent, then the connection times out with no
   response. General internet egress was fine. Open-Meteo's own status/GitHub
   showed matching timeout reports. The pipeline **self-heals** each hour: the
   `weather-pipeline-stale` alert (fires after 3h with no success) correctly
   stayed quiet because successes kept landing between the bursts.

2. **Every error message was blank (`error=""`).** `open_meteo_client.py`
   wraps a bare `asyncio.TimeoutError` (raised by `asyncio.wait_for`) as
   `OpenMeteoError(str(primary))`, and `str(TimeoutError())` is `""`. The real
   failure cause was invisible in the logs.

3. **The `pipeline-worker-errors` alert is a `condition_matched_log` on every
   `pipeline_error` event.** So a transient, self-healing upstream outage floods
   the inbox (rate-limited to ~1 email / 5 min, but still noisy and
   non-actionable).

4. **Amplifying factor.** The catalog is now 39 mountains (was tuned for ~11).
   The orchestrator fans the weather refresh out to all 39 in the same minute;
   each worker makes 2 concurrent Open-Meteo calls. A larger herd is more
   exposed to any upstream capacity hiccup.

## Goals

Three coherent fixes, chained: **(A)** classify each failure so logs can tell
"transient upstream hiccup" from "our bug"; **(B)** wire that classification into
the alert so only actionable failures page; **(C)** a small herd-tuning knob for
the 39-mountain fan-out.

Non-goals: retry-harder heroics (cannot save a multi-hour hard upstream outage —
data self-heals next run); changing the mountain catalog; touching the web app.

## Design

### Error taxonomy

Two classes, logged on every `pipeline_error` event via a new `errorClass` field:

- **`transient`** — expected to self-heal on the next scheduled run: Open-Meteo
  timeouts, connection/transport errors, 5xx after retry exhaustion, throttle
  (429 / "too many concurrent requests") after retry exhaustion, and
  200-but-no-usable-models (an upstream data gap).
- **`actionable`** — a real problem needing a human: deterministic 4xx
  bad-params responses, unknown-mountain, and any unexpected exception (a code
  bug).

Rule: the alert pages on `actionable`; `transient` stays quiet and relies on the
existing `weather-pipeline-stale` safety net (3h with no success) if an outage is
ever sustained enough to make data actually stale.

### Fix A — Observability: never blank, always classified

**`functions/weather_worker/open_meteo_client.py`**
- Add `class OpenMeteoUnavailable(OpenMeteoError)` — transient transport/timeout/
  5xx failure after retries are exhausted.
- In `fetch_forecast`, when `primary` (the GFS+ECMWF request) is an `Exception`
  that is **not** already an `OpenMeteoError` (i.e. a raw `asyncio.TimeoutError`
  or `httpx` error surfaced by `reraise=True`), wrap it as
  `OpenMeteoUnavailable(str(primary) or repr(primary))`. The message is **never
  blank**. An `OpenMeteoError`/`OpenMeteoThrottled` still re-raises as-is.
- Update the tuning-constant defaults (see Fix C) so tests/local runs match prod.

**`functions/weather_worker/main.py`**
- In the `except omc.OpenMeteoError as exc` block, compute
  `error_class = "transient" if isinstance(exc, (omc.OpenMeteoUnavailable, omc.OpenMeteoThrottled)) else "actionable"`
  and log `error=str(exc) or repr(exc)`, `errorClass=error_class`.
- The "no usable models" branch logs `errorClass="transient"` (upstream data gap).
- Wrap the handler body so any **unexpected** exception (e.g. the existing
  `ValueError("Unknown mountain")`, a `KeyError`, etc.) logs a `pipeline_error`
  with `errorClass="actionable"` before re-raising (so a real bug reaches DLQ
  **and** pages). **Ordering constraint (avoid double-logging):** an
  `OpenMeteoError` and the "no usable models" case are already logged with their
  own `errorClass` at the point they occur; the catch-all must let those
  propagate **without** re-logging (e.g. an `except omc.OpenMeteoError: raise`
  ahead of the `except Exception` catch-all, and the "no usable models" branch
  raising an already-logged `OpenMeteoError`). Only genuinely-unhandled
  exceptions get the catch-all's `actionable` log.

**`functions/shared/obs.py`**
- Add `classify_exception(exc) -> str`: returns `"transient"` for timeout/
  transport/5xx-shaped exceptions (`asyncio.TimeoutError`, `TimeoutError`, and
  `httpx`/`requests` transport & timeout errors — matched by exception
  type module/name so `shared` need not import httpx), otherwise `"actionable"`.
- Document the `errorClass` field alongside the existing `event` contract.

**`functions/snotel_worker/main.py`, `nwac_worker/main.py`, `satellite_worker/main.py`**
- Pass `errorClass=obs.classify_exception(exc)` on their existing
  `pipeline_error` logs. This is required: Fix B's filter keys on `errorClass`,
  so without it these workers' errors would silently drop out of the alert.

### Fix B — Alert precision (Terraform)

**`terraform/modules/monitoring/main.tf`** — `google_monitoring_alert_policy.pipeline_errors`:
- Change the filter from
  `jsonPayload.event="pipeline_error" severity>=ERROR`
  to
  `jsonPayload.event="pipeline_error" jsonPayload.errorClass="actionable" severity>=ERROR`.
- Keep the `notification_rate_limit { period = "300s" }` (still required for
  `condition_matched_log`).
- Update the resource comment to describe the actionable-only behavior.

Effect: a transient burst like 2026-07-03 sends **zero** emails; a genuine bug
pages within ~5 minutes. `weather-pipeline-stale` remains the stale-data backstop.

### Fix C — Herd resilience (minimal, fits the 120s worker timeout)

Deliberately marginal — cannot rescue a multi-hour hard outage. The one lever
that helps a 39-worker simultaneous fan-out is wider **jitter spread**. Worst-case
wall-clock must stay under the weather-worker's 120s timeout:
`JITTER + RETRY_ATTEMPTS×REQUEST_TIMEOUT + (RETRY_ATTEMPTS-1)×RETRY_WAIT_MAX`.

| Knob (`WEATHER_FETCH_*`)     | Now | New | Rationale                         |
|------------------------------|-----|-----|-----------------------------------|
| `JITTER_SECONDS`             | 10  | 20  | spread 39 workers over 20s        |
| `REQUEST_TIMEOUT`  (`_TIMEOUT`) | 20  | 18  | fit the budget                    |
| `RETRY_WAIT_MAX`             | 8   | 6   | fit the budget                    |
| `RETRY_ATTEMPTS`            | 4   | 4   | unchanged                         |

Worst case = `20 + 4×18 + 3×6 = 110s` < 120s. ✓

**`functions/weather_worker/open_meteo_client.py`**: update the `os.environ.get`
default values to the "New" column (so code, tests, and local runs match prod).

**`terraform/modules/functions/main.tf`**:
- Add an optional per-function `env` map to the `functions` local, and set
  `environment_variables = merge(local.shared_env, lookup(each.value, "env", {}))`
  on the service config.
- Give `weather-worker` `env = { WEATHER_FETCH_JITTER_SECONDS = "20",
  WEATHER_FETCH_TIMEOUT = "18", WEATHER_FETCH_RETRY_WAIT_MAX = "6",
  WEATHER_FETCH_RETRY_ATTEMPTS = "4" }` — declarative and deploy-tracked.

## Testing (TDD, ≥90% coverage — hard gate)

Failing test first, then implement, for each:

- `open_meteo_client`: a timed-out/transport-failed primary → `OpenMeteoUnavailable`
  with a **non-empty** message; a deterministic bad-params 400 → plain
  `OpenMeteoError` (not Unavailable); a 429/concurrency 400 → `OpenMeteoThrottled`.
- `weather_worker/main`: `pipeline_error` log carries a non-blank `error` **and**
  the correct `errorClass` for each path — timeout→`transient`,
  throttle→`transient`, bad-params→`actionable`, no-usable-models→`transient`,
  unexpected exception→`actionable`.
- `shared/obs.classify_exception`: transient vs actionable for representative
  exception types.
- `snotel`/`nwac`/`satellite` workers: `errorClass` present on their error logs.
- `terraform -chdir=terraform validate` passes.

Gates: `cd functions && pytest` (`--cov-fail-under=90`, live tests deselected) +
`terraform validate`.

## Verification (live, per user QA preference)

After `terraform apply`:
1. Publish a `weather-refresh` for one mountain (or `POST /api/admin/trigger-refresh`).
2. Confirm the resulting `pipeline_error` logs (if any) carry a real `error`
   message and an `errorClass` field.
3. Confirm the updated `pipeline-worker-errors` alert filter matches only
   `errorClass="actionable"` (transient errors no longer email).

## Files touched

- `functions/weather_worker/open_meteo_client.py`
- `functions/weather_worker/main.py`
- `functions/shared/obs.py`
- `functions/snotel_worker/main.py`
- `functions/nwac_worker/main.py`
- `functions/satellite_worker/main.py`
- `terraform/modules/monitoring/main.tf`
- `terraform/modules/functions/main.tf`
- Corresponding test files under `functions/**/tests/`

## Deployment note

Standard non-destructive redeploy (`terraform plan -out` then `apply`), with
`TF_VAR_alert_email` and `TF_VAR_ga_measurement_id` exported (per the two live
config gotchas — omitting either silently wipes live monitoring/analytics config).
