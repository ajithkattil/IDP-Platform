#!/bin/bash
# ============================================================
# Idp IDP POC - Daily Startup Script
# Run this every time you resume the POC
#
# What this does:
#   1. Refresh AWS SSO + export credentials
#   2. Kill any stale port-forwards from a previous session
#   3. Start port-forwards to deployed cluster services
#   4. Run health checks
#
# After the script finishes, two optional steps are documented below
# (local Backstage + local DevPortal). Run them manually only if needed
# for development. For demos, the port-forwarded deployed services
# are all you need.
# ============================================================

set -u  # treat unset vars as errors (but NOT -e, so we continue past failures)

# --- Paths ---
BACKSTAGE_DIR="$HOME/Desktop/code/IDP/POC/backstage"
DEVPORTAL_DIR="$HOME/Desktop/code/IDP/POC/idp-devportal"

# --- AWS config ---
AWS_PROFILE="idp_dev_pwruser_ps-123456789012"

# --- GitLab token (required by Backstage scaffolder to create repos) ---
# Set this in your shell rc (~/.zshrc or ~/.bashrc) so it persists:
#   export GITLAB_TOKEN='glpat-7_uIW...'
# Required scopes: api, write_repository, read_repository
if [ -z "${GITLAB_TOKEN:-}" ]; then
  echo "⚠️  GITLAB_TOKEN is not set in this shell."
  echo "   Backstage scaffolder will fail at 'Create GitLab repo' step."
  echo ""
  echo "   Option A — paste the token here (will be exported for this run):"
  echo "   Option B — Ctrl+C, then in THIS terminal run:"
  echo "                export GITLAB_TOKEN='glpat-...'"
  echo "                ./start-poc.sh"
  echo "              (env vars don't cross terminals — must be same shell)"
  echo ""
  read -r -s -p "   Paste token (input hidden) or press Enter to skip: " GITLAB_TOKEN
  echo ""
  if [ -z "$GITLAB_TOKEN" ]; then
    echo "   No token provided. Aborting."
    exit 1
  fi
  export GITLAB_TOKEN
fi

