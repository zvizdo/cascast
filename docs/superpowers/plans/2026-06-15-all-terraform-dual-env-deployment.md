# All-Terraform Dual-Environment Deployment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `terraform apply` the single, complete deploy path for two isolated environments (`dev`/`prod`) in the one GCP project `mountain-weatherman-app`, after a clean-slate teardown of all existing resources.

**Architecture:** Terraform workspaces drive `env` (`local.env = terraform.workspace`). Everything is `${env}-` prefixed except the prod Firestore database, which is `(default)` (started empty). A new `web` module brings the Next.js Cloud Run service into Terraform (Cloud Build image build via `local-exec`, then a declarative `google_cloud_run_v2_service`). Function staging and the DLQ dead-letter policy become `terraform_data` + `local-exec` so a single `apply` does everything. No manual scripts in the deploy path; data seeding stays out of Terraform.

**Tech Stack:** Terraform 1.14 (google ~> 5.40, archive ~> 2.4), GCP (Cloud Functions Gen2, Cloud Run v2, Firestore named DBs, Pub/Sub, Cloud Scheduler, Artifact Registry, Cloud Build, Secret Manager, Monitoring), Next.js 16 (firebase-admin 12.7.0), Python 3.12 (firebase-admin 6.5.0).

**Source of truth:** `docs/superpowers/specs/2026-06-15-all-terraform-dual-env-deployment-design.md`. Where this plan and the spec disagree, the spec wins — stop and flag.

**Branch:** `build/terraform-dual-env` (already created; never commit to `main`).

**Ordering rationale:** App code first (independent, TDD). Then teardown — which **must** run against the *current* (unrefactored) Terraform so addresses match state. Then the Terraform refactor. Then rebuild + test. Then docs.

**Live-GCP safety (Phases B & D):** These tasks mutate/destroy real GCP resources in `mountain-weatherman-app`. The user has explicitly authorized the teardown. Always target `--project mountain-weatherman-app` explicitly (the active gcloud config is a different project). Never delete `gs://mountain-weatherman-app-tfstate`.

---

## Phase A — App code: Firestore database awareness (TDD, local only)

### Task A1: Python Firestore client honors `FIRESTORE_DATABASE`

**Files:**
- Modify: `functions/shared/firestore_client.py:1-18`
- Test: `functions/shared/tests/test_firestore_client.py` (append)

- [ ] **Step 1: Write the failing tests**

Append to `functions/shared/tests/test_firestore_client.py`:

```python
def test_db_passes_firestore_database_when_env_set(monkeypatch):
    import firebase_admin
    from firebase_admin import firestore
    fc._db_client = None
    monkeypatch.setenv("FIRESTORE_DATABASE", "dev")
    monkeypatch.setattr(firebase_admin, "_apps", {"x": object()})  # skip initialize_app
    client_mock = MagicMock()
    monkeypatch.setattr(firestore, "client", client_mock)
    fc._db()
    client_mock.assert_called_once_with(database_id="dev")
    fc._db_client = None


def test_db_uses_default_when_env_unset(monkeypatch):
    import firebase_admin
    from firebase_admin import firestore
    fc._db_client = None
    monkeypatch.delenv("FIRESTORE_DATABASE", raising=False)
    monkeypatch.setattr(firebase_admin, "_apps", {"x": object()})
    client_mock = MagicMock()
    monkeypatch.setattr(firestore, "client", client_mock)
    fc._db()
    client_mock.assert_called_once_with()
    fc._db_client = None
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `cd functions && source .venv/bin/activate && pytest shared/tests/test_firestore_client.py::test_db_passes_firestore_database_when_env_set shared/tests/test_firestore_client.py::test_db_uses_default_when_env_unset -p no:cov -o addopts="" -v`
Expected: FAIL — current `_db()` calls `firestore.client()` with no args, so the `database_id="dev"` assertion fails.

- [ ] **Step 3: Implement**

In `functions/shared/firestore_client.py`, add `import os` at the top of the imports and change `_db()`:

```python
import os
from datetime import date, datetime, timedelta, timezone

import firebase_admin
from firebase_admin import firestore

_db_client = None

SNAPSHOT_TTL_DAYS = 30


def _db():
    """Singleton Firestore client (init firebase_admin once per warm instance).
    Honors FIRESTORE_DATABASE (e.g. "dev"); unset → the project's (default) DB."""
    global _db_client
    if _db_client is None:
        if not firebase_admin._apps:
            firebase_admin.initialize_app()
        db_id = os.environ.get("FIRESTORE_DATABASE")
        _db_client = firestore.client(database_id=db_id) if db_id else firestore.client()
    return _db_client
