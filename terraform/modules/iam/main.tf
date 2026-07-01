locals {
  workers = ["orchestrator", "weather-worker",
  "nwac-worker", "snotel-worker", "satellite-worker"]
}

resource "google_service_account" "workers" {
  for_each     = toset(local.workers)
  account_id   = each.value
  display_name = each.value
}

# Roles each worker SA needs (datastore + storage + pubsub publisher + token creator for eventarc)
resource "google_project_iam_member" "datastore" {
  for_each = google_service_account.workers
  project  = var.project_id
  role     = "roles/datastore.user"
  member   = "serviceAccount:${each.value.email}"
}
resource "google_project_iam_member" "storage" {
  for_each = google_service_account.workers
  project  = var.project_id
  role     = "roles/storage.objectAdmin"
  member   = "serviceAccount:${each.value.email}"
}
resource "google_project_iam_member" "pubsub_pub" {
  for_each = google_service_account.workers
  project  = var.project_id
  role     = "roles/pubsub.publisher"
  member   = "serviceAccount:${each.value.email}"
}

# Gen2 Eventarc Pub/Sub triggers invoke the function's Cloud Run service as the
# worker SA; it needs run.invoker (to invoke the service) + eventarc.eventReceiver.
resource "google_project_iam_member" "run_invoker" {
  for_each = google_service_account.workers
  project  = var.project_id
  role     = "roles/run.invoker"
  member   = "serviceAccount:${each.value.email}"
}
resource "google_project_iam_member" "event_receiver" {
  for_each = google_service_account.workers
  project  = var.project_id
  role     = "roles/eventarc.eventReceiver"
  member   = "serviceAccount:${each.value.email}"
}

# Cloud Run web runtime SA (least privilege; replaces reliance on the default editor SA).
resource "google_service_account" "web" {
  account_id   = "web-runtime"
  display_name = "web (Cloud Run)"
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
