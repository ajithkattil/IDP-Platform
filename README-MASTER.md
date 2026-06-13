# Zayo IDP POC — Master Guide

**Owner:** Ajith Kattil · Platform Engineering  
**GitLab:** gitlab.com/cltajith  
**AWS Account:** 501149494381 · Region: us-east-1  
**EKS Cluster:** test-cluster-cicd-deployment  
**Status:** POC complete — two services live on EKS with AI-powered golden pipeline

---

## What this POC proves

A developer pushes code → the platform automatically runs security scans → Claude AI explains vulnerabilities in plain English → pipeline goes green → service is deployed to Kubernetes → DORA metrics are recorded. Zero tickets to the platform team.

---

## Architecture overview

```
Developer (Mac)
      │
      │ git push
      ▼
GitLab CI/CD (gitlab.com/cltajith)
      │
      ├── lint → sast → test        (runs on every push)
      │         │
      │         └── sast-explain ──► zayo-platform-ai (Claude API)
      │                              "explain this vulnerability in plain English"
      │
      ├── docker build → ECR push   (runs on main branch only)
      │
      └── ArgoCD sync ──────────────► EKS cluster (us-east-1)
                                           │
                                     ┌─────┴─────┐
                                     │           │
                               platform-ai    orders
                               namespace      namespace
                                     │           │
                             zayo-platform-ai  spring-orders-poc
                             (Python/FastAPI)  (Java/Spring Boot)
                                     │
                               Claude API (Anthropic)
                               Datadog APM
```

---

## Repositories

| Repo | Language | Purpose | GitLab URL |
|------|----------|---------|------------|
| `zayo-platform-ai` | Python 3.11 / FastAPI | AI service — Claude API, SAST explanation, data bridge | gitlab.com/cltajith/zayo-platform-ai |
| `spring-orders-poc` | Java 17 / Spring Boot | Demo customer service — intentional vulnerabilities for SAST demo | gitlab.com/cltajith/spring-orders-poc |
| `platform` | Bash / Terraform / HCL | Infrastructure — bootstrap, EKS, ArgoCD, scripts | gitlab.com/cltajith/platform |
| `backstage` | Node.js / React | Developer portal — service catalog, software templates | gitlab.com/cltajith/backstage (planned) |

---

## Infrastructure

| Component | Value |
|-----------|-------|
| AWS Account | 501149494381 |
| Region | us-east-1 |
| EKS Cluster | test-cluster-cicd-deployment |
| ECR Registry | 501149494381.dkr.ecr.us-east-1.amazonaws.com |
| ECR Repo (AI) | zayo-poc/zayo-platform-ai |
| ECR Repo (Orders) | zayo-poc/spring-orders-poc |
| Terraform State | s3://zayo-poc-tf-state-501149494381-idp |
| DynamoDB Lock | zayo-poc-tf-locks |

---

## Kubernetes namespaces

| Namespace | Contents | Status |
|-----------|----------|--------|
| `platform-ai` | zayo-platform-ai deployment (2 replicas) | Running |
| `orders` | spring-orders-poc deployment (1 replica) | Running |
| `argocd` | ArgoCD server, controller, repo server | Running |
| `backstage` | Backstage portal | Planned |

---

## End-to-end demo flow (8 minutes)

### Setup (before presenting)
```bash
# Refresh SSO
aws sso login --profile idp_dev_pwruser_ps-501149494381
export AWS_PROFILE=idp_dev_pwruser_ps-501149494381

# Start port-forwards
kubectl port-forward svc/zayo-platform-ai 8000:8000 -n platform-ai &
kubectl port-forward svc/spring-orders-poc 8080:8080 -n orders &

# Verify both services healthy
curl -s http://localhost:8000/api/v1/health
curl -s http://localhost:8080/actuator/health

# Open mockup
open /Users/kattil/Desktop/code/ZAYO/POC/zayo_devportal_v3_complete.html
```

### Demo script

| Time | Action | What to show |
|------|--------|-------------|
| 0:00 | Open mockup | Dashboard with DORA metrics, service catalog, AI Copilot |
| 0:30 | Navigate portal | Service catalog, platform health, AI Copilot chat |
| 2:00 | Push code | `git commit --allow-empty -m "demo: ZSP-4821 add payment feature" && git push` |
| 2:30 | Pipeline starts | Show lint → sast running in GitLab |
| 4:00 | AI explains findings | Show sast-explain job log — Claude explaining CWE-798 and CWE-89 |
| 5:00 | Fix and redeploy | Show pipeline going green after fix |
| 6:30 | Deployment | Show ArgoCD syncing, pods updating in EKS |
| 7:30 | DORA metrics | Show deploy frequency, lead time updating |
| 8:00 | Summary | $180K/quarter incident cost avoided, zero platform team tickets |

---

## GitLab CI/CD variables (required in all repos)

| Variable | Description | Masked |
|----------|-------------|--------|
| `AWS_ACCOUNT_ID` | 501149494381 | No |
| `AWS_REGION` | us-east-1 | No |
| `AWS_ACCESS_KEY_ID` | SSO temporary key (refresh every 24h) | Yes |
| `AWS_SECRET_ACCESS_KEY` | SSO temporary secret | Yes |
| `AWS_SESSION_TOKEN` | SSO session token | Yes |
| `ANTHROPIC_API_KEY` | Claude API key | Yes |
| `DD_API_KEY` | Datadog API key | Yes |
| `DD_APP_KEY` | Datadog app key | Yes |
| `GITLAB_TOKEN` | GitLab PAT with api + write_repository | Yes |
| `PLATFORM_CI_TOKEN` | Same as GITLAB_TOKEN | Yes |

### Refreshing AWS credentials (required every ~8 hours)
```bash
aws sso login --profile idp_dev_pwruser_ps-501149494381
export AWS_PROFILE=idp_dev_pwruser_ps-501149494381
aws configure export-credentials --profile idp_dev_pwruser_ps-501149494381 --format env
# Update AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_SESSION_TOKEN in GitLab CI/CD variables
```

---

## Known issues and workarounds

| Issue | Workaround |
|-------|-----------|
| AWS SSO expires every ~8 hours | Re-run `aws sso login` and update GitLab CI/CD variables |
| EKS nodes resource constrained | spring-orders-poc runs 1 replica instead of 2 |
| Terraform has syntax errors | Terraform jobs disabled in pipeline (`when: never`) — using existing EKS cluster |
| Datadog bridge 403 error | Datadog not used in demo — simulated data in mockup |
| GitLab OIDC blocked by permission boundary | Using static SSO credentials instead |

---

## What's next (MVP roadmap)

| Sprint | Focus | Duration |
|--------|-------|----------|
| Sprint 1 | Backstage portal + GitLab auth + service catalog | 2 weeks |
| Sprint 2 | Software Templates — self-service service creation | 2 weeks |
| Sprint 3 | External Secrets Operator + real Checkmarx | 2 weeks |
| Sprint 4 | Multi-environment promotion (dev → staging → prod) | 2 weeks |

---

## Contact

**Ajith Kattil** · Ajith.KumarKattil@zayo.com · Platform Engineering
