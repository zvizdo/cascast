# All-Terraform Dual-Environment Deployment — Design

**Date:** 2026-06-15
**Status:** Approved (design); pending implementation plan.
**Supersedes:** the ad-hoc deploy model (`scripts/deploy-web.sh`, manual `stage-functions.sh`, out-of-band gcloud DLQ + secret steps, single shared `(default)` Firestore).

## 1. Goal

One system — Terraform — deploys everything, top to bottom, for two fully isolated environments (`dev` and `prod`) living in the **single** GCP project `mountain-weatherman-app`. After this work, deploying any environment is exactly:

```bash
terraform -chdir=terraform workspace select prod   # or: dev
terraform -chdir=terraform apply
```

That single `apply` must:
- build & push the Next.js web image,
- stage (vendor `shared/`) and deploy all 6 Cloud Functions,
- deploy the web app to Cloud Run,
- provision Firestore, Storage, Pub/Sub, scheduler, IAM, secrets (containers), monitoring,
- attach the DLQ dead-letter policy.

**No manual scripts in the deploy path.** Scripts may exist as files, but Terraform invokes them (via `local-exec`); the operator never runs them by hand.

**Out of scope (explicit decision):** data seeding. Terraform provisions infra only. The existing `scripts/seed-*.ts` remain standalone tools the operator runs manually when desired.

**Clean-slate requirement (user directive 2026-06-15):** before Terraform is tested, all existing GCP resources for this project are torn down (including the out-of-band Cloud Run service and source-deploy Artifact Registry repos), and the prod Firestore `(default)` database is emptied completely. The previous "preserve live data" intent is withdrawn — there is no data to migrate.

## 2. Non-goals

- Two separate GCP projects (rejected: single-project model chosen for POC cost/complexity).
- CI/CD on GitHub (repo has no remote; quality gates are local).
- Migrating GCS bucket *contents* (regenerable by re-running pipelines).
- Seeding reference or demo data from Terraform.

## 3. Environment selection — Terraform workspaces

`env` is **derived from the active workspace name**, so there is no `-var-file` to remember and per-env state isolation is automatic.

```hcl
locals {
  env = terraform.workspace   # "dev" | "prod"
}

# Guard: refuse to apply in the unconfigured default workspace.
resource "terraform_data" "workspace_guard" {
  lifecycle {
    precondition {
      condition     = contains(["dev", "prod"], terraform.workspace)
      error_message = "Select a workspace first: terraform workspace select dev|prod"
    }
  }
}
```

- State: the existing GCS backend (`mountain-weatherman-app-tfstate`, prefix `terraform/state`) stores each workspace's state under a separate object automatically.
- `terraform/environments/dev.tfvars` and `prod.tfvars` are **removed**. `project_id` and `region` become constants/locals (single project). `budget_billing_account` becomes a local (only consumed in `prod`).
- `var.env` is replaced throughout by `local.env` (passed into modules as before).

## 4. Isolation matrix

Everything is uniformly `${env}-` prefixed. The **single exception** is the prod Firestore database, which stays `(default)` to preserve existing live data.

| Resource | dev | prod |
|---|---|---|
| Firestore database | named `dev-db` (fresh) | `(default)` (adopted, **started empty**) |

> **Note (impl):** Firestore database ids must be 4–63 chars, so the bare workspace name `dev` (3 chars) is invalid. Non-prod workspaces use `"${workspace}-db"` (e.g. `dev-db`); prod stays `(default)`.
| weather bucket | `mountain-weatherman-app-dev-weather-data` | `mountain-weatherman-app-prod-weather-data` |
| satellite bucket | `mountain-weatherman-app-dev-satellite-tiles` | `mountain-weatherman-app-prod-satellite-tiles` |
| source bucket | `mountain-weatherman-app-dev-function-source` | `mountain-weatherman-app-prod-function-source` |
| functions | `dev-orchestrator`, `dev-weather-worker`, … | `prod-orchestrator`, … |
| Pub/Sub topics | `dev-orchestrate`, `dev-weather-refresh`, … | `prod-*` |
| DLQ topic | `dev-refresh-dlq` | `prod-refresh-dlq` |
| scheduler jobs | `dev-weather-orchestrate`, … | `prod-*` |
| worker SAs | `dev-orchestrator@…`, … | `prod-*@…` |
| Cloud Run service | `mtn-weather-web-dev` | `mtn-weather-web-prod` |
| web runtime SA | `dev-web@…` | `prod-web@…` |
| Artifact Registry repo | `web-dev` | `web-prod` |
| CDSE secrets (containers) | `dev-cdse-client-id`, `dev-cdse-client-secret` | `prod-cdse-client-id`, `prod-cdse-client-secret` |
| budget | — | one project-wide budget (gated to prod) |
| TF state | workspace `dev` | workspace `prod` |

