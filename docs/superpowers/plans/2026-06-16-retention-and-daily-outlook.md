# Retention/Accumulation + Daily Outlook Fixes — Implementation Plan

> **For agentic workers:** Execute task-by-task with TDD. Steps use checkbox (`- [ ]`) syntax.

**Goal:** (1) Make SNOTEL, NWAC, and Satellite pipelines accumulate a dated time-series with a 35-day retention window (Firestore TTL + GCS lifecycle), matching the weather snapshots pattern, while keeping all current reads/UI working off the latest record. (2) Fix the desktop Daily Outlook header that doesn't stretch to full width. (3) Replace the single cycling expander with two stepwise controls (expand one level / collapse one level).

**Architecture:**
- Retention: keep each source's existing "latest" doc/object (current reads untouched). ADD an accumulating `…/{id}/history/{dateKey}` Firestore subcollection (date-keyed → idempotent per pull) with an `expireAt` field, plus date-stamped GCS history images for satellite. One new Firestore TTL policy on the `history` collection group; one GCS lifecycle rule on the satellite bucket scoped to the `history/` prefix.
- UI: surgical edits to `DailyOutlook.tsx` only (+ small CSS).

**Tech Stack:** Python 3.12 Cloud Functions (firebase-admin / google-cloud-firestore), Terraform, Next.js 16 / React 19 / TS, Vitest, Playwright.

**Decisions (locked with user 2026-06-16):** Accumulate SNOTEL + Satellite + NWAC; keep `mountainConditions` overwrite (weather history already in snapshots). Bank-data-+-retention only — no new evolution UI this task.

---

## Cluster A — Retention/Accumulation (Python + Terraform)

### Task A1: `append_history` shared helper

**Files:**
- Modify: `functions/shared/firestore_client.py`
- Test: `functions/shared/tests/test_firestore_client.py` (or the existing shared test file)

- [ ] Write a failing test asserting `append_history("snotelData", "mt-rainier", "2026-06-16", {"a": 1})` writes to `snotelData/mt-rainier/history/2026-06-16` with the record fields PLUS an `expireAt` ~35 days out (use a fake/mocked `_db()` as existing tests do; assert the doc path and that `expireAt` is a tz-aware datetime ≈ now + 35d).
- [ ] Implement:
```python
def append_history(parent_collection: str, parent_id: str, key: str, record: dict) -> None:
    """Append a dated time-series record under <parent>/<id>/history/<key> with a
    35-day TTL (expireAt). Date-keyed so re-running the same day is idempotent."""
    now = datetime.now(timezone.utc)
    payload = {**record, "expireAt": now + timedelta(days=SNAPSHOT_TTL_DAYS)}
    (
        _db().collection(parent_collection).document(parent_id)
        .collection("history").document(key).set(payload)
    )
```
- [ ] Run shared tests; ensure pass. Commit.

### Task A2: `write_satellite_image_history` storage helper

**Files:**
- Modify: `functions/shared/storage_client.py`
- Test: existing storage_client test file.

- [ ] Failing test: `write_satellite_image_history("mt-rainier", "2026-06-14", b"...")` uploads to key `history/mt-rainier/2026-06-14.jpg` in the satellite bucket with `content_type="image/jpeg"`, returns the path. (Top-level `history/` prefix so one lifecycle rule covers all mountains; the existing `{id}/scene.jpg` latest stays outside the prefix.)
- [ ] Implement mirroring `write_satellite_image`, key = `f"history/{mountain_id}/{scene_date}.jpg"`.
- [ ] Run, commit.

### Task A3: Workers append history

**Files:**
- Modify: `functions/snotel_worker/main.py` (after the `snotelData/{id}` `.set`)
- Modify: `functions/nwac_worker/main.py` (after the `nwacForecasts/{zone}` `.set`)
- Modify: `functions/satellite_worker/main.py` (after the `satelliteCache/{id}` `.set`)
- Tests: each worker's test file.

- [ ] SNOTEL: derive a date key from the reading's date if the record carries one, else `datetime.now(PT).date().isoformat()`; call `append_history("snotelData", mountain_id, date_key, record)`. Failing test asserts the history write happens with the right path/key. Implement. (Read the record shape first — do not invent fields.)
- [ ] NWAC: key = the forecast date already on the record (e.g. `record["forecastDate"]` — verify the actual field name); call `append_history("nwacForecasts", zone_id, forecast_date, record)`. Test + implement.
- [ ] Satellite: key = the scene date already resolved by the worker (verify field name, e.g. `scene_date`/`record["sceneDate"]`); call `append_history("satelliteCache", mountain_id, scene_date, record)`. ALSO, when the worker has the scene JPEG bytes (same place it calls `write_satellite_image`), call `write_satellite_image_history(mountain_id, scene_date, jpeg)`. Test + implement. Guard: only when a scene/image actually exists (mirror existing graceful-degradation).
- [ ] Run `cd functions && pytest` (coverage ≥90). Commit.

### Task A4: Terraform — Firestore TTL + GCS lifecycle

