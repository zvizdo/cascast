# Phase 2A — Safety Data Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the six on-demand, mountain-scoped Safety API route handlers (AirNow air quality, NWS+SPC storm alerts, HANS volcano, ComCat earthquakes, NPS park alerts, and a lightweight hazards-summary roll-up), the per-mountain catalog fields that gate them, and the two runtime secrets (AirNow + NPS keys) in Secret Manager + Cloud Run — so Phase 2B can build the Safety tab panels + AQI/Storm chips against a stable read-only API.

**Architecture:** Each handler is a thin Next.js Route Handler under `src/app/api/mountains/[slug]/…` that resolves the mountain from the bundled catalog constant, calls the external API server-side (injecting hidden keys / required headers), normalizes the response to a project TS type, stamps source provenance + freshness, and returns JSON with a `Cache-Control`. **No scheduled workers, no Pub/Sub, no Firestore writes** — the hazard APIs are range-queryable on demand. A shared `src/lib/hazards/` module holds the fetch wrapper (User-Agent, timeout, error handling), a haversine distance helper, and the response types. Keys are injected as Cloud Run env vars from Secret Manager (mirroring CDSE); values never enter Terraform state or tracked files.

**Tech Stack:** Next.js 16 Route Handlers (Node runtime), TypeScript, `global fetch`, Vitest (mocked `fetch`), Terraform (Secret Manager + Cloud Run v2 env), Google Cloud.

## Global Constraints

- **Base branch:** branch from `main` (Phase 1A+1B are merged). Use `feature/phase2a-safety-backend`.
- Coverage gate: **90% lines / 90% functions / 85% branches** (Vitest). TDD: failing test first.
- Gates that must stay green: `npm test` · `npx tsc --noEmit` · `npm run build` · `npm run test:e2e` · `terraform -chdir=terraform validate`. (Python `pytest` is unaffected — no function changes.)
- **No new scheduled workers / Pub/Sub / DLQ / Firestore writes.** Routes are read-only proxies. (Spec §10.)
- **Route conventions (match existing exactly):** async params `type Params = { params: Promise<{ slug: string }> }`; resolve via `mountainBySlug(slug)` (catalog constant, NOT Firestore); unknown slug → `NextResponse.json({ error: "Mountain not found" }, { status: 404 })`; standard cache header `const CACHE = "public, max-age=300, stale-while-revalidate=600"`; no try/catch around the whole handler (let Next's boundary handle unexpected throws) EXCEPT where an upstream failure should degrade gracefully (see per-task notes). Routes return raw normalized data — no display formatting (that's client-side).
- **Secrets:** AirNow + NPS keys live ONLY in Secret Manager (env-prefixed `airnow-api-key`, `nps-api-key`), injected to Cloud Run web as `AIRNOW_API_KEY` / `NPS_API_KEY` via `value_source.secret_key_ref`. Values are added out-of-band with `gcloud secrets versions add` (read from `NOTES.md` at deploy time) — they MUST NOT appear in Terraform, tracked code, tests, or commit messages. Read in routes via `requireEnv("AIRNOW_API_KEY")`.
- **No personal data in tracked code (user directive + memory `no-secrets-or-email-in-repo`):** the NWS `User-Agent` header MUST use a non-personal identifier read from an env var `NWS_CONTACT` (default to a generic `"MountainWeatherman/1.0 (+https://github.com/mountain-weatherman)"` if unset) — **never hardcode the user's email**.
- **Graceful degradation per peak (spec §3.2):** a peak missing the gating field returns a calm 404/empty, exactly like `nwacZone*`/`snotelStation*`. Out-of-region peaks (Whitney) and non-volcano peaks must not break.
- **Provenance shape (spec §10.5):** every route response carries a `provenance: { source: string; observedAt?: string; distanceMi?: number; note?: string }` object the 2B `<Provenance>` tag will read.
- One merged `alerts` route covers NWS + SPC (resolves spec §13 open question — merged, not separate).

---

## Reference: external API contracts (verified against the research doc; ⚠️ = live-verify during the task)

