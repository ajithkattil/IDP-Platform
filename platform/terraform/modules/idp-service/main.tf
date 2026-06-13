# ============================================================
# Zayo IDP — Per-service Terraform module
# Called by Backstage scaffolder when a new service is created
#
# Creates per service:
#   - ECR repository
#   - EKS namespace
#   - Kubernetes ServiceAccount
#   - ECR pull secret
#   - ArgoCD Application
# ============================================================

terraform {
  required_providers {
    aws        = { source = "hashicorp/aws",       version = "~> 5.0" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.0" }
    null       = { source = "hashicorp/null",       version = "~> 3.0" }
  }
}

locals {
  ecr_repo  = "zayo-poc/${var.service_name}"
  namespace = var.service_name
  tags = {
    Service     = var.service_name
    Owner       = var.owner_team
    Environment = var.environment
    ManagedBy   = "terraform"
    CreatedBy   = "zayo-idp-scaffolder"
  }
}

# ── ECR Repository ────────────────────────────────────────────
resource "aws_ecr_repository" "service" {
  name                 = local.ecr_repo
  image_tag_mutability = "MUTABLE"
  image_scanning_configuration { scan_on_push = true }
  tags = local.tags
}

resource "aws_ecr_lifecycle_policy" "service" {
  repository = aws_ecr_repository.service.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 20 images"
      selection    = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 20
      }
      action = { type = "expire" }
    }]
  })
}

# ── EKS Namespace ─────────────────────────────────────────────
resource "kubernetes_namespace" "service" {
  metadata {
    name = local.namespace
    labels = {
      "app.kubernetes.io/name"       = var.service_name
      "app.kubernetes.io/managed-by" = "terraform"
      "zayo.com/owner"               = var.owner_team
      "zayo.com/environment"         = var.environment
    }
    annotations = {
      "zayo.com/service"     = var.service_name
      "zayo.com/owner-team"  = var.owner_team
      "zayo.com/description" = var.description
    }
  }
}

# ── Kubernetes ServiceAccount ─────────────────────────────────
resource "kubernetes_service_account" "service" {
  metadata {
    name      = var.service_name
    namespace = kubernetes_namespace.service.metadata[0].name
    labels    = { "app.kubernetes.io/name" = var.service_name }
  }
  depends_on = [kubernetes_namespace.service]
}

# ── ECR Pull Secret ───────────────────────────────────────────
resource "kubernetes_secret" "ecr_pull" {
  metadata {
    name      = "ecr-pull-secret"
    namespace = kubernetes_namespace.service.metadata[0].name
  }
  type = "kubernetes.io/dockerconfigjson"
  data = {
    ".dockerconfigjson" = jsonencode({
      auths = {
        "${var.aws_account_id}.dkr.ecr.${var.aws_region}.amazonaws.com" = {
          auth = base64encode("AWS:placeholder")
        }
      }
    })
  }
  depends_on = [kubernetes_namespace.service]
}

# ── ArgoCD Application ────────────────────────────────────────
resource "null_resource" "argocd_app" {
  triggers = {
    service_name = var.service_name
    owner_team   = var.owner_team
  }

  provisioner "local-exec" {
    command = <<-CMD
      kubectl apply -f - <<EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: ${var.service_name}
  namespace: argocd
  labels:
    zayo.com/service: "${var.service_name}"
    zayo.com/owner-team: "${var.owner_team}"
spec:
  project: default
  source:
    repoURL: https://gitlab.com/${var.gitlab_group}/${var.service_name}.git
    targetRevision: main
    path: helm
    helm:
      valueFiles:
        - values-prod.yaml
  destination:
    server: https://kubernetes.default.svc
    namespace: ${var.service_name}
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
EOF
    CMD
  }
  depends_on = [kubernetes_namespace.service]
}
