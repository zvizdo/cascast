# Mountains-First Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the app around the mountain as the only first-class entity — all mountains pulled continuously on a fixed schedule (35-day TTL), pins client-side only (localStorage + shareable `?target=` URL), no projects/login/delete, single Terraform environment.

**Architecture:** Strip the `projects` concept end-to-end. Orchestrator fans out every source to all mountains; the weather worker is mountain-scoped and appends per-mountain history snapshots. The API is read-only and mountain-scoped. The frontend keeps the Cirque panels but is rewired to mountain data + a localStorage pin store; home is a search box, pins live on a "Your Mountains" page. Terraform collapses to one environment.

**Tech Stack:** Next.js 16 / React 19 / TS (Vitest, Playwright), Python 3.12 Cloud Functions Gen2 (firebase-admin 6.5.0, pytest), Terraform 1.14 (google ~> 5.40), GCP (Firestore `(default)`, Pub/Sub, Cloud Scheduler, Cloud Run, Artifact Registry, Cloud Build, Secret Manager).

**Source of truth:** `docs/superpowers/specs/2026-06-16-mountains-first-redesign-design.md`. Where this plan and the spec disagree, the spec wins — stop and flag.

**Branch:** `build/mountains-first-redesign` (already created; never commit to `main`).

**Execution order:** Phase 1 (Python pipeline) → 2 (API) → 3 (frontend) → 4 (Terraform single-env) → 5 (rebuild + live verify) → 6 (docs + gate). Phases 1–4 are pure code/IaC (local, TDD, no GCP). Phase 5 is live GCP.

---

## File structure (what changes)

**Python (`functions/`)**
- `shared/firestore_client.py` — drop project functions; add `write_mountain_snapshot`; keep `get_mountain`, `all_mountain_ids`, `upsert_mountain_conditions`.
- `orchestrator/main.py` — fan out each source type to ALL mountain ids; remove active-project + throttle logic.
- `weather_worker/main.py` — mountain-scoped only (blob + conditions + snapshot); remove project loop.
- `backfill_worker/` — **delete** the whole dir.
- tests under each `*/tests/` updated.

**API (`src/app/api/`)**
- Create `mountains/[slug]/{weather,snapshots,snotel,nwac,satellite,satellite/image}/route.ts` (ported from `projects/[id]/*`).
- Delete `projects/` (all routes). Keep/retarget `admin/trigger-refresh`.
- `src/lib/storage.ts`, `types.ts` adjusted for mountain-scoped reads.

**Frontend (`src/`)**
- New: `lib/pins.ts` (+ `usePins`), `app/your-mountains/page.tsx`, `app/mountains/[slug]/pin/page.tsx`.
- `app/page.tsx` → search home. `app/mountains/[slug]/page.tsx` → mountain detail (browse + focused via `?target`). `app/mountains/[slug]/models/page.tsx` → Model Lab.
- Rename `components/project/ProjectDetail.tsx` → `MountainDetail.tsx`, `ProjectHeader.tsx` → `MountainHeader.tsx` (remove delete/unpin server actions; wire notes + pin to `usePins`).
- Delete `app/projects/`, `app/mountains/page.tsx` (old grid).

**Terraform (`terraform/`)**
- `main.tf`/`variables.tf` — remove workspace/`local.env`/`firestore_database`; bare names; `(default)` DB.
- `modules/{storage,pubsub,iam,scheduler,monitoring,functions,web,firestore}` — drop `env` var + prefixing; remove backfill from functions map; TTL on `snapshots` collection group; remove projects index.

---

## Phase 1 — Python pipeline + schema

### Task 1.1: `firestore_client` — mountain snapshot write, drop project funcs

**Files:**
- Modify: `functions/shared/firestore_client.py`
- Test: `functions/shared/tests/test_firestore_client.py`

- [ ] **Step 1: Write the failing test** — append to the test file:

```python
def test_write_mountain_snapshot_sets_expire_at_35d(monkeypatch):
    add_ref = MagicMock()
    subcoll = MagicMock(); subcoll.add.return_value = (None, add_ref)
    mtn_ref = MagicMock(); mtn_ref.collection.return_value = subcoll
    coll = MagicMock(); coll.document.return_value = mtn_ref
    db = MagicMock(); db.collection.return_value = coll
    monkeypatch.setattr(fc, "_db", lambda: db)

    before = datetime.now(timezone.utc)
    fc.write_mountain_snapshot("mt-rainier", blob_path="forecasts/mt-rainier.json",
                               models={"gfs": {"available": True}})
    db.collection.assert_called_once_with("mountains")
    mtn_ref.collection.assert_called_once_with("snapshots")
    payload = subcoll.add.call_args.args[0]
    assert payload["forecastBlobPath"] == "forecasts/mt-rainier.json"
    assert payload["models"] == {"gfs": {"available": True}}
    delta = payload["expireAt"] - before
    assert timedelta(days=34, hours=23) < delta < timedelta(days=35, hours=1)
```

Also DELETE the now-obsolete project tests in this file: `test_get_active_projects_queries_status_and_target_end`, `test_projects_for_mountain_filters_active_set`, `test_write_weather_snapshot_sets_expire_at_30d`, `test_update_current_summary_merges_into_project`, `test_set_project_refresh_status_writes_status_and_timestamp`.

- [ ] **Step 2: Run, verify the new test fails**

