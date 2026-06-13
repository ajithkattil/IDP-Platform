"""
Pytest configuration and shared fixtures.
Tests run with mocked Claude client — no real API calls in CI.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.claude_client import ClaudeClient
from app.services.prompt_registry import PromptRegistry
from app.services.context_builder import ContextBuilder


MOCK_CLAUDE_RESPONSE = {
    "content": "This is a test response from the mocked Claude client.",
    "model": "claude-sonnet-4-20250514",
    "input_tokens": 100,
    "output_tokens": 50,
    "latency_ms": 120.0,
}


@pytest.fixture
def mock_claude():
    client = MagicMock(spec=ClaudeClient)
    client.complete = AsyncMock(return_value=MOCK_CLAUDE_RESPONSE)
    client.health_check = AsyncMock(return_value={"status": "healthy", "latency_ms": 85.0})
    client.model = "claude-sonnet-4-20250514"
    return client


@pytest.fixture
def app(mock_claude):
    """Create test app with mocked Claude client."""
    application = create_app()
    application.state.claude_client = mock_claude
    application.state.prompt_registry = PromptRegistry()
    application.state.context_builder = ContextBuilder()
    return application


@pytest.fixture
def client(app):
    """HTTP test client."""
    with TestClient(app) as c:
        yield c