```

- [ ] **Step 4: Run the new tests, verify they pass**

Run: `cd functions && source .venv/bin/activate && pytest shared/tests/test_firestore_client.py -p no:cov -o addopts="" -v`
Expected: PASS (all firestore_client tests).

- [ ] **Step 5: Run the full Python suite with coverage**

Run: `cd functions && source .venv/bin/activate && pytest`
Expected: PASS, coverage ≥ 90% (`--cov-fail-under=90`). If a stale `.coverage` from the no-cov run interferes, delete it first (`rm -f functions/.coverage`).

- [ ] **Step 6: Commit**

```bash
git add functions/shared/firestore_client.py functions/shared/tests/test_firestore_client.py
git commit -m "feat(functions): Firestore client honors FIRESTORE_DATABASE"
```

---

### Task A2: Node Firestore client + seed script honor `FIRESTORE_DATABASE`

**Files:**
- Modify: `src/lib/firebase-admin.ts:20-24`
- Modify: `scripts/seed-mountains.ts:5-14`
- Test: `src/lib/__tests__/firebase-admin.database.test.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/firebase-admin.database.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const getFirestore = vi.fn(() => ({}));
vi.mock("firebase-admin/firestore", () => ({ getFirestore }));
vi.mock("firebase-admin/app", () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
  cert: vi.fn(),
  applicationDefault: vi.fn(),
}));