**Bucket lifecycle:** `force_destroy = local.env == "dev"` (prod buckets protected from accidental destroy).

## 5. Code changes — named-database support

Named Firestore databases require every client to name its database. New env var `FIRESTORE_DATABASE`:
- prod → `(default)`
- dev → `dev-db`
- emulator / unit tests → `(default)` (default fallback)

The value is derived in Terraform: `firestore_database = local.env == "prod" ? "(default)" : "${local.env}-db"`, and injected into both the functions' `shared_env` and the Cloud Run service env vars.

### 5.1 Python — `functions/shared/firestore_client.py`

Current (line 17): `_db_client = firestore.client()`

New:
```python
import os
# ...
_db_client = firestore.client(database_id=os.environ.get("FIRESTORE_DATABASE", "(default)"))
```
(firebase-admin 6.5.0 supports the `database_id` kwarg.) Only the canonical `functions/shared/firestore_client.py` is edited; the vendored per-function copies are regenerated by the staging step.

### 5.2 Node — `src/lib/firebase-admin.ts`

Current (line 22): `db = getFirestore(getApp());`

New:
```ts
db = getFirestore(getApp(), process.env.FIRESTORE_DATABASE ?? "(default)");
```
(firebase-admin 12.7.0 supports the `databaseId` argument.)

### 5.3 Tests

- Python: `functions/conftest.py` already patches `firebase_admin.firestore.client`; assert the patched call still works with the new kwarg (set `FIRESTORE_DATABASE` in the test env or rely on the `(default)` fallback).
- Node: existing tests mock `firebase-admin/firestore`; verify `getFirestore` mock tolerates the second argument. Coverage thresholds (90/90/85 web; 90 py) must stay green.

## 6. Web → Cloud Run, fully in Terraform

Replaces `scripts/deploy-web.sh` (deleted). New `terraform/modules/web/`:

1. `google_artifact_registry_repository` `web-${env}` (DOCKER, region `us-west1`).
2. Image build via `terraform_data.build` + `local-exec`:
   ```
   gcloud builds submit --project mountain-weatherman-app \
     --tag us-west1-docker.pkg.dev/mountain-weatherman-app/web-${env}/web:${image_tag} \
     <repo root>
   ```
   `image_tag` is a content hash of the web source (e.g. `md5` over `package-lock.json`, `Dockerfile`, `next.config.ts`, and `src/**`) computed in Terraform, so the build re-runs only when the web source changes. The Cloud Run service references the image by that exact tag, so a changed hash forces a new revision.
3. `google_cloud_run_v2_service` `mtn-weather-web-${env}`:
   - image = the tagged Artifact Registry image,
   - port 8080, ingress all, public (`allUsers` → `roles/run.invoker` via `google_cloud_run_v2_service_iam_member`),
   - runtime SA = the dedicated `${env}-web` SA,
   - env vars set declaratively:
     `GCP_PROJECT`, `ENV=${env}`, `FIRESTORE_DATABASE`, `GCS_BUCKET_WEATHER`, `GCS_BUCKET_SATELLITE`, `TOPIC_WEATHER_REFRESH`, `TOPIC_BACKFILL_REFRESH`, `TOPIC_NWAC_REFRESH`, `TOPIC_SNOTEL_REFRESH`, `BROWSE_REFRESH_MODE=scheduled`.
4. Dedicated web runtime SA `${env}-web` (in the IAM module) with least privilege: `roles/datastore.user`, `roles/storage.objectAdmin`, `roles/pubsub.publisher` — replacing reliance on the default compute (editor) SA.

