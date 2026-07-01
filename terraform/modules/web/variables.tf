variable "project_id" { type = string }
variable "region" { type = string }
variable "weather_bucket" { type = string }
variable "satellite_bucket" { type = string }
variable "terrain_bucket" { type = string }
variable "geo_bucket" { type = string }
variable "topic_paths" { type = map(string) }
variable "web_sa_email" { type = string }
variable "source_root" { type = string } # repo root containing the Dockerfile
variable "ga_measurement_id" {
  type    = string
  default = ""
}
