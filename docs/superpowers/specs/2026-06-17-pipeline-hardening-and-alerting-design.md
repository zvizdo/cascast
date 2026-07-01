# Pipeline Hardening & Native Log-Based Alerting — Design

Date: 2026-06-17
Status: Approved (brainstorm) — pending spec review
Branch: `build/mountains-first-redesign`

## 1. Goal

Make the data-gathering pipeline **self-healing** (a multi-day outage backfills any gap it
*can* recover, within the existing 35-day retention) and **observable** (the operator gets an
email when a pipeline issue occurs). No new compute, topics, buckets, or Cloud Functions —
**harden the five existing workers** and add **Cloud Monitoring alerting in Terraform**.

### Non-goals
- No new Cloud Functions / watchdog service / Pub/Sub topics / buckets.
- No change to the 35-day TTL/lifecycle policies, the schedule cadence, or the read/UI paths.
- No backfill of data that genuinely cannot be re-fetched (see §2).

## 2. Self-healing matrix — honest about what is recoverable

Backfill only ever fills **within** the existing 35-day retention window; nothing is retained longer.
The orchestrator already fans out one independent Pub/Sub message per mountain, so a single
mountain's failure is already isolated to its own DLQ — that isolation is preserved.

| Source | Cadence | Recoverable? | Mechanism |
|---|---|---|---|
| **SNOTEL** | daily 7am PT | **Yes** (already) | Re-fetches a rolling window every run. Hardening: extend window 30→35d; bank **per-day** history from `trend` (idempotent by reading date) instead of one doc keyed by the latest date. |
| **Satellite** | weekly Sun 8am PT | **Yes** | Search CDSE for **all** <70%-cloud scenes in the trailing 35d; render+store each scene-date **not already in history** (capped per run). Missed scenes fill on the next weekly run. |
| **NWAC** | daily 7–11am PT | **No** | Past daily avalanche products aren't reliably fetchable by date, and summer is a no-op. Stays idempotent "latest"; a one-day outage self-corrects to the current forecast next morning. Covered by alerting only. |
| **Weather** | hourly | **No** (by decision) | A forecast issued during an outage cannot be retrieved after the fact. Current forecast resumes on the next hourly run; the evolution chart shows an honest gap. Covered by alerting only. |

**Key principle:** all history writes stay **date-keyed and idempotent** — re-running a day
overwrites, never duplicates — so re-fetching a trailing window is always safe.

## 3. Worker hardening

### 3.1 Shared structured-logging helper (logging only — no new function)
Add `log_event()` to a shared module `functions/shared/obs.py` (NOT `logging.py` — that would
shadow the stdlib `logging` inside the `shared` package). Cloud Run parses a
single-line JSON object on stdout: a `severity` field becomes the LogEntry severity and the rest
becomes `jsonPayload` — giving both correct severity **and** filterable fields with zero library setup.

```python
import json
def log_event(severity: str, event: str, **fields) -> None:
    print(json.dumps({"severity": severity, "event": event, **fields}))
```

**Logging contract** — every worker emits exactly one terminal line per mountain:
- Success: `log_event("INFO", "pipeline_success", source="<weather|nwac|snotel|satellite>", mountainId=...)`
- Failure (before re-raise / on swallowed degradation): `log_event("ERROR", "pipeline_error", source=..., mountainId=..., error=str(exc))`

These two `event` values are the sole contract the alert filters depend on.

### 3.2 Satellite worker — trailing-window backfill + visible errors
`functions/satellite_worker/`:
- `copernicus_client._search_body`: change the open-ended `datetime` to a trailing window
  `"{today-35d}T00:00:00Z/.."` and raise `SEARCH_LIMIT` (e.g. 10→30) so a 35-day window of
  ~5-day-revisit scenes isn't truncated.
- Add `parse_scenes(payload) -> list[dict]` (plural) returning **all** features under the cloud
  threshold (newest-first), alongside the existing `parse_search` (keep for the "latest" doc).
