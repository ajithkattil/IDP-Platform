#!/usr/bin/env bash
#
# cleanup-service.sh — remove a scaffolded throwaway service from every layer
#
# Usage:
#   ./cleanup-service.sh <service-name>
#
# Example:
#   ./cleanup-service.sh e2e-test-001
#
# What it cleans:
#   1. EKS — namespace + everything in it (deployments, services, secrets, configmaps)
#   2. ArgoCD — the Application resource that watches the repo
#   3. ArgoCD repo secret (the per-repo auth secret we create per service today)
#   4. Backstage catalog — the entity (live API delete, no Backstage restart needed)
#   5. ECR — the Docker repository (all image tags removed)
#   6. Artifactory — best-effort cleanup (only runs if AF_URL/AF_TOKEN env vars are set)
#   7. GitLab — the repo itself (asks for confirmation before deleting)
#   8. Local — Terraform state file for the service
#
# Safe to re-run. If a resource is already gone, the relevant step prints a notice and moves on.
# Requires: aws cli (SSO logged in), kubectl, curl, python3.
# GitLab deletion requires GITLAB_TOKEN env var (group deploy token preferred).

set -u  # treat unset vars as errors
# Note: NOT using `set -e` — we want to continue past failures, not abort the cleanup.

SVC="${1:-}"
if [[ -z "$SVC" ]]; then
  echo "Usage: $0 <service-name>"
  echo "Example: $0 e2e-test-001"
  exit 1
fi

# === Configuration — adjust if your environment differs ===
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="501149494381"
EKS_CLUSTER="eks-test-cluster"
GITLAB_GROUP="zayo-group/devops/idp-platform"
BACKSTAGE_URL="http://localhost:7007"
ARGOCD_NAMESPACE="argocd"
TF_STATE_DIR="$HOME/Desktop/code/ZAYO/POC/platform/terraform/modules/idp-service"

# Colors for output
R='\033[0;31m'; G='\033[0;32m'; Y='\033[1;33m'; B='\033[0;34m'; N='\033[0m'

step() { echo -e "\n${B}==>${N} ${1}"; }
ok()   { echo -e "  ${G}\xE2\x9C\x93${N} ${1}"; }
warn() { echo -e "  ${Y}!${N} ${1}"; }
err()  { echo -e "  ${R}\xE2\x9C\x97${N} ${1}"; }

echo "================================================================"
echo "Cleanup target: ${SVC}"
echo "Account: ${AWS_ACCOUNT_ID}  Region: ${AWS_REGION}  Cluster: ${EKS_CLUSTER}"
echo "================================================================"

read -p "Proceed? [y/N] " yn
case "$yn" in
  y|Y|yes|YES) ;;
  *) echo "Cancelled."; exit 0 ;;
esac

# --- 1. EKS namespace ---
step "1. EKS \xE2\x80\x94 delete namespace ${SVC}"
if kubectl get namespace "$SVC" >/dev/null 2>&1; then
  kubectl delete namespace "$SVC" --wait=false && ok "Namespace deletion initiated (background)"
else
  warn "Namespace ${SVC} does not exist \xE2\x80\x94 skipping"
fi

# --- 2. ArgoCD Application ---
step "2. ArgoCD \xE2\x80\x94 delete Application ${SVC}"
if kubectl get application -n "$ARGOCD_NAMESPACE" "$SVC" >/dev/null 2>&1; then
  kubectl delete application -n "$ARGOCD_NAMESPACE" "$SVC" && ok "ArgoCD Application removed"
else
  warn "ArgoCD Application ${SVC} does not exist \xE2\x80\x94 skipping"
fi

# --- 3. ArgoCD per-repo secret ---
step "3. ArgoCD \xE2\x80\x94 delete repo secret argocd-repo-${SVC}"
if kubectl get secret -n "$ARGOCD_NAMESPACE" "argocd-repo-${SVC}" >/dev/null 2>&1; then
  kubectl delete secret -n "$ARGOCD_NAMESPACE" "argocd-repo-${SVC}" && ok "ArgoCD repo secret removed"
else
  warn "ArgoCD repo secret does not exist \xE2\x80\x94 skipping"
fi

# --- 4. Backstage catalog entity ---
step "4. Backstage catalog \xE2\x80\x94 unregister ${SVC}"
# Find the entity UID first (catalog API requires it for delete)
ENT_UID=$(curl -s "${BACKSTAGE_URL}/api/catalog/entities/by-name/component/default/${SVC}" 2>/dev/null \
  | python3 -c "import sys, json
try:
    d = json.load(sys.stdin)
    print(d.get('metadata', {}).get('uid', ''))
except Exception:
    print('')
" 2>/dev/null)

if [[ -n "$ENT_UID" ]]; then
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
    "${BACKSTAGE_URL}/api/catalog/entities/by-uid/${ENT_UID}")
  if [[ "$HTTP" == "204" ]]; then
    ok "Catalog entity removed (uid: ${ENT_UID})"
  else
    err "Catalog delete returned HTTP ${HTTP}"
  fi
