"""
Tests for data bridge endpoints.
All external dependencies (GitLab, Datadog, EKS, Postgres) are mocked.
The bridge must always return 200 even when all dependencies fail.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestBridgeHealth:
    def test_bridge_health_returns_200(self, client):
        """Bridge health must always return 200."""
        with patch("app.routers.databridge.get_gitlab") as mg, \
             patch("app.routers.databridge.get_datadog") as md, \
             patch("app.routers.databridge.get_eks") as me:
            mg.return_value.health_check = AsyncMock(return_value={"status": "healthy"})
            md.return_value.health_check = AsyncMock(return_value={"status": "healthy"})
            me.return_value.health_check = AsyncMock(return_value={"status": "healthy"})
            resp = client.get("/api/v1/bridge/health")
        assert resp.status_code == 200

    def test_bridge_health_has_cors_header(self, client):
        """CORS header must be present so mockup HTML can call it."""
        with patch("app.routers.databridge.get_gitlab") as mg, \
             patch("app.routers.databridge.get_datadog") as md, \
             patch("app.routers.databridge.get_eks") as me:
            mg.return_value.health_check = AsyncMock(return_value={"status": "healthy"})
            md.return_value.health_check = AsyncMock(return_value={"status": "healthy"})
            me.return_value.health_check = AsyncMock(return_value={"status": "healthy"})
            resp = client.get("/api/v1/bridge/health")
        assert "access-control-allow-origin" in resp.headers

    def test_bridge_health_returns_200_when_all_fail(self, client):
        """Bridge must NOT return 5xx even when all deps are down."""
        with patch("app.routers.databridge.get_gitlab") as mg, \
             patch("app.routers.databridge.get_datadog") as md, \
             patch("app.routers.databridge.get_eks") as me:
            mg.return_value.health_check = AsyncMock(side_effect=Exception("gitlab down"))
            md.return_value.health_check = AsyncMock(side_effect=Exception("dd down"))
            me.return_value.health_check = AsyncMock(side_effect=Exception("eks down"))
            resp = client.get("/api/v1/bridge/health")
        assert resp.status_code == 200

    def test_live_mode_flag_present(self, client):
        """live_mode_available must be in response."""
        with patch("app.routers.databridge.get_gitlab") as mg, \
             patch("app.routers.databridge.get_datadog") as md, \
             patch("app.routers.databridge.get_eks") as me:
            for m in [mg, md, me]:
                m.return_value.health_check = AsyncMock(return_value={"status": "healthy"})
            data = client.get("/api/v1/bridge/health").json()
        assert "live_mode_available" in data


class TestBridgePipeline:
    def test_pipeline_returns_200_no_project_id(self, client):
        """Without project_id, returns mock data (not error)."""
        resp = client.get("/api/v1/bridge/pipeline")
        assert resp.status_code == 200

    def test_pipeline_mock_has_stages(self, client):
        """Mock pipeline response must include stages for mockup to animate."""
        data = client.get("/api/v1/bridge/pipeline").json()
        assert "pipeline" in data
        assert "stages" in data["pipeline"]
        assert len(data["pipeline"]["stages"]) > 0

    def test_pipeline_with_project_id_calls_gitlab(self, client):
        """When project_id is given, GitLab client is invoked."""
        with patch("app.routers.databridge.get_gitlab") as mg:
            mg.return_value.get_latest_pipeline = AsyncMock(return_value=None)
            resp = client.get("/api/v1/bridge/pipeline?project_id=12345")
        assert resp.status_code == 200
        mg.return_value.get_latest_pipeline.assert_called_once()

    def test_pipeline_fallback_on_gitlab_failure(self, client):
        """Returns mock data if GitLab throws."""
        with patch("app.routers.databridge.get_gitlab") as mg:
            mg.return_value.get_latest_pipeline = AsyncMock(
                side_effect=Exception("gitlab timeout")
            )
            resp = client.get("/api/v1/bridge/pipeline?project_id=99999")
        assert resp.status_code == 200
        assert "pipeline" in resp.json()


class TestBridgeDeployments:
    def test_deployments_returns_200_no_db(self, client):
        """Without DB URL, returns mock deployments."""
        resp = client.get("/api/v1/bridge/deployments")
        assert resp.status_code == 200

    def test_deployments_has_list(self, client):
        data = client.get("/api/v1/bridge/deployments").json()
        assert "deployments" in data
        assert isinstance(data["deployments"], list)
        assert len(data["deployments"]) > 0

    def test_deployments_mock_has_required_fields(self, client):
        """Each deployment must have fields the mockup expects."""
        data = client.get("/api/v1/bridge/deployments").json()
        d = data["deployments"][0]
        for field in ["service", "version", "git_sha", "jira_ticket"]:
            assert field in d, f"Missing field: {field}"


class TestBridgeDora:
    def test_dora_returns_200(self, client):
        resp = client.get("/api/v1/bridge/dora")
        assert resp.status_code == 200

    def test_dora_has_metrics(self, client):
        data = client.get("/api/v1/bridge/dora").json()
        assert "dora" in data
        dora = data["dora"]
        assert "deploy_frequency" in dora
        assert "change_failure_rate" in dora

    def test_dora_with_datadog(self, client):
        """When Datadog is configured, its client is called."""
        with patch("app.routers.databridge.get_datadog") as md:
            md.return_value.get_dora_metrics = AsyncMock(return_value={
                "deploy_frequency": 4.1,
                "lead_time_hours": 0.3,
                "change_failure_rate": 5.0,
                "mttr_minutes": 30,
                "source": "datadog",
            })
            md.return_value.get_slo_status = AsyncMock(return_value={
                "status": "healthy", "slo_pct": 99.95
            })
            data = client.get("/api/v1/bridge/dora?service=orders").json()
        assert data["dora"]["deploy_frequency"] == 4.1


class TestBridgeCluster:
    def test_cluster_returns_200(self, client):
        resp = client.get("/api/v1/bridge/cluster")
        assert resp.status_code == 200

    def test_cluster_has_pods(self, client):
        data = client.get("/api/v1/bridge/cluster").json()
        assert "pods" in data
        assert "summary" in data

    def test_cluster_summary_has_counts(self, client):
        data = client.get("/api/v1/bridge/cluster").json()
        summary = data["summary"]
        assert "total" in summary
        assert "running" in summary
        assert "ready" in summary


class TestCORSHeaders:
    """All bridge endpoints must include CORS headers for mockup access."""

    endpoints = [
        "/api/v1/bridge/health",
        "/api/v1/bridge/pipeline",
        "/api/v1/bridge/deployments",
        "/api/v1/bridge/dora",
        "/api/v1/bridge/cluster",
    ]

    def test_all_endpoints_have_cors(self, client):
        for ep in self.endpoints:
            resp = client.get(ep)
            assert "access-control-allow-origin" in resp.headers, \
                f"Missing CORS on {ep}"
