"""
zayo-platform-ai · Context Builder
Injects structured service context into Claude prompts so answers
are specific to Zayo services, not generic.

Phase 2: will pull context from live Deployment Record DB,
         Datadog API, and Neptune Knowledge Graph.
Phase 1 (now): uses context provided by the API caller.
"""
import json
import logging
from typing import Optional
from app.models.schemas import ServiceContext

logger = logging.getLogger(__name__)


class ContextBuilder:
    """
    Builds context strings injected into the Claude system prompt.
    """

    def build(
        self,
        context: Optional[ServiceContext],
        category: str = "chat",
    ) -> str:
        """Return a formatted context block for injection into the system prompt."""
        if not context:
            return ""

        parts = []

        if context.service_name:
            parts.append(f"Current service: {context.service_name}")

        if context.team:
            parts.append(f"Team: {context.team}")

        if context.environment:
            parts.append(f"Environment: {context.environment}")

        if context.dora_metrics:
            dora = context.dora_metrics
            parts.append(
                f"DORA metrics: "
                f"deploy_freq={dora.get('deploy_frequency', 'unknown')}/day · "
                f"lead_time={dora.get('lead_time_days', 'unknown')}d · "
                f"cfr={dora.get('change_failure_rate', 'unknown')}% · "
                f"mttr={dora.get('mttr_minutes', 'unknown')}min"
            )

        if context.scorecard:
            sc = context.scorecard
            parts.append(
                f"Scorecard: "
                f"cicd={sc.get('cicd_adoption', '?')} · "
                f"security={sc.get('security_posture', '?')} · "
                f"observability={sc.get('observability_coverage', '?')} · "
                f"docs={sc.get('documentation_quality', '?')} · "
                f"dora={sc.get('dora_performance', '?')} · "
                f"deps={sc.get('dependency_hygiene', '?')}"
            )

        if context.recent_deploys:
            last = context.recent_deploys[0] if context.recent_deploys else None
            if last:
                parts.append(
                    f"Last deploy: {last.get('version', 'unknown')} "
                    f"at {last.get('deployed_at', 'unknown')} "
                    f"(Jira: {last.get('jira_ticket', 'no-ticket')})"
                )

        if not parts:
            return ""

        context_block = "\n\n--- CURRENT SERVICE CONTEXT ---\n"
        context_block += "\n".join(parts)
        context_block += "\n--- END CONTEXT ---"

        logger.debug(
            "Context built",
            extra={
                "service": context.service_name,
                "category": category,
                "parts": len(parts),
            },
        )
        return context_block

    def enrich_system_prompt(
        self,
        base_prompt: str,
        context: Optional[ServiceContext],
        category: str = "chat",
    ) -> str:
        """Append context block to a base system prompt."""
        ctx = self.build(context, category)
        if ctx:
            return base_prompt + ctx
        return base_prompt