Build dependency: the Docker build needs `cloudbuild.googleapis.com` + `artifactregistry.googleapis.com` (already enabled) and the build pushes to the per-env repo. `gcloud builds submit` uses the Cloud Build default SA.

## 7. Functions staging + DLQ — into the Terraform graph

### 7.1 Staging (vendoring `shared/`)
`scripts/stage-functions.sh` is retained but invoked by Terraform, never by hand:
```hcl
resource "terraform_data" "stage_functions" {
  triggers_replace = { src = <hash of functions/shared + each worker source> }
  provisioner "local-exec" { command = "${path.root}/../scripts/stage-functions.sh" }
}

data "archive_file" "src" {
  for_each   = local.functions
  depends_on = [terraform_data.stage_functions]
  # ...
}
```
The trigger hash ensures re-staging whenever any function/shared source changes.

### 7.2 DLQ dead-letter policy
Replaces the manual gcloud step. Per function, a `terraform_data` with `local-exec` resolves the Gen2 trigger's auto-created push subscription and sets the dead-letter policy:
```
SUB=$(gcloud eventarc triggers describe <trigger> --location us-west1 \
  --project mountain-weatherman-app --format='value(transport.pubsub.subscription)')
gcloud pubsub subscriptions update "$SUB" --project mountain-weatherman-app \
  --dead-letter-topic=<dlq_topic> --max-delivery-attempts=5
```
Triggered on the function's id so it re-applies if the function is recreated. The existing placeholder `google_pubsub_subscription.dlq_attach` ("records intent") is removed in favor of this.

## 8. Project-global resources (single-project gotcha)

No separate bootstrap layer is needed; each potential cross-workspace conflict is resolved by scoping:
- **CDSE secrets:** env-prefixed names (`${env}-cdse-*`) → no clash between workspaces. Secret **values** are added out-of-band (`gcloud secrets versions add`), never in Terraform. The `secret` name in the functions module changes from `lower(replace(KEY,"_","-"))` to `"${local.env}-" + lower(replace(KEY,"_","-"))`.
- **Artifact Registry:** per-env repo → no clash.
- **Budget:** project-wide; created only in the `prod` workspace (`count = local.env == "prod" ? 1 : 0`) to avoid duplicate budgets on the same project. `budget_billing_account` is a local set for prod.
- **API enablement (`google_project_service`):** stays in root. It is idempotent with `disable_on_destroy = false`; both workspaces harmlessly ensure-enabled and neither disables on destroy.

## 9. Clean-slate teardown, then rebuild

Per the user directive, this is **not** a data-preserving migration. The existing deployment is fully torn down and rebuilt from scratch; the prod Firestore `(default)` database is emptied (the database object is kept and adopted, since deleting/recreating `(default)` is quirky — only its data is cleared).

Current state (default workspace) holds: `(default)` Firestore with live data, `dev-*` compute, bare-named buckets, bare CDSE secrets. Plus **out-of-band** resources not in Terraform: the `mtn-weather-web` Cloud Run service and the `cloud-run-source-deploy` / `gcf-artifacts` Artifact Registry repos (created by `gcloud run deploy --source` and Gen2 function builds).

**Teardown (exact commands in the implementation plan):**
1. `terraform state rm` the Firestore database resource (and its index/TTL) from the current state so the `(default)` database object is **not** deleted by destroy.
2. `terraform destroy` the rest of the current default-workspace state (all `dev-*` compute/topics/subs/scheduler/IAM/secrets/monitoring/buckets). Buckets have `force_destroy = true` (env=dev) so they delete cleanly.
3. Delete out-of-band resources manually via `gcloud`: the `mtn-weather-web` Cloud Run service, and the `cloud-run-source-deploy` + `gcf-artifacts` Artifact Registry repos.
4. Empty the `(default)` Firestore database completely (e.g. `firebase firestore:delete --all-collections --force`).
5. Delete the old default-workspace state object so the project starts from a clean state.
6. **Preserve** the `mountain-weatherman-app-tfstate` backend bucket (it holds Terraform state) — never delete it.

**Rebuild:**
7. Land the refactored Terraform.
8. `terraform workspace new prod` → `terraform import` the (now-empty) `(default)` database → `terraform apply` (creates all `prod-*` resources, adopts the empty `(default)` DB, recreates its index/TTL).
9. `terraform workspace new dev` → `terraform apply` (all fresh, incl. the new `dev` database).
10. Populate `dev-cdse-*` and `prod-cdse-*` secret values. Optionally trigger the pipelines per env to fill buckets/Firestore.

