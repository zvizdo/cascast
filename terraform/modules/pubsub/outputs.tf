output "orchestrate_topic_id" { value = google_pubsub_topic.topics["orchestrate"].id }
output "dlq_topic_id" { value = google_pubsub_topic.dlq.id }
output "topic_ids" { value = { for k, t in google_pubsub_topic.topics : k => t.id } }
