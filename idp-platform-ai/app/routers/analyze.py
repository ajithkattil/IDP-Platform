"""
idp-platform-ai · Analyze router
POST /api/v1/analyze/security  — Checkmarx findings → plain English + fix plan
POST /api/v1/analyze/service   — DoD checklist → gap analysis + sprint plan

Used by: DevPortal Tech Insights screen, Security Agent (Phase 3)
"""
import json
import logging
from fastapi import APIRouter, Request, HTTPException, status

from app.models.schemas import (
    SecurityAnalysisRequest, SecurityAnalysisResponse,
    ServiceAnalysisRequest, ServiceAnalysisResponse,
    RemediationStep, DoDGap,
)

router = APIRouter(tags=["analyze"])
logger = logging.getLogger(__name__)


# ── Security analysis ─────────────────────────────────────────
@router.post(
    "/analyze/security",
    response_model=SecurityAnalysisResponse,
    summary="Explain Checkmarx findings in plain English with fix plan",
)
async def analyze_security(
    request: Request,
    body: SecurityAnalysisRequest,
) -> SecurityAnalysisResponse:
    """
    Takes raw Checkmarx/Trivy/Gitleaks findings and returns:
    - Plain English summary any developer understands
    - Prioritised remediation steps with code examples
    - Estimated fix effort
    - Whether findings can be auto-remediated (Phase 3: Security Agent)
    """
    claude = getattr(request.app.state, "claude_client", None)
    registry = getattr(request.app.state, "prompt_registry", None)

    if not claude:
        raise HTTPException(status_code=503, detail="Claude client not initialised")

    system_prompt = registry.get_system_prompt("security") if registry else \
        "You are an application security expert. Explain findings clearly."

    # Build findings summary for Claude
    findings_text = "\n".join([
        f"- [{f.severity}] {f.rule} in {f.file}:{f.line} — {f.description}"
        + (f" (CWE-{f.cwe_id})" if f.cwe_id else "")
        for f in body.findings
    ])

    severity_counts = {}
    for f in body.findings:
        severity_counts[f.severity] = severity_counts.get(f.severity, 0) + 1

    user_message = f"""Analyse these security findings for service: {body.service_name}
Language: {body.language}

FINDINGS:
{findings_text}

Return a JSON object with these exact fields:
{{
  "plain_english_summary": "2-3 sentence summary a developer can understand",
  "top_risk": "the single highest-priority risk in one sentence",
  "remediation_steps": [
    {{"step": 1, "action": "...", "code_example": "...", "effort": "low|medium|high"}},
    ...
  ],
  "estimated_fix_time": "e.g. 2-4 hours",
  "auto_fixable": true|false
}}

Return ONLY the JSON object, no markdown, no explanation."""

    logger.info(
        "Security analysis request",
        extra={"service": body.service_name, "finding_count": len(body.findings)},
    )

    try:
        result = await claude.complete(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
            max_tokens=1024,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI API error: {str(e)[:200]}")

    # Parse structured response
    try:
        parsed = json.loads(result["content"].strip())
    except json.JSONDecodeError:
        # Fallback: return raw content in summary field
        parsed = {
            "plain_english_summary": result["content"][:500],
            "top_risk": "Unable to parse structured response",
            "remediation_steps": [],
            "estimated_fix_time": "unknown",
            "auto_fixable": False,
        }

    steps = [
        RemediationStep(
            step=s.get("step", i + 1),
            action=s.get("action", ""),
            code_example=s.get("code_example"),
            effort=s.get("effort", "medium"),
        )
        for i, s in enumerate(parsed.get("remediation_steps", []))
    ]

    return SecurityAnalysisResponse(
        service_name=body.service_name,
        severity_summary=severity_counts,
        plain_english_summary=parsed.get("plain_english_summary", ""),
        top_risk=parsed.get("top_risk", ""),
        remediation_steps=steps,
        estimated_fix_time=parsed.get("estimated_fix_time", "unknown"),
        auto_fixable=parsed.get("auto_fixable", False),
        model=result["model"],
    )


# ── Service DoD analysis ──────────────────────────────────────
@router.post(
    "/analyze/service",
    response_model=ServiceAnalysisResponse,
    summary="Analyse service DoD gaps and produce sprint plan",
)
async def analyze_service(
    request: Request,
    body: ServiceAnalysisRequest,
) -> ServiceAnalysisResponse:
    """
    Takes a service's DoD checklist and returns a prioritised gap analysis
    the team can action in their next sprint.
    """
    claude = getattr(request.app.state, "claude_client", None)
    registry = getattr(request.app.state, "prompt_registry", None)

    if not claude:
        raise HTTPException(status_code=503, detail="Claude client not initialised")

    system_prompt = registry.get_system_prompt("service") if registry else \
        "You are a platform engineering advisor. Analyse service health gaps."

    passed = [i for i in body.dod_items if i.passed]
    failed = [i for i in body.dod_items if not i.passed]
    score = round(len(passed) / len(body.dod_items) * 100, 1) if body.dod_items else 0

    gaps_text = "\n".join([
        f"- [{i.category.upper()}] {i.name}: FAILED" + (f" ({i.detail})" if i.detail else "")
        for i in failed
    ])

    user_message = f"""Analyse this service against the platform Definition of Done.

Service: {body.service_name}
DoD score: {len(passed)}/{len(body.dod_items)} ({score}%)

GAPS (failed items):
{gaps_text if gaps_text else "None — all items passing!"}

Return a JSON object:
{{
  "overall_health": "green|amber|red",
  "gaps": [
    {{"item": "...", "category": "...", "priority": "must fix now|fix this sprint|backlog", "action": "...", "effort_hours": 2}},
    ...
  ],
  "summary": "2-3 sentence overall assessment",
  "next_action": "single most important action to take right now"
}}

Return ONLY the JSON, no markdown."""

    logger.info(
        "Service analysis request",
        extra={"service": body.service_name, "score": score, "gap_count": len(failed)},
    )

    try:
        result = await claude.complete(
            messages=[{"role": "user", "content": user_message}],
            system_prompt=system_prompt,
            max_tokens=1024,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI API error: {str(e)[:200]}")

    try:
        parsed = json.loads(result["content"].strip())
    except json.JSONDecodeError:
        parsed = {
            "overall_health": "amber",
            "gaps": [],
            "summary": result["content"][:300],
            "next_action": "Review the analysis above",
        }

    gaps = [
        DoDGap(
            item=g.get("item", ""),
            category=g.get("category", "unknown"),
            priority=g.get("priority", "backlog"),
            action=g.get("action", ""),
            effort_hours=g.get("effort_hours", 1),
        )
        for g in parsed.get("gaps", [])
    ]

    return ServiceAnalysisResponse(
        service_name=body.service_name,
        dod_score=score,
        passed_count=len(passed),
        total_count=len(body.dod_items),
        overall_health=parsed.get("overall_health", "amber"),
        gaps=gaps,
        summary=parsed.get("summary", ""),
        next_action=parsed.get("next_action", ""),
        model=result["model"],
    )
