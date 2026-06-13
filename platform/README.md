# platform

**Contents:** Bootstrap scripts, Terraform, ArgoCD configurations, utility scripts  
**GitLab:** gitlab.com/cltajith/platform

---

## What it does

The infrastructure backbone of the Idp IDP POC. Contains everything needed to provision and configure the AWS and Kubernetes infrastructure that all services run on.

---

## Directory structure

```
platform/
├── bootstrap/
│   └── bootstrap.sh            # One-time AWS setup — run this first
├── terraform/
│   └── main.tf                 # EKS cluster, VPC, ECR, IAM (syntax issues — WIP)
├── argocd/
│   └── apps.yaml               # ArgoCD Application manifests for all services
└── scripts/
    ├── cost-check.py           # AWS cost estimation script
    ├── fire-datadog-event.py   # DORA metrics publisher
    └── write-deployment-record.py  # Deployment record writer
```

---

## Bootstrap script

Run once before anything else. Creates all AWS prerequisites.

```bash
export AWS_REGION=us-east-1
export GITLAB_GROUP="cltajith"
chmod +x bootstrap/bootstrap.sh
./bootstrap/bootstrap.sh
```

### What bootstrap creates

| Resource | Name | Purpose |
|----------|------|---------|
| S3 Bucket | idp-poc-tf-state-123456789012-idp | Terraform state storage |
| DynamoDB Table | idp-poc-tf-locks | Terraform state locking |
| OIDC Provider | gitlab.com | GitLab CI → AWS auth (blocked by permission boundary) |
| IAM Role | idp-poc-gitlab-ci-role | Pipeline role (blocked by permission boundary) |
| ECR Repo | idp-poc/idp-platform-ai | AI service images |
| ECR Repo | idp-poc/spring-orders-poc | Orders service images |

### Known issue — IAM role creation blocked

The bootstrap script fails at step 4 (IAM role creation) because the AWS account has a permission boundary that blocks `iam:CreateRole`. The workaround is to use static SSO credentials in GitLab CI/CD variables instead of OIDC.

**To fix permanently:** Ask AWS admin to either:
- Create the `idp-poc-gitlab-ci-role` IAM role manually, or
- Remove the `iam:CreateRole` restriction from the permission boundary

---

## ArgoCD applications

The `argocd/apps.yaml` file defines both service deployments. Apply it once after ArgoCD is installed:

```bash
kubectl apply -f argocd/apps.yaml
```

### Adding GitLab credentials to ArgoCD

ArgoCD needs a GitLab PAT to pull Helm charts:

```bash
# For idp-platform-ai
kubectl create secret generic argocd-repo-idp-platform-ai \
  -n argocd \
  --from-literal=type=git \
  --from-literal=url=https://gitlab.com/cltajith/idp-platform-ai.git \
  --from-literal=username=cltajith \
  --from-literal=password=glpat-...

kubectl label secret argocd-repo-idp-platform-ai \
  -n argocd \
  "argocd.argoproj.io/secret-type=repository"

# For spring-orders-poc
kubectl create secret generic argocd-repo-spring-orders-poc \
  -n argocd \
  --from-literal=type=git \
  --from-literal=url=https://gitlab.com/cltajith/spring-orders-poc.git \
  --from-literal=username=cltajith \
  --from-literal=password=glpat-...

kubectl label secret argocd-repo-spring-orders-poc \
  -n argocd \
  "argocd.argoproj.io/secret-type=repository"
```

---

## Terraform (WIP)

The Terraform configuration provisions a full EKS cluster from scratch. Currently disabled in CI/CD pipelines due to syntax errors in `main.tf`.

**Status:** Not used in current POC — using existing `test-cluster-cicd-deployment` EKS cluster.

**To fix:** The `main.tf` file has inline block syntax issues (semicolons instead of newlines). Needs a full rewrite before use.

---

## Utility scripts

### cost-check.py
Estimates AWS costs for running POC resources.
```bash
python3 scripts/cost-check.py --region us-east-1
```

### fire-datadog-event.py
Fires a DORA deployment event to Datadog.
```bash
python3 scripts/fire-datadog-event.py \
  --service idp-platform-ai \
  --env prod \
  --version v1.0.0-abc123 \
  --committed-at 1234567890 \
  --deployed-at 1234567999 \
  --pipeline-url https://gitlab.com/...
```

### write-deployment-record.py
Writes an immutable deployment record to Postgres.
```bash
python3 scripts/write-deployment-record.py \
  --service idp-platform-ai \
  --env prod \
  --version v1.0.0-abc123 \
  --git-sha abc123 \
  --pipeline 12345 \
  --jira ZSP-001
```

---

## EKS cluster setup (one-time)

After the cluster exists, set up namespaces and ArgoCD:

```bash
# Configure kubectl
aws eks update-kubeconfig --name test-cluster-cicd-deployment --region us-east-1

# Create namespaces
kubectl create namespace platform-ai
kubectl create namespace orders
kubectl create namespace argocd

# Install ArgoCD
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml

# Wait for ArgoCD
kubectl wait deployment/argocd-server --for=condition=available --timeout=120s -n argocd

# Apply ArgoCD apps
kubectl apply -f argocd/apps.yaml
```

---

## Teardown

```bash
# Delete all POC namespaces
kubectl delete namespace platform-ai orders argocd

# Clean up ECR images (optional)
aws ecr list-images --repository-name idp-poc/idp-platform-ai --region us-east-1
aws ecr batch-delete-image --repository-name idp-poc/idp-platform-ai --region us-east-1 --image-ids ...

# Clean up S3 state bucket (optional)
aws s3 rb s3://idp-poc-tf-state-123456789012-idp --force
```