Run: `cd functions && source .venv/bin/activate && pytest shared/tests/test_firestore_client.py -p no:cov -o addopts="" -q`
Expected: FAIL — `write_mountain_snapshot` not defined.

- [ ] **Step 3: Implement** — in `functions/shared/firestore_client.py`, change `SNAPSHOT_TTL_DAYS = 30` → `35`, remove the project functions (`get_active_projects`, `projects_for_mountain`, `write_weather_snapshot`, `update_current_summary`, `set_project_refresh_status`), and add:

```python
def write_mountain_snapshot(mountain_id: str, blob_path: str, models: dict) -> str:
    """Append a forecast snapshot under a mountain with a 35-day TTL (expireAt).
    Returns the new snapshot id. Powers forecast-evolution (accumulates forward)."""
    now = datetime.now(timezone.utc)
    payload = {
        "fetchedAt": now,
        "forecastBlobPath": blob_path,
        "models": models,
        "expireAt": now + timedelta(days=SNAPSHOT_TTL_DAYS),
    }
    _, ref = (
        _db().collection("mountains").document(mountain_id)
        .collection("snapshots").add(payload)
    )
    return ref.id
```
Keep `get_mountain`, `_with_id`, `upsert_mountain_conditions`, `all_mountain_ids` unchanged.

- [ ] **Step 4: Run the file's tests, verify pass**

Run: `cd functions && source .venv/bin/activate && pytest shared/tests/test_firestore_client.py -p no:cov -o addopts="" -q`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add functions/shared/firestore_client.py functions/shared/tests/test_firestore_client.py
git commit -m "feat(functions): mountain-scoped snapshot write (35d TTL); drop project funcs"
```

### Task 1.2: Orchestrator fans out every source to all mountains

**Files:**
- Modify: `functions/orchestrator/main.py`
- Test: `functions/orchestrator/tests/test_main.py`

First **read** the current `functions/orchestrator/main.py` to see the existing publish helper + message shape. The orchestrator receives `{"type": "weather"|"nwac"|"snotel"|"satellite"}` and must publish one refresh message `{"mountainId": <id>}` per mountain to that source's topic. Remove any active-project query, browse/pin distinction, and 6-hour throttle.

- [ ] **Step 1: Write the failing test** — the orchestrator, for `type=weather`, publishes one message per mountain id to the weather-refresh topic. Mirror the existing test style in `functions/orchestrator/tests/test_main.py` (mock `fc.all_mountain_ids` → `["mt-rainier","mt-baker"]` and the publisher; assert 2 publishes to the weather topic with the right `mountainId`). Add an equivalent assertion that no active-project query is made (`fc` has no `get_active_projects` anymore).

```python
def test_weather_fans_out_to_all_mountains(monkeypatch, mock_publisher):
    import orchestrator.main as m  # adjust import to match existing tests
    monkeypatch.setattr(m.fc, "all_mountain_ids", lambda: ["mt-rainier", "mt-baker"])
    m.orchestrate(_pubsub_event({"type": "weather"}))
    topics = [c.args[0] for c in mock_publisher.publish.call_args_list]
    assert mock_publisher.publish.call_count == 2
    # every publish targets the weather-refresh topic with a mountainId payload
```
(Use the same event-construction + import helpers already present in the file; read it first.)

- [ ] **Step 2: Run, verify it fails.**
Run: `cd functions && source .venv/bin/activate && pytest orchestrator/tests/test_main.py -p no:cov -o addopts="" -q` → FAIL.

- [ ] **Step 3: Implement** — rewrite the orchestrate body so each `type` maps to a topic env var and publishes `{"mountainId": mid}` for every `mid in fc.all_mountain_ids()`:

```python
TYPE_TO_TOPIC_ENV = {
    "weather": "TOPIC_WEATHER_REFRESH",
    "nwac": "TOPIC_NWAC_REFRESH",
    "snotel": "TOPIC_SNOTEL_REFRESH",
    "satellite": "TOPIC_SATELLITE_REFRESH",
}

def orchestrate(event):
    msg = _decode(event)            # existing decode helper
    job_type = msg.get("type")
    topic = os.environ[TYPE_TO_TOPIC_ENV[job_type]]
    publisher = _publisher()        # existing publisher singleton
    for mid in fc.all_mountain_ids():
        publisher.publish(topic, json.dumps({"mountainId": mid}).encode())
