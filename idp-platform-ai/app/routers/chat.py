"""
idp-platform-ai · Chat router
POST /api/v1/chat
Used by: DevPortal AI Copilot screen (Phase 1)
Phase 2: will add RAG retrieval from pgvector + Neptune graph context.
"""
import logging
from fastapi import APIRouter, Request, HTTPException, status

from app.models.schemas import ChatRequest, ChatResponse

router = APIRouter(tags=["chat"])
logger = logging.getLogger(__name__)


@router.post(
    "/chat",
    response_model=ChatResponse,
    summary="AI Copilot — ask anything about the platform",
)
async def chat(request: Request, body: ChatRequest) -> ChatResponse:
    """
    Conversational AI endpoint for the DevPortal Copilot.

    Accepts a list of messages (conversation history) plus optional
    service context. Returns Claude's response.

    Phase 2 enhancement: inject RAG chunks from TechDocs + Confluence.
    """
    claude = getattr(request.app.state, "claude_client", None)
    registry = getattr(request.app.state, "prompt_registry", None)
    ctx_builder = getattr(request.app.state, "context_builder", None)

    if not claude:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Claude client not initialised",
        )

    # Get versioned system prompt
    try:
        prompt_version = body.prompt_version or "chat_v1.0"
        system_prompt = registry.get_system_prompt("chat", prompt_version) if registry else ""
        resolved_version = registry.get_version("chat") if registry else "unknown"
    except Exception:
        system_prompt = "You are a helpful platform engineering assistant."
        resolved_version = "fallback"

    # Inject service context
    if ctx_builder and body.context:
        system_prompt = ctx_builder.enrich_system_prompt(system_prompt, body.context, "chat")
        context_injected = True
    else:
        context_injected = False

    # Convert to Anthropic message format
    messages = [{"role": m.role.value, "content": m.content} for m in body.messages]

    logger.info(
        "Chat request",
        extra={
            "message_count": len(messages),
            "service": body.context.service_name if body.context else None,
            "prompt_version": resolved_version,
        },
    )

    try:
        result = await claude.complete(
            messages=messages,
            system_prompt=system_prompt,
            max_tokens=body.max_tokens,
        )
    except Exception as e:
        logger.error("Chat completion failed", extra={"error": str(e)})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI API error: {str(e)[:200]}",
        )

    return ChatResponse(
        content=result["content"],
        model=result["model"],
        prompt_version=resolved_version,
        tokens_used=result["input_tokens"] + result["output_tokens"],
        context_injected=context_injected,
    )
