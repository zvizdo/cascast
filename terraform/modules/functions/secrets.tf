# CDSE (Copernicus Data Space Ecosystem) credentials for the satellite worker.
# The secret CONTAINERS + IAM are managed here; the secret VALUES (versions) are
# added out-of-band via `gcloud secrets versions add` so credentials never land
# in terraform state or any tracked file.
resource "google_secret_manager_secret" "cdse_client_id" {
  secret_id = "cdse-client-id"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret" "cdse_client_secret" {
  secret_id = "cdse-client-secret"
  replication {
    auto {}
  }
}

# Grant the satellite worker SA read access to both secrets.
resource "google_secret_manager_secret_iam_member" "satellite_id" {
  secret_id = google_secret_manager_secret.cdse_client_id.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.satellite_sa_email}"
}

resource "google_secret_manager_secret_iam_member" "satellite_secret" {
  secret_id = google_secret_manager_secret.cdse_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.satellite_sa_email}"
}