| Source | Endpoint (placeholders) | Auth | Key UI fields |
|---|---|---|---|
| AirNow current | `https://www.airnowapi.org/aq/observation/latLong/current/?format=application/json&latitude={lat}&longitude={lng}&distance=50&API_KEY={key}` | `API_KEY` query | `AQI`, `Category.Number`, `Category.Name`, `ParameterName`, `ReportingArea`, `Latitude`, `Longitude` |
| AirNow historical (24h trend) | `…/historical/?…&date={YYYY-MM-DD}T{HH}-0000&distance=50&API_KEY={key}` (one call per hour ⚠️ tz of `HH`) | `API_KEY` query | `AQI`, `HourObserved`, `ParameterName` |
| NWS active alerts | `https://api.weather.gov/alerts/active?point={lat},{lng}` (header `User-Agent`) | header | `properties.{event,severity,urgency,headline,onset,expires,areaDesc}` ⚠️ field names live |
| SPC Day-1 categorical | `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/SPC_wx_outlks/MapServer/1/query?geometry={lng},{lat}&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&inSR=4326&outFields=*&f=geojson` (⚠️ confirm layer 1 = Day-1 categorical) | none | `features[].properties.{label,label2,fill,valid,expire}` (empty features ⇒ below TSTM) |
| ComCat earthquakes | `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude={lat}&longitude={lng}&maxradiuskm=30&minmagnitude=0&starttime={YYYY-MM-DD}&orderby=time` | none | `features[].properties.{mag,place,time,type,status}`, `geometry.coordinates[2]`=depth(km), `metadata.count` |
| HANS volcano | `https://volcanoes.usgs.gov/hans-public/api/volcano/getVolcano/{id}` (+ `newestForVolcano/{id}` ⚠️ shape) | none | `colorCode`, `alertLevel`, `volcano_name`, `nvews_threat`, `newest_notice_url` |
| NPS alerts | `https://developer.nps.gov/api/v1/alerts?parkCode={code}&limit=50` (header `X-Api-Key`) | header key | `data[].{category,title,description,url,parkCode,lastIndexedDate}` |

HANS WA volcano IDs: Adams `wa1`, Baker `wa2`, Glacier Peak `wa3`, St. Helens `wa4`, Rainier `wa6`. NPS park codes (WA): Rainier `mora`, North Cascades peaks `noca`, Olympic `olym`; Whitney → Sequoia/Kings `seki`. Peaks with no volcano/park → empty string.

---

## File Structure

**New files**
- `src/lib/hazards/fetch.ts` — `fetchJson()` wrapper (User-Agent, timeout, !ok throw) + `haversineMiles()`.
- `src/lib/hazards/types.ts` — `AirQuality`, `StormAlerts`, `VolcanoStatus`, `SeismicSummary`, `ParkAlerts`, `HazardsSummary`, `SourceMeta`.
- `src/app/api/mountains/[slug]/air-quality/route.ts` (+ `__tests__/route.test.ts`)
- `src/app/api/mountains/[slug]/alerts/route.ts` (+ test)
- `src/app/api/mountains/[slug]/volcano/route.ts` (+ test)
- `src/app/api/mountains/[slug]/seismic/route.ts` (+ test)
- `src/app/api/mountains/[slug]/park-alerts/route.ts` (+ test)
- `src/app/api/mountains/[slug]/hazards-summary/route.ts` (+ test)
- `terraform/modules/web/secrets.tf` — the two secret containers + web-SA accessor IAM.

**Modified files**
- `src/lib/types.ts` — add optional `hansVolcanoId?`, `npsParkCode?`, `airnowHint?` to `Mountain`.
- `src/lib/mountains-data.ts` — seed the new fields per peak.
- `src/lib/__tests__/mountains-data.test.ts` — assert the new fields where present (volcano IDs on the 5 volcanoes, etc.).
- `scripts/seed-mountains.ts` (if it maps fields explicitly) — include the new fields so Firestore stays in sync.
- `terraform/modules/web/main.tf` — two secret `env {}` blocks on the Cloud Run service.
- `terraform/modules/web/variables.tf` — (only if `web_sa_email` is absent — it exists, so likely no change).
- `references/add-mountain.md` — document the three new fields.

---

## Task 1: Catalog fields (hansVolcanoId / npsParkCode / airnowHint)

**Files:**
- Modify: `src/lib/types.ts`, `src/lib/mountains-data.ts`, `src/lib/__tests__/mountains-data.test.ts`, `references/add-mountain.md`
- Check: `scripts/seed-mountains.ts`