describe("getDb database selection", () => {
  beforeEach(() => {
    vi.resetModules();
    getFirestore.mockClear();
    process.env.GCP_PROJECT = "mountain-weatherman-app";
  });

  it("passes FIRESTORE_DATABASE to getFirestore when set", async () => {
    process.env.FIRESTORE_DATABASE = "dev";
    const { getDb } = await import("@/lib/firebase-admin");
    getDb();
    expect(getFirestore).toHaveBeenCalledWith(expect.anything(), "dev");
  });

  it("defaults to (default) when FIRESTORE_DATABASE unset", async () => {
    delete process.env.FIRESTORE_DATABASE;
    const { getDb } = await import("@/lib/firebase-admin");
    getDb();
    expect(getFirestore).toHaveBeenCalledWith(expect.anything(), "(default)");
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `npm test -- src/lib/__tests__/firebase-admin.database.test.ts`
Expected: FAIL — current code calls `getFirestore(getApp())` with one argument.

- [ ] **Step 3: Implement the firebase-admin change**

In `src/lib/firebase-admin.ts`, change `getDb()`:

```ts
export function getDb(): Firestore {
  if (db) return db;
  db = getFirestore(getApp(), process.env.FIRESTORE_DATABASE ?? "(default)");
  return db;
}
```

- [ ] **Step 4: Implement the seed-script change**

In `scripts/seed-mountains.ts`, update `db()` so it can target a named database:

```ts
import { initializeApp, applicationDefault, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { MOUNTAINS } from "../src/lib/mountains-data";

function db() {
  if (!getApps().length) {
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    initializeApp({
      projectId: process.env.GCP_PROJECT ?? "mountain-weatherman-app",
      credential: sa ? cert(JSON.parse(sa)) : applicationDefault(),
    });
  }
  const dbId = process.env.FIRESTORE_DATABASE;
  return dbId ? getFirestore(getApp(), dbId) : getFirestore();
}
```

- [ ] **Step 5: Run the new test + the existing singleton test, verify pass**

Run: `npm test -- src/lib/__tests__/firebase-admin.database.test.ts src/lib/__tests__/firebase-admin.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full web suite + build**

Run: `npm test && npm run build`
Expected: tests PASS with coverage ≥ 90/90/85; build produces all routes. (The new test file is covered by the existing `include` globs.)

- [ ] **Step 7: Commit**

```bash
git add src/lib/firebase-admin.ts scripts/seed-mountains.ts src/lib/__tests__/firebase-admin.database.test.ts
git commit -m "feat(web): Firestore client + seed honor FIRESTORE_DATABASE"
```

---

## Phase B — Clean-slate teardown (LIVE GCP, destructive)

> Run against the **current** Terraform (still has `var.env` + `environments/*.tfvars`). Do NOT start Phase C until teardown is complete.

### Task B1: Inventory current live resources

**Files:** none (produces a printed record).

- [ ] **Step 1: List everything currently deployed**

Run each and capture output:
```bash
P=mountain-weatherman-app; R=us-west1
gcloud functions list --project $P --regions=$R
gcloud run services list --project $P --region $R
gcloud pubsub topics list --project $P
gcloud pubsub subscriptions list --project $P
gcloud scheduler jobs list --project $P --location $R
gcloud storage buckets list --project $P --format="value(name)"
gcloud iam service-accounts list --project $P
gcloud secrets list --project $P
gcloud artifacts repositories list --project $P --location $R
gcloud firestore databases list --project $P
```
Expected: the `dev-*` functions/topics/scheduler/SAs, bare-named buckets, `cdse-*` secrets, the `mtn-weather-web` Cloud Run service, `cloud-run-source-deploy` + `gcf-artifacts` AR repos, and the `(default)` Firestore database. Record the bucket names and AR repo names for later verification.

- [ ] **Step 2: Confirm the tfstate bucket exists and will be preserved**

Run: `gcloud storage buckets describe gs://mountain-weatherman-app-tfstate --project mountain-weatherman-app --format="value(name)"`
Expected: prints `mountain-weatherman-app-tfstate`. **This bucket is never deleted.**

### Task B2: Tear down the current Terraform-managed resources

**Files:** none (Terraform state operations).

- [ ] **Step 1: Initialize against the current config**

Run: `terraform -chdir=terraform init`
Expected: success; backend `gcs` initialized; default workspace selected.

- [ ] **Step 2: Protect the `(default)` Firestore database from deletion**

Remove only the database from state so `destroy` does NOT delete the DB object (its index + TTL stay in state and will be deleted, then recreated on rebuild):
```bash
terraform -chdir=terraform state rm 'module.firestore.google_firestore_database.default'
```
Expected: `Removed module.firestore.google_firestore_database.default` (1 resource removed).

- [ ] **Step 3: Destroy the rest of the current state**

Run: `terraform -chdir=terraform destroy -var-file=environments/dev.tfvars`
Review the plan: it must show destruction of the `dev-*` functions, topics, subscriptions, scheduler jobs, worker SAs, the 3 buckets, the `cdse-*` secrets, the firestore index + TTL field, and monitoring — and must **NOT** reference `google_firestore_database.default`. Type `yes`.
Expected: `Destroy complete!`. (Buckets destroy because `force_destroy = true` for env=dev.)

- [ ] **Step 4: Verify the compute/storage resources are gone**

Run:
```bash
gcloud functions list --project mountain-weatherman-app --regions=us-west1
gcloud storage buckets list --project mountain-weatherman-app --format="value(name)"
gcloud secrets list --project mountain-weatherman-app
```
Expected: no `dev-*` functions; the 3 data buckets gone (only `mountain-weatherman-app-tfstate` remains); no `cdse-*` secrets.

### Task B3: Delete the out-of-band resources

**Files:** none.

- [ ] **Step 1: Delete the manually-deployed Cloud Run web service**

Run: `gcloud run services delete mtn-weather-web --project mountain-weatherman-app --region us-west1 --quiet`
Expected: `Deleted service [mtn-weather-web].`

- [ ] **Step 2: Delete the source-deploy / function-build Artifact Registry repos**

Run:
```bash
gcloud artifacts repositories delete cloud-run-source-deploy --project mountain-weatherman-app --location us-west1 --quiet
gcloud artifacts repositories delete gcf-artifacts --project mountain-weatherman-app --location us-west1 --quiet
```
Expected: each `Deleted repository`. (If a repo does not exist, that is fine — note it and continue.)

- [ ] **Step 3: Verify**

Run: `gcloud run services list --project mountain-weatherman-app --region us-west1 && gcloud artifacts repositories list --project mountain-weatherman-app --location us-west1`
Expected: no `mtn-weather-web` service; no `cloud-run-source-deploy`/`gcf-artifacts` repos.

### Task B4: Empty the `(default)` Firestore database

**Files:** none.

- [ ] **Step 1: Delete all collections in `(default)`**

Run: `firebase firestore:delete --all-collections --project mountain-weatherman-app --force`
Expected: completes; all documents deleted from the `(default)` database. (The database object itself remains — it was protected in Task B2 Step 2.)

- [ ] **Step 2: Verify the database is empty but present**

Run: `gcloud firestore databases list --project mountain-weatherman-app --format="value(name)"`
Expected: lists `projects/mountain-weatherman-app/databases/(default)` (DB still exists; data is gone).

- [ ] **Step 3: Note the default-workspace state is now empty**

No commit (no repo changes in Phase B). The `default` workspace state now holds nothing usable; the Phase C workspace guard will prevent applying in it. Do **not** delete the state object (avoid touching the backend bucket).

---

## Phase C — Terraform refactor (no apply; verify with `validate`)

### Task C1: Workspace-driven env, variables, guard, budget gating

**Files:**
- Modify: `terraform/variables.tf`
- Modify: `terraform/main.tf`
- Delete: `terraform/environments/dev.tfvars`, `terraform/environments/prod.tfvars` (and the `environments/` dir)

- [ ] **Step 1: Rewrite `terraform/variables.tf`**

```hcl
variable "project_id" {
  type    = string
  default = "mountain-weatherman-app"
}
variable "region" {
  type    = string
  default = "us-west1"
}
variable "budget_billing_account" {
  type    = string
  default = "016F04-9D26E8-0B960A" # used only in the prod workspace
}
```

- [ ] **Step 2: Update `terraform/main.tf` — locals, guard, env wiring, budget gating**

Replace the `provider` + first part of `main.tf` through the module calls. The provider block is unchanged. Add `locals` and the guard immediately after the provider, change every `var.env` to `local.env`, pass `firestore_database`/`database_name`, gate the budget, and add the `web` module (the `web` module body is added in Task C5 — leave its `module "web"` block out until then).

Add after the `provider "google"` block:

```hcl
locals {
  env                = terraform.workspace
  firestore_database = terraform.workspace == "prod" ? "(default)" : terraform.workspace
}

# Refuse to apply in the unconfigured default workspace.
resource "terraform_data" "workspace_guard" {
  lifecycle {
    precondition {
      condition     = contains(["dev", "prod"], terraform.workspace)
      error_message = "Select a workspace first: terraform workspace select dev|prod"
    }
  }
}
```

Change the module calls so each `env = var.env` becomes `env = local.env`, add `database_name`/`firestore_database`, and gate the budget. The resulting module section:

```hcl
module "firestore" {
  source        = "./modules/firestore"
  project_id    = var.project_id
  region        = var.region
  database_name = local.firestore_database
  depends_on    = [google_project_service.required_apis]
}

module "storage" {
  source     = "./modules/storage"
  project_id = var.project_id
  region     = var.region
  env        = local.env
  depends_on = [google_project_service.required_apis]
}

module "pubsub" {
  source     = "./modules/pubsub"
  project_id = var.project_id
  env        = local.env
  depends_on = [google_project_service.required_apis]
}

module "iam" {
  source     = "./modules/iam"
  project_id = var.project_id
  env        = local.env
  depends_on = [google_project_service.required_apis]
}

module "scheduler" {
  source            = "./modules/scheduler"
  region            = var.region
  env               = local.env
  orchestrate_topic = module.pubsub.orchestrate_topic_id
  depends_on        = [google_project_service.required_apis]
}

module "monitoring" {
  source          = "./modules/monitoring"
  project_id      = var.project_id
  env             = local.env
  dlq_topic       = module.pubsub.dlq_topic_id
  billing_account = local.env == "prod" ? var.budget_billing_account : ""
  depends_on      = [google_project_service.required_apis]
}

locals {
  topic_paths = {
    for k in ["orchestrate", "weather-refresh", "backfill-refresh",
    "nwac-refresh", "snotel-refresh", "satellite-refresh"] :
    k => "projects/${var.project_id}/topics/${local.env}-${k}"
  }
}

module "functions" {
  source             = "./modules/functions"
  project_id         = var.project_id
  region             = var.region
  env                = local.env
  firestore_database = local.firestore_database
  source_bucket      = module.storage.source_bucket_name
  weather_bucket     = module.storage.weather_bucket_name
  satellite_bucket   = module.storage.satellite_bucket_name
  sa_emails          = module.iam.sa_emails
  topic_ids          = module.pubsub.topic_ids
  dlq_topic_id       = module.pubsub.dlq_topic_id
  topic_paths        = local.topic_paths
  satellite_sa_email = module.iam.sa_emails["satellite-worker"]
  depends_on         = [google_project_service.required_apis]
}
```

(The existing budget `count = var.billing_account == ""` logic in the monitoring module then yields zero budgets in dev and one in prod — no monitoring-module change needed.)

- [ ] **Step 3: Delete the environments directory**

```bash
git rm -r terraform/environments
```

- [ ] **Step 4: Verify it parses (syntax only for now)**

Run: `terraform -chdir=terraform fmt && terraform -chdir=terraform validate`
Expected: `fmt` reports the formatted files; `validate` may warn about the not-yet-added `firestore_database`/`database_name` variables in the modules (added in C2/C4) — that is expected to fail until C2–C5 land. If you are running tasks strictly in order, defer the final green `validate` to Task C6. Do not commit a broken `validate` mid-phase; commit at C6.

> NOTE: Tasks C1–C5 are interdependent (new module variables). Implement C1→C5, then run `validate` green in C6, then a single commit for the whole refactor. Each task below shows its exact edits.

### Task C2: Firestore module (named DB) + Storage module (env-prefixed buckets)

**Files:**
- Modify: `terraform/modules/firestore/main.tf`, `terraform/modules/firestore/variables.tf`
- Modify: `terraform/modules/storage/main.tf`

- [ ] **Step 1: Add `database_name` to the firestore module variables**

`terraform/modules/firestore/variables.tf` — append:
```hcl
variable "database_name" { type = string }
```

- [ ] **Step 2: Use it in the database resource**

`terraform/modules/firestore/main.tf` — change the database name:
```hcl
resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = var.database_name
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
}
```
(The index + TTL already reference `google_firestore_database.default.name` — no change.)

- [ ] **Step 3: Env-prefix the bucket names**

`terraform/modules/storage/main.tf` — change `local.prefix` usage so names include env:
```hcl
locals { prefix = "${var.project_id}-${var.env}" }

resource "google_storage_bucket" "weather" {
  name                        = "${local.prefix}-weather-data"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.env == "dev"
  lifecycle_rule {
    condition {
      age            = 35
      matches_prefix = ["forecasts/"]
    }
    action { type = "Delete" }
  }
}

resource "google_storage_bucket" "satellite" {
  name                        = "${local.prefix}-satellite-tiles"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.env == "dev"
}

resource "google_storage_bucket" "source" {
  name                        = "${local.prefix}-function-source"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = var.env == "dev"
}
```

### Task C3: IAM module — per-env web runtime SA

**Files:**
- Modify: `terraform/modules/iam/main.tf`, `terraform/modules/iam/outputs.tf`

- [ ] **Step 1: Add the web SA + least-privilege role bindings**

Append to `terraform/modules/iam/main.tf`:
```hcl
# Cloud Run web runtime SA (least privilege; replaces reliance on the default editor SA).
resource "google_service_account" "web" {
  account_id   = "${var.env}-web"
  display_name = "${var.env} web (Cloud Run)"
}

resource "google_project_iam_member" "web_datastore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.web.email}"
}
resource "google_project_iam_member" "web_storage" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.web.email}"
}
resource "google_project_iam_member" "web_pubsub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.web.email}"
}
```

- [ ] **Step 2: Export the web SA email**

Append to `terraform/modules/iam/outputs.tf`:
```hcl
output "web_sa_email" { value = google_service_account.web.email }
```

### Task C4: Functions module — DB env, env-prefixed secrets, staging + DLQ in-graph

**Files:**
- Modify: `terraform/modules/functions/variables.tf`, `terraform/modules/functions/main.tf`, `terraform/modules/functions/secrets.tf`

- [ ] **Step 1: Add `firestore_database` variable**

Append to `terraform/modules/functions/variables.tf`:
```hcl
variable "firestore_database" { type = string }
```

- [ ] **Step 2: Add `FIRESTORE_DATABASE` to `shared_env`**

In `terraform/modules/functions/main.tf`, in the `shared_env` map add:
```hcl
    FIRESTORE_DATABASE      = var.firestore_database
```
(place it alongside the other env entries inside `shared_env`).

- [ ] **Step 3: Env-prefix the secret reference**

In the same file, in the `secret_environment_variables` dynamic block, change the `secret` line:
```hcl
        secret     = "${var.env}-${lower(replace(secret_environment_variables.value, "_", "-"))}"
```

- [ ] **Step 4: Add the staging `terraform_data` and make `archive_file` depend on it**

In `terraform/modules/functions/main.tf`, add this BEFORE `data "archive_file" "src"`:
```hcl
# Vendor shared/ (+ self-packages) into each function dir before zipping. The
# script is invoked by Terraform — never run by hand. Re-runs when any canonical
# (non-vendored) Python source changes.
locals {
  fn_src_files = [
    for f in fileset("${path.root}/../functions", "**/*.py") : f
    if !strcontains(f, "/shared/") &&
    length(regexall("^(weather_worker/weather_worker|nwac_worker/nwac_worker|snotel_worker/snotel_worker|satellite_worker/satellite_worker|backfill_worker/weather_worker)/", f)) == 0
  ]
}

resource "terraform_data" "stage_functions" {
  triggers_replace = {
    hash = sha1(join("", [for f in local.fn_src_files : filesha1("${path.root}/../functions/${f}")]))
  }
  provisioner "local-exec" {
    command = "${path.root}/../scripts/stage-functions.sh"
  }
}
```
Then add `depends_on` to the archive data source:
```hcl
data "archive_file" "src" {
  for_each    = local.functions
  type        = "zip"
  output_path = "${path.module}/build/${each.key}.zip"
  source_dir  = each.value.source_dir
  depends_on  = [terraform_data.stage_functions]
}
```

- [ ] **Step 5: Replace the DLQ placeholder with an in-graph dead-letter policy**

In `terraform/modules/functions/main.tf`, DELETE the entire `resource "google_pubsub_subscription" "dlq_attach"` block and replace it with:
```hcl
# Attach the dead-letter policy to each Gen2 trigger's auto-created push
# subscription (the provider does not expose it, so resolve it via gcloud).
resource "terraform_data" "dlq_policy" {
  for_each         = local.functions
  triggers_replace = { fn = google_cloudfunctions2_function.fn[each.key].id }
  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<-EOT
      set -euo pipefail
      TRIG=$(basename "${google_cloudfunctions2_function.fn[each.key].event_trigger[0].trigger}")
      SUB=$(gcloud eventarc triggers describe "$TRIG" \
        --location ${var.region} --project ${var.project_id} \
        --format='value(transport.pubsub.subscription)')
      gcloud pubsub subscriptions update "$SUB" --project ${var.project_id} \
        --dead-letter-topic=${var.dlq_topic_id} --max-delivery-attempts=5
    EOT
  }
}
```

- [ ] **Step 6: Env-prefix the secret containers**

`terraform/modules/functions/secrets.tf` — change both `secret_id`s:
```hcl
resource "google_secret_manager_secret" "cdse_client_id" {
  secret_id = "${var.env}-cdse-client-id"
  replication { auto {} }
}

resource "google_secret_manager_secret" "cdse_client_secret" {
  secret_id = "${var.env}-cdse-client-secret"
  replication { auto {} }
}
```
(The IAM bindings below them already reference these resources by handle — no change.)

### Task C5: New `web` module (Artifact Registry + Cloud Build + Cloud Run)

**Files:**
- Create: `terraform/modules/web/variables.tf`, `terraform/modules/web/main.tf`, `terraform/modules/web/outputs.tf`
- Modify: `terraform/main.tf` (add `module "web"`), `terraform/outputs.tf`
- Delete: `scripts/deploy-web.sh`

- [ ] **Step 1: Create `terraform/modules/web/variables.tf`**

```hcl
variable "project_id" { type = string }
variable "region" { type = string }
variable "env" { type = string }
variable "firestore_database" { type = string }
variable "weather_bucket" { type = string }
variable "satellite_bucket" { type = string }
variable "topic_paths" { type = map(string) }
variable "web_sa_email" { type = string }
variable "source_root" { type = string } # repo root containing the Dockerfile
```

- [ ] **Step 2: Create `terraform/modules/web/main.tf`**

```hcl
resource "google_artifact_registry_repository" "web" {
  location      = var.region
  repository_id = "web-${var.env}"
  format        = "DOCKER"
}

locals {
  web_src_hash = substr(sha256(join("", concat(
    [filesha256("${var.source_root}/package-lock.json")],
    [filesha256("${var.source_root}/Dockerfile")],
    [filesha256("${var.source_root}/next.config.ts")],
    [for f in fileset("${var.source_root}/src", "**") : filesha256("${var.source_root}/src/${f}")],
  ))), 0, 16)
  web_image = "${var.region}-docker.pkg.dev/${var.project_id}/web-${var.env}/web:${local.web_src_hash}"
}

# Build + push the image via Cloud Build. Re-runs only when the source hash changes.
resource "terraform_data" "build" {
  triggers_replace = { image = local.web_image }
  provisioner "local-exec" {
    command = "gcloud builds submit --project ${var.project_id} --tag ${local.web_image} ${var.source_root}"
  }
  depends_on = [google_artifact_registry_repository.web]
}

resource "google_cloud_run_v2_service" "web" {
  name                = "mtn-weather-web-${var.env}"
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false

  template {
    service_account = var.web_sa_email
    containers {
      image = local.web_image
      ports { container_port = 8080 }
      env {
        name  = "GCP_PROJECT"
        value = var.project_id
      }
      env {
        name  = "ENV"
        value = var.env
      }
      env {
        name  = "FIRESTORE_DATABASE"
        value = var.firestore_database
      }
      env {
        name  = "GCS_BUCKET_WEATHER"
        value = var.weather_bucket
      }
      env {
        name  = "GCS_BUCKET_SATELLITE"
        value = var.satellite_bucket
      }
      env {
        name  = "TOPIC_WEATHER_REFRESH"
        value = var.topic_paths["weather-refresh"]
      }
      env {
        name  = "TOPIC_BACKFILL_REFRESH"
        value = var.topic_paths["backfill-refresh"]
      }
      env {
        name  = "TOPIC_NWAC_REFRESH"
        value = var.topic_paths["nwac-refresh"]
      }
      env {
        name  = "TOPIC_SNOTEL_REFRESH"
        value = var.topic_paths["snotel-refresh"]
      }
      env {
        name  = "BROWSE_REFRESH_MODE"
        value = "scheduled"
      }
    }
  }

  depends_on = [terraform_data.build]
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
```

- [ ] **Step 3: Create `terraform/modules/web/outputs.tf`**

```hcl
output "url" { value = google_cloud_run_v2_service.web.uri }
```

- [ ] **Step 4: Wire the module into `terraform/main.tf`**

Append after the `functions` module:
```hcl
module "web" {
  source             = "./modules/web"
  project_id         = var.project_id
  region             = var.region
  env                = local.env
  firestore_database = local.firestore_database
  weather_bucket     = module.storage.weather_bucket_name
  satellite_bucket   = module.storage.satellite_bucket_name
  topic_paths        = local.topic_paths
  web_sa_email       = module.iam.web_sa_email
  source_root        = "${path.root}/.."
  depends_on         = [google_project_service.required_apis]
}
```

- [ ] **Step 5: Add the URL output**

Append to `terraform/outputs.tf`:
```hcl
output "web_url" { value = module.web.url }
```

- [ ] **Step 6: Delete the obsolete deploy script**

```bash
git rm scripts/deploy-web.sh
```

### Task C6: Validate the full refactor and commit

- [ ] **Step 1: Format**

Run: `terraform -chdir=terraform fmt -recursive`
Expected: lists any reformatted files (or nothing).

- [ ] **Step 2: Validate**

Run: `terraform -chdir=terraform init -upgrade && terraform -chdir=terraform validate`
Expected: `Success! The configuration is valid.` (Init re-resolves modules; the `web` module + new variables now exist.)

- [ ] **Step 3: Commit the whole refactor**

```bash
git add terraform scripts
git commit -m "feat(infra): all-Terraform dual-env (workspaces, web module, in-graph staging+DLQ)"
```

---

## Phase D — Rebuild + test (LIVE GCP)

### Task D1: Build and apply the `prod` workspace

**Files:** none (live apply).

- [ ] **Step 1: Create the prod workspace**

Run: `terraform -chdir=terraform workspace new prod`
Expected: `Created and switched to workspace "prod"!`

- [ ] **Step 2: Import the emptied `(default)` database into prod state**

Run: `terraform -chdir=terraform import 'module.firestore.google_firestore_database.default' 'projects/mountain-weatherman-app/databases/(default)'`
Expected: `Import successful!` (prod adopts the existing empty `(default)` DB; apply will not try to recreate it).

- [ ] **Step 3: Apply prod**

Run: `terraform -chdir=terraform apply`
Review: creates `prod-*` functions/topics/scheduler/SAs, `…-prod-*` buckets, `prod-cdse-*` secret containers, the `web-prod` AR repo, builds + pushes the image (Cloud Build), the `mtn-weather-web-prod` Cloud Run service, the budget, monitoring, and runs the staging + DLQ `local-exec` steps. Firestore index + TTL are recreated on `(default)`. Type `yes`.
Expected: `Apply complete!` with a `web_url` output. (Cloud Build + function builds make this multi-minute.)

- [ ] **Step 4: Smoke-test prod**

Run:
```bash
URL=$(terraform -chdir=terraform output -raw web_url)
curl -s -o /dev/null -w "%{http_code}\n" "$URL"
curl -s "$URL/api/mountains"
```
Expected: `200` for the root; `[]` from `/api/mountains` (Firestore is empty — seeding is out of scope). The empty array confirms the app reaches the `(default)` DB without error.

### Task D2: Build and apply the `dev` workspace

**Files:** none (live apply).

- [ ] **Step 1: Create the dev workspace**

Run: `terraform -chdir=terraform workspace new dev`
Expected: `Created and switched to workspace "dev"!`

- [ ] **Step 2: Apply dev (all fresh; no import — the `dev` DB is new)**

Run: `terraform -chdir=terraform apply`
Review: creates the named `dev` Firestore database, `dev-*` compute, `…-dev-*` buckets, `dev-cdse-*` secrets, `web-dev` AR repo + image + `mtn-weather-web-dev` Cloud Run, and **no** budget (dev passes `billing_account=""`). Type `yes`.
Expected: `Apply complete!` with `web_url`.

- [ ] **Step 3: Smoke-test dev**

Run:
```bash
URL=$(terraform -chdir=terraform output -raw web_url)
curl -s -o /dev/null -w "%{http_code}\n" "$URL"
curl -s "$URL/api/mountains"
```
Expected: `200`; `[]`.

### Task D3: Populate CDSE secrets for both envs

**Files:** none (reads CDSE values from `NOTES.md`, which is gitignored/local).

- [ ] **Step 1: Add secret versions for prod and dev**

Using the CDSE client id/secret from `NOTES.md`:
```bash
P=mountain-weatherman-app
printf '%s' "<CDSE_CLIENT_ID>"     | gcloud secrets versions add prod-cdse-client-id     --project $P --data-file=-
printf '%s' "<CDSE_CLIENT_SECRET>" | gcloud secrets versions add prod-cdse-client-secret --project $P --data-file=-
printf '%s' "<CDSE_CLIENT_ID>"     | gcloud secrets versions add dev-cdse-client-id      --project $P --data-file=-
printf '%s' "<CDSE_CLIENT_SECRET>" | gcloud secrets versions add dev-cdse-client-secret  --project $P --data-file=-
```
Expected: each prints `Created version [1]`. (Substitute the real values from `NOTES.md`; never commit them.)

- [ ] **Step 2: Verify the satellite worker can read its secret**

Run: `gcloud secrets versions access latest --secret=dev-cdse-client-id --project mountain-weatherman-app | head -c 8`
Expected: prints the first characters of the client id (confirms the secret + value exist).

### Task D4: Seed dev + run e2e against the dev URL

**Files:** none (uses existing seed scripts + Playwright).

- [ ] **Step 1: Seed the dev mountains into the `dev` database**

Run:
```bash
terraform -chdir=terraform workspace select dev
URL=$(terraform -chdir=terraform output -raw web_url)
GCP_PROJECT=mountain-weatherman-app FIRESTORE_DATABASE=dev npm run seed:mountains
```
Expected: `Seeded 10 mountains.`

- [ ] **Step 2: Seed demo projects via the dev API**

Run: `BASE_URL="$URL" npx tsx scripts/seed-demo.ts`
Expected: creates the 3 demo projects (or skips existing).

- [ ] **Step 3: Confirm data is served**

Run: `curl -s "$URL/api/mountains" | head -c 200`
Expected: a non-empty JSON array of mountains.

- [ ] **Step 4: Run Playwright e2e against the deployed dev app**

Run: `PLAYWRIGHT_BASE_URL="$URL" npm run test:e2e`
Expected: the e2e suite passes against the live dev deployment (config skips the local webServer when `PLAYWRIGHT_BASE_URL` is set). If a test depends on freshly-run pipeline data not present yet, note it; core navigation/dashboard/create flows must pass.

---

## Phase E — Documentation + final gate

### Task E1: Update CLAUDE.md and README to the workspace workflow

**Files:**
- Modify: `CLAUDE.md` (the "Web app deploy", "Cloud resources", "Cloud Functions deploy" sections + progress log)
- Modify: `README.md` (deploy section)

- [ ] **Step 1: Replace the deploy instructions in `CLAUDE.md`**

Update the deploy guidance so it reads (single source of truth): deploy any environment with
```
terraform -chdir=terraform workspace select dev   # or prod
terraform -chdir=terraform apply
```
and state that `scripts/deploy-web.sh` is removed, `scripts/stage-functions.sh` is invoked by Terraform (not by hand), the DLQ policy is applied by Terraform, and `terraform/environments/*.tfvars` are gone (env = workspace). Note the two Cloud Run URLs are now `terraform output web_url` per workspace.

- [ ] **Step 2: Add a progress-log entry**

Append to the progress log in `CLAUDE.md`:
```
- P12 All-Terraform dual-env: ✅ DONE. Single project, two workspaces (dev/prod);
  env = terraform.workspace. Firestore: prod=(default) (emptied), dev=named `dev`
  (FIRESTORE_DATABASE plumbed into functions + Cloud Run + seed). New web module
  (Artifact Registry + Cloud Build local-exec + google_cloud_run_v2_service, public);
  function staging + DLQ dead-letter policy now in the TF graph (terraform_data +
  local-exec). Per-env least-priv web SA. Budget gated to prod. Removed
  deploy-web.sh + environments/*.tfvars. Clean-slate teardown done first.
  One command deploys everything per env.
```

- [ ] **Step 3: Update `README.md` deploy section**

Mirror the workspace workflow in the README's deploy/run instructions; remove any `./scripts/deploy-web.sh` reference.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: workspace-based Terraform deploy workflow"
```

### Task E2: Final quality gate

- [ ] **Step 1: Run every local gate**

Run:
```bash
npm run build && npm test
cd functions && source .venv/bin/activate && pytest && cd ..
terraform -chdir=terraform validate
```
Expected: web build clean; web tests pass (cov ≥ 90/90/85); pytest passes (cov ≥ 90); terraform validates.

- [ ] **Step 2: Confirm a clean tree and the two deployments**

Run:
```bash
git status
terraform -chdir=terraform workspace select prod && terraform -chdir=terraform output -raw web_url
terraform -chdir=terraform workspace select dev  && terraform -chdir=terraform output -raw web_url
```
Expected: working tree clean (all changes committed); two distinct Cloud Run URLs, one per workspace.

- [ ] **Step 3: Acceptance check**

Confirm the spec's §11 acceptance: from the current checkout, selecting a workspace and running `terraform apply` produced a working, env-isolated deployment with **no** manual gcloud/script steps in the deploy path (secret population + seeding are explicitly out-of-band). Report the two URLs.

---

## Self-review notes (plan author)

- **Spec coverage:** workspaces (§3 → C1); isolation matrix (§4 → C1–C5); code changes (§5 → A1/A2); web/Cloud Run (§6 → C5); staging + DLQ in-graph (§7 → C4); project-global handling — env-prefixed secrets/per-env AR/budget gated/APIs in root (§8 → C4/C5/C1); clean-slate teardown (§9 → B1–B4, D1 import); file map (§10 → all C tasks); quality gates (§11 → C6/D/E2). All covered.
- **No seeding in Terraform** (user directive): honored — seeding is only in D4 as manual verification, never in a TF resource.
- **Ordering:** teardown (B) precedes refactor (C) so `destroy` matches current state addresses; `(default)` DB protected via `state rm` then re-imported into prod (D1).
- **Type/name consistency:** `firestore_database` (functions + web + main local) and `database_name` (firestore module) are used consistently; `web_sa_email`, `web_url`, `topic_paths` match across modules.
