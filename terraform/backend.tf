terraform {
  required_version = ">= 1.8.0"
  required_providers {
    google  = { source = "hashicorp/google", version = "~> 5.40" }
    archive = { source = "hashicorp/archive", version = "~> 2.4" }
  }
  backend "gcs" {
    bucket = "mountain-weatherman-app-tfstate"
    prefix = "terraform/state"
  }
}