echo "✅ GITLAB_TOKEN is set (length: ${#GITLAB_TOKEN})"
GL_USER=$(curl -s -H "PRIVATE-TOKEN: $GITLAB_TOKEN" https://gitlab.com/api/v4/user | python3 -c "import sys,json; print(json.load(sys.stdin).get('username','INVALID'))" 2>/dev/null)
if [ "$GL_USER" = "INVALID" ] || [ -z "$GL_USER" ]; then
  echo "⚠️  GITLAB_TOKEN appears invalid or expired — GitLab API returned no user"
  read -p "   Continue anyway? [y/N] " -n 1 -r
  echo ""
  [[ ! $REPLY =~ ^[Yy]$ ]] && exit 1
else
  echo "   GitLab user: $GL_USER"
fi

echo "🚀 Starting Idp IDP POC..."

# ============================================================
# STEP 0 - Pre-flight port check
# ============================================================
# Verify every port we need is either free, OR owned by a process we
# can safely reclaim (stale port-forward / previous Backstage / etc.)
#
# Port map:
#   3000 → Backstage frontend (local yarn start)
#   5173 → DevPortal Vite (started in separate tab — checked, not bound)
#   7007 → Backstage backend (local yarn start)
#   8000 → idp-platform-ai port-forward
#   8080 → spring-orders-poc port-forward
echo ""
echo "Step 0: Pre-flight port check..."

REQUIRED_PORTS=(3000 5173 7007 8000 8080)
RECLAIM_PATTERNS=(
  "node.*backstage"
  "yarn.*start"
  "rspack"
  "vite"
  "kubectl port-forward"
)

PORT_BLOCKED=0
for PORT in "${REQUIRED_PORTS[@]}"; do
  PID=$(lsof -ti:$PORT -sTCP:LISTEN 2>/dev/null | head -1)
  if [ -z "$PID" ]; then
    echo "  ✅ port $PORT free"
    continue
  fi

  # Port is taken — figure out by what
  PROC=$(ps -p "$PID" -o command= 2>/dev/null | head -c 120)
  RECLAIMABLE=0
  for PAT in "${RECLAIM_PATTERNS[@]}"; do
    if echo "$PROC" | grep -Eq "$PAT"; then
      RECLAIMABLE=1
      break
    fi
  done

  if [ $RECLAIMABLE -eq 1 ]; then
    echo "  ♻️  port $PORT held by reclaimable process (PID $PID): ${PROC:0:80}"
    kill -9 "$PID" 2>/dev/null
    sleep 1
    if lsof -ti:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
      echo "     ❌ failed to free port $PORT"
      PORT_BLOCKED=1
    else
      echo "     ✅ reclaimed"
    fi
  else
    echo "  ❌ port $PORT held by FOREIGN process (PID $PID): ${PROC:0:80}"
    echo "     This is NOT a stale POC process. Investigate before continuing."
    echo "     Manual kill: kill -9 $PID"
    PORT_BLOCKED=1
  fi
done

if [ $PORT_BLOCKED -eq 1 ]; then
  echo ""
  echo "❌ One or more required ports are blocked. Aborting."
  echo "   Fix the conflicts above, then re-run this script."
  exit 1
fi
echo "  → all required ports available"

# ============================================================
# STEP 1 - Clear expired SSO cache
# ============================================================
echo ""
echo "Step 1: Clearing AWS SSO cache..."
rm -rf ~/.aws/sso/cache/*

# ============================================================
# STEP 2 - Re-authenticate with AWS SSO
# ============================================================
echo "Step 2: Logging into AWS SSO (browser will open)..."
aws sso login --profile "$AWS_PROFILE"

# ============================================================
# STEP 3 - Export temporary AWS credentials into shell
# ============================================================
echo "Step 3: Exporting AWS credentials..."
eval $(aws configure export-credentials --profile "$AWS_PROFILE" --format env)

# ============================================================
# STEP 4 - Verify AWS authentication
# ============================================================
echo "Step 4: Verifying AWS identity..."
aws sts get-caller-identity

# ============================================================
# STEP 5 - Kill stale port-forwards
# ============================================================
echo ""
echo "Step 5: Clearing old port-forwards..."
pkill -f "kubectl port-forward" 2>/dev/null
sleep 2

# ============================================================
# STEP 6 - Start port-forwards to deployed cluster services
# ============================================================
# localhost:8000 → idp-platform-ai ← Deployed AI gateway
# localhost:8080 → spring-orders-poc
#
# NOTE: Port 3000 is reserved for local Backstage frontend (Step 10).
# NOTE: DevPortal runs LOCALLY via Vite on :5173 (separate terminal tab).
# NOTE: Backstage backend runs LOCALLY on :7007 (Step 10).
echo "Step 6: Starting port-forwards to deployed cluster services..."
kubectl port-forward svc/idp-platform-ai 8000:8000 -n platform-ai &
kubectl port-forward svc/spring-orders-poc 8080:8080 -n orders &
sleep 5

# ============================================================
# STEP 7 - Health checks
# ============================================================
echo ""
echo "Step 7: Checking service health..."
echo "--- AI Service ---"
curl -s http://localhost:8000/api/v1/health | python3 -m json.tool 2>/dev/null || echo "  (health endpoint not responding yet)"

echo "--- Orders Service ---"
curl -s http://localhost:8080/actuator/health | python3 -m json.tool 2>/dev/null || echo "  (health endpoint not responding yet)"

echo "--- EKS Pods ---"
kubectl get pods -n devportal 2>/dev/null
kubectl get pods -n backstage 2>/dev/null
kubectl get pods -n platform-ai 2>/dev/null
kubectl get pods -n orders 2>/dev/null

echo "--- ArgoCD apps ---"
kubectl get applications -n argocd 2>/dev/null

# ============================================================
# Done
# ============================================================
echo ""
echo "============================================================"
echo "✅ POC environment ready"
echo "============================================================"
echo ""
echo "DEPLOYED SERVICES (port-forwarded):"
echo "  AI Service:         http://localhost:8000"
echo "  Orders:             http://localhost:8080"
echo ""
echo "LOCAL SERVICES (started by this script):"
echo "  Backstage frontend: http://localhost:3000  (starting in Step 9)"
echo "  Backstage backend:  http://localhost:7007  (starting in Step 9)"
echo ""
echo "LOCAL SERVICES (start manually in a separate terminal tab):"
echo "  DevPortal Vite:     http://localhost:5173"
echo "    → cd $DEVPORTAL_DIR && npm run dev"
echo "    → Vite proxies /api/* to Backstage on :7007"
echo ""
echo "============================================================"
echo "⚠️  GitLab CI/CD credential refresh (if running pipelines today):"
echo "  aws configure export-credentials --profile $AWS_PROFILE --format env"
echo "  Copy values into:"
echo "  https://gitlab.com/idp-group/devops/idp-platform/-/settings/ci_cd"
echo "============================================================"
echo ""

# ============================================================
# STEP 8 - Validate port-forwards came up before declaring ready
# ============================================================
echo ""
echo "Step 8: Validating port-forward listeners..."
ALL_OK=1
for PORT in 8000 8080; do
  if lsof -i:$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "  ✅ port $PORT listening"
  else
    echo "  ❌ port $PORT NOT listening"
    ALL_OK=0
  fi
done
if [ $ALL_OK -eq 0 ]; then
  echo "⚠️  Some port-forwards failed — check kubectl output above"
fi

# Also confirm :3000 and :7007 are still free for Backstage
echo ""
echo "  Final check — ports needed by local Backstage:"
for PORT in 3000 7007; do
  if lsof -i:$PORT -sTCP:LISTEN -t >/dev/null 2>&1; then
    echo "  ❌ port $PORT got grabbed since Step 0 — investigate"
    lsof -i:$PORT
    exit 1
  else
    echo "  ✅ port $PORT still free"
  fi
done

# ============================================================
# STEP 9 - Start local Backstage in this terminal
# ============================================================
echo ""
echo "============================================================"
echo "Step 9: Starting local Backstage (yarn start)..."
echo "Press Ctrl+C to stop Backstage. Port-forwards keep running."
echo "============================================================"
echo ""
cd "$BACKSTAGE_DIR" || { echo "❌ Cannot cd to $BACKSTAGE_DIR"; exit 1; }
exec yarn start
