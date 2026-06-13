# Live Mockup Integration Guide
## Connecting the DevPortal mockup to the real POC infrastructure

Once `zayo-platform-ai` is deployed and the pipeline is running,
the mockup can show **real data** instead of the simulation.

---

## How it works

```
DevPortal mockup (HTML)
        │
        │  polls every 5 seconds
        ▼
zayo-platform-ai data bridge
  GET /api/v1/bridge/pipeline     ← GitLab pipeline status
  GET /api/v1/bridge/deployments  ← Postgres Deployment Record
  GET /api/v1/bridge/dora         ← Datadog DORA metrics
  GET /api/v1/bridge/cluster      ← EKS pod status
        │
        ├── GitLab API (pipeline stages, job logs)
        ├── Datadog API (DORA events, SLOs)
        ├── EKS / kubernetes SDK (pod status)
        └── asyncpg → PostgreSQL (Deployment Record)
```

---

## Step 1 — Deploy zayo-platform-ai

Run the pipeline once to deploy the service:

```bash
cd services/zayo-platform-ai
git push origin main
# Pipeline: lint → sast → test → docker → ECR → EKS deploy
# Service URL after deploy: http://zayo-platform-ai.internal.zayo.com
```

---

## Step 2 — Set additional GitLab CI variables

Add these to GitLab Group → Settings → CI/CD → Variables:

| Variable | Value | Notes |
|---|---|---|
| `GITLAB_TOKEN` | `glpat-xxxx` | Personal Access Token, `read_api` scope |
| `GITLAB_PROJECT_IDS_JSON` | `{"zayo-platform-ai":"12345","spring-orders-poc":"12346"}` | Get project IDs from GitLab project settings |

---

## Step 3 — Verify the data bridge

```bash
# Port-forward to the running service
kubectl port-forward svc/zayo-platform-ai 8000:8000 -n platform-ai

# Check all dependencies
curl http://localhost:8000/api/v1/bridge/health | python3 -m json.tool

# Expected:
# {
#   "status": "healthy",
#   "live_mode_available": true,
#   "checks": {
#     "gitlab":   {"status": "healthy", "user": "platform-ci"},
#     "datadog":  {"status": "healthy"},
#     "eks":      {"status": "healthy"},
#     "postgres": {"status": "healthy"}
#   }
# }
```

---

## Step 4 — Connect the mockup

Open `zayo_devportal_v3_complete.html` in a browser.

In the POC screen, click the **"Connect to live POC"** button (top right).
Enter the service URL: `http://zayo-platform-ai.internal.zayo.com`

The mockup will:
1. Call `/api/v1/bridge/health` to verify connectivity
2. Show a **LIVE** badge in the nav when connected
3. Replace all simulated data with real API calls
4. Poll pipeline status every 5 seconds while running
5. Fall back to simulation automatically if the service goes down

---

## What becomes real vs what stays simulated

| Feature | Demo mode (no service) | Live mode (service connected) |
|---|---|---|
| Pipeline stage animation | Fake JS timers | Real GitLab job statuses |
| Pipeline logs | Hardcoded strings | Real GitLab job logs (last 50 lines) |
| Deployment Record | Fake fields | Real Postgres rows |
| DORA scoreboard | Hardcoded 3.2/day etc | Real Datadog metrics |
| Pod status | "2/2 pods running" | Real EKS pod names + readiness |
| Terraform panel | Fake "Applied" | Real (simulated, EKS is ephemeral) |
| AI explain panel | Simulated response | Real Claude API call |

---

## Demo setup (day-of)

```bash
# 1. Start cluster (10 min before demo)
eksctl create cluster \
  --name zayo-poc-demo \
  --region us-east-1 \
  --node-type t3.medium \
  --nodes 2

# 2. Deploy both services
kubectl apply -f platform/argocd/apps.yaml

# 3. Wait for pods
kubectl wait deployment/zayo-platform-ai --for=condition=available -n platform-ai
kubectl wait deployment/spring-orders-poc --for=condition=available -n orders

# 4. Get service URL
kubectl get svc -n platform-ai

# 5. Open mockup, click "Connect to live POC", enter URL

# 6. Demo: push code to spring-orders-poc → watch mockup update in real time

# 7. After demo: destroy
eksctl delete cluster --name zayo-poc-demo --region us-east-1
```

---

## Troubleshooting

**"LIVE badge not appearing"**
- Check bridge health: `curl http://<service>/api/v1/bridge/health`
- Verify GITLAB_TOKEN is set in the pod environment
- Check CORS: open browser dev tools, look for CORS errors

**"Pipeline stages not updating"**
- Verify `GITLAB_PROJECT_IDS_JSON` has the correct project IDs
- Check GitLab token has `read_api` scope
- Look at service logs: `kubectl logs -n platform-ai -l app=zayo-platform-ai`

**"DORA numbers still showing 3.2/day"**
- Verify `DD_API_KEY` and `DD_APP_KEY` are set
- Datadog DORA API requires at least one deploy event
- Run the pipeline once to fire the first event
