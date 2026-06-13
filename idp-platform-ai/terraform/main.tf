# ============================================================
# Terraform — Idp POC EKS Cluster + Supporting Infrastructure
# Layer: L6b · Infrastructure as Code
#
# Creates:
#   - VPC (3 public + 3 private subnets, 3 AZs)
#   - EKS cluster with OIDC provider
#   - Managed node group (t3.medium, auto-scaling 2-6)
#   - ECR repository for idp-platform-ai
#   - IRSA pod role (Secrets Manager access)
#   - ArgoCD namespace + RBAC
#   - S3 bucket for Terraform state (created separately — see bootstrap/)
#
# State: S3 backend + DynamoDB lock (configured via -backend-config in CI)
# Auth:  OIDC (GitLab CI → AWS) — zero static credentials
# ============================================================

terraform {
  required_version = ">= 1.7"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
   
}
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.0"
   
}
    helm = {
      source  = "hashicorp/helm"
      version = "~> 2.0"
   
}
 
}

  # Backend configured via -backend-config flags in CI pipeline
  backend "s3" {}
}

# ── Variables ─────────────────────────────────────────────────
variable "aws_region"    { type = string
  default = "us-east-1"
}
variable "cluster_name"  { type = string
  default = "idp-poc-eks"
}
variable "environment"   { type = string
  default = "prod"
}
variable "service_name"  { type = string
  default = "idp-platform-ai"
}
variable "image_tag"     { type = string
  default = "latest"
}

variable "node_instance_types" {
  type    = list(string)
  default = ["t3.medium"]
}

variable "node_desired" { type = number; default = 3
}
variable "node_min"     { type = number; default = 2
}
variable "node_max"     { type = number; default = 6
}

locals {
  tags = {
    Environment = var.environment
    ManagedBy   = "terraform"
    Project     = "idp-poc"
    Service     = var.service_name
 
}
}

# ── Provider ──────────────────────────────────────────────────
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
 
}
}

# ── Data sources ──────────────────────────────────────────────
data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

# ── VPC ───────────────────────────────────────────────────────
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${var.cluster_name}-vpc"
  cidr = "10.0.0.0/16"

  azs             = slice(data.aws_availability_zones.available.names, 0, 3)
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  enable_nat_gateway     = true
  single_nat_gateway     = true      # Cost-optimised for POC; use one_nat_per_az in production
  enable_dns_hostnames   = true
  enable_dns_support     = true

  # Required tags for EKS
  public_subnet_tags = {
    "kubernetes.io/role/elb"                        = "1"
    "kubernetes.io/cluster/${var.cluster_name}"     = "shared"
 
}

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb"               = "1"
    "kubernetes.io/cluster/${var.cluster_name}"     = "shared"
 
}
}

# ── EKS Cluster ───────────────────────────────────────────────
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = var.cluster_name
  cluster_version = "1.30"

  vpc_id                         = module.vpc.vpc_id
  subnet_ids                     = module.vpc.private_subnets
  cluster_endpoint_public_access = true

  # OIDC provider — required for IRSA (pods assume IAM roles without static keys)
  enable_irsa = true

  # EKS add-ons
  cluster_addons = {
    coredns    = { most_recent = true
}
    kube-proxy = { most_recent = true
}
    vpc-cni    = { most_recent = true
}
    aws-ebs-csi-driver = { most_recent = true
}
 
}

  # Managed node group
  eks_managed_node_groups = {
    idp-poc = {
      name           = "idp-poc-nodes"
      instance_types = var.node_instance_types

      min_size     = var.node_min
      max_size     = var.node_max
      desired_size = var.node_desired

      # Use latest EKS-optimised AMI
      ami_type       = "AL2_x86_64"
      capacity_type  = "ON_DEMAND"

      # Disk
      block_device_mappings = {
        xvda = {
          device_name = "/dev/xvda"
          ebs = {
            volume_size           = 50
            volume_type           = "gp3"
            delete_on_termination = true
            encrypted             = true
         
}
       
}
     
}

      labels = {
        environment = var.environment
        managed-by  = "terraform"
     
}
   
}
 
}

  # Allow access to cluster from CI/CD and platform engineers
  access_entries = {
    platform-ci = {
      kubernetes_groups = []
      principal_arn     = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/idp-poc-gitlab-ci-role"
      policy_associations = {
        admin = {
          policy_arn = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"
          access_scope = {
            type = "cluster"
         
}
       
}
     
}
   
}
 
}
}

