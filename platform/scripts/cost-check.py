#!/usr/bin/env python3
"""
cost-check.py — Post-pipeline AWS resource and cost audit
=========================================================
Run this after every CI pipeline to:
  1. Check for orphaned EKS clusters, EC2 instances, LBs, EBS volumes
  2. Show today's cost breakdown by service
  3. Alert if any CI-tagged resource is still alive

Usage:
    python3 scripts/cost-check.py
    python3 scripts/cost-check.py --alert-slack

Requirements:
    pip install boto3 rich
    AWS credentials in environment (OIDC in CI, profile locally)
"""
import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta

import boto3
from botocore.exceptions import ClientError

# Colour output without depending on rich in CI
RED    = "\033[91m"
GREEN  = "\033[92m"
YELLOW = "\033[93m"
CYAN   = "\033[96m"
RESET  = "\033[0m"
BOLD   = "\033[1m"

REGION = os.environ.get("AWS_REGION", "us-east-1")


def hdr(text):
    print(f"\n{BOLD}{CYAN}{'='*60}{RESET}")
    print(f"{BOLD}{CYAN}  {text}{RESET}")
    print(f"{BOLD}{CYAN}{'='*60}{RESET}")


def ok(text):  print(f"  {GREEN}✓{RESET}  {text}")
def warn(text): print(f"  {YELLOW}!{RESET}  {text}")
def err(text):  print(f"  {RED}✗{RESET}  {text}")


def check_eks_clusters(ec2, eks_client):
    """Find any EKS clusters tagged purpose=ci-test that are still alive."""
    hdr("EKS Clusters — CI test clusters should all be destroyed")
    issues = []
    try:
        clusters = eks_client.list_clusters()["clusters"]
        if not clusters:
            ok("No EKS clusters found")
            return issues
        for name in clusters:
            try:
                tags = eks_client.list_tags_for_resource(
                    resourceArn=f"arn:aws:eks:{REGION}:{boto3.client('sts').get_caller_identity()['Account']}:cluster/{name}"
                ).get("tags", {})
            except Exception:
                tags = {}
            purpose = tags.get("purpose", "")
            if purpose == "ci-test":
                warn(f"ORPHANED CI cluster still alive: {name}")
                warn(f"  Tags: {tags}")
                warn(f"  Run: eksctl delete cluster --name {name} --region {REGION}")
                issues.append(f"Orphaned EKS cluster: {name}")
            else:
                ok(f"Cluster {name} (purpose={purpose or 'not ci-test'}) — OK to keep")
    except Exception as e:
        warn(f"Could not list EKS clusters: {e}")
    return issues


def check_ec2_instances(ec2_client):
    """Find running EC2 instances tagged auto-delete=true."""
    hdr("EC2 Instances — auto-delete=true nodes should be gone")
    issues = []
    try:
        resp = ec2_client.describe_instances(
            Filters=[
                {"Name": "tag:auto-delete", "Values": ["true"]},
                {"Name": "instance-state-name", "Values": ["running", "pending"]},
            ]
        )
        instances = [
            i
            for r in resp["Reservations"]
            for i in r["Instances"]
        ]
        if not instances:
            ok("No auto-delete EC2 instances running")
        else:
            for inst in instances:
                iid = inst["InstanceId"]
                itype = inst["InstanceType"]
                launch = inst["LaunchTime"].strftime("%Y-%m-%d %H:%M")
                warn(f"ORPHANED instance: {iid} ({itype}) launched {launch}")
                issues.append(f"Orphaned EC2: {iid}")
    except Exception as e:
        warn(f"Could not check EC2: {e}")
    return issues


def check_load_balancers(elbv2_client):
    """Find load balancers created by Kubernetes for CI clusters."""
    hdr("Load Balancers — CI-created LBs should be gone")
    issues = []
    try:
        lbs = elbv2_client.describe_load_balancers()["LoadBalancers"]
        ci_lbs = [
            lb for lb in lbs
            if any(
                t.get("Key") in ("kubernetes.io/cluster", "auto-delete")
                for tag_resp in [
                    elbv2_client.describe_tags(ResourceArns=[lb["LoadBalancerArn"]])
                ]
                for td in tag_resp.get("TagDescriptions", [])
                for t in td.get("Tags", [])
            )
        ]
        if not ci_lbs:
            ok("No CI-tagged Load Balancers found")
        else:
            for lb in ci_lbs:
                warn(f"ORPHANED LB: {lb['LoadBalancerName']} ({lb['LoadBalancerArn']})")
                warn(f"  Run: aws elbv2 delete-load-balancer --load-balancer-arn {lb['LoadBalancerArn']}")
                issues.append(f"Orphaned LB: {lb['LoadBalancerName']}")
    except Exception as e:
        warn(f"Could not check Load Balancers: {e}")
    return issues


