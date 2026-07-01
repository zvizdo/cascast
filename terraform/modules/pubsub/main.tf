locals {
  topics = ["orchestrate", "weather-refresh",
  "nwac-refresh", "snotel-refresh", "satellite-refresh"]
}

resource "google_pubsub_topic" "dlq" {
  name = "refresh-dlq"
}

resource "google_pubsub_topic" "topics" {
  for_each = toset(local.topics)
  name     = each.value
}