else
  warn "Catalog entity not found \xE2\x80\x94 skipping"
fi

# Also try removing the location that registered it (so it doesn't get re-imported on next refresh)
LOC_TARGET="url:https://gitlab.com/${GITLAB_GROUP}/${SVC}/blob/main/catalog-info.yaml"
LOC_ID=$(curl -s "${BACKSTAGE_URL}/api/catalog/locations" 2>/dev/null \
  | python3 -c "
import sys, json
try:
    locs = json.load(sys.stdin)
    target = '${LOC_TARGET}'
    for l in locs:
        if l.get('data', {}).get('target') == target:
            print(l['data']['id'])
            break
except Exception:
    pass
" 2>/dev/null)

if [[ -n "$LOC_ID" ]]; then
  curl -s -X DELETE "${BACKSTAGE_URL}/api/catalog/locations/${LOC_ID}" >/dev/null
  ok "Catalog location entry removed (so it won't be re-imported)"
fi

# --- 5. ECR repository ---
step "5. ECR \xE2\x80\x94 delete repository ${SVC}"
if aws ecr describe-repositories --region "$AWS_REGION" --repository-names "$SVC" >/dev/null 2>&1; then
  aws ecr delete-repository --region "$AWS_REGION" --repository-name "$SVC" --force >/dev/null \
    && ok "ECR repository deleted (all image tags removed)"
else
  warn "ECR repository ${SVC} does not exist \xE2\x80\x94 skipping"
fi

# --- 6. Artifactory (best-effort) ---
step "6. Artifactory \xE2\x80\x94 best-effort cleanup"
if [[ -n "${AF_URL:-}" && -n "${AF_TOKEN:-}" ]]; then
  for REPO in docker-local generic-local maven-local; do
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
      -H "Authorization: Bearer ${AF_TOKEN}" \
      "${AF_URL}/${REPO}/${SVC}")
    if [[ "$HTTP" == "204" ]]; then
      ok "Removed from Artifactory: ${REPO}/${SVC}"
    fi
  done
else
  warn "AF_URL / AF_TOKEN env vars not set \xE2\x80\x94 skipping Artifactory"
fi

# --- 7. GitLab repo ---
step "7. GitLab \xE2\x80\x94 delete repo ${GITLAB_GROUP}/${SVC}"
if [[ -z "${GITLAB_TOKEN:-}" ]]; then
  warn "GITLAB_TOKEN not set \xE2\x80\x94 skipping GitLab repo deletion"
  warn "Delete manually at: https://gitlab.com/${GITLAB_GROUP}/${SVC}/edit#js-general-settings"
else
  read -p "  Really delete the GitLab repo ${SVC}? [y/N] " yn2
  case "$yn2" in
    y|Y|yes|YES)
      PROJECT_PATH="${GITLAB_GROUP}/${SVC}"
      PROJECT_ID_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${PROJECT_PATH}', safe=''))")
      HTTP=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
        -H "PRIVATE-TOKEN: ${GITLAB_TOKEN}" \
        "https://gitlab.com/api/v4/projects/${PROJECT_ID_ENCODED}")
      case "$HTTP" in
        202) ok "GitLab repo deletion scheduled" ;;
        404) warn "GitLab repo not found \xE2\x80\x94 already deleted?" ;;
        *)   err "GitLab delete returned HTTP ${HTTP}" ;;
      esac
      ;;
    *)
      warn "Skipped GitLab deletion"
      ;;
  esac
fi

# --- 8. Terraform state file ---
step "8. Local Terraform state \xE2\x80\x94 remove ${SVC}.tfstate"
TFSTATE="${TF_STATE_DIR}/${SVC}.tfstate"
TFVARS="${TF_STATE_DIR}/${SVC}.tfvars"
TFBACKUP="${TF_STATE_DIR}/${SVC}.tfstate.backup"

for f in "$TFSTATE" "$TFVARS" "$TFBACKUP"; do
  if [[ -f "$f" ]]; then
    rm "$f" && ok "Removed: $(basename "$f")"
  fi
done

echo ""
echo -e "${G}Cleanup complete for: ${SVC}${N}"
echo ""
echo "Verify nothing is left:"
echo "  kubectl get ns ${SVC}                                              (should be 'NotFound')"
echo "  kubectl get application -n argocd ${SVC}                            (should be 'NotFound')"
echo "  aws ecr describe-repositories --repository-names ${SVC}             (should be 'RepositoryNotFoundException')"
echo "  curl ${BACKSTAGE_URL}/api/catalog/entities/by-name/component/default/${SVC}  (should be 404)"
