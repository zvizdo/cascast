# Mount Whitney + Catalog-From-Constant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the static mountain catalog from the bundled `src/lib/mountains-data.ts` constant (eliminating per-request Firestore reads on the home/search and detail-metadata paths), and add Mount Whitney — an out-of-NWAC-region California peak that has weather + satellite data but no NWAC avalanche zone and no SNOTEL station.

**Architecture:** The mountain *catalog* (name, coords, elevations, zone/station IDs, region, description) is static reference data already compiled into the web bundle. We make the three web API routes that read the `mountains` Firestore collection for *metadata* (`/api/mountains`, `/api/mountains/[slug]`, `/api/mountains/[slug]/nwac`) read the in-memory constant instead; dynamic per-mountain feeds (conditions, weather blob, snapshots, snotel, nwac, satellite) stay in Firestore. The Python Cloud Functions continue to read the catalog from Firestore (different runtime), so adding a mountain still requires seeding Firestore. Mount Whitney's empty NWAC/SNOTEL fields are handled by (a) skip-guards in the snotel/nwac workers so the scheduled fan-out doesn't error, and (b) the already-graceful UI/API null handling.

**Tech Stack:** Next.js 16 / React 19 / TypeScript Route Handlers, Vitest, Playwright, Python 3.12 Cloud Functions (functions_framework, firebase-admin), Terraform, gcloud.

**Decisions (locked with user 2026-06-16):**
- Cache scope = **catalog only** (no in-process TTL cache, no CDN/rate-limit this round).
- Whitney avalanche = **none** (empty `nwacZone`/`nwacZoneId`).
- Whitney snow = **none** (empty `snotelStation*`).
- Whitney `region` = **`sierra-nevada`**.
- Out-of-region empty fields are represented as **empty strings** (not optional types) — minimal churn; consumers already treat falsy as absent.

---

## Pre-flight

- [ ] **Create a feature branch off `main`** (CLAUDE.md: never commit to `main`; current working tree has the uncommitted `CLAUDE.md` pointer + untracked `references/` from prior work — they should ride along on the branch):

```bash
git checkout -b feat/whitney-and-catalog-cache
git add CLAUDE.md references/
git commit -m "docs: add references/add-mountain.md + CLAUDE.md pointer"
```

(End every commit message in this plan with the Co-Authored-By trailer per repo convention.)

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/lib/mountains-data.ts` | Catalog source of truth + lookup helpers | Add `mountainBySlug`, `mountainsByName`; add Mount Whitney |
| `src/app/api/mountains/route.ts` | List endpoint | Read constant instead of Firestore |
| `src/app/api/mountains/[slug]/route.ts` | Browse aggregate (metadata + dynamic feeds) | Resolve metadata from constant; keep dynamic feeds in Firestore |
| `src/app/api/mountains/[slug]/nwac/route.ts` | Per-feed NWAC | Resolve `nwacZoneId` from constant; guard empty zone |
| `functions/snotel_worker/main.py` | SNOTEL fetch | Skip mountains with empty `snotelStationTriplet` |
| `functions/nwac_worker/main.py` | NWAC capture | Skip mountains with empty `nwacZoneId` |
| `src/lib/__tests__/mountains-data.test.ts` | Catalog invariants | 11 peaks; widen coord bounds; conditional zone/station checks; Whitney case |
| `src/app/api/__tests__/integration.emulator.test.ts` | Emulator integration | Update list count to 11 |
| `CLAUDE.md`, `references/add-mountain.md` | Docs | Reflect catalog-from-constant + out-of-region peaks + Whitney |

Routes NOT changed: `/api/mountains/[slug]/snapshots` (queries the `snapshots` *subcollection*, not the mountain doc), and the `weather`/`snotel`/`satellite` per-feed routes (they read `mountainConditions`/`snotelData`/`satelliteCache` directly, never the mountain doc). The `useMountains`/`useMountain` SWR hooks need NO change (they only call the routes).

---

## Cluster A — Catalog from constant

### Task A1: Catalog lookup helpers

**Files:**
- Modify: `src/lib/mountains-data.ts`
- Test: `src/lib/__tests__/mountains-data.test.ts`

- [ ] **Step 1: Write failing tests.** Append to `src/lib/__tests__/mountains-data.test.ts`:

```ts
import { MOUNTAINS, mountainBySlug, mountainsByName } from "@/lib/mountains-data";
// ^ update the existing top import line to add the two helpers

