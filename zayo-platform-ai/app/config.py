"""
zayo-platform-ai · Configuration
All settings injected via environment variables.
In EKS: sourced from AWS Secrets Manager via IRSA.
"""
import json
from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache
from typing import Dict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # Service identity
    service_name:    str = "zayo-platform-ai"
    service_version: str = "1.0.0"
    environment:     str = "dev"

    # Claude
    anthropic_api_key:      str = ""
    claude_model:           str = "claude-sonnet-4-20250514"
    claude_max_tokens:      int = 1024
    claude_timeout_seconds: int = 30

    # Database
    database_url:    str = ""
    db_pool_size:    int = 5
    db_max_overflow: int = 10

    # Datadog
    dd_api_key: str = ""
    dd_app_key: str = ""
    dd_site:    str = "datadoghq.com"

    # GitLab (data bridge)
    gitlab_url:              str = "https://gitlab.com"
    gitlab_token:            str = ""
    gitlab_project_ids_json: str = "{}"

    @property
    def gitlab_project_ids(self) -> Dict[str, str]:
        try:
            return json.loads(self.gitlab_project_ids_json)
        except Exception:
            return {}

    # Feature flags
    enable_prompt_registry: bool = True
    enable_context_builder: bool = True
    enable_rag:             bool = False
    enable_data_bridge:     bool = True

    # Server
    host:      str = "0.0.0.0"
    port:      int = 8000
    workers:   int = 2
    log_level: str = "INFO"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