def check_ebs_volumes(ec2_client):
    """Find available (unattached) EBS volumes from CI clusters."""
    hdr("EBS Volumes — unattached CI volumes should be deleted")
    issues = []
    try:
        vols = ec2_client.describe_volumes(
            Filters=[{"Name": "status", "Values": ["available"]}]
        )["Volumes"]
        ci_vols = [
            v for v in vols
            if any(
                t.get("Key", "").startswith("kubernetes.io/cluster")
                for t in v.get("Tags", [])
            )
        ]
        if not ci_vols:
            ok("No unattached CI EBS volumes found")
        else:
            for vol in ci_vols:
                gb = vol["Size"]
                warn(f"ORPHANED EBS: {vol['VolumeId']} ({gb}GB) — $0.08/GB/month = ${gb*0.08:.2f}/month")
                warn(f"  Run: aws ec2 delete-volume --volume-id {vol['VolumeId']}")
                issues.append(f"Orphaned EBS: {vol['VolumeId']}")
    except Exception as e:
        warn(f"Could not check EBS: {e}")
    return issues


def show_cost_breakdown(ce_client):
    """Show today's AWS cost breakdown by service using Cost Explorer."""
    hdr("AWS Cost Breakdown — today")
    today = date.today()
    yesterday = today - timedelta(days=1)

    # Cost Explorer needs a date range — use yesterday to today
    try:
        resp = ce_client.get_cost_and_usage(
            TimePeriod={
                "Start": yesterday.strftime("%Y-%m-%d"),
                "End":   today.strftime("%Y-%m-%d"),
            },
            Granularity="DAILY",
            Metrics=["UnblendedCost"],
            GroupBy=[{"Type": "DIMENSION", "Key": "SERVICE"}],
        )
    except Exception as e:
        warn(f"Cost Explorer not available: {e}")
        warn("Ensure Cost Explorer is enabled in your AWS account (Billing Console)")
        return

    total = 0.0
    rows = []
    for group in resp["ResultsByTime"][0]["Groups"]:
        svc  = group["Keys"][0]
        cost = float(group["Metrics"]["UnblendedCost"]["Amount"])
        if cost > 0.001:
            rows.append((cost, svc))
        total += cost

    rows.sort(reverse=True)
    print(f"\n  {'Service':<45} {'Cost (USD)':>12}")
    print(f"  {'-'*45} {'-'*12}")
    for cost, svc in rows[:15]:
        colour = RED if cost > 1.0 else (YELLOW if cost > 0.10 else RESET)
        print(f"  {svc:<45} {colour}${cost:>10.4f}{RESET}")
    print(f"\n  {BOLD}{'TOTAL':<45} ${total:>10.4f}{RESET}")

    if total > 1.0:
        warn(f"Today's cost ${total:.4f} is above $1.00 — check for orphaned resources above")
    else:
        ok(f"Today's cost ${total:.4f} is within expected range")


def full_cost_check_command():
    """Print the AWS CLI command for manual cost checking."""
    hdr("Manual Cost Check Command")
    today = date.today()
    month_start = today.replace(day=1).strftime("%Y-%m-%d")
    today_str   = today.strftime("%Y-%m-%d")
    print(f"""
  Run this to get month-to-date cost by service:

  {CYAN}aws ce get-cost-and-usage \\
    --time-period Start={month_start},End={today_str} \\
    --granularity DAILY \\
    --metrics "UnblendedCost" \\
    --group-by Type=DIMENSION,Key=SERVICE{RESET}

  Expected costs for a single CI run (~30 min):
    EKS control plane  : $0.10/hr × 0.5hr = $0.050
    2× t3.medium nodes : $0.0416/hr × 0.5hr = $0.042
    ECR storage        : ~$0.001 (negligible)
    TOTAL PER RUN      : ~$0.09–0.10
""")


def main():
    parser = argparse.ArgumentParser(description="Post-pipeline AWS cost and resource check")
    parser.add_argument("--region", default=REGION)
    parser.add_argument("--fail-on-orphans", action="store_true",
                        help="Exit with code 1 if orphaned resources found")
    args = parser.parse_args()

    print(f"\n{BOLD}Zayo POC — AWS Resource & Cost Check{RESET}")
    print(f"Region: {args.region}  |  Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

    session     = boto3.Session(region_name=args.region)
    ec2_client  = session.client("ec2")
    eks_client  = session.client("eks")
    elbv2_client = session.client("elbv2")
    ce_client   = session.client("ce", region_name="us-east-1")  # Cost Explorer is us-east-1 only

    all_issues = []
    all_issues += check_eks_clusters(ec2_client, eks_client)
    all_issues += check_ec2_instances(ec2_client)
    all_issues += check_load_balancers(elbv2_client)
    all_issues += check_ebs_volumes(ec2_client)
    show_cost_breakdown(ce_client)
    full_cost_check_command()

    hdr("Summary")
    if all_issues:
        err(f"Found {len(all_issues)} orphaned resource(s):")
        for issue in all_issues:
            err(f"  - {issue}")
        warn("Clean these up to avoid unexpected charges.")
        if args.fail_on_orphans:
            sys.exit(1)
    else:
        ok("No orphaned CI resources found")
        ok("All clear — no unexpected charges expected")


if __name__ == "__main__":
    main()
