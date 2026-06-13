"""
zayo-platform-ai · Pydantic schemas
All request and response models for the API.
"""
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from enum import Enum


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"


# ── Chat models ───────────────────────────────────────────────
class Message(BaseModel):
    role: MessageRole
    content: str


class ServiceContext(BaseModel):
    """Optional context the caller can inject about the current service."""
    service_name: Optional[str] = None
    team: Optional[str] = None
    environment: Optional[str] = None
    recent_deploys: Optional[List[Dict[str, Any]]] = None
    scorecard: Optional[Dict[str, Any]] = None
    dora_metrics: Optional[Dict[str, Any]] = None


class ChatRequest(BaseModel):
    messages: List[Message] = Field(..., min_length=1, description="Conversation history")
    context: Optional[ServiceContext] = None
    prompt_version: Optional[str] = None
    max_tokens: Optional[int] = Field(default=1024, ge=1, le=4096)


class ChatResponse(BaseModel):
    content: str
    model: str
    prompt_version: str
    tokens_used: int
    context_injected: bool


# ── Security analysis models ──────────────────────────────────
class CheckmarxFinding(BaseModel):
    severity: str          # Critical | High | Medium | Low
    rule: str
    file: str
    line: int
    description: str
    cwe_id: Optional[str] = None


class SecurityAnalysisRequest(BaseModel):
    service_name: str
    findings: List[CheckmarxFinding]
    language: str = "java"
    context: Optional[str] = None


class RemediationStep(BaseModel):
    step: int
    action: str
    code_example: Optional[str] = None
    effort: str  # "low" | "medium" | "high"


class SecurityAnalysisResponse(BaseModel):
    service_name: str
    severity_summary: Dict[str, int]
    plain_english_summary: str
    top_risk: str
    remediation_steps: List[RemediationStep]
    estimated_fix_time: str
    auto_fixable: bool
    model: str


# ── Service DoD analysis models ───────────────────────────────
class DoDItem(BaseModel):
    name: str
    category: str          # catalog | pipeline | quality | observability | ops
    passed: bool
    detail: Optional[str] = None


class ServiceAnalysisRequest(BaseModel):
    service_name: str
    dod_items: List[DoDItem]
    scorecard: Optional[Dict[str, Any]] = None
    dora_metrics: Optional[Dict[str, Any]] = None


class DoDGap(BaseModel):
    item: str
    category: str
    priority: str          # "must fix now" | "fix this sprint" | "backlog"
    action: str
    effort_hours: int


class ServiceAnalysisResponse(BaseModel):
    service_name: str
    dod_score: float
    passed_count: int
    total_count: int
    overall_health: str    # green | amber | red
    gaps: List[DoDGap]
    summary: str
    next_action: str
    model: str


# ── Health models ─────────────────────────────────────────────
class ComponentHealth(BaseModel):
    status: str            # healthy | degraded | unhealthy
    latency_ms: Optional[float] = None
    detail: Optional[str] = None


class HealthResponse(BaseModel):
    status: str
    service: str
    version: str
    environment: str
    checks: Dict[str, ComponentHealth]