```
Remove the active-project query, the browse-vs-pinned branching, and the throttle. Keep the existing decode/publisher helpers.

- [ ] **Step 4: Run, verify pass.** Also delete obsolete orchestrator tests that asserted active-project/throttle behavior.
Run the file's tests → PASS.

- [ ] **Step 5: Commit**
```bash
git add functions/orchestrator
git commit -m "feat(functions): orchestrator fans out each source to all mountains (no projects/throttle)"
```

### Task 1.3: Weather worker is mountain-scoped only

**Files:**
- Modify: `functions/weather_worker/main.py`
- Test: `functions/weather_worker/tests/test_main.py`

**Read** the current `weather_worker/main.py` first. It currently: decodes a message, resolves the mountain, fetches Open-Meteo, writes the GCS blob, upserts `mountainConditions`, then loops active projects writing per-project snapshots + currentSummary + refresh status. New behavior: keep fetch + blob + `upsert_mountain_conditions`; replace the project loop with a single `fc.write_mountain_snapshot(mountain_id, blob_path, models)`. The message is `{"mountainId": <id>}`.

- [ ] **Step 1: Write/adjust the failing test** — on a `{"mountainId":"mt-rainier"}` message the worker calls `fc.write_mountain_snapshot("mt-rainier", blob_path, models)` once and `fc.upsert_mountain_conditions(...)` once, and does NOT call any project function. Adapt the existing test (it likely mocks `fc`, the Open-Meteo client, and storage). Remove assertions about per-project snapshots/currentSummary.

- [ ] **Step 2: Run → FAIL** (worker still calls removed project funcs).

- [ ] **Step 3: Implement** — in `handle_message`, after writing the blob and upserting conditions, replace the active-project loop with:
```python
fc.write_mountain_snapshot(mountain_id, blob_path=blob_path, models=models)
```
Remove imports/usages of the removed `fc` project functions and any `currentSummary`-for-target computation that only existed for projects (the per-mountain `current` rollup for the browse headline is the `upsert_mountain_conditions` summary — keep that).

- [ ] **Step 4: Run → PASS** (full `weather_worker` test file).

- [ ] **Step 5: Commit**
```bash
git add functions/weather_worker
git commit -m "feat(functions): weather worker writes per-mountain snapshot only (no projects)"
```

### Task 1.4: Delete `backfill_worker`

**Files:** Delete `functions/backfill_worker/` entirely.

- [ ] **Step 1: Remove the directory + its staging entries**
```bash
git rm -r functions/backfill_worker
```
Edit `scripts/stage-functions.sh`: remove `backfill_worker` from the worker loop and delete the `backfill_worker/weather_worker` self-package block (the lines vendoring weather_worker into backfill). Edit `.gitignore`: remove the `functions/backfill_worker/...` ignore lines.

- [ ] **Step 2: Verify no references remain**
Run: `grep -rn "backfill" functions scripts --include=*.py --include=*.sh | grep -v tests` → expect no live references (only possibly comments; remove them).

- [ ] **Step 3: Run the full Python suite**
Run: `cd functions && source .venv/bin/activate && rm -f .coverage && pytest`
Expected: PASS, coverage ≥ 90% (the removed code + tests drop out cleanly).

- [ ] **Step 4: Commit**
```bash
git add -A functions scripts .gitignore
git commit -m "chore(functions): delete backfill_worker (evolution accumulates forward)"
```

### Task 1.5: NWAC worker consumes `{mountainId}` (resolve zone from mountain)

**Files:** `functions/nwac_worker/main.py` + its test. The orchestrator now publishes `{"mountainId": <id>}` to the nwac topic (not `{"zoneId"}`). Update `handle_message`: replace `zone_id = str(payload["zoneId"])` with resolving the mountain (`mtn = fc.get_mountain(payload["mountainId"])`) and `zone_id = str(mtn["nwacZoneId"])`. Keep the existing idempotency (`_already_captured_today`) and write to `nwacForecasts/{zoneId}` — mountains sharing a zone are naturally deduped by the skip. Update the test to send `{"mountainId":"mt-rainier"}` and stub `fc.get_mountain` → a doc with `nwacZoneId`. TDD: failing test → implement → pass → commit.

### Task 1.6: SNOTEL worker consumes `{mountainId}` (resolve station from mountain)

**Files:** `functions/snotel_worker/main.py` + its test. Replace `station_id = str(payload["stationId"])` with `mtn = fc.get_mountain(payload["mountainId"])`, `station_id = str(mtn["snotelStationId"])` (+ `snotelStationTriplet` from the mountain if used). Keep the write to `snotelData/{mountainId}` (or existing key). TDD as above.

> (weather_worker and satellite_worker already consume `{"mountainId"}` — no message-shape change there.)

---

## Phase 2 — API (read-only, mountain-scoped)

> Pattern: each `projects/[id]/X` route reads project → derives `mountainId` → reads data. The new `mountains/[slug]/X` route uses `slug` directly as the mountain id. **Read each existing `projects/[id]/*` route first** and port it, swapping the project lookup for `slug` and the snapshot source from `projects/{id}/weatherSnapshots` to `mountains/{slug}/snapshots`.

### Task 2.1: Mountain weather + snapshots routes

**Files:**
- Create: `src/app/api/mountains/[slug]/weather/route.ts`, `src/app/api/mountains/[slug]/snapshots/route.ts`
- Reference: `src/app/api/projects/[id]/weather/route.ts`, `…/snapshots/route.ts`, `src/lib/storage.ts`
- Test: `src/app/api/mountains/[slug]/weather/__tests__/route.test.ts` (+ snapshots)

- [ ] **Step 1: Write failing tests** — mirror the existing `projects/[id]/weather` and `/snapshots` route tests, but with the handler reading by `slug` (mock `getDb`/storage). `weather` returns the latest forecast blob for the mountain; `snapshots` returns the `mountains/{slug}/snapshots` history ordered by `fetchedAt` desc. Reuse the test scaffolding from the project route tests verbatim, changing the param from `{ id }` to `{ slug }` and the collection path.

- [ ] **Step 2: Run → FAIL** (routes don't exist).

- [ ] **Step 3: Implement** — port the two routes. `weather`: read `mountains/{slug}` (or `mountainConditions/{slug}`) for the latest `forecastBlobPath`, stream/parse the GCS blob, return it (same JSON shape as the old project weather route). `snapshots`:
```ts
const snaps = await getDb()
  .collection("mountains").doc(slug)
  .collection("snapshots").orderBy("fetchedAt", "desc").get();
return Response.json(snaps.docs.map(serializeSnap), { headers: { "Cache-Control": "no-store" } });
```
Match the existing serializer (`src/lib/serialize.ts`) and response headers.

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**
```bash
git add src/app/api/mountains/[slug]/weather src/app/api/mountains/[slug]/snapshots
git commit -m "feat(api): mountain-scoped weather + snapshots routes"
```

### Task 2.2: Mountain snotel, nwac, satellite, satellite/image routes

**Files:**
- Create: `src/app/api/mountains/[slug]/{snotel,nwac,satellite,satellite/image}/route.ts`
- Reference: the matching `projects/[id]/*` routes.
- Test: a `__tests__/route.test.ts` beside each.

- [ ] **Step 1: Write failing tests** — port each project route test to `slug`. For `satellite/image`, mirror the GCS-streaming test (content-type, 404 fallback). For `nwac`, the mountain → zone mapping comes from `mountains-data` (same as today's project route derived it from the project's mountain).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — port the four routes, reading by `slug`. `snotel` → `snotelData/{slug}`; `nwac` → resolve zone from mountain metadata → `nwacForecasts/{zoneId}`; `satellite` → `satelliteCache/{slug}`; `satellite/image` → stream `gs://…-satellite-tiles/{slug}/scene.jpg`.
- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit**
```bash
git add src/app/api/mountains/[slug]/snotel src/app/api/mountains/[slug]/nwac src/app/api/mountains/[slug]/satellite
git commit -m "feat(api): mountain-scoped snotel/nwac/satellite routes"
```

### Task 2.3: Delete project API + retarget admin trigger

**Files:**
- Delete: `src/app/api/projects/` (entire tree).
- Modify: `src/app/api/admin/trigger-refresh/route.ts` (accept `{ mountainId }`, publish to the source topic) — or delete if unused.
- Modify: `src/lib/storage.ts`, `src/lib/types.ts` — remove project types/helpers; keep mountain + snapshot + forecast types.

- [ ] **Step 1: Remove project routes**
```bash
git rm -r src/app/api/projects
```
- [ ] **Step 2: Fix fallout** — `grep -rn "api/projects\|/projects/" src --include=*.ts --include=*.tsx` and remove/replace references. Update `types.ts` to drop `Project` types (keep `Mountain`, `Snapshot`, `Forecast`, `CurrentSummary`). Update `admin/trigger-refresh` to publish `{mountainId}` to the chosen topic.
- [ ] **Step 3: Typecheck + tests**
Run: `npm run build` (tsc) — expect it to surface any missed references; fix them. Then `npm test`.
Expected: build clean; tests pass (some project-route tests are deleted with their routes).
- [ ] **Step 4: Commit**
```bash
git add -A src
git commit -m "feat(api): remove project routes/types; retarget admin trigger to mountainId"
```

---

## Phase 3 — Frontend (pin store, search home, Your Mountains, detail)

### Task 3.1: Local pin store + `usePins`

**Files:**
- Create: `src/lib/pins.ts`
- Test: `src/lib/__tests__/pins.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readPins, addPin, removePin, updatePin, getPin } from "@/lib/pins";

beforeEach(() => localStorage.clear());

describe("pins store", () => {
  it("adds and reads a pin", () => {
    addPin({ mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-19", notes: "" });
    const pins = readPins();
    expect(pins).toHaveLength(1);
    expect(pins[0].mountainId).toBe("mt-rainier");
    expect(pins[0].createdAt).toBeTruthy();
  });
  it("upserts by mountainId (no duplicates)", () => {
    addPin({ mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-19", notes: "" });
    addPin({ mountainId: "mt-rainier", name: "Mount Rainier", targetDate: "2026-06-20", notes: "x" });
    expect(readPins()).toHaveLength(1);
    expect(getPin("mt-rainier")?.targetDate).toBe("2026-06-20");
  });
  it("updates notes and removes", () => {
    addPin({ mountainId: "mt-baker", name: "Mount Baker", targetDate: "2026-07-01", notes: "" });
    updatePin("mt-baker", { notes: "bring crampons" });
    expect(getPin("mt-baker")?.notes).toBe("bring crampons");
    removePin("mt-baker");
    expect(readPins()).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `src/lib/pins.ts`**

```ts
export type Pin = {
  mountainId: string;
  name: string;
  targetDate: string; // YYYY-MM-DD
  notes: string;
  createdAt: string;
};

const KEY = "mw.pins";
const isBrowser = () => typeof window !== "undefined";
const listeners = new Set<() => void>();

export function readPins(): Pin[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Pin[]) : [];
  } catch {
    return [];
  }
}

function write(pins: Pin[]) {
  if (!isBrowser()) return;
  window.localStorage.setItem(KEY, JSON.stringify(pins));
  listeners.forEach((l) => l());
}

export function getPin(mountainId: string): Pin | undefined {
  return readPins().find((p) => p.mountainId === mountainId);
}

export function addPin(p: Omit<Pin, "createdAt">) {
  const pins = readPins().filter((x) => x.mountainId !== p.mountainId);
  pins.push({ ...p, createdAt: new Date().toISOString() });
  write(pins);
}

export function updatePin(mountainId: string, patch: Partial<Omit<Pin, "mountainId" | "createdAt">>) {
  write(readPins().map((p) => (p.mountainId === mountainId ? { ...p, ...patch } : p)));
}

export function removePin(mountainId: string) {
  write(readPins().filter((p) => p.mountainId !== mountainId));
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
```

- [ ] **Step 4: Add the `usePins` hook** (in the same file) using `useSyncExternalStore`:
```ts
import { useSyncExternalStore } from "react";
export function usePins(): Pin[] {
  return useSyncExternalStore(
    (cb) => subscribe(cb),
    () => JSON.stringify(readPins()),  // snapshot must be referentially stable
    () => "[]",
  ) ? readPins() : readPins();
}
```
(If the stringify-snapshot pattern is awkward, store a cached array and bump it on write; the test in Step 1 covers the store functions, which is the critical logic.)

- [ ] **Step 5: Run → PASS, then commit**
```bash
git add src/lib/pins.ts src/lib/__tests__/pins.test.ts
git commit -m "feat(web): client-side pin store (localStorage) + usePins"
```

### Task 3.2: Search home

**Files:**
- Modify: `src/app/page.tsx` (replace dashboard with search home)
- Reference: the existing `MountainSearch` combobox (`grep -rn "MountainSearch" src` to locate it; it was built in P6/P8).
- Test: `src/app/__tests__/home.test.tsx` (or adjust existing)

- [ ] **Step 1: Write failing test** — the home renders the search combobox; typing <3 chars shows no options; ≥3 chars filters; selecting navigates to `/mountains/[slug]`. If `MountainSearch` already enforces the 3-char threshold, assert via it; otherwise add the threshold to `MountainSearch`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — `page.tsx` becomes a client component rendering a centered search (`MountainSearch`) over the full mountain list (`GET /api/mountains` via SWR or a server fetch passed in). On select → `router.push(\`/mountains/${slug}\`)`. Ensure ≥3-char gating lives in `MountainSearch` (add it there if missing; keep its existing a11y/combobox attributes).
- [ ] **Step 4: Run → PASS, commit**
```bash
git add src/app/page.tsx src/components/shared src/app/__tests__
git commit -m "feat(web): search-first home (>=3 char suggestions)"
```

### Task 3.3: Rename detail components; mountain detail (browse + focused)

**Files:**
- Rename: `src/components/project/ProjectDetail.tsx` → `MountainDetail.tsx`; `ProjectHeader.tsx` → `MountainHeader.tsx`. Keep the other `components/project/*` panels (rename the dir to `components/mountain/` for clarity; update imports).
- Modify: `src/app/mountains/[slug]/page.tsx` to render `MountainDetail` with the mountain + an optional `target` from `searchParams`.
- Test: update `components/.../__tests__/ProjectDetail.test.tsx` → `MountainDetail.test.tsx`.

- [ ] **Step 1: Move + rename** with `git mv`, then update all imports (`grep -rn "components/project" src`). Rename the symbols `ProjectDetail`→`MountainDetail`, `ProjectHeader`→`MountainHeader`.
- [ ] **Step 2: Rewire props** — `MountainDetail` takes `{ mountain, target?: string }` instead of a `project`. Data fetches use `/api/mountains/[slug]/*`. The header drops Delete/Unpin server actions; it shows a **Pin** button (→ `/mountains/[slug]/pin`) when not pinned, or "Edit pin"/notes when `target` present. Notes read/write via `usePins` (Task 3.1), not the API.
- [ ] **Step 3: Gate focused-only UI on `target`** — in `MountainDetail`, only render the freezing-hero **target highlight**, the forecast-evolution chart, and the Notes panel when `target` is set; otherwise show the neutral browse layout (§5 of the spec). Beyond-window target → the calm "tracking begins as your date nears" state (reuse `PendingState`/a new copy).
- [ ] **Step 4: Update tests** — adapt `MountainDetail.test.tsx` to the new props; assert browse (no target) hides evolution/notes and focused (with target) shows them + highlights the day. Reuse the existing assertions where possible.
- [ ] **Step 5: Build + test**
Run: `npm run build && npm test` → clean/pass.
- [ ] **Step 6: Commit**
```bash
git add -A src
git commit -m "feat(web): MountainDetail/Header (browse vs focused via ?target); notes via local pin"
```

### Task 3.4: Pin screen + Your Mountains + Model Lab move

**Files:**
- Create: `src/app/mountains/[slug]/pin/page.tsx`, `src/app/your-mountains/page.tsx`.
- Move: `src/app/projects/[id]/models/page.tsx` → `src/app/mountains/[slug]/models/page.tsx`.
- Delete: `src/app/projects/`, `src/app/mountains/page.tsx` (old grid), `src/app/projects/new`.
- Modify: nav (the brand/header nav component) → `[Search] [Your Mountains]`.
- Test: `src/app/your-mountains/__tests__/page.test.tsx`, `src/app/mountains/[slug]/pin/__tests__/page.test.tsx`.

- [ ] **Step 1: Pin screen** — failing test first: renders a date input + notes textarea; submitting calls `addPin` and navigates to `/mountains/[slug]?target=<date>`. Implement as a client component using `addPin` from `@/lib/pins` + `useRouter`. Pre-fill from an existing pin if present (edit mode).
- [ ] **Step 2: Your Mountains** — failing test first: with no pins, shows empty state + "Pin a mountain" CTA (→ home); with pins, shows a tile per pin (name + target date + a link to `/mountains/[slug]?target=<date>`), and a remove control calling `removePin`. Implement using `usePins`.
- [ ] **Step 3: Model Lab move** — `git mv` the models page to `mountains/[slug]/models/page.tsx`; rewire to mountain data + optional `?target`; evolution chart shows a "pin a date" prompt when no target.
- [ ] **Step 4: Remove old routes + fix nav** — `git rm -r src/app/projects src/app/mountains/page.tsx`; update the nav component to the two links; brand → `/`. `grep -rn "/projects\|/mountains\"" src` and fix.
- [ ] **Step 5: Build + test**
Run: `npm run build && npm test` → clean/pass (coverage ≥ 90/90/85).
- [ ] **Step 6: Commit**
```bash
git add -A src
git commit -m "feat(web): pin screen, Your Mountains page, Model Lab moved; remove project routes + old grid"
```

### Task 3.5: Complete local UI QA suite (Playwright)

**Files:**
- Rewrite/replace: `tests/e2e/*.spec.ts` for the new flows (delete specs that reference `/projects/*` or server pins).
- Modify: `config/playwright.config.ts` (local `webServer` points the app at a seeded Firebase emulator so data is deterministic).
- Create: `tests/e2e/_seed.ts` or reuse `scripts/seed-emulator.ts` adapted to the new schema (mountains + one `mountains/{id}/snapshots` doc + `snotelData`/`nwacForecasts`/`satelliteCache`), so weather-dependent panels render locally without the cloud.

This is the **complete local UI QA**: it must click through every new flow, not just assert text. Cover, across desktop (1280×800) + mobile (iPhone 12):

- **Search home:** typing <3 chars shows no suggestions; ≥3 chars filters; selecting navigates to `/mountains/[slug]`.
- **Browse (no target):** conditions + 7-day outlook + avalanche + snowpack + satellite + Model Lab link render; NO evolution chart, NO notes, NO single target verdict; units toggle + theme work.
- **Pin flow:** from browse, click **Pin** → pin screen → set a target date + notes → submit → lands on `/mountains/[slug]?target=…` focused view.
- **Focused view:** target day highlighted; forecast-evolution present (or the "pin a date"/"tracking begins" state when out of range); notes shown and editable (edit persists via localStorage on reload).
- **Out-of-range target:** pin a date >7 days out → calm "tracking begins as your date nears" state, not empty panels.
- **Your Mountains:** empty state + CTA when no pins; after pinning, a tile appears (name + target date); clicking the tile opens the focused view; removing the pin clears the tile.
- **Already-pinned browse:** opening a pinned mountain from search shows the neutral browse + a "You've pinned this · {date} →" link to the focused view.
- **Shareable URL:** navigating directly to `/mountains/[slug]?target=…` (fresh context, empty localStorage) renders the focused view (target from URL); notes are empty (device-local).
- **Model Lab:** `/mountains/[slug]/models` renders multi-model + hourly grid; evolution chart prompts to pin when no `?target`.
- Screenshot each major screen (desktop + mobile) into the Playwright report.

- [ ] **Step 1: Adapt the emulator seed** to the new schema (mountains + a snapshot under `mountains/{id}/snapshots` with `models` day-rows + `expireAt`; keep `snotelData`/`nwacForecasts`/`satelliteCache`). Drop all `projects` fixtures. Use near-today dates so weather panels populate.
- [ ] **Step 2: Wire `config/playwright.config.ts`** so the local `webServer` runs the app with `FIRESTORE_EMULATOR_HOST` set and the seed applied before tests (e.g. a `globalSetup` that boots the emulator + seeds, or document running `firebase emulators:exec`). The pinned flows need no server data (localStorage).
- [ ] **Step 3: Write the specs** covering every bullet above (one spec file per area: `search.spec.ts`, `browse.spec.ts`, `pin-flow.spec.ts`, `focused.spec.ts`, `your-mountains.spec.ts`, `shareable.spec.ts`, `model-lab.spec.ts`, `states.spec.ts`). Use role-based locators + `localStorage` assertions for pins.
- [ ] **Step 4: Run locally, all green**
Run: `npm run test:e2e`
Expected: all specs pass on desktop + mobile; screenshots captured. Fix real issues found (this is QA — failures mean the UI is wrong, fix the component).
- [ ] **Step 5: Commit**
```bash
git add tests/e2e config/playwright.config.ts scripts/seed-emulator.ts
git commit -m "test(e2e): complete local UI QA for the mountains-first flows"
```

---

## Phase 4 — Terraform (single environment)

### Task 4.1: De-workspace the root + modules

**Files:**
- Modify: `terraform/main.tf`, `terraform/variables.tf`, `terraform/outputs.tf`, and every module's `variables.tf`/`main.tf` that took `env`.

- [ ] **Step 1: Root** — in `terraform/main.tf` remove the `locals { env ... firestore_database ... }`, the `terraform_data.workspace_guard`, and all `local.env`/`local.firestore_database` usages. Pass nothing for `env`. Budget is always created (drop the prod-gate). `topic_paths` keys become unprefixed: `projects/${var.project_id}/topics/${k}`.
- [ ] **Step 2: Modules** — remove the `env` variable + `${var.env}-`/`${var.env}` prefixing from `modules/{storage,pubsub,iam,scheduler,monitoring,functions,web,firestore}`. Resource names become bare (`weather-worker`, `orchestrate`, `${project}-weather-data`, `mtn-weather-web`, `web` AR repo, `cdse-client-id`, etc.). `firestore` module: `name = "(default)"` (drop `database_name` var). `functions` module: drop `firestore_database` var + the `FIRESTORE_DATABASE` env entry (default DB needs no override) OR set `FIRESTORE_DATABASE="(default)"` explicitly — prefer dropping it and letting the client default. Remove `backfill-worker` from the `local.functions` map.
- [ ] **Step 3: Firestore TTL on snapshots** — in `modules/firestore/main.tf`, replace the projects index + the `weatherSnapshots` TTL with a TTL on the `snapshots` collection group:
```hcl
resource "google_firestore_field" "snapshots_ttl" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "snapshots"
  field      = "expireAt"
  ttl_config {}
}
```
Remove `google_firestore_index.projects_active`.
- [ ] **Step 4: web module** — remove `firestore_database` var + the `FIRESTORE_DATABASE` Cloud Run env (or set `(default)`); names become `mtn-weather-web`, repo `web`.
- [ ] **Step 5: fmt + validate**
Run: `terraform -chdir=terraform fmt -recursive && terraform -chdir=terraform validate`
Expected: `Success! The configuration is valid.` (validate runs without selecting a workspace; there are no workspaces now.)
- [ ] **Step 6: Commit**
```bash
git add terraform
git commit -m "feat(infra): collapse to single environment (no workspaces/env-prefixing/named DB); snapshots TTL; drop backfill+projects index"
```

---

## Phase 5 — Rebuild + live verification (LIVE GCP)

> GCP is currently empty (clean slate). Target `--project mountain-weatherman-app` explicitly.

### Task 5.1: Bootstrap state bucket + init

- [ ] **Step 1: Re-create the tfstate bucket**
```bash
gcloud storage buckets create gs://mountain-weatherman-app-tfstate --project mountain-weatherman-app --location us-west1 --uniform-bucket-level-access
gcloud storage buckets update gs://mountain-weatherman-app-tfstate --versioning
```
- [ ] **Step 2: Init**
Run: `terraform -chdir=terraform init` → success (fresh empty state).

### Task 5.2: Apply (with CDSE secret bootstrap)

- [ ] **Step 1: Targeted apply of the secret containers**
```bash
terraform -chdir=terraform apply -auto-approve \
  -target=module.functions.google_secret_manager_secret.cdse_client_id \
  -target=module.functions.google_secret_manager_secret.cdse_client_secret
```
- [ ] **Step 2: Seed the CDSE secret values** (from `NOTES.md`; never write to a file):
```bash
P=mountain-weatherman-app
printf '%s' "<CDSE_CLIENT_ID>"     | gcloud secrets versions add cdse-client-id     --project $P --data-file=-
printf '%s' "<CDSE_CLIENT_SECRET>" | gcloud secrets versions add cdse-client-secret --project $P --data-file=-
```
- [ ] **Step 3: Full apply**
Run: `terraform -chdir=terraform apply` → review (5 functions, Cloud Run, buckets, topics, scheduler, TTL, monitoring), `yes`. Expected: `Apply complete!` with `web_url`.

### Task 5.3: Seed mountains + trigger pipeline

- [ ] **Step 1: Seed the 10 mountains into `(default)`**
```bash
GCP_PROJECT=mountain-weatherman-app npm run seed:mountains
```
Expected: `Seeded 10 mountains.`
- [ ] **Step 2: Trigger each source once**
```bash
for t in weather nwac snotel satellite; do
  gcloud pubsub topics publish orchestrate --project mountain-weatherman-app --message "{\"type\":\"$t\"}"
done
```
- [ ] **Step 3: Verify data flows** — after ~90s:
```bash
URL=$(terraform -chdir=terraform output -raw web_url)
curl -s "$URL/api/mountains" | head -c 200
curl -s "$URL/api/mountains/mt-rainier/weather" | head -c 200
curl -s "$URL/api/mountains/mt-rainier/snapshots" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)),"snapshots")'
```
Expected: mountains list non-empty; weather blob present; ≥1 snapshot.

### Task 5.4: Thorough LIVE QA against the deployed URL (Playwright)

Two parts: (A) run the full e2e suite against live, then (B) an interactive click-through driving real pins and visually verifying correctness.

- [ ] **Step 1: Run the full e2e suite against live**
```bash
URL=$(terraform -chdir=terraform output -raw web_url)
PLAYWRIGHT_BASE_URL="$URL" npm run test:e2e
```
The suite (Phase 3.5) runs against the deployed app reading the real pulled cloud data; pins are client-side so they exercise live. Expected: pass on desktop + mobile. Use a generous expect-timeout for the remote run (Cloud Run cold starts) — e.g. set `expect.timeout`/`retries` when `PLAYWRIGHT_BASE_URL` is set.

- [ ] **Step 2: Interactive live click-through** (Playwright MCP browser against the live URL). Drive the real product and verify each step renders correctly (snapshot/screenshot each):
  1. Open `/` → search "rai" → suggestion appears → click Rainier → browse view renders (current + 7-day + avalanche + snowpack + satellite).
  2. Click **Pin** → set a near-term target (e.g. today+3) + a note → submit → focused view: target day highlighted, evolution present, the note shown.
  3. Reload the focused URL → note + target persist (localStorage); the `?target=` is in the URL.
  4. Go to **Your Mountains** → the Rainier tile shows with the target date → click it → focused view opens.
  5. Pin a **second** mountain (e.g. Baker) with a target **>7 days out** → focused view shows the "tracking begins as your date nears" state (not blank).
  6. Open a third mountain via search that you have NOT pinned → neutral browse (no evolution/notes); confirm no "pinned" banner.
  7. Open a mountain you HAVE pinned via search → neutral browse + the "You've pinned this · {date} →" link.
  8. Remove a pin from Your Mountains → tile disappears; reload → still gone.
  9. Open `/mountains/mt-rainier/models` → Model Lab renders (multi-model + hourly); without `?target` the evolution chart shows the "pin a date" prompt.
  10. Confirm there are **no** `/projects` routes (navigating to `/projects` 404s) and the network tab shows pins are NOT persisted to any API.
- [ ] **Step 3: Record results** — note any defect found and fix it (re-deploy via `terraform apply` if a code fix is needed), then re-verify the affected step. Capture screenshots of the key screens (desktop + mobile viewport) for the final report.

---

## Phase 6 — Docs + final gate

### Task 6.1: Update CLAUDE.md + README

- [ ] **Step 1** — In `CLAUDE.md`: replace the dual-env/workspace deploy guidance with single-env (`terraform apply`, `(default)` DB, bare names, 5 functions, no backfill, no projects, local pins). Add a `P13 Mountains-first redesign` progress entry summarizing the model shift. In `README.md`: update architecture + deploy + the data model (mountains/snapshots, local pins).
- [ ] **Step 2: Commit**
```bash
git add CLAUDE.md README.md
git commit -m "docs: mountains-first single-env model + deploy workflow"
```

### Task 6.2: Final quality gate

- [ ] **Step 1: Run every gate**
```bash
npm run build && npm test
cd functions && source .venv/bin/activate && pytest && cd ..
terraform -chdir=terraform validate
```
Expected: web build clean; web tests ≥90/90/85; pytest ≥90; terraform valid.
- [ ] **Step 2: Confirm clean tree + the live URL**
```bash
git status
terraform -chdir=terraform output -raw web_url
```
- [ ] **Step 3: Acceptance** — from the deployed app: search a mountain → browse (no target) → pin (local, target+notes) → lands focused (highlight + evolution prompt/data + notes) → appears on Your Mountains. Confirm no `/projects` routes exist and nothing is stored server-side for pins.

---

## Self-review notes (plan author)

- **Spec coverage:** model shift (P1+P2+P3), nav/routes (P3.2–3.4), pin model (P3.1), browse vs focused (P3.3), pipeline (P1.2–1.4), Firestore schema + TTL (P1.1, P4.1), API (P2), frontend (P3), infra single-env (P4), quotas (spec §11; no code), rebuild+seed (P5), gates (P6). All covered.
- **Removals:** projects collection/CRUD (P2.3), active-project orchestration/throttle (P1.2), backfill (P1.4), server pin/delete (P3.3–3.4), dual-env (P4.1). Covered.
- **Type consistency:** `Pin` shape (mountainId/name/targetDate/notes/createdAt) used consistently in P3.1/3.3/3.4; `write_mountain_snapshot(mountain_id, blob_path, models)` consistent P1.1↔P1.3; mountain-scoped routes `mountains/[slug]/*` consistent P2↔P3.
- **Known read-firsts:** orchestrator/weather_worker mains and each `projects/[id]/*` route must be read before porting (their exact decode/publish/serialize helpers are reused). Flagged in-task.

## Corrections discovered during execution

- **(C1) nwac/snotel workers** must accept `{"mountainId"}` (orchestrator now sends that to all topics) → added Tasks 1.5/1.6.
- **(C2) Snapshot `models` must hold PER-DAY rows for ALL forecast days**, not a single target-day summary. Evolution is now for a client-chosen target date (any day in range), so each `mountains/{id}/snapshots` doc must let the frontend pick the target day's predicted value from history. **In Task 3.3** (wiring the evolution chart): verify `forecast-select`'s needs against the snapshot shape; if `weather_worker` currently stores a single-day summary (`all_model_summaries(blob, today)`), change `write_mountain_snapshot` + the worker to store the full multi-day per-model rows, and reconcile `src/lib/forecast-select.ts` + `types.ts`. Safe to fix in Phase 3 since no data accumulates until the Phase 5 deploy. Also: snapshots no longer have a `source` field (no backfill) — treat all as `"live"` (or drop the field) in `forecast-select`/`types`. **Also cap the `mountains/[slug]/snapshots` route** (currently uncapped) at the most-recent ~240 by `fetchedAt desc` (covers the in-window evolution; avoids returning ~840 docs).
- **(C3) Phase 2.3 cleanup also covers** `src/lib/pubsub.ts` (drop `backfill-refresh` LogicalTopic + `BackfillRefreshMessage`) and the `functions/shared/tests/test_pubsub_client.py` backfill-refresh assertion.
- **(C4) `src/app/api/mountains/[slug]/route.ts` reads `snotelData/{snotelStationId}`** (line ~62) — STALE: the snotel worker now writes `snotelData/{mountainId}` (Task 1.6). Fix in Task 2.3: either read `snotelData/{slug}` there, or drop the embedded snotel from the detail route and rely on the dedicated `/snotel` route (the SnowpackPanel uses the dedicated route). Update its test accordingly.
