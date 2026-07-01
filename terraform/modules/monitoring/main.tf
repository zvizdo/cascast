# Budget alerts ($10 / $25).
resource "google_billing_budget" "budget" {
  billing_account = var.billing_account
  display_name    = "mtn-weather-budget"
  budget_filter {
    projects = ["projects/${var.project_id}"]
  }
  amount {
    specified_amount {
      currency_code = "USD"
      units         = "25"
    }
  }
  threshold_rules {
    threshold_percent = 0.4 # $10
  }
  threshold_rules {
    threshold_percent = 1.0 # $25
  }
}

# Email notification channel — supplied via TF_VAR_alert_email (never committed).
resource "google_monitoring_notification_channel" "email" {
  count        = var.alert_email == "" ? 0 : 1
  project      = var.project_id
  display_name = "pipeline-alerts-email"
  type         = "email"
  labels       = { email_address = var.alert_email }
}

locals {
  alert_channels = var.alert_email == "" ? [] : [google_monitoring_notification_channel.email[0].id]
}

# Alert when DLQ has undelivered messages (worker failures).
resource "google_monitoring_alert_policy" "dlq" {
  display_name = "refresh-dlq-backlog"
  combiner     = "OR"
  conditions {
    display_name = "DLQ has messages"
    condition_threshold {
      filter          = "resource.type=\"pubsub_topic\" AND resource.label.topic_id=\"refresh-dlq\" AND metric.type=\"pubsub.googleapis.com/topic/send_message_operation_count\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_SUM"
      }
    }
  }
  notification_channels = local.alert_channels
}

# Any worker that logs event="pipeline_error" (incl. satellite, which degrades
# gracefully but now logs ERROR). Rate-limited so an outage doesn't flood the inbox.
resource "google_monitoring_alert_policy" "pipeline_errors" {
  project      = var.project_id
  display_name = "pipeline-worker-errors"
  combiner     = "OR"
  conditions {
    display_name = "worker logged pipeline_error"
    condition_matched_log {
      filter = "jsonPayload.event=\"pipeline_error\" severity>=ERROR"
    }
  }
  alert_strategy {
    notification_rate_limit { period = "300s" } # required for condition_matched_log; ~1 email / 5 min
  }
  notification_channels = local.alert_channels
}

resource "google_logging_metric" "weather_success" {
  project = var.project_id
  name    = "pipeline_success_weather"
  filter  = "jsonPayload.event=\"pipeline_success\" jsonPayload.source=\"weather\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_logging_metric" "snotel_success" {
  project = var.project_id
  name    = "pipeline_success_snotel"
  filter  = "jsonPayload.event=\"pipeline_success\" jsonPayload.source=\"snotel\""
  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
  }
}

resource "google_monitoring_alert_policy" "weather_stale" {
  project      = var.project_id
  display_name = "weather-pipeline-stale"
  combiner     = "OR"
  conditions {
    display_name = "no weather pipeline_success"
    condition_absent {
      filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.weather_success.name}\" resource.type=\"cloud_run_revision\""
      duration = "10800s" # 3h (hourly cadence)
      aggregations {
        alignment_period     = "600s"
        per_series_aligner   = "ALIGN_COUNT"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger { count = 1 }
    }
  }
  notification_channels = local.alert_channels
}

resource "google_monitoring_alert_policy" "snotel_stale" {
  project      = var.project_id
  display_name = "snotel-pipeline-stale"
  combiner     = "OR"
  conditions {
    display_name = "no snotel pipeline_success"
    condition_absent {
      filter   = "metric.type=\"logging.googleapis.com/user/${google_logging_metric.snotel_success.name}\" resource.type=\"cloud_run_revision\""
      duration = "82800s" # 23h (daily cadence; under the 23.5h absence cap)
      aggregations {
        alignment_period     = "3600s"
        per_series_aligner   = "ALIGN_COUNT"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger { count = 1 }
    }
  }
  notification_channels = local.alert_channels
}
