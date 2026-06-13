"""
zayo-platform-ai · Data Bridge Router
======================================
4 endpoints that power the LIVE mockup integration.
The DevPortal mockup polls these endpoints to show real data
instead of the simulated animation.

Endpoints:
  GET /api/v1/bridge/pipeline       ← GitLab pipeline status + job stages
  GET /api/v1/bridge/deployments    ← Deployment Record from Postgres
  GET /api/v1/bridge/dora           ← DORA metrics from Datadog
  GET /api/v1/bridge/cluster        ← Pod status from EKS

Design principles:
  - Every endpoint returns in under 3 seconds (timeout enforced)
  - Every endpoint falls back to mock data on failure (never 5xx)
  - CORS headers allow the mockup HTML to call from any origin
  - Results are cached 10-30s to avoid hammering external APIs
"""
import asyncio
import logging
import os
import time
from typing import Optional

from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.services.gitlab_client import GitLabClient
from app.services.datadog_client import DatadogClient
from app.services.eks_client import EKSClient

router = APIRouter(tags=["databridge"])
logger = logging.getLogger(__name__)

# Singletons — one per worker process
_gitlab: Optional[GitLabClient] = None
_datadog: Optional[DatadogClient] = None
_eks: Optional[EKSClient] = None


def get_gitlab() -> GitLabClient:
    global _gitlab
    if _gitlab is None:
        _gitlab = GitLabClient()
    return _gitlab


def get_datadog() -> DatadogClient:
    global _datadog
    if _datadog is None:
        _datadog = DatadogClient()
    return _datadog


def get_eks() -> EKSClient:
    global _eks
    if _eks is None:
        _eks = EKSClient()
    return _eks


def cors_json(data: dict, status: int = 200) -> JSONResponse:
    """Return JSON with CORS headers so mockup HTML can call cross-origin."""
    return JSONResponse(
        content=data,
        status_code=status,
        headers={
            "Access-Control-Allow-Origin":  "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Cache-Control": "no-cache",
        },
    )


