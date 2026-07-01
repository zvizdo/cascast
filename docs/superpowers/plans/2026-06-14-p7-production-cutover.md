# P7 — Production Cutover & Demo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. This is an **infra/ops + verification** phase: tasks are step-by-step `terraform`/`gcloud`/`firebase`/`curl`/Playwright commands with expected output, not unit tests — except the `deploy.yml` YAML-validity check and one production smoke Playwright spec.

**Goal:** Cut the Mountain Weather POC over to **production** on real data and prove it end-to-end. Finalize `prod.tfvars`; provision prod secrets (Mapbox token + CDSE OAuth in Secret Manager) and confirm the worker service accounts can read them; wire `deploy.yml` (terraform apply prod on push to `main`, plus the App-Hosting auto-deploy note); `terraform apply` the full prod stack (6 Cloud Functions, 4 scheduler jobs, topics + DLQ, buckets, Firestore + TTL, monitoring/budget); seed the 10 prod mountains; verify the scheduled pipeline runs and writes Firestore/GCS with an empty DLQ; stand up the **34-hour Rainier scenario** (+ favorable Baker + hazardous Shuksan) demo data; run a live production Playwright smoke across every screen with screenshots; sanity-check cost/monitoring and the attribution footer; write `docs/DEMO.md`; and sign off the POC.

**Architecture:** Same monorepo and infra as dev (Terraform-managed GCP, Python Gen2 Cloud Functions, Next.js 16 on Firebase App Hosting, Firestore + Pub/Sub + GCS) — P7 instantiates the **`prod`** environment of that stack. All resources are `${env}`-prefixed (`prod-`) per contract §2; the project is shared (`mountain-weatherman-app`), region `us-west1`. Terraform `prod` state lives in the same `gs://mountain-weatherman-app-tfstate` backend bucket but under a separate workspace/prefix-equivalent state (the prod `apply` uses `-var-file=environments/prod.tfvars`; resources differ by name so dev and prod coexist in one project). The Next.js app is **not** deployed by Terraform — Firebase App Hosting auto-builds from the connected `main` branch (P0 Task 12); `deploy.yml` only runs the prod `terraform apply`.

**Tech Stack:** Terraform 1.8.x (google ~5.40, archive provider); `gcloud` (Cloud Functions Gen2, Pub/Sub, Firestore, Secret Manager, Cloud Logging, Cloud Scheduler); `firebase` CLI (App Hosting); GitHub Actions (`google-github-actions/auth`, `hashicorp/setup-terraform`); `curl`; Playwright 1.49 (desktop 1280×800 + mobile iPhone 12 projects, contract §12). Node 20.9+, Python 3.12.

**References:**
- Spec: `docs/superpowers/specs/2026-06-14-mountain-weather-poc-design.md` — esp. **§7 (P7 scope)**, **§10 (deploy strategy: local-first, deploy at gates, prod cutover isolated in P7)**, **§5 (the 34-hour creation flow)**, §3 (refresh model — hourly weather, 15-min NWAC morning window, daily SNOTEL, weekly satellite), §4 (browse + `BROWSE_REFRESH_MODE=scheduled`).
- Contract: `docs/superpowers/specs/2026-06-14-interface-contract.md` — **§2 (resource names, scheduler crons, env vars, prod secrets CDSE/Mapbox)**, **§12 + §12a (attribution footer + units toggle)**, §3/§7/§9 (Firestore shapes + API routes the smoke test hits), §10 (10-peak seed dataset), §0/§11 (Cirque screens the smoke test covers), spec §2 #15–17 (budget/DLQ/error-rate monitoring decisions).
- Format exemplar + reused artifacts: `docs/superpowers/plans/2026-06-14-p0-foundation.md` (Terraform root, `dev.tfvars`/`prod.tfvars`, `apphosting.yaml`, `test.yml`, `seed-mountains.ts`, monitoring module).
- Backend phases: `docs/superpowers/plans/2026-06-14-p1-weather-pipeline.md` (functions module, deploy packaging / `shared/` vendoring, manual `weather-refresh` verification), `docs/superpowers/plans/2026-06-14-p2-nwac-snotel-satellite.md` (3 more workers, CDSE Secret Manager `secrets.tf`, `cdse_client_id`/`cdse_client_secret` tfvars), `docs/superpowers/plans/2026-06-14-p3-api-layer.md` (API routes + `POST /api/projects` immediate-refresh + backfill fan-out; `admin/trigger-refresh`).

**Prerequisites:**
- **P0–P3 complete and merged**, and **P4–P6 complete** (UI phases) so the live app has every screen the smoke test hits. *(See "Gaps / assumptions" — P4/P5/P6 plan docs are not yet present in `docs/superpowers/plans/`; if any UI phase is incomplete, defer Tasks 7–8/10 of this plan to a follow-up but still execute the infra Tasks 1–6, 9, 11.)*
- `gcloud` authenticated as **owner** of `mountain-weatherman-app`; Terraform dev state exists; the `archive` provider is in `terraform/backend.tf` (P1).
- A **real Mapbox token** and a **real CDSE OAuth client** (`CDSE_CLIENT_ID` / `CDSE_CLIENT_SECRET`) created and in hand.
- The **billing account id** for `mountain-weatherman-app` (for budget alerts) — get it via `gcloud billing projects describe`.
- A **GitHub repo + remote** with App Hosting connected to `main` (P0 Task 12), and permission to add Actions secrets/environments.
- A **prod CI service-account key** (`GCP_SA_KEY_PROD`) with the roles Terraform needs (`roles/owner` or the narrower set: cloudfunctions admin, run admin, pubsub admin, storage admin, cloudscheduler admin, datastore owner, secretmanager admin, monitoring editor, iam serviceAccount admin, billing budgets editor, serviceusage admin).