**Interfaces:**
- Produces: `Mountain` gains optional `hansVolcanoId?: string; npsParkCode?: string; airnowHint?: string;`. Empty/absent ⇒ the corresponding Safety panel is unavailable for that peak.

- [ ] **Step 1: Write the failing test** — add to `mountains-data.test.ts`:

```ts
import { mountainBySlug } from "@/lib/mountains-data";

describe("Phase 2 hazard catalog fields", () => {
  it("tags the five Cascade volcanoes with their HANS id", () => {
    expect(mountainBySlug("mt-rainier")?.hansVolcanoId).toBe("wa6");
    // Baker wa2, Glacier Peak wa3, Adams wa1, St Helens wa4 — assert each that exists in the catalog
  });
  it("leaves non-volcano peaks without a HANS id", () => {
    // a non-volcano peak (e.g. mt-stuart / mt-shuksan) → undefined or ""
    const m = mountainBySlug("mt-stuart") ?? mountainBySlug("mt-shuksan");
    expect(m?.hansVolcanoId ?? "").toBe("");
  });
  it("tags Rainier with its NPS park code", () => {
    expect(mountainBySlug("mt-rainier")?.npsParkCode).toBe("mora");
  });
});
```

(Adjust slugs to the actual catalog — read `mountains-data.ts` first and assert against real entries.)

- [ ] **Step 2: Run → FAIL** — `npm test -- src/lib/__tests__/mountains-data.test.ts`.

- [ ] **Step 3: Extend the `Mountain` interface** in `src/lib/types.ts`:

```ts
export interface Mountain {
  // …existing fields…
  description: string;
  /** Phase 2 hazard gating (optional; empty/absent ⇒ that Safety panel is unavailable for this peak). */
  hansVolcanoId?: string; // HANS volcano id, e.g. "wa6"; "" for non-volcanoes
  npsParkCode?: string;   // NPS park code, e.g. "mora"; "" if not inside an NP
  airnowHint?: string;    // optional preferred AirNow reporting area; "" to use nearest by lat/lng
}
```

- [ ] **Step 4: Seed the fields** in `src/lib/mountains-data.ts` per peak — read the 11 entries, then add `hansVolcanoId` to the 5 volcanoes (Rainier `wa6`, Baker `wa2`, Glacier Peak `wa3`, Adams `wa1`, St Helens `wa4`), `npsParkCode` to peaks inside an NP (Rainier `mora`; North-Cascades-NP peaks `noca`; Olympic peaks `olym`; Whitney `seki`), and leave the rest empty. Most Cascade non-volcano peaks are in National Forests (no NP) → omit/`""`.

- [ ] **Step 5: Run → PASS**, then `npx tsc --noEmit` (the `as const` `MOUNTAINS` must still type-check). Update `scripts/seed-mountains.ts` only if it lists fields explicitly (so Firestore mirrors the constant); document the three fields in `references/add-mountain.md`.

- [ ] **Step 6: Commit** — `git add src/lib/types.ts src/lib/mountains-data.ts src/lib/__tests__/mountains-data.test.ts references/add-mountain.md scripts/seed-mountains.ts && git commit -m "feat(catalog): hansVolcanoId/npsParkCode/airnowHint hazard-gating fields"`

---

## Task 2: Shared hazards lib (fetch wrapper + distance + types)

**Files:**
- Create: `src/lib/hazards/fetch.ts`, `src/lib/hazards/types.ts`, `src/lib/hazards/__tests__/fetch.test.ts`

**Interfaces:**
- Produces:
  - `async function fetchJson<T>(url: string, opts?: { headers?: Record<string,string>; timeoutMs?: number }): Promise<T>` — adds `Accept: application/json`, applies an `AbortSignal.timeout(opts.timeoutMs ?? 8000)`, throws `Error("Upstream <status>")` on `!res.ok`.
  - `function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number` — great-circle miles, rounded to 1 decimal.
  - `interface SourceMeta { source: string; observedAt?: string; distanceMi?: number; note?: string }` and the six response types (`AirQuality`, `StormAlerts`, `VolcanoStatus`, `SeismicSummary`, `ParkAlerts`, `HazardsSummary`) — full shapes defined here.

- [ ] **Step 1: Write the failing test** (`fetch.test.ts`):

```ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchJson, haversineMiles } from "@/lib/hazards/fetch";

afterEach(() => vi.unstubAllGlobals());

describe("haversineMiles", () => {
  it("computes a known distance (Sea-Tac ~ Rainier ≈ 44 mi)", () => {
    const d = haversineMiles(47.4502, -122.3088, 46.8517, -121.7603);
    expect(d).toBeGreaterThan(40);
    expect(d).toBeLessThan(50);
  });
  it("is zero for the same point", () => {
    expect(haversineMiles(46.85, -121.76, 46.85, -121.76)).toBe(0);
  });
});

describe("fetchJson", () => {
  it("parses JSON on 200 and forwards headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fetchJson<{ ok: number }>("http://x", { headers: { "User-Agent": "UA" } });
    expect(out.ok).toBe(1);
    expect(fetchMock.mock.calls[0][1].headers["User-Agent"]).toBe("UA");
  });
  it("throws on a non-ok status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 503 })));
    await expect(fetchJson("http://x")).rejects.toThrow(/Upstream 503/);
  });
});
```

- [ ] **Step 2: Run → FAIL.**

- [ ] **Step 3: Implement `src/lib/hazards/fetch.ts`**

```ts
import "server-only";

export async function fetchJson<T>(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  const res = await fetch(url, {
    headers: { Accept: "application/json", ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 8000),
  });
  if (!res.ok) throw new Error(`Upstream ${res.status}`);
  return (await res.json()) as T;
}

export function haversineMiles(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 3958.7613; // earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(s)) * 10) / 10;
}
```

- [ ] **Step 4: Create `src/lib/hazards/types.ts`** with the `SourceMeta` interface and the six response types. Each response type wraps the normalized data + `provenance: SourceMeta`. Define exactly:

```ts
export interface SourceMeta { source: string; observedAt?: string; distanceMi?: number; note?: string }

export interface AirQuality {
  aqi: number; categoryNumber: number; categoryName: string; parameter: string;
  reportingArea: string; trend: { hour: number; aqi: number }[]; provenance: SourceMeta;
}
export interface StormAlert { event: string; severity: string; urgency: string; headline: string; onset: string | null; expires: string | null; areaDesc: string }
export interface StormAlerts { nws: StormAlert[]; spc: { label: string; label2: string } | null; stormActive: boolean; provenance: SourceMeta }
export interface VolcanoStatus { name: string; colorCode: string; alertLevel: string; nvewsThreat: string | null; noticeUrl: string | null; provenance: SourceMeta }
export interface QuakeEvent { mag: number; place: string; time: string; depthKm: number; type: string; status: string }
export interface SeismicSummary { count30d: number; count7d: number; largestMag: number | null; swarm: boolean; events: QuakeEvent[]; provenance: SourceMeta }
export interface ParkAlert { category: string; title: string; description: string; url: string; parkCode: string; lastIndexedDate: string }
export interface ParkAlerts { alerts: ParkAlert[]; provenance: SourceMeta }
export interface HazardsSummary {
  aqi: { value: number; category: string } | null;
  storm: { active: boolean; label: string } | null;
  provenance: SourceMeta;
}
```

- [ ] **Step 5: Run → PASS** (`npm test -- src/lib/hazards/__tests__/fetch.test.ts`); `npx tsc --noEmit`.

- [ ] **Step 6: Commit** — `git add src/lib/hazards && git commit -m "feat(hazards): shared fetchJson + haversineMiles + Safety response types"`

---

## Task 3: `air-quality` route (AirNow current + 24h trend, key-proxy)

**Files:** Create `src/app/api/mountains/[slug]/air-quality/route.ts` + `__tests__/route.test.ts`.

**Interfaces:** Consumes `mountainBySlug`, `requireEnv("AIRNOW_API_KEY")`, `fetchJson`, `haversineMiles`, `AirQuality`. `GET` returns `AirQuality` (200) or `{ error }` (404 unknown slug). On an upstream/no-data condition, return `{ error: "No air-quality data" }` with 404 (graceful — AQI can be genuinely absent).

