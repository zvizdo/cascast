# Mountain Weather POC — Design Spec

> Companion to `mountain-weather-poc-seed-plan.md`. The seed plan is the detailed
> architecture reference. **This spec records the binding decisions, the deltas from
> the seed plan, and the phased plan structure** that the implementation plans build on.
> Where this spec and the seed plan disagree, **this spec wins.**

- **Date:** 2026-06-14
- **GCP project:** `mountain-weatherman-app`
- **Scope:** Single-user, no auth, fully public POC. Out-of-scope list unchanged from seed plan §2.
- **Deliverable of the brainstorm:** this spec + eight self-contained phase plan docs.

---

## 1. Product shape (what changed from the seed plan)

The seed plan assumed data is only fetched for **pinned** mountains. This spec adds an
**unpinned browse experience** and an **urgency-driven refresh model**. The mental model is
three tiers of "liveness":

1. **Browse a mountain (no pin).** `/mountains/[slug]` shows the **full current forecast**
   — 7-day hourly timeline, multi-model comparison, freezing-level hero, elevation bands,
   NWAC, SNOTEL, satellite — but **no forecast-evolution timeline and no ongoing snapshot
   history.** It reuses the project detail components, fed by a current-only data doc.
2. **Pin a project (full tracking).** Everything browse has, **plus** the evolving-forecast
   timeline backed by timestamped `weatherSnapshots`, comprehensive hour-by-hour blobs, and
   ongoing scheduled refresh. Pinning "earns its value by adding **time**" — the core
   differentiator.
3. **Refresh cadence by urgency, not mere existence** (see §3).

**Key UX principle:** browse = instant current glance + a *"Pin to track how this forecast
evolves"* CTA. Pin = immediate populate + backfilled evolution + ongoing tracking as the
date nears.

---

## 2. Resolved decisions (the 17 open questions + additions)

| # | Question | Decision |
|---|----------|----------|
| 1 | NWAC access | **Verified:** no-auth avalanche.org NAC API — `GET /v2/public/product?type=forecast&center_id=NWAC&zone_id={id}` (zone IDs in the interface contract). HTML scraping not needed. |
| 2 | Forecast evolution source | **Both:** own Firestore snapshots are source of truth going forward, **+** Previous Runs API backfill on project creation. |
| 3 | Elevation bands | Open-Meteo pressure-level vars (≈925/700/500 hPa) interpolated to each band altitude. **Phase 1 validation spike** confirms resolution; display approximate elevation per band. |
| 4 | NWAC summer | Graceful "summer operations — no active avalanche forecast" message. Spike confirms summer endpoint behavior. |
| 5 | Bucket access | **Private** buckets; Route Handlers read blobs via Admin SDK and serve them. |
| 6 | Retention | Firestore native **TTL** (snapshots 30d) + GCS lifecycle rule (blobs 35d). |
| 7 | Seed peaks | **Full 10 peaks** with researched metadata (coords, elevation bands, IANA tz, NWAC zone, SNOTEL station). |
| 8 | Map | **Mapbox GL JS** free tier; token in env. |
| 9 | Integration tests | Unit tests mock everything; **contract tests** validate parsing against saved real responses; **opt-in (CI-skippable) live smoke tests** per source for schema-drift detection. |
| 10 | Emulator | **Firebase emulator suite** (Firestore + Pub/Sub) for local dev + integration tests. |
| 11 | Mobile | **Fully responsive from day one**, mobile-first components with defined breakpoints. |
| 12 | Timezone | **Per-mountain IANA tz** stored on the mountain doc; workers query Open-Meteo with it; UI formats in the mountain's zone. All `America/Los_Angeles` in the POC. |
| 13 | Default band | **Summit.** |
| 14 | Danger colors | Official NAC palette (Green/Blue/Yellow/Orange/Red 1–5) **+ patterns/number labels** for colorblind accessibility. |
| 15 | Monitoring | Terraform-managed **budget alerts ($10/$25)**, **DLQ topic**, and **worker error-rate alert**. |
| 16 | Cost controls | Budget alerts as above. |
| 17 | DLQ handling | **Alert on DLQ message count**; no auto-replay in POC. |
| A1 | Unpinned browse | `/mountains/[slug]` shows **full current forecast minus evolution** (reuses project components). |
| A2 | Refresh tiers | **≤48h hourly / 48h–7d every 6h / 7–14d daily** (orchestrator picks max urgency per mountain). |
| A3 | Unpinned refresh (POC) | **Refresh all 10 seed mountains on the 6h cycle** AND build the lazy get-or-refresh path so scaling is a config flip. |
| A4 | On-pin behavior | **Immediate one-shot refresh + Previous Runs backfill** of the evolution chart (partial, model-dependent, labeled). |
| A5 | Satellite approach | **EOX s2cloudless XYZ** tiles (no-auth map layer) **+ CDSE Sentinel Hub Catalog API** (OAuth client-credentials; free, 0 processing units) for the "imagery from {date}, {cloud}%" badge. Env: `CDSE_CLIENT_ID`, `CDSE_CLIENT_SECRET`. |
| A6 | NWAC capture | Idempotent "capture today's report" — every-15-min morning window (07:30–12:00 PT), skip zones already captured today (see §3). |

