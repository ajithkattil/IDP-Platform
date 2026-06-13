# AWS OIDC Setup for GitLab CI
## One-time setup — zero static credentials in any pipeline

GitLab CI uses OIDC tokens to assume an AWS IAM role.
No `AWS_ACCESS_KEY_ID` or `AWS_SECRET_ACCESS_KEY` stored anywhere.

---

## Step 1 — Create OIDC Identity Provider in AWS

```bash
# Get your GitLab instance thumbprint
THUMBPRINT=$(openssl s_client -servername gitlab.com \
  -showcerts -connect gitlab.com:443 < /dev/null 2>/dev/null \
  | openssl x509 -fingerprint -noout \
  | sed 's/://g' | awk -F= '{print tolower($2)}')

aws iam create-open-id-connect-provider \
  --url "https://gitlab.com" \
  --client-id-list "https://gitlab.com" \
  --thumbprint-list "${THUMBPRINT}"
```

---

## Step 2 — Create IAM Role with trust policy

```bash
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
GITLAB_GROUP="zayo/platform"   # your GitLab group path

cat > trust-policy.json << EOF
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
  --role-name "zayo-poc-gitlab-ci-role" \
  --assume-role-policy-document file://trust-policy.json
```

---

## Step 3 — Attach permissions to the role

```bash
# ECR — push images
aws iam attach-role-policy \
  --role-name zayo-poc-gitlab-ci-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser

# EKS — create and delete clusters
aws iam attach-role-policy \
  --role-name zayo-poc-gitlab-ci-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy

# EC2 — node group management
aws iam attach-role-policy \
  --role-name zayo-poc-gitlab-ci-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess

# IAM — eksctl needs this for node group roles
aws iam attach-role-policy \
  --role-name zayo-poc-gitlab-ci-role \
  --policy-arn arn:aws:iam::aws:policy/IAMFullAccess

# CloudFormation — eksctl uses this for cluster stacks
aws iam attach-role-policy \
  --role-name zayo-poc-gitlab-ci-role \
  --policy-arn arn:aws:iam::aws:policy/AWSCloudFormationFullAccess

# Cost Explorer — for cost-check.py
cat > ce-policy.json << EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["ce:GetCostAndUsage", "ce:GetCostForecast"],
    "Resource": "*"
  }]
}
EOF
aws iam put-role-policy \
  --role-name zayo-poc-gitlab-ci-role \
  --policy-name CostExplorerReadOnly \
  --policy-document file://ce-policy.json
```

---

## Step 4 — Set GitLab CI/CD variables (group level)

Go to: GitLab → Group → Settings → CI/CD → Variables

| Variable | Value | Protected | Masked |
|---|---|---|---|
| `AWS_ACCOUNT_ID` | `123456789012` | ✓ | ✗ |
| `AWS_ROLE_ARN` | `arn:aws:iam::123456789012:role/zayo-poc-gitlab-ci-role` | ✓ | ✗ |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | ✓ | ✓ |
| `DD_API_KEY` | `...` | ✓ | ✓ |
| `DEPLOYMENT_RECORD_DB_URL` | `postgres://...` | ✓ | ✓ |

---

## Step 5 — Verify

Push to main branch. Check the `ecr-push` job logs:
```
[auth] arn:aws:sts::123456789012:assumed-role/zayo-poc-gitlab-ci-role/gitlab-ci-...
```

If you see that line, OIDC is working correctly.