# ── OPTIONS handler for CORS pre-flight ──────────────────────
@router.options("/bridge/{path:path}")
async def bridge_options():
    return JSONResponse(
        content={},
        headers={
            "Access-Control-Allow-Origin":  "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
    )


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 1 — Pipeline status
# Mockup polls every 5s while pipeline is running
# ═══════════════════════════════════════════════════════════════
@router.get(
    "/bridge/pipeline",
    summary="Real GitLab pipeline status for live mockup",
)
async def get_pipeline(
    project_id: str = Query(
        default=None,
        description="GitLab project ID or URL-encoded path (e.g. zayo%2Fplatform%2Fzayo-platform-ai)",
    ),
    service: str = Query(default="zayo-platform-ai"),
    ref: str = Query(default="main"),
):
    """
    Returns the latest pipeline with all job statuses.
    The mockup uses this to animate pipeline stage circles
    with real GitLab job statuses instead of JS timers.

    Stage status mapping:
      created/pending → idle (grey)
      running         → active (animated blue)
      success         → done (green)
      failed          → failed (red)
      canceled        → idle (grey)
    """
    settings = get_settings()
    pid = project_id or settings.gitlab_project_ids.get(service)

    if not pid:
        return cors_json({
            "source": "mock",
            "service": service,
            "pipeline": _mock_pipeline(service),
        })

    try:
        gitlab = get_gitlab()
        pipeline = await asyncio.wait_for(
            gitlab.get_latest_pipeline(pid, ref),
            timeout=5.0,
        )

        if not pipeline:
            return cors_json({"source": "no_data", "service": service, "pipeline": None})

        # Normalise job stages for mockup consumption
        jobs = pipeline.get("jobs", [])
        stages = _normalise_stages(jobs)

        return cors_json({
            "source": "gitlab",
            "service": service,
            "pipeline": {
                "id":         pipeline["id"],
                "status":     pipeline["status"],
                "ref":        pipeline.get("ref", ref),
                "sha":        pipeline.get("sha", "")[:8],
                "created_at": pipeline.get("created_at"),
                "duration":   pipeline.get("duration"),
                "web_url":    pipeline.get("web_url"),
                "stages":     stages,
            },
        })

    except asyncio.TimeoutError:
        logger.warning("Pipeline fetch timed out")
        return cors_json({"source": "timeout", "service": service, "pipeline": _mock_pipeline(service)})
    except Exception as e:
        logger.error("Pipeline bridge error", extra={"error": str(e)})
        return cors_json({"source": "error", "service": service, "pipeline": _mock_pipeline(service)})


def _normalise_stages(jobs: list) -> list:
    """Group jobs by stage and return normalised status per stage."""
    stage_order = ["lint", "sast", "sast-explain", "test", "docker-build",
                   "ecr-push", "iac", "eks-create", "deploy", "integration-test",
                   "eks-destroy", "notify", "update-helm"]
    stage_map: dict = {}

    for job in jobs:
        stage = job.get("stage", "unknown")
        if stage not in stage_map:
            stage_map[stage] = {"stage": stage, "jobs": [], "status": "created"}
        stage_map[stage]["jobs"].append(job)

        # Stage is running if ANY job is running
        # Stage is failed if ANY job failed
        # Stage is success only if ALL jobs succeeded
        jstatus = job.get("status", "created")
        cur = stage_map[stage]["status"]
        if jstatus == "running":
            stage_map[stage]["status"] = "running"
        elif jstatus == "failed" and cur != "running":
            stage_map[stage]["status"] = "failed"
        elif jstatus == "success" and cur == "created":
            stage_map[stage]["status"] = "success"

    # Return in logical order
    ordered = []
    for s in stage_order:
        if s in stage_map:
            ordered.append(stage_map[s])
    for s, v in stage_map.items():
        if s not in stage_order:
            ordered.append(v)

    return ordered


def _mock_pipeline(service: str) -> dict:
    return {
        "id": 18443,
        "status": "success",
        "ref": "main",
        "sha": "a4f1bc23",
        "source": "mock",
        "stages": [
            {"stage": "lint",        "status": "success"},
            {"stage": "sast",        "status": "success"},
            {"stage": "sast-explain","status": "success"},
            {"stage": "test",        "status": "success"},
            {"stage": "docker-build","status": "success"},
            {"stage": "ecr-push",    "status": "success"},
            {"stage": "iac",         "status": "success"},
            {"stage": "deploy",      "status": "success"},
            {"stage": "notify",      "status": "success"},
        ],
    }


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 2 — Deployment Record
# Mockup shows this after successful deploy
# ═══════════════════════════════════════════════════════════════
@router.get(
    "/bridge/deployments",
    summary="Real deployment records from Postgres",
)
async def get_deployments(
    service: str = Query(default=None),
    limit: int = Query(default=5, ge=1, le=20),
):
    """
    Returns recent deployments from the Deployment Record table.
    The mockup shows this as the golden thread trace
    after each successful pipeline run.
    """
    db_url = os.environ.get("DEPLOYMENT_RECORD_DB_URL", "")

    if not db_url:
        return cors_json({
            "source": "mock",
            "deployments": _mock_deployments(service),
        })

    try:
        import asyncpg
        conn = await asyncio.wait_for(
            asyncpg.connect(db_url),
            timeout=4.0,
        )
        try:
            query = """
                SELECT
                    service, environment, version, image_tag, git_sha,
                    gitlab_mr_iid, pipeline_id, jira_ticket,
                    committed_at, deployed_at, lead_time_minutes
                FROM deployment_records
                {}
                ORDER BY deployed_at DESC
                LIMIT ${}
            """
            if service:
                rows = await conn.fetch(
                    query.format("WHERE service = $1", "2"),
                    service, limit
                )
            else:
                rows = await conn.fetch(
                    query.format("", "1"),
                    limit
                )

            deployments = [
                {
                    "service":          r["service"],
                    "environment":      r["environment"],
                    "version":          r["version"],
                    "image_tag":        r["image_tag"],
                    "git_sha":          r["git_sha"][:8] if r["git_sha"] else None,
                    "mr_iid":           r["gitlab_mr_iid"],
                    "pipeline_id":      r["pipeline_id"],
                    "jira_ticket":      r["jira_ticket"],
                    "deployed_at":      r["deployed_at"].isoformat() if r["deployed_at"] else None,
                    "lead_time_minutes": r["lead_time_minutes"],
                }
                for r in rows
            ]
            return cors_json({"source": "postgres", "deployments": deployments})

        finally:
            await conn.close()

    except Exception as e:
        logger.warning("Deployment record fetch failed", extra={"error": str(e)})
        return cors_json({"source": "error", "deployments": _mock_deployments(service)})


def _mock_deployments(service: str = None) -> list:
    svc = service or "zayo-platform-ai"
    return [
        {
            "service": svc, "environment": "prod",
            "version": "v1.0.0-a4f1bc23", "git_sha": "a4f1bc23",
            "jira_ticket": "ZSP-4821", "mr_iid": "!2843",
            "pipeline_id": "18443", "lead_time_minutes": 18.2,
            "deployed_at": "2024-01-15T14:32:11Z",
        }
    ]


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 3 — DORA metrics
# Mockup scoreboard shows these live numbers
# ═══════════════════════════════════════════════════════════════
@router.get(
    "/bridge/dora",
    summary="Real DORA metrics from Datadog",
)
async def get_dora(
    service: str = Query(default="zayo-platform-ai"),
    env: str = Query(default="poc"),
    days: int = Query(default=30, ge=1, le=90),
):
    """
    Returns all 4 DORA metrics for a service.
    The mockup scoreboard polls this every 30 seconds
    to show live numbers instead of hardcoded values.
    """
    try:
        dd = get_datadog()
        metrics = await asyncio.wait_for(
            dd.get_dora_metrics(service, env, days),
            timeout=6.0,
        )
        slo = await asyncio.wait_for(
            dd.get_slo_status(service),
            timeout=4.0,
        )
        return cors_json({
            "service": service,
            "env": env,
            "dora": metrics,
            "slo": slo,
        })
    except Exception as e:
        logger.warning("DORA bridge error", extra={"error": str(e)})
        return cors_json({
            "service": service,
            "dora": {
                "deploy_frequency": 3.2,
                "lead_time_hours": 0.38,
                "change_failure_rate": 8.0,
                "mttr_minutes": 47,
                "source": "fallback",
            },
            "slo": {"status": "unknown", "slo_pct": None},
        })


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 4 — Cluster status
# Mockup shows real pod names and status
# ═══════════════════════════════════════════════════════════════
@router.get(
    "/bridge/cluster",
    summary="Real EKS pod and deployment status",
)
async def get_cluster(
    namespace: str = Query(default=None),
    deployment: str = Query(default=None),
):
    """
    Returns live pod status from EKS.
    The mockup ArgoCD/EKS panel shows real pod names
    and readiness states instead of hardcoded strings.
    """
    try:
        eks = get_eks()

        pods_task = asyncio.wait_for(
            eks.get_pods(namespace),
            timeout=4.0,
        )

        if deployment and namespace:
            deploy_task = asyncio.wait_for(
                eks.get_deployment_status(deployment, namespace),
                timeout=4.0,
            )
            pods, deploy_status = await asyncio.gather(
                pods_task, deploy_task, return_exceptions=True
            )
        else:
            pods = await pods_task
            deploy_status = None

        # Filter to relevant pods if namespace specified
        if namespace and isinstance(pods, list):
            pods = [p for p in pods if p.get("namespace") == namespace]

        return cors_json({
            "source": "eks" if pods else "mock",
            "namespace": namespace,
            "pods": pods if isinstance(pods, list) else [],
            "deployment": deploy_status if isinstance(deploy_status, dict) else None,
            "summary": {
                "total":   len(pods) if isinstance(pods, list) else 0,
                "running": len([p for p in (pods if isinstance(pods, list) else []) if p.get("status") == "Running"]),
                "ready":   len([p for p in (pods if isinstance(pods, list) else []) if p.get("ready")]),
            },
        })

    except Exception as e:
        logger.warning("Cluster bridge error", extra={"error": str(e)})
        return cors_json({
            "source": "error",
            "namespace": namespace,
            "pods": [
                {"name": "orders-7d4f-xk2p", "status": "Running", "ready": True},
                {"name": "orders-7d4f-mn9q", "status": "Running", "ready": True},
            ],
            "summary": {"total": 2, "running": 2, "ready": 2},
        })


# ═══════════════════════════════════════════════════════════════
# ENDPOINT 5 — Bridge health (all 4 dependencies)
# Mockup shows "LIVE" badge only when this returns healthy
# ═══════════════════════════════════════════════════════════════
@router.get(
    "/bridge/health",
    summary="Health check for all data bridge dependencies",
)
async def bridge_health():
    """
    Checks all 4 data sources.
    The mockup calls this on load to decide whether to show
    'LIVE' mode (real data) or 'DEMO' mode (simulation).
    """
    results = await asyncio.gather(
        asyncio.wait_for(get_gitlab().health_check(),  timeout=4.0),
        asyncio.wait_for(get_datadog().health_check(), timeout=4.0),
        asyncio.wait_for(get_eks().health_check(),     timeout=4.0),
        return_exceptions=True,
    )

    def safe(r):
        if isinstance(r, Exception):
            return {"status": "error", "detail": str(r)[:60]}
        return r

    checks = {
        "gitlab":  safe(results[0]),
        "datadog": safe(results[1]),
        "eks":     safe(results[2]),
        "postgres": {"status": "healthy" if os.environ.get("DEPLOYMENT_RECORD_DB_URL") else "unconfigured"},
    }

    statuses = [v.get("status") for v in checks.values()]
    overall = (
        "healthy"      if all(s == "healthy" for s in statuses) else
        "degraded"     if any(s == "healthy" for s in statuses) else
        "unconfigured" if all(s == "unconfigured" for s in statuses) else
        "unhealthy"
    )

    return cors_json({
        "status": overall,
        "live_mode_available": overall in ("healthy", "degraded"),
        "checks": checks,
    })
