resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
}

# Native TTL on the snapshots collection group (snapshots.expireAt).
resource "google_firestore_field" "snapshots_ttl" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "snapshots"
  field      = "expireAt"
  ttl_config {}
}

# Native TTL on the history collection group (history.expireAt) — accumulated
# dated time-series for snotel/nwac/satellite, 35-day retention.
resource "google_firestore_field" "history_ttl" {
  project    = var.project_id
  database   = google_firestore_database.default.name
  collection = "history"
  field      = "expireAt"
  ttl_config {}
}
