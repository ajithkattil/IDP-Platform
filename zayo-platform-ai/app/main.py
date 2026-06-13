"""
zayo-platform-ai · FastAPI application
The AI backbone of the Zayo DevPortal.
Layer: L4b · AI Core
"""
import logging
import os
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import health, chat, analyze, databridge
from app.services.claude_client import ClaudeClient
from app.services.prompt_registry import PromptRegistry
from app.services.context_builder import ContextBuilder

structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ]
)
logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO"),
    format="%(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Starting zayo-platform-ai",
                extra={"version": settings.service_version,
                       "environment": settings.environment,
                       "model": settings.claude_model})
    try:
        app.state.claude_client = ClaudeClient()
    except Exception as e:
        logger.error("Claude client init failed", extra={"error": str(e)})
        app.state.claude_client = None

    app.state.prompt_registry = PromptRegistry()
    app.state.context_builder = ContextBuilder()
    logger.info("Startup complete")
    yield
    logger.info("Shutdown")


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(
        title="Zayo Platform AI",
        description=(
            "AI backbone of the Zayo IDP. "
            "Powers DevPortal AI Copilot, SAST explanation, DoD gap analysis, "
            "and live data bridge for mockup integration."
        ),
        version=settings.service_version,
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],   # open for mockup HTML file access
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
    )

    app.include_router(health.router,      prefix="/api/v1")
    app.include_router(chat.router,        prefix="/api/v1")
    app.include_router(analyze.router,     prefix="/api/v1")
    app.include_router(databridge.router,  prefix="/api/v1")

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        logger.error("Unhandled exception",
                     extra={"path": request.url.path, "error": str(exc)})
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )

    @app.get("/", include_in_schema=False)
    async def root():
        return {
            "service": "zayo-platform-ai",
            "docs": "/docs",
            "health": "/api/v1/health",
            "bridge": "/api/v1/bridge/health",
        }

    return app


app = create_app()
