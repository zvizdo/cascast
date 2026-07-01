output "sa_emails" { value = { for k, sa in google_service_account.workers : k => sa.email } }
output "web_sa_email" { value = google_service_account.web.email }
