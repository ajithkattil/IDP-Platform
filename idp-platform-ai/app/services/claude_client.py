"""
idp-platform-ai · Claude Client
Async wrapper around the Anthropic Python SDK.

Handles:
- Model selection and token budget
- Retry on transient errors (rate limit, overload)
- Structured logging for every call (cost tracking in Phase 2)
- Timeout enforcement
"""
import asyncio
import logging
import time
from typing import List, Dict, Any, Optional

import anthropic
from anthropic import AsyncAnthropic, APIStatusError, APITimeoutError

from app.config import get_settings

logger = logging.getLogger(__name__)


class ClaudeClient:

    def __init__(self):
        settings = get_settings()
        if not settings.anthropic_api_key:
            raise ValueError(
                "ANTHROPIC_API_KEY is not set. "
                "In EKS this should be injected from AWS Secrets Manager via IRSA."
            )
        self._client = AsyncAnthropic(
            api_key=settings.anthropic_api_key,
            timeout=settings.claude_timeout_seconds,
        )
        self.model = settings.claude_model
        self.default_max_tokens = settings.claude_max_tokens
        logger.info(
            "ClaudeClient initialised",
            extra={"model": self.model, "max_tokens": self.default_max_tokens},
        )

    async def complete(
        self,
        messages: List[Dict[str, str]],
        system_prompt: str,
        max_tokens: Optional[int] = None,
        retries: int = 2,
    ) -> Dict[str, Any]:
        """
        Call the Claude API and return structured result.

        Returns:
            {
                "content":    str   — the assistant's reply
                "model":      str   — model used
                "input_tokens":  int
                "output_tokens": int
                "latency_ms": float
            }
        """
        mt = max_tokens or self.default_max_tokens
        start = time.perf_counter()
        last_exc = None

        for attempt in range(retries + 1):
            try:
                response = await self._client.messages.create(
                    model=self.model,
                    max_tokens=mt,
                    system=system_prompt,
                    messages=messages,
                )
                latency = (time.perf_counter() - start) * 1000
                result = {
                    "content": response.content[0].text,
                    "model": response.model,
                    "input_tokens": response.usage.input_tokens,
                    "output_tokens": response.usage.output_tokens,
                    "latency_ms": round(latency, 1),
                }
                logger.info(
                    "Claude API call succeeded",
                    extra={
                        "model": result["model"],
                        "input_tokens": result["input_tokens"],
                        "output_tokens": result["output_tokens"],
                        "latency_ms": result["latency_ms"],
                        "attempt": attempt + 1,
                    },
                )
                return result

            except APIStatusError as e:
                if e.status_code == 429 and attempt < retries:
                    wait = 2 ** attempt
                    logger.warning(
                        "Rate limited, retrying",
                        extra={"attempt": attempt + 1, "wait_seconds": wait},
                    )
                    await asyncio.sleep(wait)
                    last_exc = e
                    continue
                logger.error(
                    "Anthropic API error",
                    extra={"status_code": e.status_code, "message": str(e)},
                )
                raise

            except APITimeoutError as e:
                logger.error("Anthropic API timeout", extra={"timeout": get_settings().claude_timeout_seconds})
                raise

        raise last_exc  # type: ignore

    async def health_check(self) -> Dict[str, Any]:
        """Lightweight connectivity check — uses minimal tokens."""
        start = time.perf_counter()
        try:
            result = await self.complete(
                messages=[{"role": "user", "content": "Reply with one word: healthy"}],
                system_prompt="You are a health check endpoint. Reply with one word only.",
                max_tokens=10,
            )
            latency = (time.perf_counter() - start) * 1000
            return {"status": "healthy", "latency_ms": round(latency, 1)}
        except Exception as e:
            return {"status": "unhealthy", "detail": str(e)}
