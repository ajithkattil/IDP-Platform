"""
idp-platform-ai · Health router
GET /api/v1/health — used by:
  - EKS readiness probe (fails → pod removed from load balancer)
  - EKS liveness probe  (fails → pod restarted)
  - DevPortal Platform Health screen
  - Datadog synthetic monitor
"""
import asyncio
import logging
import os
import time
from fastapi import APIRouter, Request, status

from app.models.schemas import HealthResponse, ComponentHealth

router = APIRouter(tags=["health"])
logger = logging.getLogger(__name__)


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Readiness + liveness health check",
)
async def health(request: Request) -> HealthResponse:
    """
    Returns overall service health.
    HTTP 200 = healthy (EKS keeps sending traffic).
    HTTP 503 = unhealthy (EKS stops sending traffic / restarts pod).
    """
    checks: dict = {}

    # ── 1. Claude API ─────────────────────────────────────────
    claude_client = getattr(request.app.state, "claude_client", None)
    if claude_client:
        try:
            result = await asyncio.wait_for(claude_client.health_check(), timeout=5.0)
            checks["claude_api"] = ComponentHealth(
                status=result["status"],
                latency_ms=result.get("latency_ms"),
            )
        except asyncio.TimeoutError:
            checks["claude_api"] = ComponentHealth(status="degraded", detail="timeout >5s")
        except Exception as e:
            checks["claude_api"] = ComponentHealth(status="unhealthy", detail=str(e)[:120])
    else:
        checks["claude_api"] = ComponentHealth(status="degraded", detail="client not initialised")

    # ── 2. Prompt Registry ────────────────────────────────────
    try:
        registry = getattr(request.app.state, "prompt_registry", None)
        if registry:
            _ = registry.get("chat")
            checks["prompt_registry"] = ComponentHealth(status="healthy")
        else:
            checks["prompt_registry"] = ComponentHealth(status="degraded", detail="not initialised")
    except Exception as e:
        checks["prompt_registry"] = ComponentHealth(status="unhealthy", detail=str(e)[:120])

    # ── Overall status ────────────────────────────────────────
    statuses = [c.status for c in checks.values()]
    if "unhealthy" in statuses:
        overall = "unhealthy"
    elif "degraded" in statuses:
        overall = "degraded"
    else:
        overall = "healthy"

    logger.info("Health check", extra={"overall": overall, "checks": {k: v.status for k, v in checks.items()}})

    return HealthResponse(
        status=overall,
        service=os.environ.get("DD_SERVICE", "idp-platform-ai"),
        version=os.environ.get("DD_VERSION", "unknown"),
        environment=os.environ.get("DD_ENV", "unknown"),
        checks=checks,
    )