- `main.handle_message`:
  - Resolve the newest scene as today (drives the `satelliteCache` "latest" doc, `scene.jpg`,
    metadata — **unchanged behavior**).
  - For each older scene-date in the window, **skip if `satelliteCache/{id}/history/{date}` already
    exists** (one `.get()` per candidate = the "have-it" index); otherwise render + `write_satellite_image_history` + `append_history`. **Cap renders per run** (e.g. ≤4) to bound CDSE Processing-API cost; if capped, `log_event` a warning naming the dropped dates (no silent truncation).
  - Replace **all** `print(...)` with `log_event(...)`. Swallowed CDSE/render failures keep
    degrading gracefully but now emit `severity=ERROR` `event="pipeline_error"` so they're alertable
    (this is the single most important alerting fix — today they're invisible).

### 3.3 SNOTEL worker — per-day history across the window
`functions/snotel_worker/` + `snotel_client.py`:
- `WINDOW_DAYS` 30→35 (match retention).
- `main.handle_message`: keep writing the "latest" `snotelData/{id}` doc (full record) unchanged.
  Then bank **per-day** history: for each reading in `[*data.trend, data.current]`,
  `append_history("snotelData", id, reading.date, <per-day reading record>)`. Idempotent by date,
  so a previously-missed day fills in on any later successful run.

### 3.4 Error isolation + logging across all four workers
- weather/nwac/snotel already re-raise on hard failure (→ Pub/Sub retry → DLQ after 5). Keep that;
  wrap the body so the `pipeline_error` line is emitted **before** the re-raise, and the
  `pipeline_success` line is emitted on the write path. Per-mountain isolation is already provided
  by the orchestrator's per-mountain fan-out.
- No change to retry/tenacity config or `--max-delivery-attempts=5`.

## 4. Terraform alerting (all new monitoring config — no new compute)

`terraform/modules/monitoring/`. Tuning: **balanced** (rate-limited error emails; absence alerts only
where the cadence fits under the 23.5h metric-absence cap → weather + SNOTEL).

| Resource | Type | Catches |
|---|---|---|
| `email` | `google_monitoring_notification_channel` (type `email`, `labels.email_address` = the operator address) | — |
| `dlq` (existing) | `google_monitoring_alert_policy` | A mountain failed all 5 retries. **Wire `notification_channels` to `email`** (today it has none). |
| `pipeline_errors` | `google_monitoring_alert_policy` w/ `condition_matched_log` | **Any** worker logs `event="pipeline_error"` (incl. satellite). `alert_strategy.notification_rate_limit.period = 300s` (≈1 email / 5 min). Must be the only condition in the policy. |
| `weather_success` | `google_logging_metric` (counter) | filter `jsonPayload.event="pipeline_success" jsonPayload.source="weather"` |
| `snotel_success` | `google_logging_metric` (counter) | filter `…source="snotel"` |
| `weather_stale` | `google_monitoring_alert_policy` w/ `condition_absent` | No weather success for ~2–3h (hourly cadence; well under the 23.5h absence cap). |
| `snotel_stale` | `google_monitoring_alert_policy` w/ `condition_absent` | No SNOTEL success for ~23h (daily cadence; at the cap edge). |

All policies set `notification_channels = [email.id]`. **The operator email must NOT be committed
to the repo.** `alert_email` is a **required Terraform variable with NO default**, supplied at apply
time via the `TF_VAR_alert_email` environment variable. No tracked `.tf`, `.tfvars`, test, or doc may
contain a real email address (use placeholders like `ops@example.com` in any example). The
notification channel is created only when `alert_email` is set.

**Why no absence alert for satellite/NWAC:** the metric-absence trigger is capped at **23.5 hours**;
satellite is weekly (8 days) and NWAC produces no success logs in summer, so an absence alert would
be impossible/false-positive. Both are covered by the `pipeline_errors` log alert + DLQ instead.

## 5. Testing & verification (TDD — failing test first)

Python (`cd functions && pytest`, coverage ≥90):
- `log_event` emits a single JSON line with the right `severity`/`event`/fields.
- `parse_scenes` returns all sub-threshold features newest-first; respects the cloud filter.
- Satellite backfill: given a window with N scenes of which M are already in history, renders only the
  missing ones, respects the per-run cap, and still writes the newest as the "latest" doc; on
  CDSE/render failure emits `pipeline_error` and does not crash.
- SNOTEL: banks one idempotent history doc per date in `[*trend, current]`; re-run overwrites.
- Each worker emits `pipeline_success` on the happy path and `pipeline_error` before re-raise.

Infra: `terraform -chdir=terraform validate`; `plan` shows only the added monitoring resources + the
DLQ policy's `notification_channels` change (no function/Firestore/bucket destroys).

Gates (all must stay green): `functions pytest --cov-fail-under=90`, web `npm run build`/`npm test`,
`terraform validate`. Reviewer: `python-reviewer` on the worker changes.

Live verification: trigger a refresh (`POST /api/admin/trigger-refresh?...` or publish to a
`*-refresh` topic) for one mountain; confirm `pipeline_success`/`pipeline_error` lines appear with the
expected severity in Cloud Logging, and that the satellite backfill writes missing history dates. Apply
the monitoring module and confirm the email channel + policies exist and the DLQ alert is wired.

## 6. Risks / constraints
- **23.5h metric-absence cap** — bounds absence alerting to weather (hourly) and SNOTEL (daily);
  designed around, not fought.
- **Satellite Processing-API cost** — bounded by the per-run render cap; capped drops are logged.
- **CDSE catalog `limit`** — must be large enough that a 35-day window isn't truncated before the
  cloud filter; client-side filter retained (server-side `sortby`/`filter` return 400).
- Vendored `shared/` is copied into each function at deploy time by `stage-functions.sh` (run by
  Terraform); the new `shared/obs.py` is picked up automatically — do not commit vendored copies.