> **CDSE secret bootstrap (impl).** The `satellite-worker` references its secret at `versions/latest`, so the secret **must have a version before that function deploys** — otherwise the deploy fails with "Secret … versions/latest was not found". Secret *values* cannot live in Terraform. So per new env: create the secret containers (targeted `terraform apply -target=module.functions.google_secret_manager_secret.cdse_client_id -target=…cdse_client_secret`), add the secret versions, then full `terraform apply`. Equivalently, a first full apply fails on `satellite-worker`, you seed the secrets, and a second apply converges. This one-time seeding is the only out-of-band step. During this migration the values were piped server-side from the pre-existing `cdse-client-id`/`cdse-client-secret` secrets into the new `${env}-cdse-*` secrets (never written to disk).

## 10. File-level change map

- `terraform/backend.tf` — unchanged (workspaces reuse the backend).
- `terraform/variables.tf` — drop `env`; keep `project_id`, `region` (constants), `budget_billing_account` (local/prod-only).
- `terraform/main.tf` — `local.env = terraform.workspace`; add workspace guard; pass `local.env`, `local.firestore_database` into modules; budget gated to prod; new `web` module wired with buckets/topics/SA/firestore_database.
- `terraform/environments/` — directory removed.
- `terraform/modules/firestore/` — database `name = local.env == "prod" ? "(default)" : local.env`; index + TTL reference that database.
- `terraform/modules/storage/` — bucket names `${project}-${env}-…`; `force_destroy = env == "dev"`.
- `terraform/modules/iam/` — add per-env `web` SA + its 3 role bindings.
- `terraform/modules/functions/` — `FIRESTORE_DATABASE` in `shared_env`; secret name env-prefixed; `stage_functions` `terraform_data` + `archive_file` `depends_on`; DLQ `terraform_data` per function; remove `dlq_attach` placeholder.
- `terraform/modules/functions/secrets.tf` — secret ids env-prefixed.
- `terraform/modules/web/` — **new** (Artifact Registry + build + Cloud Run + public IAM).
- `terraform/modules/monitoring/` — budget `count` gated to prod.
- `terraform/outputs.tf` — add Cloud Run URL output.
- `functions/shared/firestore_client.py` — `database_id` from env.
- `src/lib/firebase-admin.ts` — `getFirestore(app, FIRESTORE_DATABASE)`.
- `scripts/deploy-web.sh` — **deleted**.
- `scripts/stage-functions.sh` — retained (now TF-invoked).
- `CLAUDE.md`, `README.md` — deploy docs updated to the workspace workflow; progress log entry.

## 11. Quality gates (must stay green)

- `terraform -chdir=terraform validate`.
- `terraform -chdir=terraform plan` clean (no drift) in both `dev` and `prod` workspaces.
- `npm run build` and `npm test` (coverage 90/90/85) — covers the `firebase-admin.ts` change.
- `cd functions && pytest` (coverage `--cov-fail-under=90`) — covers the `firestore_client.py` change.
- Live smoke + Playwright e2e against the deployed `dev` Cloud Run URL.
- Manual acceptance: from a clean checkout, `workspace select dev && apply` then `workspace select prod && apply` each produce a working, env-isolated deployment with no manual gcloud/script steps.

## 12. Risks & mitigations

- **Build inside Terraform (`local-exec`)** is not pure-declarative; mitigated by content-hash triggers so builds are deterministic and skipped when unchanged. Accepted as the only way to reach one-command deploy for image builds + vendoring.
- **Clean-slate teardown is destructive by design.** All current data is intentionally discarded (user directive); the only protected resource is the `tfstate` backend bucket. The `(default)` database object is kept (only emptied) to avoid Firestore's quirky default-DB delete/recreate.
- **DLQ via `local-exec`** depends on `gcloud` resolving the Gen2 auto-subscription; mitigated by triggering on the function id and failing loudly if the subscription can't be resolved.
- **firebase-admin `database_id` support** assumed for 6.5.0 (py) / 12.7.0 (node); verified during the first implementation task before broader changes.