describe("catalog helpers", () => {
  it("mountainBySlug returns the matching mountain or undefined", () => {
    expect(mountainBySlug("mt-rainier")?.name).toBe("Mount Rainier");
    expect(mountainBySlug("does-not-exist")).toBeUndefined();
  });
  it("mountainsByName returns all peaks sorted by name ascending", () => {
    const names = mountainsByName().map((m) => m.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(mountainsByName()).toHaveLength(MOUNTAINS.length);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npm test -- src/lib/__tests__/mountains-data.test.ts` → FAIL (helpers not exported).
- [ ] **Step 3: Implement.** At the end of `src/lib/mountains-data.ts` (after the `MOUNTAINS` `as const` block), add:

```ts
export const mountainBySlug = (slug: string): Mountain | undefined =>
  MOUNTAINS.find((m) => m.slug === slug);

export const mountainsByName = (): Mountain[] =>
  [...MOUNTAINS].sort((a, b) => a.name.localeCompare(b.name));
```

- [ ] **Step 4: Run, verify pass.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: add mountainBySlug/mountainsByName catalog helpers"`

### Task A2: `/api/mountains` list reads the constant

**Files:**
- Modify: `src/app/api/mountains/route.ts`
- Test: `src/app/api/mountains/__tests__/route.test.ts`

- [ ] **Step 1: Rewrite the test** to assert against the real constant (no Firestore mock). Replace the whole file with:

```ts
import { describe, it, expect } from "vitest";
import { MOUNTAINS } from "@/lib/mountains-data";

describe("GET /api/mountains", () => {
  it("returns all catalog mountains sorted by name, with cache header, from the constant", async () => {
    const { GET } = await import("@/app/api/mountains/route");
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600");
    const body = await res.json();
    expect(body).toHaveLength(MOUNTAINS.length);
    const names = body.map((m: { name: string }) => m.name);
    expect(names).toEqual([...names].sort((a: string, b: string) => a.localeCompare(b)));
    // every entry carries a slug (the catalog uses slug as id)
    expect(body.every((m: { slug?: string }) => typeof m.slug === "string" && m.slug.length > 0)).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail.** `npm test -- src/app/api/mountains/__tests__/route.test.ts` → FAIL (route still queries Firestore; the old mock import is gone so `getDb` is undefined / unsorted result differs).
- [ ] **Step 3: Implement.** Replace `src/app/api/mountains/route.ts` entirely with:

```ts
import { NextResponse } from "next/server";
import { mountainsByName } from "@/lib/mountains-data";

// Catalog is static reference data — served from the in-memory constant (no
// Firestore reads). Firestore's `mountains` collection still backs the Python
// functions; the two are seeded from the same source file.
const CACHE = "public, max-age=300, stale-while-revalidate=600";

export async function GET() {
  return NextResponse.json(mountainsByName(), { headers: { "Cache-Control": CACHE } });
}
```

- [ ] **Step 4: Run, verify pass.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "perf: serve /api/mountains from the bundled catalog constant"`

### Task A3: `/api/mountains/[slug]` resolves metadata from the constant

**Files:**
- Modify: `src/app/api/mountains/[slug]/route.ts`
- Test: `src/app/api/mountains/[slug]/__tests__/route.test.ts`

- [ ] **Step 1: Update the test.** The mountain metadata now comes from the constant, so:
  - The mocked `mountains/<slug>` docs are no longer read for metadata — keep the mocked dynamic docs.
  - Tests must use a slug that exists in the constant (`mt-rainier`) for 200s and a non-existent slug for 404.
  - The test that injected `nwacZoneId: "1130"` via the mocked mountain doc must switch to **mt-rainier's real `nwacZoneId` `"1648"`** (from the constant) and mock `nwacForecasts/1648`.

  Apply these edits to `src/app/api/mountains/[slug]/__tests__/route.test.ts`:
  - In **"returns weather (combined blob), nwac, and snotel for the peak"**: change the `mountains/mt-rainier` mock line's `nwacZoneId: "1130"` → remove it (ignored now), change `"nwacForecasts/1130"` → `"nwacForecasts/1648"`, and `expect(body.nwac.zoneName)` mock value stays but is now keyed at `1648`. Concretely the `docs` map becomes:

```ts
dbHolder.db = makeDb({ docs: {
  "mountainConditions/mt-rainier": { mountainId: "mt-rainier", forecastBlobPath: "blobs/mt-rainier/latest.json", updatedAt: fresh },
  "nwacForecasts/1648": { zoneId: "1648", zoneName: "West Slopes South", season: "winter" },
  "snotelData/mt-rainier": { mountainId: "mt-rainier", stationName: "Paradise" },
} }).db;
```
  and update the assertion `expect(body.nwac.zoneName).toBe("Mt Hood")` → `expect(body.nwac.zoneName).toBe("West Slopes South")`.
  - In every other test, **delete the `"mountains/mt-rainier": {...}` entry** from the `docs` map (metadata now comes from the constant); the `mt-rainier` slug still resolves because it's in `MOUNTAINS`. Leave the `mountainConditions`/`satelliteCache` entries.
  - The **404 test** (`ctx("nope")`) stays — `nope` is not in the constant → 404.

- [ ] **Step 2: Run, verify fail.** `npm test -- src/app/api/mountains/[slug]/__tests__/route.test.ts` → FAIL (route still reads `mountains/mt-rainier`; with that doc removed it now 404s for mt-rainier).
- [ ] **Step 3: Implement.** In `src/app/api/mountains/[slug]/route.ts`:
  - Add import: `import { mountainBySlug } from "@/lib/mountains-data";`
  - Replace the metadata block (the `mtnDoc`/`mtnData`/`mountain` lines) with the constant lookup. The new `GET` body top becomes:

```ts
export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const db = getDb();

  const condDoc = await db.collection("mountainConditions").doc(slug).get();
  const conditions = condDoc.exists
    ? (condDoc.data() as { updatedAt?: unknown; forecastBlobPath?: string })
    : null;

  const satDoc = await db.collection("satelliteCache").doc(slug).get();
  const satellite = satDoc.exists ? satDoc.data() : null;

  const weather = conditions?.forecastBlobPath
    ? await readCombinedBlob(conditions.forecastBlobPath)
    : null;

  const nwacDoc = mountain.nwacZoneId
    ? await db.collection("nwacForecasts").doc(mountain.nwacZoneId).get()
    : null;
  const nwac = nwacDoc?.exists ? nwacDoc.data() : null;

  const snotelDoc = await db.collection("snotelData").doc(slug).get();
  const snotel = snotelDoc.exists ? snotelDoc.data() : null;

  const stale = isStale(conditions?.updatedAt);

  return NextResponse.json(
    serializeTimestamps({ mountain, conditions, satellite, weather, nwac, snotel, stale }),
    { headers: { "Cache-Control": CACHE } },
  );
}
```
  (`mountain.nwacZoneId` is `""` for Whitney → `nwacDoc` is null → `nwac` null. `getDb`, `readCombinedBlob`, `serializeTimestamps`, `isStale`, `toMillis` all remain in use.)

- [ ] **Step 4: Run, verify pass.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "perf: resolve /api/mountains/[slug] metadata from the catalog constant"`

### Task A4: `/api/mountains/[slug]/nwac` resolves zone from the constant + guards empty zone

**Files:**
- Modify: `src/app/api/mountains/[slug]/nwac/route.ts`
- Test: `src/app/api/mountains/[slug]/nwac/__tests__/route.test.ts`

- [ ] **Step 1: Update/extend tests.** Read the existing test file; (a) drop the mocked `mountains/<slug>` doc (zone now comes from the constant), use `mt-rainier` (real zone `1648`) and key `nwacForecasts/1648`; (b) add a test that an out-of-region peer (`mt-whitney`, empty zone) returns `{ season: "summer" }` **without** any Firestore `nwacForecasts` lookup. Add:

```ts
it("returns summer for an out-of-NWAC-region peak (empty zone) without a Firestore lookup", async () => {
  dbHolder.db = makeDb({ docs: {} }).db; // no nwacForecasts docs
  const { GET } = await import("@/app/api/mountains/[slug]/nwac/route");
  const res = await GET(new Request("http://t"), ctx("mt-whitney"));
  const body = await res.json();
  expect(body.season).toBe("summer");
});
```
  (This test depends on Mount Whitney existing in the constant — Task B3 adds it. If running A4 before B3, temporarily assert with any constant peak that has an empty zone; otherwise sequence A4 after B3. Recommended: implement B3 first, then A4. Adjust task order in TodoWrite accordingly.)

- [ ] **Step 2: Run, verify fail.**
- [ ] **Step 3: Implement.** Replace the metadata read + add the empty-zone guard (an empty doc id like `doc("")` throws in Firestore). New file:

```ts
import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebase-admin";
import { serializeTimestamps } from "@/lib/serialize";
import { mountainBySlug } from "@/lib/mountains-data";

const CACHE = "public, max-age=300, stale-while-revalidate=600";
type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const mountain = mountainBySlug(slug);
  if (!mountain) return NextResponse.json({ error: "Mountain not found" }, { status: 404 });
  const { nwacZoneId } = mountain;
  // Out-of-NWAC-region peaks (e.g. Mount Whitney) have no zone — report off-season.
  if (!nwacZoneId) return NextResponse.json({ season: "summer", zoneId: "" }, { headers: { "Cache-Control": CACHE } });

  const db = getDb();
  const fc = await db.collection("nwacForecasts").doc(nwacZoneId).get();
  if (!fc.exists) return NextResponse.json({ season: "summer", zoneId: nwacZoneId }, { headers: { "Cache-Control": CACHE } });
  const data = fc.data() as { season?: string };
  if (data.season === "summer") return NextResponse.json(serializeTimestamps({ ...data, season: "summer" }), { headers: { "Cache-Control": CACHE } });
  return NextResponse.json(serializeTimestamps(data), { headers: { "Cache-Control": CACHE } });
}
```

- [ ] **Step 4: Run, verify pass.**
- [ ] **Step 5: Commit.** `git add -A && git commit -m "perf+fix: nwac route reads zone from constant and guards empty zone"`

---

## Cluster B — Mount Whitney

> Implement **B3 before A4** (A4's new test references the Whitney slug). Suggested overall order: A1, A2, A3, B1, B2, B3, A4, then Cluster C/D.

### Task B1: SNOTEL worker skips peaks with no station

**Files:**
- Modify: `functions/snotel_worker/main.py`
- Test: `functions/snotel_worker/tests/test_main.py`

- [ ] **Step 1: Write the failing test.** Mirror the event-construction + mocking of the sibling `test_handle_message_unknown_mountain_is_noop` in this file. Add:

```python
def test_handle_message_no_station_is_noop(monkeypatch):
    mountain = {"id": "mt-whitney", "snotelStationId": "", "snotelStationTriplet": ""}
    monkeypatch.setattr(main.fc, "get_mountain", lambda _id: mountain)
    db = MagicMock()
    monkeypatch.setattr(main, "get_db", lambda: db)
    calls = []
    monkeypatch.setattr(main, "fetch_snotel", lambda *a, **k: calls.append((a, k)))
    main.handle_message(_event({"mountainId": "mt-whitney"}))  # use this file's existing event builder
    assert calls == []
    db.collection.assert_not_called()
```

- [ ] **Step 2: Run, verify fail.** `cd functions && source .venv/bin/activate && pytest snotel_worker/tests/test_main.py::test_handle_message_no_station_is_noop -p no:cov -o addopts="" -v` → FAIL (worker calls `fetch_snotel` with empty triplet).
- [ ] **Step 3: Implement.** In `functions/snotel_worker/main.py`, immediately after the two lines that assign `station_id` and `triplet`, add:

```python
    if not triplet:
        print(f"snotel_worker: mountain {mountain['id']} has no SNOTEL station, skipping")
        return
```

- [ ] **Step 4: Run, verify pass.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: snotel_worker skips peaks with no SNOTEL station"`

### Task B2: NWAC worker skips peaks with no zone

**Files:**
- Modify: `functions/nwac_worker/main.py`
- Test: `functions/nwac_worker/tests/test_main.py`

- [ ] **Step 1: Write the failing test.** Mirror `test_unknown_mountain_is_noop`. Add:

```python
def test_no_zone_is_noop(monkeypatch):
    mountain = {"id": "mt-whitney", "nwacZoneId": ""}
    monkeypatch.setattr(main.fc, "get_mountain", lambda _id: mountain)
    db = MagicMock()
    monkeypatch.setattr(main, "get_db", lambda: db)
    fetched = []
    monkeypatch.setattr(main.nwac_client, "fetch_forecast", lambda *a, **k: fetched.append(1))
    main.handle_message(_event({"mountainId": "mt-whitney"}))  # use this file's existing event builder
    assert fetched == []
    db.collection.assert_not_called()
```

- [ ] **Step 2: Run, verify fail.** `cd functions && source .venv/bin/activate && pytest nwac_worker/tests/test_main.py::test_no_zone_is_noop -p no:cov -o addopts="" -v` → FAIL (empty `document("")` path / fetch attempted).
- [ ] **Step 3: Implement.** In `functions/nwac_worker/main.py`, immediately after `zone_id = str(mountain["nwacZoneId"])` and **before** `doc_ref = db.collection("nwacForecasts").document(zone_id)`, add:

```python
    if not zone_id:
        print(f"nwac_worker: mountain {mountain['id']} has no NWAC zone, skipping")
        return
```

- [ ] **Step 4: Run, verify pass.** Same command → PASS.
- [ ] **Step 5: Commit.** `git add -A && git commit -m "feat: nwac_worker skips peaks with no NWAC zone"`

### Task B3: Add Mount Whitney to the catalog + update invariants

**Files:**
- Modify: `src/lib/mountains-data.ts`
- Modify: `src/lib/__tests__/mountains-data.test.ts`
- Modify: `src/app/api/__tests__/integration.emulator.test.ts`

> **Data sourcing (per `references/add-mountain.md`):** cross-check each value against two sources before committing. Authoritative summit point (USGS GNIS): **36.5785, −118.2920**, summit **14,505 ft**. Route references: base = Whitney Portal trailhead ≈ **8,360 ft**; mid = Trail Camp ≈ **12,000 ft**. Verify lat/lng/summit against PeakBagger or CalTopo as the independent #2 and record both sources in the commit message. NWAC/SNOTEL intentionally empty (out of region — user decision).

- [ ] **Step 1: Update the invariant tests first.** In `src/lib/__tests__/mountains-data.test.ts`:
  - `toHaveLength(10)` → `toHaveLength(11)`; the unique-slugs `toBe(10)` → `toBe(11)`.
  - Widen the coord bounds to a West-Coast box that includes the Sierra, and make zone/station checks conditional (Whitney is empty). The loop body becomes:

```ts
for (const m of MOUNTAINS) {
  expect(m.lat).toBeGreaterThan(36); expect(m.lat).toBeLessThan(49.5);
  expect(m.lng).toBeLessThan(-118); expect(m.lng).toBeGreaterThan(-124.5);
  expect(m.elevations.summit).toBeGreaterThan(m.elevations.mid);
  expect(m.elevations.mid).toBeGreaterThan(m.elevations.base);
  if (m.nwacZoneId) expect(NWAC_ZONE_IDS.has(m.nwacZoneId)).toBe(true);
  if (m.snotelStationTriplet) expect(m.snotelStationTriplet).toMatch(/^\d+:(WA|OR):SNTL$/);
  expect(m.timezone).toBe("America/Los_Angeles");
}
```
  - Add a Whitney-specific invariant:

```ts
it("Mount Whitney is an out-of-NWAC-region peak with no avalanche/snow station", () => {
  const w = MOUNTAINS.find((m) => m.slug === "mt-whitney");
  expect(w).toBeDefined();
  expect(w!.region).toBe("sierra-nevada");
  expect(w!.nwacZone).toBe(""); expect(w!.nwacZoneId).toBe("");
  expect(w!.snotelStationId).toBe(""); expect(w!.snotelStationTriplet).toBe(""); expect(w!.snotelStationName).toBe("");
});
```

- [ ] **Step 2: Run, verify fail.** `npm test -- src/lib/__tests__/mountains-data.test.ts` → FAIL (length 10, no Whitney).
- [ ] **Step 3: Implement.** Append to the `MOUNTAINS` array in `src/lib/mountains-data.ts` (before the closing `] as const;`):

```ts
  { name:"Mount Whitney", slug:"mt-whitney", lat:36.5785, lng:-118.2920,
    elevations:{base:8360,mid:12000,summit:14505}, nwacZone:"",
    nwacZoneId:"", snotelStationId:"", snotelStationTriplet:"",
    snotelStationName:"", region:"sierra-nevada", timezone:"America/Los_Angeles", // out of NWAC/SNOTEL region — weather+satellite only
    description:"The highest summit in the contiguous United States, in California's Eastern Sierra, climbed via the Mount Whitney Trail from Whitney Portal." },
```

- [ ] **Step 4: Update the emulator integration count.** In `src/app/api/__tests__/integration.emulator.test.ts`, change the list-length assertion `toBe(10)` → `toBe(11)`.
- [ ] **Step 5: Run, verify pass.** `npm test -- src/lib/__tests__/mountains-data.test.ts` → PASS. (Integration test runs under `npm run test:integration` in Cluster C.)
- [ ] **Step 6: Commit.** `git add -A && git commit -m "feat: add Mount Whitney (out-of-NWAC-region; weather+satellite only)"` (include the two data sources in the message body).

---

## Cluster C — Verify, deploy, live-validate

### Task C1: Local quality gates + route-mocked Playwright (regression)

- [ ] **Step 1: Web unit gates.**
  - `npx tsc --noEmit` → clean.
  - `npm run build` → succeeds.
  - `npm test` → all pass, coverage stays ≥ 90/90/85 (lines/functions/branches).
- [ ] **Step 2: Python gates.** `cd functions && source .venv/bin/activate && pytest` → all pass, `--cov-fail-under=90` holds. (If a chained `-p no:cov` run left a stale `.coverage`, delete it first.)
- [ ] **Step 3: Terraform.** `terraform -chdir=terraform validate` → Success (run from repo root).
- [ ] **Step 4: Emulator integration.** `npm run test:integration` → passes with the updated count (11).
- [ ] **Step 5: Route-mocked Playwright (regression).** `npm run test:e2e` (desktop 1280×800 + mobile iPhone 12) → green. This proves the catalog-from-constant refactor didn't break existing mt-rainier flows. Confirm the home search now lists 11 peaks (the list comes from the constant).
- [ ] **Step 6: Commit any test-fixture adjustments** needed to keep e2e green. `git commit -m "test: keep gates green after catalog refactor + Whitney"`

### Task C2: Deploy to Cloud Run + seed Whitney + trigger data

- [ ] **Step 1: Deploy everything.** `terraform -chdir=terraform apply` (SINGLE env, `(default)` DB, bare names). This rebuilds the web image (hash-triggered, includes the new constant + routes) and restages/redeploys the snotel + nwac workers (source changed). Confirm `Apply complete`.
- [ ] **Step 2: Seed the catalog to Firestore** (so the Python orchestrator's `all_mountain_ids` includes Whitney). From repo root, ADC present:

```bash
GCP_PROJECT=mountain-weatherman-app npm run seed:mountains
```
  Expect `Seeded 11 mountains.` (merge upsert — safe to re-run.)

- [ ] **Step 3: Trigger Whitney's weather + satellite** (the only sources Whitney has). Get the URL and POST the admin trigger:

```bash
WEB=$(terraform -chdir=terraform output -raw web_url)
curl -fsS -X POST "$WEB/api/admin/trigger-refresh?mountainId=mt-whitney&type=weather"
curl -fsS -X POST "$WEB/api/admin/trigger-refresh?mountainId=mt-whitney&type=satellite"
```
  (Do NOT trigger snotel/nwac for Whitney — they have no source; the scheduled fan-out will now skip Whitney gracefully thanks to B1/B2.)

- [ ] **Step 4: Verify data landed.** Poll the live API until weather is present (weather worker is quick; satellite may take longer):

```bash
curl -fsS "$WEB/api/mountains" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), [m['slug'] for m in d if m['slug']=='mt-whitney'])"   # 11 and ['mt-whitney']
curl -fsS "$WEB/api/mountains/mt-whitney" | python3 -c "import sys,json; d=json.load(sys.stdin); print('weather' , bool(d.get('weather')), 'nwac', d.get('nwac'), 'snotel', d.get('snotel'))"
```
  Expect: list length 11 including `mt-whitney`; `mt-whitney` browse returns `weather` truthy (after the worker runs), `nwac` null, `snotel` null.

- [ ] **Step 5: Confirm no worker errors after deploy.** Check that the next scheduled snotel/nwac runs skip Whitney without error:

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND (resource.labels.service_name="snotel-worker" OR resource.labels.service_name="nwac-worker") AND severity>=ERROR' --project mountain-weatherman-app --freshness=1d --limit=10
```
  Expect: no Whitney-related errors. (Optionally publish a manual snotel/nwac fan-out and confirm the "has no SNOTEL station/NWAC zone, skipping" log lines appear for Whitney.)

### Task C3: Live Playwright validation (Whitney click-through)

**Files:**
- Create: `tests/e2e/whitney.spec.ts`

- [ ] **Step 1: Write a live e2e spec.** It runs against the deployed URL (real data). It seeds a Whitney pin via localStorage (mirroring `daily-outlook-fixes.spec.ts`'s `addInitScript` pin pattern), loads the focused detail, and asserts: the peak name + `sierra-nevada` region render; the weather/forecast panel renders; the avalanche panel shows its off-season/not-available state; the snowpack panel shows its pending state. Save screenshots to `qa-screenshots/` (gitignored).

```ts
import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("mw.pins")) return;
    localStorage.setItem("mw.pins", JSON.stringify([{
      mountainId: "mt-whitney", name: "Mount Whitney", targetDate: "",
      notes: "", createdAt: new Date().toISOString(),
    }]));
  });
});

