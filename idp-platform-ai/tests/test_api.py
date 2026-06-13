"""Tests for health, chat, and analyze endpoints."""
import json
import pytest
from unittest.mock import AsyncMock


# ── Health tests ──────────────────────────────────────────────
class TestHealth:
    def test_health_returns_200(self, client):
        response = client.get("/api/v1/health")
        assert response.status_code == 200

    def test_health_structure(self, client):
        data = client.get("/api/v1/health").json()
        assert "status" in data
        assert "service" in data
        assert "version" in data
        assert "checks" in data

    def test_health_healthy_when_claude_ok(self, client):
        data = client.get("/api/v1/health").json()
        assert data["status"] in ("healthy", "degraded")

    def test_health_unhealthy_when_claude_fails(self, client, app):
        app.state.claude_client.health_check = AsyncMock(
            side_effect=Exception("connection refused")
        )
        data = client.get("/api/v1/health").json()
        assert data["checks"]["claude_api"]["status"] in ("unhealthy", "degraded")


# ── Chat tests ────────────────────────────────────────────────
class TestChat:
    def test_chat_returns_200(self, client):
        payload = {
            "messages": [{"role": "user", "content": "What services have security issues?"}]
        }
        response = client.post("/api/v1/chat", json=payload)
        assert response.status_code == 200

    def test_chat_response_structure(self, client):
        payload = {"messages": [{"role": "user", "content": "Hello"}]}
        data = client.post("/api/v1/chat", json=payload).json()
        assert "content" in data
        assert "model" in data
        assert "prompt_version" in data
        assert "tokens_used" in data
        assert "context_injected" in data

    def test_chat_with_service_context(self, client):
        payload = {
            "messages": [{"role": "user", "content": "What is wrong with billing-service?"}],
            "context": {
                "service_name": "billing-service",
                "team": "Finance Engineering",
                "environment": "prod",
                "dora_metrics": {
                    "deploy_frequency": 0.3,
                    "lead_time_days": 4.8,
                    "change_failure_rate": 22,
                    "mttr_minutes": 144
                }
            }
        }
        data = client.post("/api/v1/chat", json=payload).json()
        assert data["context_injected"] is True

    def test_chat_empty_messages_rejected(self, client):
        payload = {"messages": []}
        response = client.post("/api/v1/chat", json=payload)
        assert response.status_code == 422

    def test_chat_tokens_used_is_sum(self, client, app):
        app.state.claude_client.complete = AsyncMock(return_value={
            "content": "Test",
            "model": "claude-sonnet-4-20250514",
            "input_tokens": 80,
            "output_tokens": 40,
            "latency_ms": 100.0,
        })
        payload = {"messages": [{"role": "user", "content": "test"}]}
        data = client.post("/api/v1/chat", json=payload).json()
        assert data["tokens_used"] == 120


# ── Security analysis tests ───────────────────────────────────
class TestAnalyzeSecurity:
    SECURITY_PAYLOAD = {
        "service_name": "billing-service",
        "language": "java",
        "findings": [
            {
                "severity": "Critical",
                "rule": "SQL_Injection",
                "file": "BillingService.java",
                "line": 89,
                "description": "User input concatenated directly into SQL query",
                "cwe_id": "89"
            },
            {
                "severity": "High",
                "rule": "Path_Traversal",
                "file": "FileUploadService.java",
                "line": 142,
                "description": "Path traversal via unsanitized filename",
                "cwe_id": "22"
            }
        ]
    }

    def test_security_returns_200(self, client, app):
        mock_response = json.dumps({
            "plain_english_summary": "Two critical issues found in billing-service.",
            "top_risk": "SQL injection allows full database read/write.",
            "remediation_steps": [
                {"step": 1, "action": "Use prepared statements", "code_example": "preparedStatement.setString(1, input)", "effort": "low"}
            ],
            "estimated_fix_time": "2-4 hours",
            "auto_fixable": False
        })
        app.state.claude_client.complete = AsyncMock(return_value={
            "content": mock_response,
            "model": "claude-sonnet-4-20250514",
            "input_tokens": 200,
            "output_tokens": 150,
            "latency_ms": 300.0,
        })
        response = client.post("/api/v1/analyze/security", json=self.SECURITY_PAYLOAD)
        assert response.status_code == 200

    def test_security_severity_summary(self, client, app):
        mock_response = json.dumps({
            "plain_english_summary": "Issues found.",
            "top_risk": "SQL injection",
            "remediation_steps": [],
            "estimated_fix_time": "2h",
            "auto_fixable": False
        })
        app.state.claude_client.complete = AsyncMock(return_value={
            "content": mock_response, "model": "m", "input_tokens": 10, "output_tokens": 10, "latency_ms": 1.0
        })
        data = client.post("/api/v1/analyze/security", json=self.SECURITY_PAYLOAD).json()
        assert data["severity_summary"]["Critical"] == 1
        assert data["severity_summary"]["High"] == 1


# ── Service analysis tests ────────────────────────────────────
class TestAnalyzeService:
    SERVICE_PAYLOAD = {
        "service_name": "billing-service",
        "dod_items": [
            {"name": "catalog-info.yaml committed", "category": "catalog", "passed": True},
            {"name": "Golden pipeline adopted", "category": "pipeline", "passed": True},
            {"name": "SAST gates passing", "category": "pipeline", "passed": False, "detail": "High finding open"},
            {"name": "TechDocs runbook published", "category": "observability", "passed": False},
            {"name": "Datadog APM instrumented", "category": "observability", "passed": True},
        ]
    }

    def test_service_returns_200(self, client, app):
        mock_response = json.dumps({
            "overall_health": "amber",
            "gaps": [
                {"item": "SAST gates passing", "category": "pipeline", "priority": "must fix now",
                 "action": "Fix SQL injection in BillingService.java:89", "effort_hours": 2}
            ],
            "summary": "Service has 3/5 DoD items passing. Two gaps need attention.",
            "next_action": "Fix the open High SAST finding blocking pipeline."
        })
        app.state.claude_client.complete = AsyncMock(return_value={
            "content": mock_response, "model": "m", "input_tokens": 100, "output_tokens": 80, "latency_ms": 200.0
        })
        response = client.post("/api/v1/analyze/service", json=self.SERVICE_PAYLOAD)
        assert response.status_code == 200

    def test_service_score_calculation(self, client, app):
        mock_response = json.dumps({
            "overall_health": "amber", "gaps": [],
            "summary": "Service at 60%.", "next_action": "Fix SAST."
        })
        app.state.claude_client.complete = AsyncMock(return_value={
            "content": mock_response, "model": "m", "input_tokens": 10, "output_tokens": 10, "latency_ms": 1.0
        })
        data = client.post("/api/v1/analyze/service", json=self.SERVICE_PAYLOAD).json()
        assert data["passed_count"] == 3
        assert data["total_count"] == 5
        assert data["dod_score"] == 60.0