# ── ECR Repository ────────────────────────────────────────────
resource "aws_ecr_repository" "service" {
  name                 = "idp-poc/${var.service_name}"
  image_tag_mutability = "IMMUTABLE"

  image_scanning_configuration {
    scan_on_push = true
 
}

  encryption_configuration {
    encryption_type = "KMS"
 
}
}

resource "aws_ecr_lifecycle_policy" "service" {
  repository = aws_ecr_repository.service.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 20 tagged images"
      selection = {
        tagStatus   = "tagged"
        countType   = "imageCountMoreThan"
        countNumber = 20
     
}
      action = { type = "expire"
}
    }]
  })
}

# ── IRSA — Pod role for AWS Secrets Manager access ───────────
data "aws_iam_openid_connect_provider" "eks" {
  url = module.eks.cluster_oidc_issuer_url
}

resource "aws_iam_role" "pod_role" {
  name = "${var.service_name}-pod-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Federated = data.aws_iam_openid_connect_provider.eks.arn
     
}
      Action = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = {
          "${replace(module.eks.cluster_oidc_issuer_url, "https://", "")}:sub" =
            "system:serviceaccount:${var.environment}:${var.service_name}"
       
}
     
}
    }]
  })
}

resource "aws_iam_role_policy" "pod_secrets" {
  name = "${var.service_name}-secrets-policy"
  role = aws_iam_role.pod_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:${data.aws_caller_identity.current.account_id}:secret:idp/${var.service_name}/*"
      },
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = ["ecr:BatchCheckLayerAvailability", "ecr:GetDownloadUrlForLayer", "ecr:BatchGetImage"]
        Resource = aws_ecr_repository.service.arn
     
}
    ]
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

resource "kubernetes_namespace" "prod" {
  metadata {
    name = "prod"
    labels = {
      environment = "prod"
      managed-by  = "terraform"
   
}
 
}
  depends_on = [module.eks]
}

resource "kubernetes_namespace" "dev" {
  metadata {
    name = "dev"
    labels = {
      environment = "dev"
      managed-by  = "terraform"
   
}
 
}
  depends_on = [module.eks]
}

resource "kubernetes_namespace" "argocd" {
  metadata {
    name = "argocd"
    labels = {
      "app.kubernetes.io/name" = "argocd"
      managed-by               = "terraform"
   
}
 
}
  depends_on = [module.eks]
}

# ── ArgoCD (deployed via Helm) ────────────────────────────────
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

  set {
    name  = "server.service.type"
    value = "ClusterIP"
 
}
  set {
    name  = "global.image.tag"
    value = "v2.12.0"
 
}

  depends_on = [kubernetes_namespace.argocd]
}

# ── S3 for SBOMs ─────────────────────────────────────────────
resource "aws_s3_bucket" "sboms" {
  bucket = "idp-poc-sboms-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "sboms" {
  bucket = aws_s3_bucket.sboms.id
  versioning_configuration { status = "Enabled"
}
}

resource "aws_s3_bucket_public_access_block" "sboms" {
  bucket                  = aws_s3_bucket.sboms.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Outputs ───────────────────────────────────────────────────
output "cluster_name"            { value = module.eks.cluster_name
}
output "cluster_endpoint"        { value = module.eks.cluster_endpoint
}
output "ecr_repository_url"      { value = aws_ecr_repository.service.repository_url
}
output "pod_role_arn"            { value = aws_iam_role.pod_role.arn
}
output "configure_kubectl"       { value = "aws eks update-kubeconfig --region ${var.aws_region} --name ${var.cluster_name}"
}
