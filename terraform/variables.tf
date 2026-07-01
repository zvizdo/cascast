variable "project_id" {
  type    = string
  default = "mountain-weatherman-app"
}
variable "region" {
  type    = string
  default = "us-west1"
}
variable "budget_billing_account" {
  type    = string
  default = "016F04-9D26E8-0B960A"
}
variable "alert_email" {
  type        = string
  default     = ""
  description = "Operator email for pipeline alerts. Supply via TF_VAR_alert_email; never commit a real address."
}
variable "ga_measurement_id" {
  type        = string
  default     = ""
  description = "GA4 Measurement ID (G-XXXXXXXXXX). Supply via TF_VAR_ga_measurement_id; empty disables analytics. Not a secret, but kept out of the repo by convention."
}
