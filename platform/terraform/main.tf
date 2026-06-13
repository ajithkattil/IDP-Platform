# ============================================================
# Zayo POC — Combined Platform Terraform
# Creates ONE shared EKS cluster used by both services:
#   - spring-orders-poc  (namespace: orders)
#   - zayo-platform-ai   (namespace: platform-ai)
#
# Deploy order:
#   1. terraform apply  → cluster + ECR repos + namespaces
#   2. kubectl apply argocd/platform-ai-app.yaml  → AI service first
#   3. kubectl apply argocd/orders-app.yaml       → orders service second
# ============================================================

terraform {
  required_version = ">= 1.7"
  required_providers {
    aws        = { source = "hashicorp/aws",        version = "~> 5.0" }
    kubernetes = { source = "hashicorp/kubernetes",  version = "~> 2.0" }
    helm       = { source = "hashicorp/helm",        version = "~> 2.0" }
  }
  backend "s3" {}
}

variable "aws_region"   { default = "us-east-1" }
variable "cluster_name" { default = "zayo-poc-eks" }
variable "environment"  { default = "poc" }

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "zayo-poc"
  }
  services = ["zayo-platform-ai", "spring-orders-poc"]
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = local.tags }
}

data "aws_availability_zones" "available" { state = "available" }
data "aws_caller_identity" "current" {}

# ── VPC ───────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"
  name    = "${var.cluster_name}-vpc"
  cidr    = "10.0.0.0/16"
  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]
  enable_nat_gateway   = true
  single_nat_gateway   = true
  enable_dns_hostnames = true
  public_subnet_tags  = { "kubernetes.io/role/elb" = "1", "kubernetes.io/cluster/${var.cluster_name}" = "shared" }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = "1", "kubernetes.io/cluster/${var.cluster_name}" = "shared" }
}

# ── EKS Cluster ───────────────────────────────────────────────
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"
  cluster_name    = var.cluster_name
  cluster_version = "1.30"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  cluster_endpoint_public_access = true
  enable_irsa = true
  cluster_addons = {
    coredns    = { most_recent = true }
    kube-proxy = { most_recent = true }
    vpc-cni    = { most_recent = true }
  }
  eks_managed_node_groups = {
    shared = {
      name           = "zayo-poc-nodes"
      instance_types = ["t3.medium"]
      min_size       = 2
      max_size       = 4
      desired_size   = 2
      labels         = { environment = var.environment }
      tags           = { auto-delete = "true" }
    }
  }
}

# ── ECR — one repo per service ────────────────────────────────
resource "aws_ecr_repository" "services" {
  for_each             = toset(local.services)
  name                 = "zayo-poc/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration { scan_on_push = true }
  encryption_configuration    { encryption_type = "KMS" }
}

resource "aws_ecr_lifecycle_policy" "services" {
  for_each   = aws_ecr_repository.services
  repository = each.value.name
  policy = jsonencode({ rules = [{ rulePriority = 1, description = "Keep 20 images",
    selection = { tagStatus = "tagged", countType = "imageCountMoreThan", countNumber = 20 },
    action = { type = "expire" } }] })
}

# ── IRSA — pod role per service ───────────────────────────────
data "aws_iam_openid_connect_provider" "eks" {
  url        = module.eks.cluster_oidc_issuer_url
  depends_on = [module.eks]
}

resource "aws_iam_role" "pod_roles" {
  for_each = toset(local.services)
  name     = "${each.key}-pod-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = data.aws_iam_openid_connect_provider.eks.arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(module.eks.cluster_oidc_issuer_url, "https://", "")}:sub" =
            "system:serviceaccount:${each.key == "zayo-platform-ai" ? "platform-ai" : "orders"}:${each.key}"
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "pod_secrets" {
  for_each = toset(local.services)
  name     = "${each.key}-secrets"
  role     = aws_iam_role.pod_roles[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:zayo/${each.key}/*"
    }]
  })
}

# ── Kubernetes namespaces ─────────────────────────────────────
provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", var.cluster_name]
  }
}

resource "kubernetes_namespace" "namespaces" {
  for_each = toset(["platform-ai", "orders", "argocd"])
  metadata {
    name   = each.key
    labels = { environment = var.environment, "managed-by" = "terraform" }
  }
  depends_on = [module.eks]
}

# ── ArgoCD ────────────────────────────────────────────────────
provider "helm" {
  kubernetes {
    host                   = module.eks.cluster_endpoint
    cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
    exec {
      api_version = "client.authentication.k8s.io/v1beta1"
      command     = "aws"
      args        = ["eks", "get-token", "--cluster-name", var.cluster_name]
    }
  }
}

resource "helm_release" "argocd" {
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = "7.4.0"
  namespace        = "argocd"
  create_namespace = false
  timeout          = 600
  set { name = "server.service.type"; value = "ClusterIP" }
  depends_on = [kubernetes_namespace.namespaces]
}

# ── S3 for SBOMs ─────────────────────────────────────────────
resource "aws_s3_bucket" "sboms" {
  bucket = "zayo-poc-sboms-${data.aws_caller_identity.current.account_id}"
}
resource "aws_s3_bucket_public_access_block" "sboms" {
  bucket                  = aws_s3_bucket.sboms.id
  block_public_acls       = true; block_public_policy     = true
  ignore_public_acls      = true; restrict_public_buckets = true
}

# ── Outputs ───────────────────────────────────────────────────
output "cluster_name"     { value = module.eks.cluster_name }
output "cluster_endpoint" { value = module.eks.cluster_endpoint }
output "configure_kubectl" {
  value = "aws eks update-kubeconfig --region ${var.aws_region} --name ${var.cluster_name}"
}
output "ecr_urls" {
  value = { for k, v in aws_ecr_repository.services : k => v.repository_url }
}
output "pod_role_arns" {
  value = { for k, v in aws_iam_role.pod_roles : k => v.arn }
}