- [ ] **Step 1: Write failing tests** — mock `fetch` (`vi.stubGlobal`) and `requireEnv` (`vi.mock("@/lib/env", () => ({ requireEnv: () => "test-key" }))`). Cases: (a) current call returns one PM2.5 record → response `aqi`/`categoryName`/`reportingArea` set, `provenance.distanceMi` computed from the monitor lat/lng via haversine, `provenance.source === "AirNow"`; (b) the trend is built from the historical calls (mock them to return ascending AQI) → `trend.length > 0`; (c) unknown slug → 404; (d) empty current array → 404 `{ error: "No air-quality data" }`. Assert the request URL contains `API_KEY=test-key` and `latitude=`/`longitude=` from the mountain.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — resolve the mountain; build the current URL with the key + `distance=50`; pick the record with the highest `AQI` (worst pollutant) as the headline; compute `distanceMi = haversineMiles(mountain.lat, mountain.lng, record.Latitude, record.Longitude)`; build the 24h trend by fetching the historical endpoint for the prior N hours (cap N at 12–24, run with `Promise.all`, tolerate individual failures with `Promise.allSettled` so one bad hour doesn't 500 the route); stamp `provenance = { source: "AirNow", observedAt, distanceMi, note: \`${reportingArea} reporting area\` }`. ⚠️ Live-verify the historical `date` hour timezone before finalizing the trend (note in the report). Cache header standard.
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): air-quality route (AirNow current + 24h trend)"`

---

## Task 4: `alerts` route (NWS active alerts + SPC Day-1 categorical)

**Files:** Create `air…/alerts/route.ts` + test.

**Interfaces:** Returns `StormAlerts`. No key. NWS needs `User-Agent` from `process.env.NWS_CONTACT ?? "MountainWeatherman/1.0 (+https://github.com/mountain-weatherman)"` (NEVER the personal email). `stormActive = true` when any NWS feature's `event` is in `{"Severe Thunderstorm Warning","Severe Thunderstorm Watch","Tornado Warning"}` OR the SPC `label` rank ≥ `ENH`.

- [ ] **Step 1: Write failing tests** — mock `fetch` to return, in order, the NWS FeatureCollection then the SPC GeoJSON. Cases: (a) an active Severe Thunderstorm Warning → `nws[0].event` set + `stormActive === true`; (b) SPC returns an `ENH` feature → `spc.label === "ENH"` and `stormActive === true`; (c) empty NWS features + empty SPC features → `nws === []`, `spc === null`, `stormActive === false` (quiet state, still 200, NOT 404 — "no active storm" is a valid answer); (d) the NWS request carries the `User-Agent` header and it does NOT contain `@`/an email; (e) if the SPC call throws, the route still returns the NWS half (degrade — wrap SPC in try/catch, set `spc: null`).
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — fetch NWS active alerts by point (with User-Agent), map features to `StormAlert[]`; fetch SPC layer-1 point query, take the highest-rank intersecting feature's `{label, label2}` (empty features ⇒ `null`); compute `stormActive`; `provenance = { source: "NWS + SPC", observedAt: now }`. Wrap the SPC fetch in try/catch so its failure degrades to `spc: null` without failing the route. ⚠️ Live-verify NWS `properties` field names + SPC layer index 1 (note in report). Cache header standard (consider `max-age=300`).
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): alerts route (NWS warnings + SPC day-1 categorical)"`

---

## Task 5: `volcano` route (HANS, gated on hansVolcanoId)

**Files:** Create `…/volcano/route.ts` + test.

**Interfaces:** Returns `VolcanoStatus` (200) or 404. If `mountain.hansVolcanoId` is empty/absent → `{ error: "Not a monitored volcano" }` 404 **before any fetch** (graceful — most peaks).

- [ ] **Step 1: Write failing tests** — (a) a volcano peak (mock `mountainBySlug` to return `hansVolcanoId: "wa6"`, or use a real volcano slug) + mocked `getVolcano/wa6` → `colorCode`/`alertLevel`/`name` set, `provenance.source === "USGS HANS"`; (b) a non-volcano peak (`hansVolcanoId: ""`) → 404 `{ error: "Not a monitored volcano" }` and `fetch` NOT called; (c) unknown slug → 404 "Mountain not found".
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — guard the empty `hansVolcanoId` BEFORE fetching; fetch `getVolcano/{id}`, map `{volcano_name→name, colorCode, alertLevel, nvews_threat→nvewsThreat, newest_notice_url→noticeUrl}`; ⚠️ `newestForVolcano/{id}` exact shape is unverified — fetch it optionally (try/catch) to enrich `noticeUrl`/notice date, but do NOT fail the route if it errors; note the unverified shape in the report. Cache header: standard (or `max-age=3600` since volcano status is slow-changing — choose and document).
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): volcano route (HANS, gated on hansVolcanoId)"`