---

## 3. Refresh model (urgency tiers)

The hourly Cloud Scheduler tick fires the orchestrator. For each **unique** mountain
referenced by active projects (deduplicated), the orchestrator computes the **max urgency**
across all referencing projects and decides whether to publish a `weather-refresh` this tick:

| Urgency (nearest target date) | Cadence | Rationale |
|---|---|---|
| Project with `targetDateStart` ≤ 48h away | **Hourly** | HRRR is only meaningful 0–48h. |
| Project 48h–7d away | **Every 6h** (ticks at 00/06/12/18 local) | Matches GFS/ECMWF run cadence. |
| Project 7–14d away | **Daily** | No usable forecast yet (we fetch 7 forecast days); record-keeping only. |
| **Browse-only** mountain (no active project) | **Every 6h** (POC) → **lazy on-demand** (scale) | See §4. |

**NWAC — "capture today's report" (idempotent retry).** NWAC publishes each morning and the
forecast expires same-day, so we must reliably capture it once per day. A scheduler job fires
**every 15 minutes in a morning window (07:30–12:00 Pacific)**. On each tick the NWAC
orchestrator checks, per zone, whether `nwacForecasts/{zoneId}` already holds **today's
published** forecast (`product_type == "forecast"` AND `published_time` is today's Pacific
date). Zones already captured are skipped; only missing zones are re-fetched. Once all zones
are captured for the day, every remaining tick is a cheap no-op. In summer (`product_type ==
"summary"` / empty `danger`), the worker records the summary once and the day is considered
captured (no further retries that day).

**SNOTEL** — daily (its own scheduler job). **Satellite** — weekly (its own scheduler job).

**Implementation note:** the *weather* orchestrator is invoked hourly; it self-gates the
6h/daily tiers by inspecting the current local hour. NWAC uses the separate 15-min morning
window job above. SNOTEL (daily) and satellite (weekly) keep their own single jobs. So:
4 scheduler jobs total — `weather` (hourly), `nwac` (every 15 min, morning window),
`snotel` (daily), `satellite` (weekly).

---

## 4. Browse data path & scale

### Firestore additions
- **`mountainConditions/{mountainId}`** — *current-only* forecast for browse. Holds the same
  summary fields as a project's `currentSummary` plus a pointer to the latest combined Cloud
  Storage blob and `updatedAt`. **No** `weatherSnapshots` subcollection. Written by the
  weather worker every time it runs for that mountain (pinned or browse).

The weather worker therefore **always** (a) writes the combined blob to Cloud Storage and
(b) upserts `mountainConditions/{mountainId}`. **Additionally**, for each active project
referencing the mountain, it writes a `weatherSnapshot` and updates `currentSummary`.

### POC behavior
All 10 seed mountains are refreshed on the 6h cycle (cheap; keeps browse pages instant) on
top of any hourly refresh they get from being pinned ≤48h.

### Scale behavior (built now, config-gated)
For unpinned mountains at scale you cannot pre-refresh everything (cost + Open-Meteo
non-commercial daily limits). The **get-or-refresh** path:
1. `/mountains/[slug]` Route Handler reads `mountainConditions`.
2. If `updatedAt` < ~3h old → serve instantly.
3. If stale/absent → serve stale (or an empty state) with an "updating…" pill **and**
   publish a `weather-refresh` to Pub/Sub (fire-and-forget). The browser never calls
   Open-Meteo directly.

A single env flag (`BROWSE_REFRESH_MODE = "scheduled" | "lazy"`) switches POC ↔ scale.

### Scale notes captured for later (not POC work)
- Pinned mountains are bounded by urgency tiers + dedup — they scale fine.
- The cost driver at scale is unique-mountains × frequency × 3 models vs. Open-Meteo limits;
  the lazy path + tiering is the mitigation. Self-hosted/commercial Open-Meteo is the
  eventual lever. Documented, not built.

---

## 5. Project-creation flow (the 34-hour scenario)

