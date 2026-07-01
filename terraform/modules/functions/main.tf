locals {
  # P1 seeds three functions; P2 appends nwac/snotel/satellite to this map.
  functions = {
    orchestrator = {
      entry_point   = "orchestrate"
      source_dir    = "${path.root}/../functions/orchestrator"
      trigger_topic = "orchestrate"
      sa_key        = "orchestrator"
      memory        = "256Mi"
      timeout       = 60
      max_instances = 3
    }
    weather-worker = {
      entry_point   = "handle_message"
      source_dir    = "${path.root}/../functions/weather_worker"
      trigger_topic = "weather-refresh"
      sa_key        = "weather-worker"
      memory        = "512Mi"
      timeout       = 120
      max_instances = 100
    }
    nwac-worker = {
      entry_point   = "handle_message"
      source_dir    = "${path.root}/../functions/nwac_worker"
      trigger_topic = "nwac-refresh"
      sa_key        = "nwac-worker"
      memory        = "256Mi"
      timeout       = 60
      max_instances = 5
    }
    snotel-worker = {
      entry_point   = "handle_message"
      source_dir    = "${path.root}/../functions/snotel_worker"
      trigger_topic = "snotel-refresh"
      sa_key        = "snotel-worker"
      memory        = "256Mi"
      timeout       = 60
      max_instances = 10
    }
    satellite-worker = {
      entry_point   = "handle_message"
      source_dir    = "${path.root}/../functions/satellite_worker"
      trigger_topic = "satellite-refresh"
      sa_key        = "satellite-worker"
      memory        = "512Mi"
      timeout       = 300
      max_instances = 5
      secrets       = ["CDSE_CLIENT_ID", "CDSE_CLIENT_SECRET"]
    }
  }

  shared_env = {
    GCP_PROJECT             = var.project_id
    GCS_BUCKET_WEATHER      = var.weather_bucket
    GCS_BUCKET_SATELLITE    = var.satellite_bucket
    TOPIC_WEATHER_REFRESH   = var.topic_paths["weather-refresh"]
    TOPIC_NWAC_REFRESH      = var.topic_paths["nwac-refresh"]
    TOPIC_SNOTEL_REFRESH    = var.topic_paths["snotel-refresh"]
    TOPIC_SATELLITE_REFRESH = var.topic_paths["satellite-refresh"]
  }
}

# Vendor shared/ (+ self-packages) into each function dir before zipping. The
# script is invoked by Terraform — never run by hand. Re-runs when any canonical
# (non-vendored) Python source changes.
locals {
  fn_src_files = [
    for f in fileset("${path.root}/../functions", "**/*.py") : f
    if !strcontains(f, "/shared/") &&
    length(regexall("^(weather_worker/weather_worker|nwac_worker/nwac_worker|snotel_worker/snotel_worker|satellite_worker/satellite_worker)/", f)) == 0
  ]
}

resource "terraform_data" "stage_functions" {
  triggers_replace = {
    hash = sha1(join("", [for f in local.fn_src_files : filesha1("${path.root}/../functions/${f}")]))
  }
  provisioner "local-exec" {
    command = "${path.root}/../scripts/stage-functions.sh"
  }
}

# Bundle each function's source (its own dir + the vendored shared/ package).
data "archive_file" "src" {
  for_each    = local.functions
  type        = "zip"
  output_path = "${path.module}/build/${each.key}.zip"
  source_dir  = each.value.source_dir
  depends_on  = [terraform_data.stage_functions]
}

resource "google_storage_bucket_object" "src" {
  for_each = local.functions
  name     = "sources/${each.key}/${data.archive_file.src[each.key].output_md5}.zip"
  bucket   = var.source_bucket
  source   = data.archive_file.src[each.key].output_path
}

resource "google_cloudfunctions2_function" "fn" {
  for_each = local.functions
  name     = each.key
  location = var.region

  build_config {
    runtime     = "python312"
    entry_point = each.value.entry_point
    source {
      storage_source {
        bucket = var.source_bucket
        object = google_storage_bucket_object.src[each.key].name
      }
    }
  }

  service_config {
    available_memory      = each.value.memory
    timeout_seconds       = each.value.timeout
    max_instance_count    = each.value.max_instances
    service_account_email = var.sa_emails[each.value.sa_key]
    environment_variables = local.shared_env

    dynamic "secret_environment_variables" {
      for_each = toset(lookup(each.value, "secrets", []))
      content {
        key        = secret_environment_variables.value
        project_id = var.project_id
        secret     = lower(replace(secret_environment_variables.value, "_", "-"))
        version    = "latest"
      }
    }
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic          = var.topic_ids[each.value.trigger_topic]
    retry_policy          = "RETRY_POLICY_RETRY"
    service_account_email = var.sa_emails[each.value.sa_key]
  }

  depends_on = [
    google_secret_manager_secret.cdse_client_id,
    google_secret_manager_secret.cdse_client_secret,
  ]
}

# Attach the dead-letter policy to each Gen2 trigger's auto-created push
# subscription (the provider does not expose it, so resolve it via gcloud).
resource "terraform_data" "dlq_policy" {
  for_each         = local.functions
  triggers_replace = { fn = google_cloudfunctions2_function.fn[each.key].id }
  provisioner "local-exec" {
    interpreter = ["/bin/bash", "-c"]
    command     = <<-EOT
      set -euo pipefail
      TRIG=$(basename "${google_cloudfunctions2_function.fn[each.key].event_trigger[0].trigger}")
      SUB=$(gcloud eventarc triggers describe "$TRIG" \
        --location ${var.region} --project ${var.project_id} \
        --format='value(transport.pubsub.subscription)')
      gcloud pubsub subscriptions update "$SUB" --project ${var.project_id} \
        --dead-letter-topic=${var.dlq_topic_id} --max-delivery-attempts=5
    EOT
  }
}