---

## Task 6: `seismic` route (ComCat, 30-day / 30 km)

**Files:** Create `…/seismic/route.ts` + test.

**Interfaces:** Returns `SeismicSummary`. No key, no gating (works for every peak — earthquakes are global). `starttime` = 30 days before now (compute from a passed `now`/`Date`; the route may read `new Date()` — fine for a server route). `swarm = count7d > (count30d / 30) * 7 * 2` (7-day count more than 2× the 30-day daily-rate baseline).

- [ ] **Step 1: Write failing tests** — mock `fetch` to return a ComCat FeatureCollection with several events (varied `time`, `mag`, `geometry.coordinates[2]`). Cases: (a) `count30d` = features length, `largestMag` = max mag, `events` mapped with `depthKm` from `coordinates[2]` and `time` as ISO; (b) recent-heavy fixture → `swarm === true`; (c) empty features → `count30d === 0`, `largestMag === null`, `events === []`, still 200; (d) the request URL contains `maxradiuskm=30`, `format=geojson`, `latitude=`/`longitude=`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — build the FDSN query URL (30 km, M≥0, 30-day window, `orderby=time`); map features → `QuakeEvent[]` (`time` epoch-ms → ISO, `depthKm` = `geometry.coordinates[2]`); compute `count30d`/`count7d`/`largestMag`/`swarm`; cap `events` to the most-recent ~15 for the payload (note the cap, per CLAUDE "no silent caps" — `note` it in provenance or a field); `provenance = { source: "USGS ComCat", observedAt: now }`.
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): seismic route (ComCat 30-day/30km + swarm flag)"`

---

## Task 7: `park-alerts` route (NPS, gated on npsParkCode, key-proxy)

**Files:** Create `…/park-alerts/route.ts` + test.

**Interfaces:** Returns `ParkAlerts` (200) or 404 when `npsParkCode` is empty (graceful — peaks outside NPs). Key via `X-Api-Key` header from `requireEnv("NPS_API_KEY")`.

- [ ] **Step 1: Write failing tests** — mock `fetch` + `requireEnv`. Cases: (a) a park peak (`npsParkCode: "mora"`) + mocked alerts → `alerts[].category/title/url` mapped, `provenance.source === "NPS"`; (b) empty `npsParkCode` → 404 `{ error: "No park alerts" }`, `fetch` NOT called; (c) the request carries the `X-Api-Key` header (assert it equals the mocked key) and `parkCode=mora`; (d) empty `data` array → `alerts === []`, 200.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — guard empty `npsParkCode`; fetch with `X-Api-Key`; map `data[]` → `ParkAlert[]`; `provenance = { source: "NPS", observedAt: now }`. Cache header standard.
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit`.
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): park-alerts route (NPS, gated on npsParkCode)"`

---

## Task 8: `hazards-summary` route (roll-up for the header chips)

**Files:** Create `…/hazards-summary/route.ts` + test.

**Interfaces:** Returns `HazardsSummary` — `{ aqi: {value,category}|null, storm: {active,label}|null, provenance }`. Composes the AirNow + NWS/SPC fetches (reuse the same lib calls, NOT an internal HTTP call to the sibling routes) so the page-load chips populate cheaply. Each half degrades independently (a failing AQI → `aqi: null`, the route still 200s). This route is fetched once on page load for the header chips on every tab.