On `POST /api/projects`:
1. Create the Firestore project doc; dashboard card shows **"Pending first refresh"** optimistically.
2. **Immediate refresh:** publish one-shot `weather-refresh` (+ `nwac-refresh`, `snotel-refresh`)
   for the mountain. Current forecast lands in ~10–30s.
3. **Backfill:** a backfill function calls the **Open-Meteo Previous Runs API** to reconstruct
   what HRRR/GFS/ECMWF predicted *for the target date* over the past several days, written as
   `weatherSnapshots` with `source:"backfill"`. The evolution chart is non-empty immediately.

**Expectation-setting:** backfill is partial and model-dependent (≈full GFS/ECMWF history,
≈2 days HRRR). Backfilled vs. live points are labeled in the chart. Every scheduled snapshot
thereafter appends a real "live" point.

The existing `POST /api/admin/trigger-refresh` (seed plan §11.2) remains for demos.

---

## 6. Data-model deltas (vs. seed plan §6)

Additions/changes only; everything else in seed plan §6 stands.

- **New** `mountainConditions/{mountainId}` (see §4).
- **`mountains/{id}`** gains `timezone: string` (IANA, e.g. `America/Los_Angeles`).
- **`projects/{id}/weatherSnapshots/{id}`** gains `source: "live" | "backfill"`.
- **TTL field** on `weatherSnapshots` for native Firestore TTL (30-day expiry).
- All other collections (`projects`, `nwacForecasts`, `snotelData`, `satelliteCache`,
  `mountains`) as specified in the seed plan.

---

## 7. Phase decomposition (one plan doc per phase)

Eight self-contained, sequentially-dependent plan docs. Each ends in a **verification +
deploy gate**. Local-first throughout; real-GCP deploy + smoke test at backend phase gates
(P1, P2) and app deploy at P0/P7.

```
P0 Foundation ─► P1 Weather Pipeline ─► P2 Other Workers ─► P3 API Layer
                                                                 │
P6 Polish ◄── P5 Signature Features ◄── P4 Dashboard & Core UI ◄─┘
                                                                 │
                                              P7 Production Cutover & Demo
```

- **P0 — Foundation & Infra Skeleton.** git repo + structure; Terraform backend/state bucket;
  enable APIs; service accounts/IAM; private buckets + lifecycle rules; Pub/Sub topics + DLQ;
  single hourly + daily/weekly scheduler jobs; Firestore DB + TTL policy; budget alerts +
  error-rate alert. Next.js scaffold deploying to Firebase App Hosting (empty app). Firebase
  emulator suite config. CI skeleton (`test.yml`). `seed-mountains.ts` + the researched
  10-peak dataset (incl. `timezone`).
- **P1 — Weather Pipeline.** `shared/` (Pydantic models, Firestore + Storage clients);
  `open_meteo_client.py`; `weather_worker` (writes blob + `mountainConditions` + per-project
  snapshots + `currentSummary`); `orchestrator` (urgency tiering + dedup + fan-out);
  Previous Runs **backfill** function. Pressure-level validation spike. ≥90% pytest coverage.
  Deploy + end-to-end Scheduler→Pub/Sub→worker verification.
- **P2 — NWAC / SNOTEL / Satellite workers.** Three workers + clients; NWAC endpoint spike +
  summer handling; SNOTEL CSV parse; Copernicus tile fetch. Contract tests + opt-in live
  smoke tests. Deploy all scheduled jobs; confirm ≥90% coverage in CI.
- **P3 — Next.js API Layer.** Admin SDK singleton; all Route Handlers (projects incl.
  immediate-refresh + backfill trigger on create, weather, snapshots, nwac, snotel, mountains,
  `mountainConditions` get-or-refresh, admin/trigger-refresh); private-bucket blob serving;
  Vitest ≥90%; emulator-backed integration tests.
All UI phases recreate the **Cirque** prototype (`prototype-ui/`) pixel-perfect — see
interface contract §0 and §11. Charts are hand-built SVG (no Recharts); fonts Newsreader/
Hanken Grotesk/IBM Plex Mono; Glacier + Slate themes (no Tweaks panel).

- **P4 — Dashboard, Create, Calm-Layer Detail.** Cirque tokens/themes/fonts in `globals.css`;
  Header + ThemeToggle; hand-built SVG chart primitives (AreaSpark/LineChart/BarChart);
  Dashboard + ProjectCard (condition tone) + AddCard; Pin-a-Peak (Mapbox typeahead);
  Project Detail calm layer in IA order — Verdict, **Daily Outlook** (Daily→AM·Mid·PM→
  Hourly-48h), NWAC panel + DangerColumn + AspectRose (NAC colors + patterns), SNOTEL panel +
  AreaSpark, Satellite + Notes; `/mountains` browse + `/mountains/[slug]` (calm panels minus
  Confidence/Evolution/Model Lab); **units toggle** (°F/°C, mph/km·h, ft/m) via `lib/units.ts`
  store + Header control, applied across all display + charts (contract §12a). Playwright smoke
  + screenshots (mobile + desktop).
