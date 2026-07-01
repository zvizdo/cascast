# Mountains-First Redesign — Design

**Date:** 2026-06-16
**Status:** Approved (design). Supersedes the project/pin server model and the dual-env deployment topology from the 2026-06-15 specs.

## 1. Goal

Drastically simplify the architecture. The **mountain** is the only first-class entity. All 10 mountains are pulled continuously on a fixed schedule (no pin-awareness). A "pin" is **client-side only** (localStorage + a shareable URL target date) — it personalizes the view but stores nothing on the server. No login, no server-side projects, no delete.

Success criteria:
- All mountain data (weather, avalanche, snowpack, satellite) refreshes on a fixed cadence for every mountain, retained 35 days, auto-expired.
- A user can search a mountain, browse it with no target, then pin it locally with a target date + notes; pinned mountains appear on a "Your Mountains" page; the focused view highlights the target date and shows forecast evolution.
- One `terraform apply` deploys everything in a single environment. No scripts in the deploy path (except the one-time CDSE secret bootstrap).
- Quotas comfortably within free tiers.

## 2. Core model shift

- **Removed:** the `projects` Firestore collection, all project CRUD, server-side pin/unpin/delete, active-project orchestration + throttling, the `backfill_worker`, and the dual-env Terraform workspaces.
- **Mountain-centric:** every data source writes per-mountain. The browse data (`mountainConditions`/`snotelData`/`nwacForecasts`/`satelliteCache`) is already per-mountain; the only history that was per-project (`weatherSnapshots`) moves under the mountain.
- **Pins are local:** `localStorage` holds the user's pins; the target date is also encoded in the URL for shareable focused views; notes are device-local only.

## 3. Navigation & routes

| Route | Purpose |
|---|---|
| `/` | **Search home.** A single dynamic search box. Suggestions appear only after **≥3 characters**; nothing shown before. Selecting a result → `/mountains/[slug]`. |
| `/mountains/[slug]` | **Browse (neutral).** Full conditions: current + 7-day daily outlook + avalanche + snowpack + satellite + a Model Lab link. A **Pin** button → the pin screen. If the mountain is already pinned locally, show a "You've pinned this · {date} →" link to the focused view. With `?target=YYYY-MM-DD`, renders the **focused** view (see §5). |
| `/mountains/[slug]/pin` | **Pin screen.** Form: target date (single date) + optional notes. Save → write to localStorage → redirect to `/mountains/[slug]?target=YYYY-MM-DD`. |
| `/mountains/[slug]/models` | **Model Lab** for any mountain: multi-model charts + hourly grid. The forecast-evolution chart shows a "pin a date to see the trend" prompt unless `?target=` is present, then renders for that date. |
| `/your-mountains` | **Your Mountains.** Tiles for each local pin (mountain name, target date, current tone). Empty → empty tiles + "Pin a mountain" CTA. |

Top nav: **[Search (home)] · [Your Mountains]**. The brand/logo links home.

`/mountains` (the old browse-all grid), `/projects/*`, and `/projects/new` routes are **removed** (search home replaces grid browse; project routes are gone).

## 4. Pin model (client-side)

`localStorage` key `mw.pins` holds a JSON array:
```ts
type Pin = {
  mountainId: string;   // slug, e.g. "mt-rainier"
  name: string;         // display name snapshot
  targetDate: string;   // ISO date "YYYY-MM-DD" (single objective day)
  notes: string;        // device-local only; never leaves the browser
  createdAt: string;    // ISO timestamp
};
```
- A small client store (`src/lib/pins.ts` + a `usePins()` hook) reads/writes the array and notifies subscribers (so "Your Mountains" and the "already-pinned" banner stay in sync). SSR-safe (guards `window`).
- The **target date** is the source of truth in the URL (`?target=`) for the focused view, so links are shareable; the localStorage pin is what makes it appear in "Your Mountains" and carries the notes.
- Editing notes / target on the focused view updates the localStorage pin. Removing a pin deletes it from the array (this replaces the old server delete; it is purely local).

## 5. Browse vs focused view

Both render the same mountain detail screen (reusing the Cirque panels). The difference is driven solely by the presence of `?target=`:

- **Browse (no target):** headline = current conditions for the current/nearest day + the 7-day outlook; avalanche, snowpack, satellite, Model Lab link. **No** single target verdict, **no** forecast-evolution chart, **no** notes.
- **Focused (`?target=`):** adds — the target day highlighted across the daily outlook + freezing hero; the **forecast-evolution** chart (how the prediction for the target date has trended, from accumulated snapshots); editable **notes** (from the local pin). If the target is **beyond the ~7-day forecast window**, the weather panels show a calm "We'll start tracking this as your date gets within range" state instead of empty panels; everything fills in automatically as the date enters range (the mountain is always being pulled).

## 6. Data pipeline

The orchestrator fans out to **all mountains** for each source on a fixed cadence — no pin-awareness, no throttling, no priority:

| Source | Worker | Cadence | Notes |
|---|---|---|---|
| Weather | `weather_worker` | hourly | Per mountain: write latest forecast blob + append a history snapshot. |
| Avalanche (NWAC) | `nwac_worker` | morning publish window, in-season | Off-season → graceful no-op/summer banner. |
| Snowpack (SNOTEL) | `snotel_worker` | daily | Per station. |
| Satellite | `satellite_worker` | weekly | Per mountain true-color scene to GCS. |

- The orchestrator's job payloads stay `{type: "weather"|"nwac"|"snotel"|"satellite"}`; for each type it loads **all mountain ids** and publishes one refresh message per mountain. The active-project query + 6-hour browse throttle are removed.
- **`backfill_worker` is deleted** (function, Terraform, tests, vendoring). Forecast evolution accumulates forward from the hourly snapshots.
- The `weather_worker` becomes mountain-scoped only (no project loop, no `currentSummary`-for-target computation): it writes the per-mountain latest forecast + a snapshot, and updates the mountain's current rollup.

## 7. Firestore schema (single `(default)` database)

- `mountains/{mountainId}` — static metadata (from `mountains-data`) **+** a `current` rollup written each weather pull (latest day-rows summary for the browse headline + `updatedAt`).
- `mountains/{mountainId}/snapshots/{autoId}` — one per weather pull: `{ fetchedAt, forecastBlobPath, models, expireAt }` where `models` carries per-model day rows (summit high/low, wind, freezing level, precip per day) used by the daily outlook, freezing hero, model lab, and evolution. **TTL** on `expireAt` (= `fetchedAt` + 35 days) auto-deletes.
- `snotelData/{mountainId}`, `nwacForecasts/{zoneId}`, `satelliteCache/{mountainId}` — unchanged shape; refreshed for all mountains.
- **`projects` (+ `projects/{id}/weatherSnapshots`) — removed.**
- GCS: per-mountain latest forecast `combined.json` under the weather bucket; per-mountain satellite scene under the satellite bucket (as today, but keyed by mountain only).
- Composite index: the old `projects` (status, targetDateEnd) index is removed. Snapshots are queried by their parent mountain ordered by `fetchedAt` — a single-field index suffices (no composite needed).

## 8. API (read-only, mountain-scoped)

Re-point the project-scoped routes to mountain-scoped and delete project CRUD:

| New route | Replaces | Returns |
|---|---|---|
| `GET /api/mountains` | (same) | all mountains list |
| `GET /api/mountains/[slug]` | (same) | mountain metadata + current rollup |
| `GET /api/mountains/[slug]/weather` | `…/projects/[id]/weather` | latest forecast blob (per-model day rows) |
| `GET /api/mountains/[slug]/snapshots` | `…/projects/[id]/snapshots` | snapshot history (for evolution) |
| `GET /api/mountains/[slug]/snotel` | `…/projects/[id]/snotel` | snowpack |
| `GET /api/mountains/[slug]/nwac` | `…/projects/[id]/nwac` | avalanche |
| `GET /api/mountains/[slug]/satellite` | `…/projects/[id]/satellite` | satellite metadata |
| `GET /api/mountains/[slug]/satellite/image` | `…/projects/[id]/satellite/image` | streams the scene JPEG from GCS |