- [ ] **Step 1: Write failing tests** — mock `fetch`/`requireEnv`. Cases: (a) both AQI + storm present → both summary fields set; (b) AQI fetch throws → `aqi: null` but `storm` still set, 200; (c) both fail → both `null`, 200 (never 500 for the chips); (d) unknown slug → 404.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** — extract the AirNow-current normalization and the NWS/SPC normalization into small shared helpers in `src/lib/hazards/` (so this route and Tasks 3/4 don't duplicate fetch+normalize logic — DRY). Call both with `Promise.allSettled`; map to the compact summary; `provenance = { source: "AirNow + NWS/SPC", observedAt: now }`. Cache header: `max-age=300`.
- [ ] **Step 4: Run → PASS**; `npx tsc --noEmit`. Refactor Tasks 3/4 to use the shared helpers if not already (keep their tests green).
- [ ] **Step 5: Commit** — `git commit -m "feat(safety): hazards-summary roll-up route for header chips"`

---

## Task 9: Secrets + Cloud Run env (Terraform)

**Files:**
- Create: `terraform/modules/web/secrets.tf`
- Modify: `terraform/modules/web/main.tf` (two secret `env {}` blocks)

**Interfaces:** Two `google_secret_manager_secret` (`airnow-api-key`, `nps-api-key`) + `google_secret_manager_secret_iam_member` granting `roles/secretmanager.secretAccessor` to `var.web_sa_email`, and two Cloud Run `env {}` blocks injecting `AIRNOW_API_KEY`/`NPS_API_KEY` via `value_source.secret_key_ref`. Values NEVER in Terraform.

- [ ] **Step 1: Write `terraform/modules/web/secrets.tf`** (mirror `terraform/modules/functions/secrets.tf`):

```hcl
# Runtime secrets for the Safety key-proxy routes. VALUES are added out-of-band via
# `gcloud secrets versions add` — never in Terraform state. (Mirrors the CDSE pattern.)
resource "google_secret_manager_secret" "airnow_api_key" {
  secret_id = "airnow-api-key"
  replication { auto {} }
}
resource "google_secret_manager_secret" "nps_api_key" {
  secret_id = "nps-api-key"
  replication { auto {} }
}
resource "google_secret_manager_secret_iam_member" "web_airnow" {
  secret_id = google_secret_manager_secret.airnow_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.web_sa_email}"
}
resource "google_secret_manager_secret_iam_member" "web_nps" {
  secret_id = google_secret_manager_secret.nps_api_key.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.web_sa_email}"
}
```

- [ ] **Step 2: Add the env blocks** to the Cloud Run container in `terraform/modules/web/main.tf` (after the existing plain `env {}` blocks; add a `depends_on` to the service for the two secret resources if the existing resources don't already chain):

```hcl
env {
  name = "AIRNOW_API_KEY"
  value_source { secret_key_ref { secret = google_secret_manager_secret.airnow_api_key.secret_id; version = "latest" } }
}
env {
  name = "NPS_API_KEY"
  value_source { secret_key_ref { secret = google_secret_manager_secret.nps_api_key.secret_id; version = "latest" } }
}
```

- [ ] **Step 3: Validate** — `terraform -chdir=terraform validate` → success. Do NOT apply yet (apply is Task 10, after the secret versions exist).
- [ ] **Step 4: Commit** — `git commit -m "feat(infra): AirNow + NPS secrets in Secret Manager, injected to Cloud Run web"`

---

## Task 10: Bootstrap secrets, deploy, live-verify

**Files:** none (deploy + verification).

- [ ] **Step 1: Full local gates** — `npm test` (coverage ≥ 90/90/85; the six routes + lib must be covered by their tests), `npx tsc --noEmit`, `npm run build`, `npm run test:e2e` (the new routes aren't consumed by the UI yet, so e2e is unaffected — just confirm still green), `terraform -chdir=terraform validate`.
- [ ] **Step 2: Bootstrap the secret containers** — targeted apply so the secrets exist before the web service references them: `terraform -chdir=terraform plan -out=PLAN -target=module.web.google_secret_manager_secret.airnow_api_key -target=module.web.google_secret_manager_secret.nps_api_key` then `apply PLAN`.
- [ ] **Step 3: Add the secret VALUES out-of-band** (read from `NOTES.md`; NEVER echo them into tracked files or the transcript): for each key, `gcloud secrets versions add airnow-api-key --project mountain-weatherman-app --data-file=-` (paste the value via stdin) and likewise `nps-api-key`. **Suggest the user run these via the `! <command>` prompt** so the secret value stays out of the agent transcript, OR pipe from a local untracked file.
- [ ] **Step 4: Full apply** — `terraform -chdir=terraform plan -out=PLAN` (expect: ~2 secret adds + 2 IAM adds + 1 Cloud Run in-place update for the env blocks + the usual hash-triggered restage; NO destructive infra) then `apply PLAN`.
- [ ] **Step 5: Live-verify each route** against the deployed web URL (`terraform -chdir=terraform output -raw web_url`): `GET /api/mountains/mt-rainier/air-quality`, `/alerts`, `/volcano`, `/seismic`, `/park-alerts`, `/hazards-summary` → 200 with the normalized shape; `GET /api/mountains/mt-stuart/volcano` → 404 "Not a monitored volcano"; a non-park peer → `/park-alerts` 404. **Resolve every ⚠️ live-verify flag here** (AirNow historical tz, NWS field names, SPC layer index, HANS newestForVolcano shape) and fix any normalization mismatch surfaced by real data (commit fixes).
- [ ] **Step 6: Security follow-up** — confirm the keys are NOT in any tracked file (`rg -n "API_KEY|api_key" src terraform` shows only env-var reads, no values) and remind the user to **rotate the AirNow + NPS keys** (they were in `NOTES.md` git history) per the spec §10.4 ⚠️.
- [ ] **Step 7: Commit any live-fix** — `git commit -m "fix(safety): reconcile route normalization with live API responses"`

---

## Self-Review (completed)

**Spec coverage (Phase-2 backend slice):**
- §7 Safety panels' DATA: air-quality (1), storm NWS+SPC (1, merged per §13), volcano (1), seismic (1), park-alerts (1) + hazards-summary chips feed (1) → Tasks 3–8. ✓ (The Avalanche panel/chip already exist from Phase 1.)
- §10.1 serving model = on-demand routes, no scheduled worker/Pub/Sub/Firestore-write → all tasks are read-only proxies. ✓
- §10.2 route list (`air-quality`,`alerts`,`volcano`,`seismic`,`park-alerts`,`hazards-summary`) → Tasks 3–8. (Cached geospatial `trails`/`roads`/`wilderness`/`rec-sites` are Phase 3, not here.) ✓
- §10.3 catalog fields (`hansVolcanoId`,`npsParkCode`,`airnowHint`) → Task 1. (`webcams`/`mapBbox`/`permits`/`usfsForestName` are Phase-3 Terrain fields — deferred.) ✓
- §10.4 secrets (AirNow+NPS → Secret Manager → Cloud Run) → Tasks 9–10, values never committed; rotation reminder in 10.6. ✓
- §10.5 provenance shape `{source,observedAt,distanceMi?}` on every response → `SourceMeta` (Task 2) carried by all routes. ✓
- §3.2 graceful degradation (empty gating field ⇒ calm 404, no broken render) → volcano/park-alerts guard before fetch; AQI/seismic tolerate empty. ✓
- **Deferred to Phase 2B (documented, not gaps):** the Safety-tab UI panels, the AQI/Storm `<HazardChip>`s + `airQualityChip`/`stormChip` mappers, the `<Provenance>` tags, and the SWR hooks that call these routes. 2A ships the API only.
- **Deferred to Phase 3:** all Terrain & Access (§8) — map, GIBS, trails/roads/wilderness cached routes, webcams, access cards, 3D entry move.

**Placeholder scan:** No "TBD/TODO". The shared lib + types + the haversine/fetch code are complete; each route task carries its exact endpoint(s), normalized type (defined in Task 2), the field-mapping rules, and concrete test cases. The four ⚠️ live-verify items are explicitly scheduled in Task 10 against real responses (the research doc flagged them as unconfirmed) — that is a deliberate verification step, not a placeholder.

**Type consistency:** `SourceMeta` + the six response types (Task 2) are consumed unchanged by Tasks 3–8 and by Phase 2B. `Mountain` gains optional fields (Task 1) read by Tasks 5/7 (`hansVolcanoId`/`npsParkCode`). `fetchJson`/`haversineMiles` (Task 2) used by Tasks 3–8. Route conventions (async params, `mountainBySlug`, `CACHE`, 404 shape) are identical across all six and match the existing routes. `requireEnv` (existing) reads `AIRNOW_API_KEY`/`NPS_API_KEY` (Task 9 injects them) and `NWS_CONTACT` (optional, defaulted). Consistent.

**Security check:** AirNow/NPS key values appear nowhere in code/tests/Terraform/commits (env-var reads + Secret Manager only); the NWS User-Agent uses `NWS_CONTACT` with a non-personal default (no committed email); Task 10.6 reminds the user to rotate the previously-exposed keys.
