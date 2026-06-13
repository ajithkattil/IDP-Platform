#!/usr/bin/env python3
"""
write-deployment-record.py — Layer L5b · Deployment Record Store
Writes one immutable row after every successful deploy.
Answers: "What is in production right now?" in <2 seconds.

Called from GitLab CI notify stage.
Credentials injected from AWS Secrets Manager via OIDC.
"""
import argparse
import os
import sys

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--service",   required=True)
    p.add_argument("--env",       required=True)
    p.add_argument("--version",   required=True)
    p.add_argument("--image-tag", required=True)
    p.add_argument("--git-sha",   required=True)
    p.add_argument("--mr-iid",    required=True)
    p.add_argument("--pipeline",  required=True)
    p.add_argument("--jira",      required=True)
    p.add_argument("--committed", required=True, type=int)
    p.add_argument("--deployed",  required=True, type=int)
    args = p.parse_args()

    db_url = os.environ.get("DEPLOYMENT_RECORD_DB_URL")
    if not db_url:
        print("[record] ERROR: DEPLOYMENT_RECORD_DB_URL not set — injected from Secrets Manager in prod", file=sys.stderr)
        # Non-fatal in local dev
        print(f"[record] Would write: {args.service} {args.version} jira={args.jira} lead_time={round((args.deployed-args.committed)/60,1)}min")
        return

    try:
        import psycopg2
        lead_time_secs = args.deployed - args.committed
        conn = psycopg2.connect(db_url)
        cur  = conn.cursor()
        cur.execute("""
            INSERT INTO deployment_records (
                service, environment, version, image_tag, git_sha,
                gitlab_mr_iid, pipeline_id, jira_ticket,
                committed_at, deployed_at, lead_time_seconds, lead_time_minutes
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,
                      to_timestamp(%s), to_timestamp(%s), %s, %s)
            RETURNING id
        """, (
            args.service, args.env, args.version, args.image_tag, args.git_sha,
            args.mr_iid, args.pipeline, args.jira,
            args.committed, args.deployed,
            lead_time_secs, round(lead_time_secs / 60, 1)
        ))
        record_id = cur.fetchone()[0]
        conn.commit()
        print(f"[record] Written: id={record_id} service={args.service} version={args.version} "
              f"jira={args.jira} lead_time={round(lead_time_secs/60,1)}min")
    except Exception as e:
        print(f"[record] ERROR: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if 'conn' in dir():
            conn.close()

if __name__ == "__main__":
    main()
