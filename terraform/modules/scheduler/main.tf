resource "google_cloud_scheduler_job" "weather" {
  name      = "weather-orchestrate"
  region    = var.region
  schedule  = "0 * * * *"
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic
    data       = base64encode(jsonencode({ type = "weather" }))
  }
  retry_config { retry_count = 1 }
}

resource "google_cloud_scheduler_job" "nwac" {
  name      = "nwac-orchestrate"
  region    = var.region
  schedule  = "*/15 7-11 * * *" # 07:00–11:45 PT; idempotent skip makes early ticks no-ops
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic
    data       = base64encode(jsonencode({ type = "nwac" }))
  }
  retry_config { retry_count = 1 }
}

resource "google_cloud_scheduler_job" "snotel" {
  name      = "snotel-orchestrate"
  region    = var.region
  schedule  = "0 7 * * *"
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic
    data       = base64encode(jsonencode({ type = "snotel" }))
  }
}

resource "google_cloud_scheduler_job" "satellite" {
  name      = "satellite-orchestrate"
  region    = var.region
  schedule  = "0 8 * * 0"
  time_zone = "America/Los_Angeles"
  pubsub_target {
    topic_name = var.orchestrate_topic
    data       = base64encode(jsonencode({ type = "satellite" }))
  }
}
