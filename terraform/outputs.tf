output "weather_bucket" { value = module.storage.weather_bucket_name }
output "satellite_bucket" { value = module.storage.satellite_bucket_name }
output "source_bucket" { value = module.storage.source_bucket_name }
output "orchestrate_topic" { value = module.pubsub.orchestrate_topic_id }
output "function_names" { value = module.functions.function_names }
output "web_url" { value = module.web.url }