test("Mount Whitney: weather renders, avalanche+snow degrade gracefully", async ({ page }, ti) => {
  await page.goto("/mountains/mt-whitney");
  await expect(page.getByText("Mount Whitney")).toBeVisible();
  await expect(page.getByText(/sierra-nevada/i)).toBeVisible();
  // Avalanche off-season + snow pending states (data-independent, always render for Whitney):
  await expect(page.getByText(/Avalanche danger/i)).toBeVisible();
  await expect(page.getByText(/Snowpack/i)).toBeVisible();
  await page.screenshot({ path: `qa-screenshots/whitney-${ti.project.name}.png`, fullPage: true });
});
```

- [ ] **Step 2: Run live (desktop + mobile).**

```bash
PLAYWRIGHT_BASE_URL="$WEB" npm run test:e2e -- whitney.spec.ts
```
  Expect: pass on both projects; screenshots saved. If weather hasn't populated yet, re-trigger and wait (the spec only asserts the data-independent panels + page shell, so it should pass regardless; weather presence is verified via the curl in C2 Step 4).

- [ ] **Step 3: Re-run the full live suite** to confirm no regressions for the existing peaks: `PLAYWRIGHT_BASE_URL="$WEB" npm run test:e2e`.
- [ ] **Step 4: Commit.** `git add -A && git commit -m "test: live Playwright check for Mount Whitney"`

---

## Cluster D — Docs

### Task D1: Update CLAUDE.md + references/add-mountain.md

**Files:**
- Modify: `CLAUDE.md`
- Modify: `references/add-mountain.md`

- [ ] **Step 1: CLAUDE.md.**
  - Add a **P15 progress entry** summarizing: catalog now served from the bundled constant by the web API (`/api/mountains`, `/api/mountains/[slug]` metadata, `/api/mountains/[slug]/nwac`) to eliminate per-request Firestore catalog reads; Firestore `mountains` collection remains the source for the Python functions; **11 mountains** now (added Mount Whitney, an out-of-NWAC-region CA peak with empty NWAC/SNOTEL — weather+satellite only); snotel/nwac workers skip empty station/zone.
  - Update any "10 mountains" / "all 10" phrasings that are now inaccurate to "11" (or "all mountains").
  - Under the web-deploy/cloud-resources notes, state: **adding a mountain requires (a) editing `src/lib/mountains-data.ts`, (b) seeding Firestore (`npm run seed:mountains`), and (c) a web redeploy (`terraform apply`)** — because the web reads the catalog from the bundled constant.
- [ ] **Step 2: references/add-mountain.md.**
  - In §1 "How to add one", make explicit that the web serves the catalog from the constant, so the procedure is **edit constant → seed Firestore → `terraform apply` (web rebuild) → trigger-refresh** (the web redeploy is mandatory, not optional). This supersedes the earlier note.
  - Add a short **"Out-of-NWAC-region peaks"** subsection: NWAC covers WA+OR only and NRCS SNOTEL is sparse outside the Cascades; for such peaks set `nwacZone`/`nwacZoneId`/`snotelStation*` to `""`, add the appropriate `region` value, and rely on the worker skip-guards (the snotel/nwac workers skip empty station/zone; the UI/API already degrade to "not available"/"pending"). Cite **Mount Whitney (`region: sierra-nevada`)** as the worked example, and note weather + satellite are global so they still populate.
  - Add `sierra-nevada` to the `region` enum list in the field table.
  - Update the "10 seed mountains" framing to note the set is now 11 and extensible.
- [ ] **Step 3: Commit.** `git add -A && git commit -m "docs: catalog-from-constant + out-of-region peaks (Whitney) in CLAUDE.md and add-mountain.md"`

---

## Self-Review notes (author)
- **Spec coverage:** catalog-from-constant (A2/A3/A4) ✓; Whitney add (B3) ✓; empty-field worker skips (B1/B2) ✓; empty-zone API guard (A4) ✓; invariants/count updates (B3) ✓; deploy + seed + trigger (C2) ✓; local + live Playwright (C1/C3) ✓; docs (D1) ✓.
- **Ordering caveat:** B3 must precede A4 (A4 test references the Whitney slug) — flagged in Cluster B header and TodoWrite.
- **Empty doc-id hazard:** `Firestore.doc("")` throws — guarded in A4 (per-feed nwac) and avoided in A3 (truthy check) and the workers (B1/B2 early-return). The aggregate `[slug]` route already guards via `mountain.nwacZoneId ? … : null`.
- **Type consistency:** `mountainBySlug`/`mountainsByName` defined in A1 and used in A2/A3/A4; `mt-rainier` real `nwacZoneId` is `"1648"` (used in A3 test fix).
