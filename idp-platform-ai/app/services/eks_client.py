"""
idp-platform-ai · EKS Client
Fetches real Kubernetes pod and cluster status via boto3 + kubernetes SDK.
Uses IRSA (pod IAM role) — no static AWS credentials.

Falls back to mock data gracefully if EKS is unreachable.
"""
import logging
import os
import time
from typing import Dict, Any, List, Optional

logger = logging.getLogger(__name__)

_cache: Dict[str, tuple] = {}


def _cached(key: str, ttl: int = 15):
    if key in _cache:
        v, ts = _cache[key]
        if time.time() - ts < ttl:
            return v
    return None


def _store(key: str, value: Any):
    _cache[key] = (value, time.time())
    return value


class EKSClient:
    """
    Queries EKS cluster for pod status and resource info.
    Uses the in-cluster kubeconfig when running inside EKS.
    Falls back gracefully when running locally.
    """

    def __init__(self):
        self._k8s_loaded = False
        self._v1 = None

    def _load_k8s(self) -> bool:
        """Load kubernetes client (in-cluster or local kubeconfig)."""
        if self._k8s_loaded:
            return self._v1 is not None
        self._k8s_loaded = True
        try:
            from kubernetes import client, config as k8s_config
            try:
                k8s_config.load_incluster_config()   # inside EKS pod
            except Exception:
                k8s_config.load_kube_config()         # local development
            self._v1 = client.CoreV1Api()
            return True
        except Exception as e:
            logger.info("Kubernetes client not available", extra={"reason": str(e)[:80]})
            return False

    async def get_pods(
        self,
        namespace: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Return running pods, optionally filtered by namespace."""
        cache_key = f"pods:{namespace or 'all'}"
        cached = _cached(cache_key)
        if cached:
            return cached

        if not self._load_k8s():
            return self._mock_pods(namespace)

        try:
            if namespace:
                items = self._v1.list_namespaced_pod(namespace).items
            else:
                items = self._v1.list_pod_for_all_namespaces().items

            pods = [
                {
                    "name":      p.metadata.name,
                    "namespace": p.metadata.namespace,
                    "status":    p.status.phase,
                    "ready":     all(
                        c.ready for c in (p.status.conditions or [])
                        if c.type == "Ready"
                    ),
                    "restarts":  sum(
                        cs.restart_count
                        for cs in (p.status.container_statuses or [])
                    ),
                    "node":      p.spec.node_name,
                    "labels":    p.metadata.labels or {},
                }
                for p in items
                if p.status.phase not in ("Succeeded", "Failed")
            ]
            return _store(cache_key, pods)

        except Exception as e:
            logger.warning("EKS pod list failed", extra={"error": str(e)})
            return self._mock_pods(namespace)

    async def get_deployment_status(
        self,
        name: str,
        namespace: str,
    ) -> Dict[str, Any]:
        """Return deployment rollout status."""
        cache_key = f"deploy:{namespace}/{name}"
        cached = _cached(cache_key)
        if cached:
            return cached

        if not self._load_k8s():
            return self._mock_deployment(name, namespace)

        try:
            from kubernetes import client
            apps_v1 = client.AppsV1Api()
            d = apps_v1.read_namespaced_deployment(name, namespace)
            status = d.status
            result = {
                "name":           name,
                "namespace":      namespace,
                "desired":        d.spec.replicas or 0,
                "ready":          status.ready_replicas or 0,
                "available":      status.available_replicas or 0,
                "updated":        status.updated_replicas or 0,
                "image":          d.spec.template.spec.containers[0].image
                                  if d.spec.template.spec.containers else None,
                "health":         "healthy" if (status.ready_replicas or 0) == (d.spec.replicas or 0) else "degraded",
            }
            return _store(cache_key, result)
        except Exception as e:
            logger.warning("EKS deployment status failed", extra={"error": str(e)})
            return self._mock_deployment(name, namespace)

    def _mock_pods(self, namespace: Optional[str]) -> List[Dict[str, Any]]:
        ns = namespace or "orders"
        return [
            {"name": f"{ns}-7d4f-xk2p", "namespace": ns, "status": "Running",
             "ready": True, "restarts": 0, "node": "ip-10-0-1-45.ec2.internal"},
            {"name": f"{ns}-7d4f-mn9q", "namespace": ns, "status": "Running",
             "ready": True, "restarts": 0, "node": "ip-10-0-2-12.ec2.internal"},
        ]

    def _mock_deployment(self, name: str, namespace: str) -> Dict[str, Any]:
        return {
            "name": name, "namespace": namespace,
            "desired": 2, "ready": 2, "available": 2, "updated": 2,
            "image": f"123456789.dkr.ecr.us-east-1.amazonaws.com/idp-poc/{name}:v1.0.0-placeholder",
            "health": "healthy",
        }

    async def health_check(self) -> Dict[str, Any]:
        if not self._load_k8s():
            return {"status": "unavailable", "detail": "kubernetes SDK not available or not in cluster"}
        try:
            self._v1.list_namespace(limit=1)
            return {"status": "healthy"}
        except Exception as e:
            return {"status": "unhealthy", "detail": str(e)[:100]}
