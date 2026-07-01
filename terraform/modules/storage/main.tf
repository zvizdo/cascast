resource "google_storage_bucket" "weather" {
  name                        = "${var.project_id}-weather-data"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
  lifecycle_rule {
    condition {
      age            = 35
      matches_prefix = ["forecasts/"]
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "satellite" {
  name                        = "${var.project_id}-satellite-tiles"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
  # Retain dated scene-history images under history/ for 35 days. The latest
  # {id}/scene.jpg and {id}/metadata.json live OUTSIDE this prefix and are kept.
  lifecycle_rule {
    condition {
      age            = 35
      matches_prefix = ["history/"]
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "terrain" {
  name                        = "${var.project_id}-terrain"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
  # Terrain assets are immutable per mountain; no lifecycle rule.
}

resource "google_storage_bucket" "geo" {
  name                        = "${var.project_id}-geo"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
  # Auto-evict stale GCS read-through cache objects after 14 days.
  lifecycle_rule {
    condition {
      age = 14
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket" "source" {
  name                        = "${var.project_id}-function-source"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true
}
