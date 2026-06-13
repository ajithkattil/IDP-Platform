"""
idp-platform-ai · Datadog Client
Fetches real DORA metrics and SLO data from Datadog API.
Used by the data bridge to power the live mockup scoreboard.
"""
import logging
import time
from typing import Optional, Dict, Any
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)

_cache: Dict[str, tuple] = {}


def _cached(key: str, ttl: int = 60):
    if key in _cache:
        v, ts = _cache[key]
        if time.time() - ts < ttl:
            return v
    return None


def _store(key: str, value: Any):
    _cache[key] = (value, time.time())
    return value


class DatadogClient:
    """
    Wraps Datadog API v2 for DORA metrics and SLO data.
    All 4 DORA metrics are populated by the pipeline scripts:
      - fire-datadog-event.py fires deploy events
      - Datadog calculates deploy frequency + lead time
      - Failed events contribute to CFR
      - MTTR via PagerDuty integration (Phase 2)
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = settings.dd_api_key
        self.app_key = settings.dd_app_key
        self.site = settings.dd_site
        self.base_url = f"https://api.{self.site}"
        self.timeout = 8.0

    @property
    def _headers(self):
        return {
            "DD-API-KEY": self.api_key,
            "DD-APPLICATION-KEY": self.app_key,
            "Content-Type": "application/json",
        }

    async def get_dora_metrics(
        self,
        service: str,
        env: str = "poc",
        days: int = 30,
    ) -> Dict[str, Any]:
        """
        Fetch all 4 DORA metrics for a service.
        Returns deploy_frequency, lead_time_hours, change_failure_rate, mttr_minutes.
        """
        cache_key = f"dora:{service}:{env}"
        cached = _cached(cache_key, ttl=120)
        if cached:
            return cached

        if not self.api_key:
            return self._mock_dora(service)

        now = int(time.time())
        start = now - (days * 86400)

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Fetch deployment events
                resp = await client.get(
                    f"{self.base_url}/api/v2/events",
                    headers=self._headers,
                    params={
                        "filter[query]": f"service:{service} env:{env} source:deployment",
                        "filter[from]": str(start),
                        "filter[to]": str(now),
                        "page[limit]": 200,
                    },
                )
                resp.raise_for_status()
                events = resp.json().get("data", [])

                deploy_events = [e for e in events if e.get("attributes", {}).get("status") == "success"]
                fail_events   = [e for e in events if e.get("attributes", {}).get("status") == "failure"]

                total = len(deploy_events) + len(fail_events)
                cfr = round((len(fail_events) / total * 100) if total > 0 else 0, 1)
                freq = round(len(deploy_events) / days, 2)

                # Extract lead times from event metadata
                lead_times = []
                for e in deploy_events:
                    attrs = e.get("attributes", {})
                    meta  = attrs.get("attributes", {})
                    if "lead_time_seconds" in meta:
                        lead_times.append(float(meta["lead_time_seconds"]) / 3600)

                lead_time_avg = round(sum(lead_times) / len(lead_times), 2) if lead_times else None

                result = {
                    "service": service,
                    "env": env,
                    "period_days": days,
                    "deploy_frequency": freq,
                    "lead_time_hours": lead_time_avg,
                    "change_failure_rate": cfr,
                    "mttr_minutes": None,    # Phase 2: PagerDuty integration
                    "total_deploys": len(deploy_events),
                    "total_failures": len(fail_events),
                    "source": "datadog",
                }
                return _store(cache_key, result)

        except Exception as e:
            logger.warning("Datadog DORA fetch failed", extra={"error": str(e)})
            return self._mock_dora(service)

    async def get_slo_status(
        self,
        service: str,
    ) -> Dict[str, Any]:
        """Fetch SLO status for a service."""
        cache_key = f"slo:{service}"
        cached = _cached(cache_key, ttl=30)
        if cached:
            return cached

        if not self.api_key:
            return {"status": "healthy", "slo_pct": 99.94, "source": "mock"}

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                resp = await client.get(
                    f"{self.base_url}/api/v1/slo",
                    headers=self._headers,
                    params={"query": f"service:{service}", "limit": 5},
                )
                resp.raise_for_status()
                slos = resp.json().get("data", [])
                if slos:
                    s = slos[0]
                    thresholds = s.get("thresholds", [])
                    current = thresholds[0].get("current_target", 99.9) if thresholds else 99.9
                    return _store(cache_key, {
                        "status": "healthy" if current >= 99.5 else "degraded",
                        "slo_pct": round(current, 3),
                        "slo_name": s.get("name", "availability"),
                        "source": "datadog",
                    })
        except Exception as e:
            logger.warning("Datadog SLO fetch failed", extra={"error": str(e)})

        return {"status": "unknown", "slo_pct": None, "source": "error"}

    def _mock_dora(self, service: str) -> Dict[str, Any]:
        """Return representative mock data when Datadog is unavailable."""
        return {
            "service": service,
            "deploy_frequency": 3.2,
            "lead_time_hours": 0.38,
            "change_failure_rate": 8.0,
            "mttr_minutes": 47,
            "source": "mock",
        }

    async def health_check(self) -> Dict[str, Any]:
        if not self.api_key:
            return {"status": "unconfigured", "detail": "DD_API_KEY not set"}
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    f"{self.base_url}/api/v1/validate",
                    headers=self._headers,
                )
                resp.raise_for_status()
                return {"status": "healthy"}
        except Exception as e:
            return {"status": "unhealthy", "detail": str(e)[:100]}