**Files:**
- Modify: `terraform/modules/firestore/main.tf`
- Modify: `terraform/modules/storage/main.tf`

- [ ] Add a `google_firestore_field` for the `history` collection group, field `expireAt`, `ttl_config {}` (mirror the existing `snapshots_ttl` resource; same `project`/`database`).
- [ ] Add a `lifecycle_rule` to the satellite bucket: `condition { age = 35  matches_prefix = ["history/"] }  action { type = "Delete" }`. (Scoped to `history/` so the latest `{id}/scene.jpg` + `metadata.json` are NOT deleted.)
- [ ] `terraform -chdir=terraform validate` → Success. Commit.

---

## Cluster B — Daily Outlook UI

### Task B1: Desktop header stretch fix

**Files:**
- Modify: `src/components/project/DailyOutlook.tsx` (the header group `style` at ~line 295)
- Possibly: `src/app/globals.css` (`.daily-group`)
- Test: `src/components/project/__tests__/DailyOutlook.test.tsx`

- [ ] In the `groups.map`, change the group wrapper style so it stretches in stretch mode and stays fixed in scroll mode:
  `style={stretch ? { flex: `${groupW} 1 0` } : { width: groupW, flexShrink: 0 }}`
  (`stretch` is already in scope at render. Inline `flex` overrides the stylesheet's `flex-shrink:0`.)
- [ ] Add/extend a unit test: when the grid is in stretch mode, the header groups carry proportional `flex` (not a fixed px width) so they fill the row in sync with the `fr` grid. (Assert on inline style.)
- [ ] `npm test` (this file) green. Commit.

### Task B2: Stepwise expand/collapse controls

**Files:**
- Modify: `src/components/project/DailyOutlook.tsx`
- Test: `src/components/project/__tests__/DailyOutlook.test.tsx`

- [ ] Add local consts near the top of the component module:
```ts
const RANK: Record<Level, number> = { day: 0, period: 1, hour: 2 };
const COARSER: Record<Level, Level> = { hour: "period", period: "day", day: "day" };
```
- [ ] Replace `cycleDay` with two handlers:
  - `stepUp(g)`: `const next = nextLevelFor(g.level, g); if (next) setPerDay(p => ({ ...p, [g.dateKey]: next }))`.
  - `stepDown(g)`: `target = COARSER[g.level]`; `setPerDay(p => { const o = {...p}; if (RANK[target] <= RANK[globalZoom]) delete o[g.dateKey]; else o[g.dateKey] = target; return o; })`. (Deleting the override when collapsing to/below the global baseline lets the day follow the baseline.)
- [ ] In the header render, show TWO buttons:
  - Collapse (◄): shown when `RANK[g.level] > RANK[globalZoom]` (strictly above the baseline). `aria-label={`Collapse ${g.label} one level`}`. Use a rotated chevron (`className="dg-collapse"` with CSS `transform: rotate(180deg)` on its svg, or an existing left/back icon if present).
  - Expand (►): shown when `nextLevelFor(g.level, g)` is defined. `aria-label` describing the next level (reuse existing wording).
  - Wrap both in a small flex span so they sit together at the group's right edge.
- [ ] Remove the now-unused `showCtrl`/`ctrlLabel`/`Icons.check` collapse-all path (only remove what THIS change orphans).
- [ ] Update the affected unit tests to the two-button model (expand steps one level up; collapse steps one level down; collapse hidden at baseline; expand hidden at finest available). Add a test that from `hour` the collapse button steps to `period` (not all the way to day).
- [ ] Add CSS for `.dg-collapse` rotation if needed (`src/app/globals.css`).
- [ ] `npm test` green. Commit.

---

## Cluster C — Verify

### Task C1: Local gates + Playwright

- [ ] `cd functions && source .venv/bin/activate && pytest` (≥90), `npx tsc --noEmit`, `npm run build`, `npm test` (coverage 90/90/85), `terraform -chdir=terraform validate`.
- [ ] Playwright local (route-mocked) desktop 1280×800 + mobile iPhone 12: open a focused mountain detail, screenshot the Daily Outlook showing (a) full-width stretched headers on desktop, (b) expand a day one level, collapse one level via the back control. Save screenshots. Extend/repair `tests/e2e` as needed; `npm run test:e2e`.

### Task C2: Deploy + live verification

- [ ] `terraform -chdir=terraform apply` (rebuilds web image, restages/deploys the 5 functions with the new history writes, applies the new Firestore TTL field + GCS lifecycle).
- [ ] Trigger refreshes (`POST /api/admin/trigger-refresh?...&type=snotel|nwac|satellite`) and verify history accumulation: a `…/history/{date}` doc exists in Firestore for each source, and a `gs://…-satellite-tiles/history/<id>/<date>.jpg` object exists. Confirm the `expireAt` field is present.
- [ ] `PLAYWRIGHT_BASE_URL=<web_url> npm run test:e2e`; live screenshots of the fixed Daily Outlook (desktop + mobile), both themes.
- [ ] Report results.
