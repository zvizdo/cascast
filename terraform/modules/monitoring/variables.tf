variable "project_id" { type = string }
variable "dlq_topic" { type = string }
variable "billing_account" { type = string }
variable "alert_email" {
  type        = string
  default     = ""
  description = "Operator email for pipeline alerts (empty = no channel/notifications)."
}
