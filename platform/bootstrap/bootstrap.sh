#!/bin/bash
# ============================================================
# bootstrap.sh — One-time AWS setup for Idp POC
# Run this ONCE before the first terraform apply.
# Safe to run multiple times (idempotent).
# ============================================================
set -e

REGION=${AWS_REGION:-"us-east-1"}
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
STATE_BUCKET="idp-poc-tf-state-${ACCOUNT_ID}-idp"
LOCK_TABLE="idp-poc-tf-locks"
OIDC_ROLE="idp-poc-gitlab-ci-role"
GITLAB_GROUP="${GITLAB_GROUP:-idp/platform}"

echo "============================================"
echo " Idp POC — AWS Bootstrap"
echo " Account: ${ACCOUNT_ID}"
echo " Region:  ${REGION}"
echo "============================================"

# ── 1. S3 state bucket ────────────────────────────────────────
echo ""
echo "[1/5] S3 Terraform state bucket..."
if [ "${REGION}" = "us-east-1" ]; then
  aws s3api create-bucket     --bucket "${STATE_BUCKET}"     --region "${REGION}" 2>/dev/null     || echo "  Bucket already exists"
else
  aws s3api create-bucket     --bucket "${STATE_BUCKET}"     --region "${REGION}"     --create-bucket-configuration LocationConstraint="${REGION}" 2>/dev/null     || echo "  Bucket already exists"
fi
aws s3api put-bucket-versioning \
  --bucket "${STATE_BUCKET}" \
  --versioning-configuration Status=Enabled
aws s3api put-public-access-block \
  --bucket "${STATE_BUCKET}" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
echo "  ✓ s3://${STATE_BUCKET}"

# ── 2. DynamoDB lock table ────────────────────────────────────
echo ""
echo "[2/5] DynamoDB lock table..."
aws dynamodb create-table \
  --table-name "${LOCK_TABLE}" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "${REGION}" 2>/dev/null \
  || echo "  Table already exists"
echo "  ✓ ${LOCK_TABLE}"

# ── 3. GitLab OIDC provider ───────────────────────────────────
echo ""
echo "[3/5] GitLab OIDC Identity Provider..."
THUMBPRINT=$(openssl s_client -servername gitlab.com \
  -showcerts -connect gitlab.com:443 < /dev/null 2>/dev/null \
  | openssl x509 -fingerprint -noout \
  | sed 's/://g' | awk -F= '{print tolower($2)}')
aws iam create-open-id-connect-provider \
  --url "https://gitlab.com" \
  --client-id-list "https://gitlab.com" \
  --thumbprint-list "${THUMBPRINT}" 2>/dev/null \
  || echo "  Provider already exists"
echo "  ✓ OIDC provider for gitlab.com"

# ── 4. GitLab CI IAM Role ─────────────────────────────────────
echo ""
echo "[4/5] GitLab CI IAM role..."
cat > /tmp/trust-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "Federated": "arn:aws:iam::${ACCOUNT_ID}:oidc-provider/gitlab.com"
    },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringLike": {
        "gitlab.com:sub": "project_path:${GITLAB_GROUP}/*:ref_type:branch:ref:*"
      }
    }
  }]
}
EOF

aws iam create-role \
  --role-name "${OIDC_ROLE}" \
  --assume-role-policy-document file:///tmp/trust-policy.json 2>/dev/null \
  || echo "  Role already exists"

# Attach required policies
for POLICY in \
  "arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser" \
  "arn:aws:iam::aws:policy/AmazonEKSClusterPolicy" \
  "arn:aws:iam::aws:policy/AmazonEC2FullAccess" \
  "arn:aws:iam::aws:policy/IAMFullAccess" \
  "arn:aws:iam::aws:policy/AWSCloudFormationFullAccess"; do
  aws iam attach-role-policy --role-name "${OIDC_ROLE}" --policy-arn "${POLICY}" 2>/dev/null || true
done

# Cost Explorer policy
cat > /tmp/ce-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{"Effect": "Allow","Action": ["ce:GetCostAndUsage"],"Resource": "*"}]
}
EOF
aws iam put-role-policy \
  --role-name "${OIDC_ROLE}" \
  --policy-name "CostExplorer" \
  --policy-document file:///tmp/ce-policy.json
echo "  ✓ arn:aws:iam::${ACCOUNT_ID}:role/${OIDC_ROLE}"

# ── 5. ECR repos ──────────────────────────────────────────────
echo ""
echo "[5/5] ECR repositories..."
for REPO in "idp-poc/idp-platform-ai" "idp-poc/spring-orders-poc"; do
  aws ecr create-repository \
    --repository-name "${REPO}" \
    --image-tag-mutability IMMUTABLE \
    --image-scanning-configuration scanOnPush=true \
    --region "${REGION}" 2>/dev/null \
    || echo "  ${REPO} already exists"
  echo "  ✓ ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPO}"
done

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "============================================"
echo " Bootstrap complete. Set these GitLab vars:"
echo "============================================"
echo ""
echo "  AWS_ACCOUNT_ID  = ${ACCOUNT_ID}"
echo "  AWS_REGION      = ${REGION}"
echo "  AWS_ROLE_ARN    = arn:aws:iam::${ACCOUNT_ID}:role/${OIDC_ROLE}"
echo "  TF_STATE_BUCKET = ${STATE_BUCKET}"
echo "  TF_LOCK_TABLE   = ${LOCK_TABLE}"
echo ""
echo "Next step: cd platform/terraform && terraform init"
echo "  -backend-config=\"bucket=${STATE_BUCKET}\""
echo "  -backend-config=\"key=idp-poc/terraform.tfstate\""
echo "  -backend-config=\"region=${REGION}\""
echo "  -backend-config=\"dynamodb_table=${LOCK_TABLE}\""
