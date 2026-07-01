# Runtime secrets for the Safety key-proxy routes. VALUES are added out-of-band via
# `gcloud secrets versions add` - never in Terraform state. (Mirrors the CDSE pattern.)
resource "google_secret_manager_secret" "airnow_api_key" {
  secret_id = "airnow-api-key"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "nps_api_key" {
  secret_id = "nps-api-key"
  replication {
    auto {}
  }
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