- **P5 — Signature Views & Model Lab.** Static Freezing-Level cross-section (SVG, range band,
  DayStrip, band label cards — **no scrubber**); Confidence strip; Model Lab
  (`/projects/[id]/models`): multi-model LineCharts + disagreement flags, forecast-evolution
  chart (live + backfill points labeled), MOS-style HourlyGrid. Elevation Base/Mid/Summit
  selector (default Summit) driving the calm layer. Playwright interaction tests + screenshots.
- **P6 — Polish & POC Readiness.** Responsive QA (≤900/≤680 breakpoints per DESIGN.md §15);
  loading/error/empty + pending-first-refresh, <3-snapshot evolution, summer-NWAC states;
  last-refreshed + "updating…" indicators; Share/copy-link; accessibility (danger number+label+
  meter, tone dot+word, `prefers-reduced-motion`, focus audit); attribution footer; README;
  full coverage re-check.
- **P7 — Production Cutover & Demo.** `terraform apply` prod config; `deploy.yml`; smoke-test
  all features on live data; cost/monitoring sanity check; demo script.

---

## 8. Per-phase plan doc template

Every phase doc uses the same structure so it executes uninterrupted:

1. **Objective & exit criteria** — what "done" means.
2. **Prerequisites** — prior phases/artifacts required.
3. **Tasks** — small, ordered, each with its own acceptance check. Backend tasks follow TDD
   (test first). Each task independently verifiable.
4. **Test plan** — unit (pytest/Vitest); contract tests vs saved responses; emulator
   integration tests; (P4+) Playwright specs with screenshot capture at mobile + desktop.
5. **Verification gate** — concrete commands + expected output (coverage ≥90%,
   `terraform plan` clean, emulator E2E green, Playwright green + screenshots reviewed).
6. **Deploy step** — local-first; real-GCP deploy + smoke at backend gates (P1, P2); app at
   P0/P7.
7. **Rollback / notes** — how to back out; open risks.

---

## 9. Cross-cutting conventions

- **Tooling:** Python 3.12 (pytest, pytest-cov, pytest-mock, pytest-httpx, pytest-asyncio,
  httpx, pydantic v2, tenacity); Node 20.9+ (Next.js 16.2.x App Router, React 19.2, Turbopack,
  Vitest, Testing Library, Playwright, SWR, Zustand, **hand-built SVG charts (no Recharts)**,
  D3 (scales/paths), Mapbox GL JS, `next/font/google`); Terraform 1.8.x (google ~5.x);
  Firebase emulator suite. Next 16: async `params` (Promise), GET Route Handlers uncached by
  default, `serverExternalPackages` top-level. **Visual spec: the Cirque prototype
  (`prototype-ui/`)** — see interface contract §0.
- **Env/secrets:** `.env.local.example`; GCP project `mountain-weatherman-app`; Firebase
  config from `NOTES.md`; Mapbox token; `BROWSE_REFRESH_MODE` flag; GitHub Actions secrets
  for SA keys (`GCP_SA_KEY_DEV`, `GCP_SA_KEY_PROD`).
- **Reuse existing repo assets:** the project's `design-tokens`, `nextjs-patterns`, and
  `python-gcp-patterns` skills and the `python-reviewer` / `ux-reviewer` agents — referenced
  in the relevant phase docs so execution sessions invoke them.
- **CI:** `test.yml` (Python + Vitest + Playwright + `terraform validate`) from P0;
  `deploy.yml` (terraform apply prod) wired at P7.
- **Global Definition of Done:** coverage gates pass; lints clean; emulator E2E green;
  Playwright green with screenshots; phase deploy/smoke verified.

---

## 10. Test & deployment strategy (local-first, deploy at gates)

- **Local dev/tests:** Firestore + Pub/Sub emulators; external APIs mocked (`pytest-httpx`,
  MSW) for unit tests; saved-response contract tests guard parsing.
- **Drift detection:** opt-in live smoke tests per external source, skippable in CI.
- **UI:** Playwright runs against local Next.js (emulator-backed), capturing mobile + desktop
  screenshots as part of each UI phase's gate.
- **Deploy:** real GCP deploy + smoke test at P1 and P2 gates (backend) and P0/P7 (app);
  production cutover isolated in P7 for a clean reviewable step.
