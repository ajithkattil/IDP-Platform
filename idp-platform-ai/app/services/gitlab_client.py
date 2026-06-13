"""
idp-platform-ai · GitLab Client
Fetches real pipeline data from GitLab API.
Used by the data bridge to power the live mockup integration.

Authentication: Personal Access Token stored in AWS Secrets Manager,
injected via IRSA into the pod environment.
"""
import logging
import time
from typing import Optional, Dict, Any, List
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)

# Simple in-memory cache to avoid hammering GitLab API
_cache: Dict[str, tuple] = {}
CACHE_TTL = 10  # seconds


def _cached(key: str, ttl: int = CACHE_TTL):
    """Check cache and return value if fresh, else None."""
    if key in _cache:
        value, ts = _cache[key]
        if time.time() - ts < ttl:
            return value
    return None


def _store(key: str, value: Any):
    _cache[key] = (value, time.time())
    return value


class GitLabClient:
    """
    Wraps GitLab REST API v4.
    Fetches pipeline status, job logs, and MR info.
    """

    def __init__(self):
        settings = get_settings()
        self.base_url = settings.gitlab_url.rstrip("/")
        self.token = settings.gitlab_token
        self.timeout = 8.0
        self._headers = {
            "PRIVATE-TOKEN": self.token,
            "Content-Type": "application/json",
        }

    async def get_latest_pipeline(
        self,
        project_id: str,
        ref: str = "main",
    ) -> Optional[Dict[str, Any]]:
        """Return the most recent pipeline for a project+branch."""
        cache_key = f"pipeline:{project_id}:{ref}"
        cached = _cached(cache_key)
        if cached:
            return cached

        url = f"{self.base_url}/api/v4/projects/{project_id}/pipelines"
        params = {"ref": ref, "per_page": 1, "order_by": "id", "sort": "desc"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, headers=self._headers, params=params)
                resp.raise_for_status()
                pipelines = resp.json()
                if not pipelines:
                    return None
                pipeline = pipelines[0]
                # Enrich with jobs
                pipeline["jobs"] = await self.get_pipeline_jobs(
                    project_id, pipeline["id"]
                )
                return _store(cache_key, pipeline)
        except Exception as e:
            logger.warning("GitLab pipeline fetch failed", extra={"error": str(e)})
            return None

    async def get_pipeline_jobs(
        self,
        project_id: str,
        pipeline_id: int,
    ) -> List[Dict[str, Any]]:
        """Return all jobs for a pipeline with status and timing."""
        url = f"{self.base_url}/api/v4/projects/{project_id}/pipelines/{pipeline_id}/jobs"

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(
                    url, headers=self._headers, params={"per_page": 50}
                )
                resp.raise_for_status()
                jobs = resp.json()
                return [
                    {
                        "id": j["id"],
                        "name": j["name"],
                        "stage": j["stage"],
                        "status": j["status"],
                        "duration": j.get("duration"),
                        "started_at": j.get("started_at"),
                        "finished_at": j.get("finished_at"),
                        "web_url": j.get("web_url"),
                    }
                    for j in jobs
                ]
        except Exception as e:
            logger.warning("GitLab jobs fetch failed", extra={"error": str(e)})
            return []

    async def get_job_log(
        self,
        project_id: str,
        job_id: int,
        max_lines: int = 50,
    ) -> str:
        """Return last N lines of a job log."""
        cache_key = f"joblog:{project_id}:{job_id}"
        cached = _cached(cache_key, ttl=5)
        if cached:
            return cached

        url = f"{self.base_url}/api/v4/projects/{project_id}/jobs/{job_id}/trace"
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(url, headers=self._headers)
                resp.raise_for_status()
                lines = resp.text.split("\n")
                # Strip ANSI escape codes simply
                import re
                ansi = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
                clean = [ansi.sub('', l) for l in lines[-max_lines:]]
                result = "\n".join(l for l in clean if l.strip())
                return _store(cache_key, result)
        except Exception as e:
            logger.warning("GitLab job log fetch failed", extra={"error": str(e)})
            return ""

    async def health_check(self) -> Dict[str, Any]:
        """Verify GitLab connectivity."""
        if not self.token:
            return {"status": "unconfigured", "detail": "GITLAB_TOKEN not set"}
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self.base_url}/api/v4/user",
                    headers=self._headers,
                )
                resp.raise_for_status()
                user = resp.json()
                return {"status": "healthy", "user": user.get("username")}
        except Exception as e:
            return {"status": "unhealthy", "detail": str(e)[:100]}
