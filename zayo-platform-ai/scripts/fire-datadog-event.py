#!/usr/bin/env python3
"""
fire-datadog-event.py — Layer L5a · Datadog DORA instrumentation

Fires a deployment event to the Datadog DORA Deployments API.
Called from GitLab CI notify stage (success) and on_failure job (failure).

DORA metrics calculated by Datadog from these events:
  Deploy frequency  — count of success events per day per service
  Lead time         — committed_at → deployed_at delta (we calculate it)
  Change failure rate — failed events / total events
  MTTR              — requires PagerDuty incident → resolution tracking (Phase 2)
"""
import argparse
import json
import os
import sys
import time
import requests


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--service",       required=True)
    p.add_argument("--env",           required=True)
    p.add_argument("--version",       required=True)
    p.add_argument("--committed-at",  type=int, default=None)
    p.add_argument("--deployed-at",   type=int, default=None)
    p.add_argument("--pipeline-url",  required=True)
    p.add_argument("--failed",        default="false")
    args = p.parse_args()

    dd_api_key = os.environ.get("DD_API_KEY")
    if not dd_api_key:
        print("[datadog] WARNING: DD_API_KEY not set — skipping DORA event (set in Secrets Manager in prod)")
        return

    is_failed   = args.failed.lower() == "true"
    status      = "failure" if is_failed else "success"
    deployed_at = args.deployed_at or int(time.time())
    committed_at = args.committed_at or deployed_at

    lead_time_secs = deployed_at - committed_at

    payload = {
        "data": {
            "attributes": {
                "service":         args.service,
                "env":             args.env,
                "started_at":      committed_at,
                "finished_at":     deployed_at,
                "deployment_name": f"{args.service}-{args.version}",
                "status":          status,
                "version":         args.version,
                "git": {
                    "repository_url": os.environ.get("CI_PROJECT_URL", ""),
                    "sha":            os.environ.get("CI_COMMIT_SHA", ""),
                    "branch":         os.environ.get("CI_COMMIT_BRANCH", ""),
                    "tag":            args.version,
                },
                "custom_tags": [
                    f"jira:{os.environ.get('JIRA_TICKET', 'no-ticket')}",
                    f"pipeline:{os.environ.get('CI_PIPELINE_ID', '')}",
                    f"team:platform-engineering",
                    f"lead_time_minutes:{round(lead_time_secs/60, 1)}",
                ],
            },
            "type": "dora_deployment",
        }
    }

    headers = {
        "DD-API-KEY":   dd_api_key,
        "Content-Type": "application/json",
    }

    resp = requests.post(
        f"https://api.{os.environ.get('DD_SITE','datadoghq.com')}/api/v2/dora/deployments",
        headers=headers,
        data=json.dumps(payload),
        timeout=10,
    )

    if resp.status_code in (200, 201, 202):
        lead = f" lead_time={round(lead_time_secs/60,1)}min" if not is_failed else ""
        print(f"[datadog] DORA event fired: service={args.service} "
              f"version={args.version} status={status}{lead}")
    else:
        print(f"[datadog] WARNING: API returned {resp.status_code}: {resp.text[:200]}", file=sys.stderr)
        # Non-fatal — do not fail the pipeline if Datadog is unavailable


if __name__ == "__main__":
    main()
