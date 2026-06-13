output "ecr_repository_url" {
  description = "ECR repository URL for the service"
  value       = aws_ecr_repository.service.repository_url
}

output "ecr_repository_name" {
  description = "ECR repository name"
  value       = aws_ecr_repository.service.name
}

output "namespace" {
  description = "Kubernetes namespace created for the service"
  value       = kubernetes_namespace.service.metadata[0].name
}

output "service_account" {
  description = "Kubernetes ServiceAccount name"
  value       = kubernetes_service_account.service.metadata[0].name
}

output "argocd_app_name" {
  description = "ArgoCD application name"
  value       = var.service_name
}

output "gitlab_repo_url" {
  description = "Expected GitLab repo URL for the service"
  value       = "https://gitlab.com/${var.gitlab_group}/${var.service_name}"
}