**Exit criteria:**
- `terraform/environments/prod.tfvars` finalized (env=prod, region us-west1, billing account id) and prod resource names confirmed per contract §2.
- Prod secrets provisioned: Mapbox token reaches the App Hosting backend; `cdse-client-id` / `cdse-client-secret` exist in Secret Manager and the **satellite worker SA** can read them (the weather worker SA does **not** need them — see notes).
- `.github/workflows/deploy.yml` exists, is valid YAML, runs `terraform apply -var-file=environments/prod.tfvars -auto-approve` on push to `main` via `google-github-actions/auth` (`GCP_SA_KEY_PROD`), notes App-Hosting auto-deploy, and lists the required GitHub secrets/environments.
- `terraform apply -var-file=environments/prod.tfvars` succeeds and creates the expected prod resource counts (6 functions, 4 scheduler jobs, 7 topics incl. DLQ, 3 buckets, Firestore TTL, monitoring + budget).
- Prod `mountains` collection has **10 docs**.
- The scheduled pipeline is verified live (weather hourly, NWAC 15-min idempotent morning capture, SNOTEL daily, satellite weekly) writing Firestore/GCS; **DLQ empty**.
- The 34-hour Rainier scenario project exists with a populated `currentSummary` + a non-empty evolution chart (backfill), plus favorable Baker + hazardous Shuksan projects.
- `tests/e2e/prod-smoke.spec.ts` passes against the live App Hosting URL with screenshots of every screen; manual checklist fallback recorded.
- Budget alerts ($10/$25), DLQ alert policy, and worker error-rate visibility confirmed; worker logs clean; attribution footer renders in prod.
- `docs/DEMO.md` written; POC sign-off checklist complete.

---

## File structure created/modified in P7

| Path | Action | Responsibility |
|---|---|---|
| `terraform/environments/prod.tfvars` | **modify** | Finalize prod vars (env, region, `budget_billing_account`); document non-committed secret vars |
| `.github/workflows/deploy.yml` | create | Prod terraform apply on push to `main` + App-Hosting note + required-secrets list |
| `tests/e2e/prod-smoke.spec.ts` | create | Playwright smoke across every screen on the live prod URL |
| `playwright.config.ts` | (read/optionally extend) | A `prod` project / `PROD_BASE_URL` override for the live smoke run |
| `docs/DEMO.md` | create | Written 34-hour-Rainier demo walkthrough + talking points |
| `scripts/seed-demo.ts` | create (optional) | Idempotent prod demo-project creator (calls `POST /api/projects`) — fallback to raw `curl` |
| `README.md` | **modify** | Prod URL, prod resource map, secret-rotation + rollback notes |
| `.secrets/prod.auto.tfvars` (gitignored) | create (local only) | `cdse_client_id` / `cdse_client_secret` values for local prod applies — **never committed** |

---

## Task 1: Finalize `prod.tfvars` + confirm prod resource names

**Files:** Modify `terraform/environments/prod.tfvars`.

- [ ] **Step 1: Get the billing account id**