**Removed:** `POST /api/projects`, `GET /api/projects`, `GET/PATCH/DELETE /api/projects/[id]`, and all `projects/[id]/*` routes. `POST /api/admin/trigger-refresh` may remain (manual refresh by mountain) or be removed — kept, retargeted to a mountainId.

All GETs return `Cache-Control: no-store` (or short) as today; serialization (Timestamp→ISO) unchanged.

## 9. Frontend

Keep the Cirque visual system and panels; rewire from project-scoped to mountain-scoped + local pin.

- **New:** `src/app/page.tsx` → search home (reuse the existing `MountainSearch` combobox); `src/app/your-mountains/page.tsx` → pins tiles; `src/app/mountains/[slug]/pin/page.tsx` → local pin form; `src/lib/pins.ts` + `usePins()` hook.
- **Moved/repurposed:** the project detail (`ProjectDetail`, `ProjectHeader`) becomes the mountain detail at `src/app/mountains/[slug]/page.tsx`, reading mountain data and applying `?target=`. Model Lab moves to `src/app/mountains/[slug]/models/page.tsx`.
- **Removed:** `src/app/projects/*` (page, detail, new, models), the Delete/Unpin server actions in `ProjectHeader`, `/api/projects` client calls, the old dashboard data dependency on `/api/projects`.
- Renames are encouraged where they reduce confusion (e.g. `ProjectDetail` → `MountainDetail`), but not required if risky; follow existing patterns. Component renames are listed in the plan.
- Notes editing writes to the local pin (no API). Share/copy-link copies the `?target=` URL.

## 10. Infrastructure (single environment)

- One environment in project `mountain-weatherman-app`. **No Terraform workspaces, no env-prefixing, no named `dev-db`** — use the `(default)` Firestore database and bare resource names. `env`/workspace logic from the 2026-06-15 design is removed.
- `terraform apply` deploys everything (5 functions, Cloud Run via Cloud Build, Pub/Sub, scheduler, IAM, Secret Manager containers, monitoring, Firestore TTL). The `web` module, in-graph staging (`terraform_data.stage_functions`), and in-graph DLQ policy are retained but de-workspaced.
- The `tfstate` GCS bucket is re-bootstrapped (it was deleted in the clean-slate). Functions: orchestrator, weather_worker, nwac_worker, snotel_worker, satellite_worker (backfill removed).
- **One-time CDSE secret bootstrap** stays the only out-of-band step (satellite worker needs a secret version before it deploys).
- Budget alert + DLQ alert retained.

## 11. Quotas / cost (verified safe)

- Open-Meteo (free non-commercial; ~10k/day, 5k/hr): 10 mountains × hourly ≈ 240–720 calls/day. No backfill calls.
- NWAC: a few zones, morning window, idempotent skips; summer no-op.
- SNOTEL: 10 stations, daily.
- CDSE satellite (Sentinel Hub Processing): 10 × weekly ≈ 40 small renders/week, within free PU.
- Firestore: ~240 writes/day, ≤~8.4k live docs (35-day TTL). Cloud Run + Functions scale to zero.

## 12. Rebuild & seed

GCP is currently empty (clean slate). The rebuild:
1. Re-create the `tfstate` bucket (bootstrap), `terraform init`.
2. Create the CDSE secret containers (targeted apply) + add versions, then `terraform apply` (or apply → seed secrets → re-apply).
3. Seed the 10 mountains: `GCP_PROJECT=… npm run seed:mountains` (against `(default)`; no `FIRESTORE_DATABASE` needed now).
4. Trigger each source once to populate, then it runs on schedule.

## 13. Quality gates

- Web: `npm run build` · `npm test` (Vitest ≥90/90/85) · e2e (now stable — browse uses live pulled data; pins are client-side, no fixture-date problem).
- Python: `cd functions && pytest` (≥90).
- Infra: `terraform validate`.
- TDD: failing test first, then implement.

## 14. Non-goals / out of scope

- No login/accounts; no server persistence of pins/notes.
- No date *ranges* for pins (single target date); revisit later if needed.
- No adding mountains via UI (still seeded from `mountains-data`).
- No dual-env / staging (single environment).
