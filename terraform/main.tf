provider "google" {
  project = var.project_id
  region  = var.region
  # Required for APIs that bill against a quota project (e.g. billingbudgets) under ADC.
  billing_project       = var.project_id
  user_project_override = true
}

resource "google_project_service" "required_apis" {
  for_each = toset([
    "cloudfunctions.googleapis.com", "cloudscheduler.googleapis.com",
    "pubsub.googleapis.com", "firestore.googleapis.com", "storage.googleapis.com",
    "eventarc.googleapis.com", "run.googleapis.com", "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com", "firebase.googleapis.com",
    "iam.googleapis.com", "secretmanager.googleapis.com", "monitoring.googleapis.com",
    "billingbudgets.googleapis.com",
  ])
  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}

module "firestore" {
  source     = "./modules/firestore"
  project_id = var.project_id
  region     = var.region
  depends_on = [google_project_service.required_apis]
}

module "storage" {
  source     = "./modules/storage"
  project_id = var.project_id
  region     = var.region
  depends_on = [google_project_service.required_apis]
}

module "pubsub" {
  source     = "./modules/pubsub"
  project_id = var.project_id
  depends_on = [google_project_service.required_apis]
}

module "iam" {
  source     = "./modules/iam"
  project_id = var.project_id
  depends_on = [google_project_service.required_apis]
}

module "scheduler" {
  source            = "./modules/scheduler"
  region            = var.region
  orchestrate_topic = module.pubsub.orchestrate_topic_id
  depends_on        = [google_project_service.required_apis]
}

module "monitoring" {
  source          = "./modules/monitoring"
  project_id      = var.project_id
  dlq_topic       = module.pubsub.dlq_topic_id
  billing_account = var.budget_billing_account
  alert_email     = var.alert_email
  depends_on      = [google_project_service.required_apis]
}

locals {
  topic_paths = {
    for k in ["orchestrate", "weather-refresh",
    "nwac-refresh", "snotel-refresh", "satellite-refresh"] :
    k => "projects/${var.project_id}/topics/${k}"
  }
}

module "functions" {
  source             = "./modules/functions"
  project_id         = var.project_id
  region             = var.region
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

module "web" {
  source           = "./modules/web"
  project_id       = var.project_id
  region           = var.region
  weather_bucket   = module.storage.weather_bucket_name
  satellite_bucket = module.storage.satellite_bucket_name
  terrain_bucket   = module.storage.terrain_bucket_name
  geo_bucket       = module.storage.geo_bucket_name
  topic_paths      = local.topic_paths
  web_sa_email      = module.iam.web_sa_email
  source_root       = "${path.root}/.."
  ga_measurement_id = var.ga_measurement_id
  depends_on       = [google_project_service.required_apis]
}