Run: `gcloud billing projects describe mountain-weatherman-app --format="value(billingAccountName)"`
Expected: `billingAccounts/XXXXXX-XXXXXX-XXXXXX`. Record the bare id (strip the `billingAccounts/` prefix for the `google_billing_budget.billing_account` field — confirm the format the monitoring module expects; P0's module passes `var.budget_billing_account` straight into `billing_account`, which wants the bare `XXXXXX-XXXXXX-XXXXXX`).

- [ ] **Step 2: Finalize `terraform/environments/prod.tfvars`**

```hcl
# terraform/environments/prod.tfvars
project_id             = "mountain-weatherman-app"
region                 = "us-west1"
env                    = "prod"
budget_billing_account = "XXXXXX-XXXXXX-XXXXXX"   # from Step 1 (enables $10/$25 budget alerts)
# CDSE secrets are NOT set here (sensitive). Pass at apply time via a gitignored
# .secrets/prod.auto.tfvars or -var flags (Task 4 Step 4 / Task 2).
```

- [ ] **Step 3: Confirm prod resource names match contract §2**

Cross-check (read-only) that the `${env}` prefix renders the expected prod names. With `env=prod`:
- Topics: `prod-orchestrate`, `prod-weather-refresh`, `prod-backfill-refresh`, `prod-nwac-refresh`, `prod-snotel-refresh`, `prod-satellite-refresh`, `prod-refresh-dlq` (contract §2 Pub/Sub table).
- Scheduler jobs: `prod-weather-orchestrate` (`0 * * * *`), `prod-nwac-orchestrate` (`*/15 7-11 * * *`), `prod-snotel-orchestrate` (`0 7 * * *`), `prod-satellite-orchestrate` (`0 8 * * 0`), all `America/Los_Angeles` (contract §2 Scheduler table).
- Functions: `prod-orchestrator`, `prod-weather-worker`, `prod-backfill-worker`, `prod-nwac-worker`, `prod-snotel-worker`, `prod-satellite-worker` (contract §2 Functions table).
- SAs: `prod-orchestrator`, `prod-weather-worker`, … (P0 iam module).
- Buckets: `mountain-weatherman-app-weather-data`, `-satellite-tiles`, `-function-source` — **note these are NOT `${env}`-prefixed** in P0's storage module (they use `local.prefix = var.project_id`). **This means dev and prod share the same buckets.** See "Gaps / assumptions" — acceptable for a single-project POC; document it.

Run (after init, read-only): `terraform -chdir=terraform plan -var-file=environments/prod.tfvars` and grep the plan for the names above (full plan happens in Task 4; this step just eyeballs names).

- [ ] **Step 4: Commit**

```bash
git add terraform/environments/prod.tfvars
git commit -m "feat(p7): finalize prod.tfvars (env, region, billing account)"
```

---

## Task 2: Provision prod secrets (Mapbox + CDSE) and verify SA access

**Files:** none committed (secrets live in Secret Manager / App Hosting / gitignored tfvars).

- [ ] **Step 1: Create the CDSE secrets in Secret Manager (Terraform-owned)**

The CDSE secrets are **declared by Terraform** (`terraform/modules/functions/secrets.tf`, P2): `google_secret_manager_secret` + `_version` for `cdse-client-id` and `cdse-client-secret`, plus a `secretmanager.secretAccessor` IAM member for the **satellite worker SA**. Provide the values at apply time (Task 4) — do **not** create them by hand if Terraform manages the versions (avoid drift). Stage them locally:

```bash
mkdir -p .secrets && cat > .secrets/prod.auto.tfvars <<'EOF'
cdse_client_id     = "<real CDSE client id>"
cdse_client_secret = "<real CDSE client secret>"
EOF
echo ".secrets/" >> .gitignore
```
Expected: gitignored tfvars present; `git status` shows `.secrets/` ignored.

> If you prefer Terraform to manage only the secret *containers* and not the *values*, set the secret versions manually instead:
> `printf %s "<id>" | gcloud secrets versions add cdse-client-id --data-file=- --project mountain-weatherman-app` (and `cdse-client-secret`). Pick one approach and note it in the README to avoid version drift.

- [ ] **Step 2: Provision the Mapbox token to App Hosting**

The Next.js app reads `NEXT_PUBLIC_MAPBOX_TOKEN` (contract §2). It is **public** (ships to the browser) but still set as an App Hosting env var / secret, not committed. Add it to `apphosting.yaml` as a Secret-Manager-backed env (preferred) so it is not in source:

```bash
printf %s "<real mapbox token>" | gcloud secrets create mapbox-token \
  --data-file=- --project mountain-weatherman-app --replication-policy=automatic \
  || printf %s "<real mapbox token>" | gcloud secrets versions add mapbox-token \
       --data-file=- --project mountain-weatherman-app
```
Then reference it in `apphosting.yaml`:
```yaml
env:
  - variable: NEXT_PUBLIC_MAPBOX_TOKEN
    secret: mapbox-token
  - variable: NEXT_PUBLIC_EOX_ATTRIBUTION
    value: "Sentinel-2 cloudless - https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data)"
  - variable: BROWSE_REFRESH_MODE
    value: scheduled
```
Grant the App Hosting backend SA read access if prompted:
```bash
firebase apphosting:secrets:grantaccess mapbox-token --project mountain-weatherman-app --backend <backend-id>
```
Expected: secret created/granted; the next App Hosting build picks it up. (If the `firebase apphosting:secrets` subcommand is unavailable, set the env var in the Firebase console App Hosting settings — document which path was used.)

- [ ] **Step 3: Confirm the satellite worker SA can read the CDSE secrets**

(After Task 4's apply.) Run:
```bash
SA=$(gcloud iam service-accounts list --project mountain-weatherman-app \
     --filter="email~prod-satellite-worker" --format="value(email)")
for s in cdse-client-id cdse-client-secret; do
  gcloud secrets get-iam-policy "$s" --project mountain-weatherman-app \
    --format="value(bindings.members)" | grep -q "$SA" \
    && echo "$s: $SA OK" || echo "$s: MISSING accessor binding"
done
```
Expected: both lines `OK`. (The P2 `secrets.tf` binds `roles/secretmanager.secretAccessor` to the satellite SA on both secrets.)

- [ ] **Step 4: Confirm the weather worker SA does NOT depend on CDSE**

Contract §2 lists `CDSE_CLIENT_ID/SECRET` as **satellite_worker only**. The prompt says "verify the weather/satellite workers' SAs can access them" — only the **satellite** worker needs them, so the check is: satellite SA = accessor (Step 3 OK), weather SA = no CDSE env var. Confirm:
```bash
gcloud functions describe prod-satellite-worker --gen2 --region us-west1 \
  --project mountain-weatherman-app \
  --format="value(serviceConfig.secretEnvironmentVariables[].key)"
```
Expected: `CDSE_CLIENT_ID` and `CDSE_CLIENT_SECRET` present on the **satellite** worker; absent on `prod-weather-worker` (a parallel describe should show none). Record this in the README. *(Assumption noted: the task's "weather/satellite workers' SAs" is satisfied by satellite-only access; the weather worker has no CDSE need.)*

---

## Task 3: `deploy.yml` — prod terraform apply on push to main

**Files:** Create `.github/workflows/deploy.yml`.

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy (prod)
on:
  push:
    branches: [main]

# Note: the Next.js app is NOT deployed here. Firebase App Hosting auto-builds
# and deploys the app from the connected `main` branch (P0 Task 12). This
# workflow only applies the production Terraform infrastructure.

permissions:
  contents: read
  id-token: write   # for google-github-actions/auth (WIF, if used)

concurrency:
  group: prod-terraform
  cancel-in-progress: false

jobs:
  terraform-apply-prod:
    runs-on: ubuntu-latest
    environment: production   # GitHub environment gate (optional manual approval)
    steps:
      - uses: actions/checkout@v4

      - id: auth
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY_PROD }}

      - uses: hashicorp/setup-terraform@v3
        with: { terraform_version: "1.8.5" }

      - name: Terraform init
        run: terraform -chdir=terraform init

      - name: Terraform apply (prod)
        run: |
          terraform -chdir=terraform apply \
            -var-file=environments/prod.tfvars \
            -var="cdse_client_id=${{ secrets.CDSE_CLIENT_ID }}" \
            -var="cdse_client_secret=${{ secrets.CDSE_CLIENT_SECRET }}" \
            -auto-approve
```

> **Deploy packaging:** P1/P2 require `shared/` vendored into each function dir before the source zip is built (P1 Task 13 Step 1). If `terraform apply` builds the source `archive_file` from the function dirs, add a pre-apply vendoring step here mirroring P1:
> ```yaml
>       - name: Vendor shared/ into function dirs
>         run: for fn in orchestrator weather_worker backfill_worker nwac_worker snotel_worker satellite_worker; do rsync -a --delete functions/shared/ "functions/$fn/shared/"; done
> ```
> Place it **before** `Terraform apply`. Confirm the exact vendoring list against P1/P2's final approach (backfill also vendors `weather_worker.summary`).

- [ ] **Step 2: Required GitHub secrets / environments** — document at the top of the workflow file as a comment block, and in the README:

| Name | Type | Purpose |
|---|---|---|
| `GCP_SA_KEY_PROD` | repo/env secret | JSON key for the prod Terraform SA (auth). Required. |
| `CDSE_CLIENT_ID` | repo/env secret | Passed to `-var` so the prod secret version matches the real CDSE client. |
| `CDSE_CLIENT_SECRET` | repo/env secret | As above. |
| `production` | GitHub **environment** | Optional required-reviewers gate before the apply runs. |

> App Hosting needs no secret here (it deploys itself). Mapbox is provisioned in Task 2 (App Hosting secret), not via this workflow.

- [ ] **Step 3: YAML-validity check**

Run: `python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml')); print('valid')"`
Expected: `valid`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(p7): prod terraform apply workflow + app-hosting auto-deploy note"
```

---

## Task 4: Apply infra to prod

**Files:** none (state change only).

- [ ] **Step 1: Init + select/confirm prod state**

Run: `terraform -chdir=terraform init`
Expected: backend initialized against `gs://mountain-weatherman-app-tfstate`. *(Dev and prod resources are name-disambiguated by `${env}` and the buckets are project-scoped; if P0/P1 used a single state for both envs this apply adds the prod-named resources alongside dev. If a separate prod workspace is desired, `terraform workspace new prod` first — confirm which model P0 established and note it.)*

- [ ] **Step 2: Plan prod**

Run:
```bash
terraform -chdir=terraform plan -var-file=environments/prod.tfvars
```
Expected: a clean plan creating the prod stack:
- **6** `google_cloudfunctions2_function` (`prod-orchestrator`, `prod-weather-worker`, `prod-backfill-worker`, `prod-nwac-worker`, `prod-snotel-worker`, `prod-satellite-worker`) + their source objects + DLQ-attach subs.
- **7** `google_pubsub_topic` (6 logical + `prod-refresh-dlq`).
- **4** `google_cloud_scheduler_job`.
- **6** `google_service_account` + their IAM bindings.
- **2** `google_secret_manager_secret` (+ versions + satellite accessor binding).
- **1** `google_billing_budget` (now that the billing account id is set) + **1** DLQ `google_monitoring_alert_policy` (+ the error-rate alert if P0/P1 defined one).
- Firestore DB already exists (shared `(default)`) — TTL field policy is shared, no change.
No errors.

- [ ] **Step 3: Apply prod**

Run:
```bash
terraform -chdir=terraform apply -var-file=environments/prod.tfvars
```
(Local applies pick up CDSE values from `.secrets/prod.auto.tfvars`; or add `-var="cdse_client_id=..." -var="cdse_client_secret=..."`.)
Expected: apply completes; `terraform output function_names` lists the six prod functions.

- [ ] **Step 4: Confirm functions + scheduler + topics**

Run:
```bash
gcloud functions list --gen2 --project mountain-weatherman-app --regions us-west1 \
  --filter="name~prod-" --format="value(name,state)"
gcloud scheduler jobs list --location us-west1 --project mountain-weatherman-app \
  --filter="name~prod-" --format="value(name,schedule)"
gcloud pubsub topics list --project mountain-weatherman-app \
  --filter="name~prod-" --format="value(name)"
```
Expected: 6 functions `ACTIVE`; 4 scheduler jobs with the §2 crons; 7 `prod-*` topics.

- [ ] **Step 5: Bind the DLQ to the prod trigger subscriptions (idempotent, per P1 Task 13 Step 5)**

```bash
for fn in prod-weather-worker prod-backfill-worker prod-orchestrator \
          prod-nwac-worker prod-snotel-worker prod-satellite-worker; do
  SUB=$(gcloud pubsub subscriptions list --project mountain-weatherman-app \
        --filter="name~eventarc AND pushConfig.pushEndpoint~$fn" --format="value(name)" | head -n1)
  [ -n "$SUB" ] && gcloud pubsub subscriptions update "$SUB" \
    --dead-letter-topic="projects/mountain-weatherman-app/topics/prod-refresh-dlq" \
    --max-delivery-attempts=5 --project mountain-weatherman-app || echo "no sub for $fn yet"
done
```
Expected: each trigger subscription updated with the DLQ.

---

## Task 5: Seed prod `mountains` (10 peaks)

**Files:** none (uses `scripts/seed-mountains.ts` from P0; dataset is contract §10).

- [ ] **Step 1: Seed the 10 peaks into prod Firestore**

Run:
```bash
GOOGLE_APPLICATION_CREDENTIALS=<prod-sa-key.json> GCP_PROJECT=mountain-weatherman-app \
  npm run seed:mountains
```
Expected: `Seeded 10 mountains.` (The seed script is idempotent — `batch.set(..., {merge:true})`.)

- [ ] **Step 2: Verify 10 docs**

Run:
```bash
gcloud firestore documents list \
  "projects/mountain-weatherman-app/databases/(default)/documents/mountains" \
  --format="value(name)" | wc -l
```
Expected: `10`. Spot-check Rainier carries `timezone: America/Los_Angeles`, `nwacZoneId: 1648`, `snotelStationTriplet: 679:WA:SNTL` (contract §10) via `gcloud firestore documents describe .../mountains/mt-rainier`.

---

## Task 6: Verify the scheduled pipeline end-to-end in prod

**Files:** none.

- [ ] **Step 1: Force a weather tick (don't wait for the hourly cron)**

Run:
```bash
gcloud pubsub topics publish prod-orchestrate --project mountain-weatherman-app \
  --message='{"type":"weather"}'
```
Wait ~60s. *(With no pinned projects yet, browse refresh is on the 6h cycle, spec §4 — the orchestrator may publish `weather-refresh` for the 10 seed mountains on the right local-hour tick. If nothing fans out because of the 6h self-gate, fall back to a direct per-mountain publish to prove the worker path:)*
```bash
gcloud pubsub topics publish prod-weather-refresh --project mountain-weatherman-app \
  --message='{"mountainId":"mt-rainier","reason":"manual"}'
```

- [ ] **Step 2: Confirm a combined.json landed in GCS + `mountainConditions`**

```bash
gsutil ls "gs://mountain-weatherman-app-weather-data/forecasts/mt-rainier/**/*-combined.json" | head
gcloud firestore documents describe \
  "projects/mountain-weatherman-app/databases/(default)/documents/mountainConditions/mt-rainier" \
  --format="value(fields.forecastBlobPath.stringValue)"
```
Expected: ≥1 blob path; a `forecasts/mt-rainier/.../*-combined.json` value on `mountainConditions/mt-rainier`.

- [ ] **Step 3: Fire NWAC (idempotent morning capture) and verify**

```bash
gcloud pubsub topics publish prod-orchestrate --project mountain-weatherman-app \
  --message='{"type":"nwac"}'
sleep 30
gcloud firestore documents list \
  "projects/mountain-weatherman-app/databases/(default)/documents/nwacForecasts" \
  --format="value(name)" | head
```
Expected: per-zone `nwacForecasts/{zoneId}` docs (e.g. `1648`). **Idempotency check:** publish `{"type":"nwac"}` again; the worker should skip zones already captured today (logs show "skip — already captured"), confirming the no-op behavior (spec §3). In summer the doc carries `productType:"summary"` / `season:"summer"` and is captured once (spec §3, contract §5.2).

- [ ] **Step 4: Fire SNOTEL (daily) + satellite (weekly) and verify**

```bash
gcloud pubsub topics publish prod-orchestrate --message='{"type":"snotel"}' --project mountain-weatherman-app
gcloud pubsub topics publish prod-orchestrate --message='{"type":"satellite"}' --project mountain-weatherman-app
sleep 40
gcloud firestore documents list "projects/mountain-weatherman-app/databases/(default)/documents/snotelData" --format="value(name)" | head
gcloud firestore documents list "projects/mountain-weatherman-app/databases/(default)/documents/satelliteCache" --format="value(name)" | head
```
Expected: `snotelData/{stationId}` docs with `current`+`trend`; `satelliteCache/{mountainId}` docs with `tileSource:"eox-s2cloudless"`, a `latestImageDate` + `cloudCoverPercent` (CDSE catalog badge — proves the satellite SA read the CDSE secrets).

- [ ] **Step 5: Confirm the DLQ is empty**

```bash
gcloud pubsub topics list-subscriptions prod-refresh-dlq --project mountain-weatherman-app
# Inspect undelivered count on the DLQ monitoring metric:
gcloud monitoring time-series list --project mountain-weatherman-app \
  --filter='metric.type="pubsub.googleapis.com/topic/send_message_operation_count" AND resource.label.topic_id="prod-refresh-dlq"' \
  --interval-start-time="$(date -u -v-1H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" 2>/dev/null \
  | grep -c "points" || echo "no DLQ messages"
```
Expected: no messages sent to the DLQ (no points / count 0). If non-zero, inspect the failing worker's logs before proceeding.

- [ ] **Step 6: Confirm all six worker logs are clean**

```bash
for fn in prod-orchestrator prod-weather-worker prod-backfill-worker \
          prod-nwac-worker prod-snotel-worker prod-satellite-worker; do
  echo "== $fn =="
  gcloud functions logs read "$fn" --gen2 --region us-west1 \
    --project mountain-weatherman-app --limit 10 | grep -iE "error|traceback|exception" || echo "clean"
done
```
Expected: `clean` for each (a successful invocation, no tracebacks).

---

## Task 7: Demo data setup — the 34-hour scenario (+ Baker, Shuksan)

**Files:** Create `scripts/seed-demo.ts` (optional) — or use raw `curl`. Mirrors the Cirque prototype's three-project demo (Rainier / Baker favorable / Shuksan hazardous; `prototype-ui/.../app/data.js`).

> The 34-hour scenario (spec §5) requires `targetDateStart ≈ now + 34h` so Rainier lands in the **≤48h hourly** urgency tier (spec §3) and HRRR has data. Today is 2026-06-14; compute the target dynamically at run time. All three projects are created through `POST /api/projects`, which (P3) writes the project, publishes `weather-refresh{reason:"on_create"}` + `nwac`/`snotel` refresh + `backfill-refresh` so `currentSummary` populates in ~10–30s and the evolution chart backfills immediately.

- [ ] **Step 1: Resolve the live prod base URL**

Run: `firebase apphosting:backends:list --project mountain-weatherman-app` (or read it from the README/console).
Set: `PROD_URL=https://<apphosting-backend-url>`

- [ ] **Step 2: Create the 34-hour Rainier project**

```bash
START=$(date -u -v+34H +%Y-%m-%dT00:00:00Z 2>/dev/null || date -u -d '+34 hours' +%Y-%m-%dT00:00:00Z)
TDATE=$(date -u -v+34H +%Y-%m-%d 2>/dev/null || date -u -d '+34 hours' +%Y-%m-%d)
curl -s -X POST "$PROD_URL/api/projects" -H 'content-type: application/json' \
  -d "{\"name\":\"Rainier — 34h Window\",\"mountainId\":\"mt-rainier\",\"targetDateStart\":\"$TDATE\",\"targetDateEnd\":\"$TDATE\",\"notes\":\"Demo: evolving forecast as the date nears.\"}" \
  | python -c "import sys,json;d=json.load(sys.stdin);print('created',d['id'],d['lastRefreshStatus'])"
```
Expected: `created <id> pending`.

- [ ] **Step 3: Create Baker (favorable) + Shuksan (hazardous) for varied dashboard tones**

```bash
for m in mt-baker mt-shuksan; do
  curl -s -X POST "$PROD_URL/api/projects" -H 'content-type: application/json' \
    -d "{\"name\":\"$m demo\",\"mountainId\":\"$m\",\"targetDateStart\":\"$TDATE\",\"targetDateEnd\":\"$TDATE\",\"notes\":\"Demo project.\"}" \
    | python -c "import sys,json;d=json.load(sys.stdin);print('created',d['mountainId'],d['id'])"
done
```
Expected: two `created` lines. *(Tone is computed server-side from real weather/NWAC — we can't force "favorable"/"hazardous". Baker/Shuksan are the prototype's favorable/hazardous picks; if live conditions differ, the demo narration says "tone reflects today's real conditions." Note in DEMO.md.)*

- [ ] **Step 4: Verify immediate refresh populated `currentSummary`**

Wait ~45s, then:
```bash
RID=<rainier project id from Step 2>
curl -s "$PROD_URL/api/projects/$RID" \
  | python -c "import sys,json;d=json.load(sys.stdin);cs=d.get('currentSummary',{});print('tone',cs.get('tone'),'verdict',cs.get('verdict'),'high',cs.get('targetDateHigh'),'status',d['lastRefreshStatus'])"
```
Expected: non-null `tone`/`verdict`/`targetDateHigh` and `lastRefreshStatus` `ok`/`partial` (not `pending`).

- [ ] **Step 5: Verify the backfill populated the evolution chart**

```bash
curl -s "$PROD_URL/api/projects/$RID/snapshots" \
  | python -c "import sys,json;a=json.load(sys.stdin);print('snapshots',len(a));print('sources',sorted({s['source'] for s in a}))"
```
Expected: `snapshots ≥ 2` with `sources` including `backfill` (and `live` once a scheduled tick lands). The Model Lab evolution chart will be non-empty (spec §5).

- [ ] **Step 6: (Optional) capture this as `scripts/seed-demo.ts`** for repeatable demos — same three POSTs, idempotent (skip if a project with the same name+mountain already exists). Commit if created.

```bash
git add scripts/seed-demo.ts 2>/dev/null && git commit -m "feat(p7): prod demo-data seeder (34h Rainier + Baker + Shuksan)" || true
```

---

## Task 8: Production smoke test (Playwright, live URL)

**Files:** Create `tests/e2e/prod-smoke.spec.ts`; optionally extend `playwright.config.ts` with a `prod` project that uses `PROD_BASE_URL`.

- [ ] **Step 1: Add a prod base-URL hook**

The existing `playwright.config.ts` (P0) starts a local webServer. For the live smoke, run with `PROD_BASE_URL` and skip the webServer. Add (or confirm) a config branch:

```ts
// playwright.config.ts (excerpt) — prod live run uses PROD_BASE_URL, no local webServer
const PROD = process.env.PROD_BASE_URL;
// ...in defineConfig:
use: { baseURL: PROD ?? "http://localhost:3000", trace: "on-first-retry" },
webServer: PROD ? undefined : { command: "npm run build && npm run start", url: "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
```

- [ ] **Step 2: Write `tests/e2e/prod-smoke.spec.ts`** — hits every screen (contract §0/§11, routes contract §1/§7) and screenshots each.

```ts
import { test, expect } from "@playwright/test";

const slug = "mt-rainier";

test.describe("prod smoke — every screen", () => {
  test("dashboard renders project cards + tones", async ({ page }, ti) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // at least the demo projects + AddCard
    await expect(page.getByText(/Rainier/i).first()).toBeVisible();
    await page.screenshot({ path: ti.outputPath("01-dashboard.png"), fullPage: true });
  });

  test("pin-a-peak (create) loads with map + search", async ({ page }, ti) => {
    await page.goto("/projects/new");
    await expect(page.getByText(/Pin a Peak|Pin to track/i).first()).toBeVisible();
    await page.screenshot({ path: ti.outputPath("02-pin-a-peak.png"), fullPage: true });
  });

  test("project detail — calm panels + freezing level", async ({ page }, ti) => {
    await page.goto("/");
    await page.getByText(/Rainier/i).first().click();
    await page.waitForURL(/\/projects\/.+/);
    await expect(page.getByText(/The call for/i)).toBeVisible();            // Verdict
    await expect(page.getByText(/Freezing Level/i)).toBeVisible();          // hero
    await expect(page.getByText(/Avalanche|summer operations/i)).toBeVisible();
    await expect(page.getByText(/Snowpack|SNOTEL/i)).toBeVisible();
    await page.screenshot({ path: ti.outputPath("03-project-detail.png"), fullPage: true });
  });

  test("model lab — charts + evolution + hourly grid", async ({ page }, ti) => {
    await page.goto("/");
    await page.getByText(/Rainier/i).first().click();
    await page.waitForURL(/\/projects\/.+/);
    await page.getByRole("link", { name: /Model lab|Compare all models/i }).click();
    await page.waitForURL(/\/projects\/.+\/models/);
    await expect(page.getByText(/Forecast Evolution|evolution/i)).toBeVisible();
    await expect(page.locator("svg").first()).toBeVisible();                // hand-built SVG chart
    await page.screenshot({ path: ti.outputPath("04-model-lab.png"), fullPage: true });
  });

  test("browse mountain page", async ({ page }, ti) => {
    await page.goto(`/mountains/${slug}`);
    await expect(page.getByText(/Rainier/i).first()).toBeVisible();
    await expect(page.getByText(/Freezing Level/i)).toBeVisible();
    // browse excludes the Model Lab / evolution / confidence (contract §0)
    await page.screenshot({ path: ti.outputPath("05-browse-mountain.png"), fullPage: true });
  });

  test("units toggle + theme toggle + share link", async ({ page }, ti) => {
    await page.goto("/");
    await page.getByText(/Rainier/i).first().click();
    await page.waitForURL(/\/projects\/.+/);
    // units toggle (°F⇄°C) — contract §12a
    const cToggle = page.getByRole("button", { name: /°C|km\/h|m\b/ }).first();
    if (await cToggle.isVisible().catch(() => false)) await cToggle.click();
    // theme toggle (Glacier⇄Slate)
    await page.getByRole("button", { name: /theme|Slate|Glacier|dark|light/i }).first().click();
    // share / copy link
    const share = page.getByRole("button", { name: /Share|Copy link/i }).first();
    await expect(share).toBeVisible();
    await page.screenshot({ path: ti.outputPath("06-toggles-share.png"), fullPage: true });
  });

  test("attribution footer renders", async ({ page }, ti) => {
    await page.goto("/");
    await expect(page.getByText(/Open-Meteo\.com/i)).toBeVisible();         // contract §12
    await expect(page.getByText(/NWAC|NRCS|EOX|s2cloudless/i)).toBeVisible();
    await page.screenshot({ path: ti.outputPath("07-footer.png"), fullPage: true });
  });
});
```

> Selectors are best-effort against the Cirque component names (contract §11); adjust the exact role/text to the real P4–P6 markup when running. Keep one screenshot per screen.

- [ ] **Step 3: Run the smoke against prod (desktop + mobile)**

Run:
```bash
PROD_BASE_URL="$PROD_URL" npx playwright test tests/e2e/prod-smoke.spec.ts
```
Expected: all specs pass on both `desktop` and `mobile` projects; screenshots `01..07` under `test-results/` for each. Review the screenshots.

- [ ] **Step 4: Manual checklist fallback** (record in `docs/DEMO.md` if any spec selector can't be stabilized):
  - [ ] Dashboard shows the 3 demo project cards with condition-tone dots + an Add card.
  - [ ] Pin-a-Peak: Mapbox map loads (token works), typeahead returns peaks.
  - [ ] Project detail: Verdict, Daily Outlook (Daily/AM·Mid·PM/Hourly-48h), Freezing-Level cross-section, Confidence strip, Avalanche (or summer message), Snowpack AreaSpark, Satellite + Notes.
  - [ ] Model Lab: multi-model line charts, forecast-evolution chart (backfill+live labeled), MOS hourly grid.
  - [ ] `/mountains/[slug]`: calm panels minus Confidence/Evolution/Model-Lab.
  - [ ] Units toggle changes displayed °F→°C / mph→km·h / ft→m across stats + chart axes.
  - [ ] Theme toggle switches Glacier⇄Slate.
  - [ ] Share/copy-link copies a working URL.
  - [ ] Attribution footer visible on every page.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/prod-smoke.spec.ts playwright.config.ts
git commit -m "test(p7): production smoke spec across every screen + prod base-url hook"
```

---

## Task 9: Cost & monitoring sanity

**Files:** none.

- [ ] **Step 1: Confirm the budget + thresholds exist**

```bash
gcloud billing budgets list --billing-account=XXXXXX-XXXXXX-XXXXXX \
  --format="value(displayName,amount.specifiedAmount.units,thresholdRules.thresholdPercent)"
```
Expected: `prod-mtn-weather-budget` at `25` USD with threshold rules `0.4` ($10) and `1.0` ($25) (P0 monitoring module, spec §2 #15-16).

- [ ] **Step 2: Confirm the DLQ alert policy**

```bash
gcloud alpha monitoring policies list --project mountain-weatherman-app \
  --filter="displayName~prod-refresh-dlq" --format="value(displayName,enabled)"
```
Expected: `prod-refresh-dlq-backlog` enabled (alerts when DLQ message count > 0; spec §2 #17, P0 monitoring module).

- [ ] **Step 3: Confirm worker error-rate visibility**

```bash
# error-rate alert policy if defined; else confirm logs-based error visibility
gcloud alpha monitoring policies list --project mountain-weatherman-app \
  --filter="displayName~error" --format="value(displayName,enabled)"
gcloud logging read 'resource.type="cloud_run_revision" AND severity>=ERROR AND resource.labels.service_name=~"prod-.*-worker"' \
  --project mountain-weatherman-app --limit 20 --freshness=2h
```
Expected: an error-rate alert policy present (spec §2 #15) **or**, if P0/P1 left it as logs-only, an empty error read confirming workers are healthy. *(Note which: the contract's monitoring decisions list a worker error-rate alert; if the P0 module shipped only budget + DLQ alerts, flag it — see "Gaps".)*

- [ ] **Step 4: Confirm the attribution footer renders in prod** — covered by Task 8 Step 2 spec ("attribution footer renders"); re-confirm visually at `$PROD_URL` that "Weather data by Open-Meteo.com", "© NWAC", "USDA NRCS", and the EOX s2cloudless string all appear (contract §12).

---

## Task 10: Demo script (`docs/DEMO.md`)

**Files:** Create `docs/DEMO.md`.

- [ ] **Step 1: Write `docs/DEMO.md`** — a written walkthrough with talking points. Structure:
  1. **Setup** — prod URL; the three demo projects (34h Rainier, Baker, Shuksan); "run `scripts/seed-demo.ts` to (re)create."
  2. **Act 1 — The 34-hour scenario (the differentiator).** Open the Rainier project. Read the Verdict ("The call for {day}" + tone). Point out `currentSummary` populated within seconds of pinning (spec §5). Open Model Lab → **Forecast Evolution chart**: "this is what HRRR/GFS/ECMWF predicted for this date over the last several days — backfilled on pin, then a live point added every scheduled refresh." **Talking point: pinning earns its value by adding *time* — an evolving forecast, not a static glance** (spec §1).
  3. **Act 2 — Browse.** Go to `/mountains` → a peak (`/mountains/[slug]`): instant current forecast, minus evolution/Model-Lab, with a "Pin to track how this forecast evolves" CTA (spec §1).
  4. **Act 3 — Drill into Model Lab.** Multi-model line charts, disagreement flags, MOS-style hourly grid.
  5. **Act 4 — Toggles.** Units (°F⇄°C, mph⇄km·h, ft⇄m, contract §12a) and theme (Glacier⇄Slate). Share a URL (copy-link).
  6. **Varied tones** — Baker (favorable) vs Shuksan (hazardous) cards on the dashboard for visual contrast (mirrors the Cirque prototype, `data.js`).
  7. **Data provenance** — point at the attribution footer (Open-Meteo / NWAC / NRCS / EOX).
  8. **Fallbacks** — what to say if live tone differs from favorable/hazardous, or if NWAC is in summer mode ("summer operations — no active avalanche forecast", spec Q4).

- [ ] **Step 2: Commit**

```bash
git add docs/DEMO.md
git commit -m "docs(p7): 34-hour Rainier demo script + talking points"
```

---

## Task 11: Final verification gate + POC sign-off

- [ ] **Step 1: Run the full prod verification sweep** (collects evidence):

```bash
gcloud functions list --gen2 --regions us-west1 --filter="name~prod-" --format="value(name,state)" --project mountain-weatherman-app
gcloud scheduler jobs list --location us-west1 --filter="name~prod-" --format="value(name,schedule)" --project mountain-weatherman-app
gcloud firestore documents list "projects/mountain-weatherman-app/databases/(default)/documents/mountains" --format="value(name)" | wc -l
curl -s -o /dev/null -w "%{http_code}\n" "$PROD_URL/"
PROD_BASE_URL="$PROD_URL" npx playwright test tests/e2e/prod-smoke.spec.ts
```
Expected: 6 ACTIVE functions; 4 scheduler jobs; `10` mountains; `200` from the app; Playwright green.

- [ ] **Step 2: Confirm CI is green** — push to a branch / confirm the latest `test.yml` run (Python + Vitest + Playwright + `terraform validate`) is green, and that `deploy.yml` parses (Task 3 Step 3). Coverage gates (Python ≥90%, Vitest lines/functions ≥90 / branches ≥85) must be green per contract §12.

- [ ] **Step 3: POC sign-off checklist** (all must be true):
  - [ ] All 6 functions ACTIVE in prod; 4 scheduler jobs scheduled (contract §2 crons).
  - [ ] Topics + DLQ exist; **DLQ empty**; DLQ alert policy enabled.
  - [ ] Budget alerts ($10/$25) configured; worker error-rate visibility confirmed.
  - [ ] Prod secrets: Mapbox reaches App Hosting; CDSE in Secret Manager; satellite SA reads them.
  - [ ] 10 mountains seeded in prod.
  - [ ] Scheduled pipeline proven live (weather/NWAC-idempotent/SNOTEL/satellite) writing Firestore + GCS.
  - [ ] 34-hour Rainier scenario: `currentSummary` populated + evolution chart non-empty (backfill); Baker + Shuksan created.
  - [ ] Every screen verified live (dashboard, pin-a-peak, project detail, Model Lab, browse, units/theme toggles, share) with screenshots.
  - [ ] Attribution footer renders in prod.
  - [ ] `deploy.yml` present + valid; required GitHub secrets/environments documented + set.
  - [ ] `docs/DEMO.md` written; demo rehearsed once end-to-end.
  - [ ] CI green; coverage gates green.

- [ ] **Step 4: Update the README** with the prod URL, the prod resource map, secret-rotation steps (Mapbox/CDSE), and the rollback note below. Commit.

```bash
git add README.md
git commit -m "docs(p7): prod URL, resource map, secret rotation + rollback notes"
```

---

## Verification gate (P7 done when all true)
- `terraform -chdir=terraform plan -var-file=environments/prod.tfvars` clean; `apply` succeeded with the expected counts (6 fns / 4 jobs / 7 topics / 3 buckets / budget + DLQ alert).
- `gcloud functions list` shows 6 `prod-*` ACTIVE; scheduler jobs match contract §2 crons.
- Prod `mountains` = 10; scheduled pipeline writes Firestore/GCS; DLQ empty; worker logs clean.
- Secrets: Mapbox in App Hosting; CDSE in Secret Manager with satellite-SA accessor.
- `deploy.yml` valid YAML; required secrets/environments listed.
- `tests/e2e/prod-smoke.spec.ts` green against `$PROD_URL` (desktop + mobile) with screenshots reviewed.
- Budget + DLQ + error-rate monitoring confirmed; attribution footer renders.
- `docs/DEMO.md` written; POC sign-off checklist complete.
- Invoke `ux-reviewer` on the live prod screens (final pass) and address any blocking findings.

## Rollback / notes
- **Infra rollback:** `terraform -chdir=terraform apply -var-file=environments/prod.tfvars` with `module "functions"` (or specific resources) targeted/commented removes prod functions; the prod base (topics, buckets, scheduler, monitoring) stays. Full prod teardown: `terraform destroy -var-file=environments/prod.tfvars` — **note the shared `(default)` Firestore DB and shared buckets are NOT `prod`-only**; destroying them affects dev too. Prefer targeted destroys.
- **App rollback:** App Hosting keeps prior rollouts — roll back in the Firebase console (or `firebase apphosting:rollouts`) to a previous build; the deploy workflow only touches Terraform.
- **Secret rotation:** Mapbox → `gcloud secrets versions add mapbox-token` then redeploy App Hosting; CDSE → update `.secrets/prod.auto.tfvars` (or the GitHub `CDSE_*` secrets) and re-apply Terraform (or `gcloud secrets versions add cdse-client-id/-secret`). Pick one ownership model (Terraform vs gcloud) to avoid version drift.
- **Open risks / assumptions:**
  1. **P4–P6 UI plans not yet present** in `docs/superpowers/plans/`. Tasks 7–8/10 assume the live app implements the Cirque screens (dashboard, pin-a-peak, project detail calm layer, Model Lab, browse, units/theme toggles, share, footer) per contract §0/§11. If a UI phase is incomplete, run infra Tasks 1–6, 9, 11 now and defer the demo/smoke to when the UI is live. Smoke-spec selectors are best-effort and must be matched to the real markup at run time.
  2. **Buckets are project-scoped, not `${env}`-prefixed** (P0 storage module uses `local.prefix = var.project_id`). Dev and prod therefore **share** the weather/satellite/source buckets and the **shared `(default)` Firestore DB**. Acceptable for a single-project POC but means there is no hard dev/prod data isolation — documented; tighten (separate project or `${env}`-prefixed buckets/named DB) before any real multi-env use.
  3. **Single Terraform state for both envs** (resources name-disambiguated by `${env}`). If P0 instead established a `prod` workspace, run `terraform workspace select prod` before applying — confirm against the P0 backend setup.
  4. **Worker error-rate alert:** spec §2 #15 / contract monitoring decisions call for a worker error-rate alert; P0's monitoring module shown shipped budget + DLQ alerts. If the error-rate policy is absent, add it (or accept logs-based error visibility) — flagged in Task 9 Step 3.
  5. **Tone is real-data-driven** — Baker "favorable" / Shuksan "hazardous" mirror the prototype but live conditions on demo day may differ; DEMO.md narrates this. In summer NWAC returns the "summary"/no-rating state (spec Q4) — the avalanche panel shows the graceful summer message.
  6. **Billing-account format:** the `google_billing_budget.billing_account` field wants the bare `XXXXXX-XXXXXX-XXXXXX`; if `gcloud billing projects describe` returns `billingAccounts/...`, strip the prefix in `prod.tfvars`.
  7. **App Hosting is not Terraform-managed** (P0 note); `deploy.yml` deliberately has no web-deploy step — App Hosting auto-builds from `main`.
- **Attribution (contract §12):** "Weather data by Open-Meteo.com" (CC BY 4.0); avalanche © NWAC; SNOTEL © USDA NRCS; the EOX s2cloudless string — all must render in the prod footer (verified Task 8/9).
