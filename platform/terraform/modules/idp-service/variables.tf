variable "service_name" {
  type        = string
  description = "Name of the service — used for ECR repo, namespace, ArgoCD app"
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,48}[a-z0-9]$", var.service_name))
    error_message = "Service name must be lowercase alphanumeric with hyphens, 4-50 chars"
  }
}

variable "owner_team" {
  type        = string
  description = "Owning team slug e.g. platform-engineering, orders-team"
}

variable "description" {
  type        = string
  description = "Brief description of the service"
  default     = ""
}

variable "environment" {
  type        = string
  description = "Environment: dev, staging, prod"
  default     = "dev"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod"
  }
}

variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "aws_account_id" {
  type        = string
  description = "AWS account ID — used for ECR URL"
}

variable "cluster_name" {
  type    = string
  default = "test-cluster-cicd-deployment"
}

variable "gitlab_group" {
  type    = string
  default = "idp-group/devops/idp-platform"
}
