# idp-platform-ai

**Language:** Python 3.11 / FastAPI  
**Namespace:** platform-ai  
**Port:** 8000  
**Image:** 123456789012.dkr.ecr.us-east-1.amazonaws.com/idp-poc/idp-platform-ai  
**GitLab:** gitlab.com/cltajith/idp-platform-ai

---

## What it does

The AI brain of the Idp IDP. It runs Claude Sonnet 4 (Anthropic) and provides:

- **AI Copilot** — developers ask questions about their code, errors, and vulnerabilities
- **SAST explanation** — called by GitLab pipelines to explain security findings in plain English
- **Data bridge** — aggregates live data from GitLab, Datadog, EKS, and Postgres for the DevPortal mockup
- **Health monitoring** — exposes health endpoints for all dependent services

Proves the full golden pipeline: GitLab SCM → CI/CD → Docker → ECR → EKS (ArgoCD) → Datadog DORA.

---

## Prerequisites

```bash
brew install python@3.11 docker terraform kubectl helm awscli
pip install -r requirements-dev.txt
```

---

## API endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/` | GET | Service info |
| `/api/v1/health` | GET | Health check — Claude API + prompt registry |
| `/api/v1/chat` | POST | AI Copilot — send messages to Claude |
| `/api/v1/analyze/security` | POST | Explain SAST findings |
| `/api/v1/analyze/service` | POST | Analyse a service |
| `/api/v1/bridge/health` | GET | Data bridge health |
| `/api/v1/bridge/pipeline` | GET | Live GitLab pipeline status |
| `/api/v1/bridge/dora` | GET | DORA metrics from Datadog |
| `/api/v1/bridge/cluster` | GET | EKS pod status |
| `/docs` | GET | Swagger UI |

---

## Step-by-step: run the pipeline end-to-end

### 1. Bootstrap AWS state backend (once only)

```bash
export AWS_REGION=us-east-1
export GITLAB_GROUP="cltajith"
chmod +x platform/bootstrap/bootstrap.sh
./platform/bootstrap/bootstrap.sh
```

This creates:
- S3 bucket for Terraform state: `idp-poc-tf-state-123456789012-idp`
- DynamoDB lock table: `idp-poc-tf-locks`
- ECR repos: `idp-poc/idp-platform-ai` and `idp-poc/spring-orders-poc`
- GitLab OIDC provider (may be blocked by permission boundary — use static credentials instead)

### 2. Set GitLab CI/CD variables

Go to `gitlab.com/cltajith/idp-platform-ai` → Settings → CI/CD → Variables:

| Variable | Value | Masked |
|----------|-------|--------|
| `AWS_ACCOUNT_ID` | 123456789012 | No |
| `AWS_REGION` | us-east-1 | No |
| `AWS_ACCESS_KEY_ID` | SSO temp key | Yes |
| `AWS_SECRET_ACCESS_KEY` | SSO temp secret | Yes |
| `AWS_SESSION_TOKEN` | SSO session token | Yes |
| `ANTHROPIC_API_KEY` | sk-ant-... | Yes |
| `DD_API_KEY` | Datadog API key | Yes |
| `DD_APP_KEY` | Datadog app key | Yes |
| `GITLAB_TOKEN` | glpat-... | Yes |
| `PLATFORM_CI_TOKEN` | same as GITLAB_TOKEN | Yes |

### 3. Push to GitLab

```bash
git clone https://gitlab.com/cltajith/idp-platform-ai.git
cd idp-platform-ai
git add .
git commit -m "feat: initial commit"
git push -u origin main
```

Pipeline triggers automatically on push:

| Stage | Jobs | Time | Runs when |
|-------|------|------|-----------|
| lint | flake8, pylint | ~1 min | Every push |
| sast | bandit, secrets-scan | ~2 min | Every push |
| test | pytest (70% coverage gate) | ~3 min | Every push |
| build | docker build | ~4 min | main only |
| push | ECR push | ~3 min | main only |
| iac | terraform (disabled) | — | Never |
| notify | Datadog DORA event | ~1 min | main only |

### 4. Deploy to EKS via ArgoCD

```bash
# Configure kubectl
aws eks update-kubeconfig --name test-cluster-cicd-deployment --region us-east-1

# Create namespace
kubectl create namespace platform-ai

# Create Kubernetes secret
kubectl create secret generic idp-platform-ai-secrets \
  -n platform-ai \
  --from-literal=anthropic-api-key="sk-ant-..." \
  --from-literal=database-url="" \
  --from-literal=datadog-api-key="..." \
  --from-literal=gitlab-token="glpat-..." \
  --from-literal=datadog-app-key="..."

# Add GitLab repo credentials to ArgoCD
kubectl create secret generic argocd-repo-idp-platform-ai \
  -n argocd \
  --from-literal=type=git \
  --from-literal=url=https://gitlab.com/cltajith/idp-platform-ai.git \
  --from-literal=username=cltajith \
  --from-literal=password=glpat-...

kubectl label secret argocd-repo-idp-platform-ai \
  -n argocd \
  "argocd.argoproj.io/secret-type=repository"

# Apply ArgoCD application
kubectl apply -f argocd-app.yaml
```

