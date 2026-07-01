output "function_names" {
  value = { for k, f in google_cloudfunctions2_function.fn : k => f.name }
}
output "function_uris" {
  value = { for k, f in google_cloudfunctions2_function.fn : k => f.service_config[0].uri }
}
