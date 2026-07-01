resource "google_artifact_registry_repository" "web" {
  location      = var.region
  repository_id = "web"
  format        = "DOCKER"
}

locals {
  web_src_hash = substr(sha256(join("", concat(
    [filesha256("${var.source_root}/package-lock.json")],
    [filesha256("${var.source_root}/Dockerfile")],
    [filesha256("${var.source_root}/next.config.ts")],
    [for f in fileset("${var.source_root}/src", "**") : filesha256("${var.source_root}/src/${f}")],
  ))), 0, 16)
  web_image = "${var.region}-docker.pkg.dev/${var.project_id}/web/web:${local.web_src_hash}"
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
  name     = "mtn-weather-web"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

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
        name  = "GCS_BUCKET_WEATHER"
        value = var.weather_bucket
      }
      env {
        name  = "GCS_BUCKET_SATELLITE"
        value = var.satellite_bucket
      }
      env {
        name  = "GCS_BUCKET_TERRAIN"
        value = var.terrain_bucket
      }
      env {
        name  = "GCS_BUCKET_GEO"
        value = var.geo_bucket
      }
      env {
        name  = "TOPIC_WEATHER_REFRESH"
        value = var.topic_paths["weather-refresh"]
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
        name  = "TOPIC_SATELLITE_REFRESH"
        value = var.topic_paths["satellite-refresh"]
      }
      env {
        name  = "GA_MEASUREMENT_ID"
        value = var.ga_measurement_id
      }
      env {
        name = "AIRNOW_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.airnow_api_key.secret_id
            version = "latest"
          }
        }
      }
      env {
        name = "NPS_API_KEY"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.nps_api_key.secret_id
            version = "latest"
          }
        }
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