### 5. Verify deployment

```bash
# Check pods
kubectl get pods -n platform-ai

# Port forward
kubectl port-forward svc/idp-platform-ai 8000:8000 -n platform-ai

# Health check
curl http://localhost:8000/api/v1/health
```

### 6. Test AI endpoints

```bash
# AI Copilot chat
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "What is a SQL injection vulnerability?"}]}'

# Security analysis
curl -X POST http://localhost:8000/api/v1/analyze/security \
  -H "Content-Type: application/json" \
  -d '{
    "service_name": "billing-service",
    "language": "java",
    "findings": [{
      "severity": "High",
      "rule": "SQL_Injection",
      "file": "BillingService.java",
      "line": 89,
      "description": "User input in SQL query",
      "cwe_id": "89"
    }]
  }'
```

---

## Local development

```bash
# Install deps
pip install -r requirements-dev.txt

# Set environment variables
export ANTHROPIC_API_KEY=sk-ant-...
export DD_API_KEY=...
export GITLAB_TOKEN=glpat-...

# Run tests
pytest tests/ -v --cov=app

# Start service locally
uvicorn app.main:app --reload --port 8000

# Open API docs
open http://localhost:8000/docs
```

---

## Project structure

```
idp-platform-ai/
├── app/
│   ├── main.py                       # FastAPI app entry point + lifespan
│   ├── config.py                     # pydantic-settings environment config
│   ├── models/
│   │   └── schemas.py                # Pydantic request/response models
│   ├── routers/
│   │   ├── chat.py                   # AI Copilot endpoint
│   │   ├── analyze.py                # SAST analysis endpoints
│   │   ├── databridge.py             # Live data aggregation
│   │   └── health.py                 # Health check endpoint
│   └── services/
│       ├── claude_client.py          # Anthropic SDK async wrapper
│       ├── gitlab_client.py          # GitLab API client
│       ├── datadog_client.py         # Datadog API client
│       ├── eks_client.py             # Kubernetes client
│       ├── context_builder.py        # RAG context builder
│       └── prompt_registry.py        # Versioned prompt templates
├── tests/
│   ├── conftest.py                   # fixtures + mock Claude client
│   └── test_api.py                   # health, chat, analyze tests
├── helm/
│   ├── Chart.yaml
│   ├── values-prod.yaml              # ArgoCD watches image.tag here
│   └── templates/
│       ├── deployment.yaml
│       └── service.yaml              # Service, SA, HPA, Ingress, PDB
├── terraform/                        # Service-level Terraform (IAM, ECR) — WIP
├── scripts/
│   ├── write-deployment-record.py    # Immutable deploy row → Postgres
│   └── fire-datadog-event.py         # DORA events → Datadog API
├── pipeline-templates/
│   └── golden-pipeline-python.gitlab-ci.yml  # Platform-owned template
├── Dockerfile                        # Multi-stage python:3.11-slim
├── .gitlab-ci.yml                    # Golden pipeline
├── argocd-app.yaml                   # ArgoCD Application manifest
├── catalog-info.yaml                 # Backstage service catalog entry
├── requirements.txt
├── requirements-dev.txt
└── pyproject.toml
```

---

## Kubernetes operations

```bash
# Check pods
kubectl get pods -n platform-ai

# View logs
kubectl logs -n platform-ai -l app=idp-platform-ai --tail=50

# Port forward
kubectl port-forward svc/idp-platform-ai 8000:8000 -n platform-ai

# Restart deployment
kubectl rollout restart deployment/idp-platform-ai -n platform-ai

# Force ArgoCD sync
kubectl annotate application idp-platform-ai \
  -n argocd \
  "argocd.argoproj.io/refresh=hard" --overwrite

# Recreate secret (after credential rotation)
kubectl delete secret idp-platform-ai-secrets -n platform-ai
kubectl create secret generic idp-platform-ai-secrets \
  -n platform-ai \
  --from-literal=anthropic-api-key="sk-ant-..." \
  --from-literal=database-url="" \
  --from-literal=datadog-api-key="..." \
  --from-literal=gitlab-token="glpat-..." \
  --from-literal=datadog-app-key="..."
kubectl rollout restart deployment/idp-platform-ai -n platform-ai
```

---

## DORA metrics

| Metric | How measured | Where it flows |
|--------|-------------|----------------|
| Deploy frequency | `fire-datadog-event.py` fires on every successful deploy | Datadog DORA dashboard |
| Lead time | `committed_at` (git log) → `deployed_at` (stage 8 time) | Datadog + Deployment Record |
| Change failure rate | `on_failure` job fires failed event | Datadog DORA dashboard |
| MTTR | PagerDuty incident open → resolution (Phase 2) | Datadog DORA dashboard |

---

## Known issues

| Issue | Workaround |
|-------|-----------|
| AWS SSO expires every ~8 hours | Re-run `aws sso login` and update GitLab CI/CD variables |
| Terraform disabled | Using existing EKS cluster `test-cluster-cicd-deployment` |
| IAM role creation blocked by permission boundary | Using static SSO credentials instead of OIDC |
| Datadog bridge 403 | Datadog optional — not required for core demo |
