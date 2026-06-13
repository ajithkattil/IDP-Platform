# ============================================================
# zayo-platform-ai — Dockerfile
# Multi-stage build: deps → runtime
# Datadog ddtrace baked in as a layer
# Non-root user enforced
# HEALTHCHECK configured for EKS readiness probe
# ============================================================

# ── STAGE 1: Build deps ───────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

# System deps for building Python packages
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --prefix=/install -r requirements.txt


# ── STAGE 2: Runtime ──────────────────────────────────────────
FROM python:3.11-slim AS runtime

# Labels — read by Backstage catalog and Datadog
LABEL maintainer="platform-engineering@zayo.com"
LABEL org.opencontainers.image.source="https://gitlab.com/zayo/platform/zayo-platform-ai"
LABEL com.zayo.service="zayo-platform-ai"
LABEL com.zayo.team="platform-engineering"
LABEL com.zayo.tier="1"

# Security: non-root user
RUN groupadd --system appgroup && \
    useradd --system --gid appgroup --create-home appuser

WORKDIR /app
RUN chown appuser:appgroup /app

# Copy installed packages from builder
COPY --from=builder /install /usr/local

# Datadog Python ddtrace agent
# Injected at container start via CMD prefix — no static version pinning needed
# DD_SERVICE, DD_ENV, DD_VERSION set via Helm values at deploy time
RUN pip install --no-cache-dir ddtrace==2.11.3

# Application source
COPY --chown=appuser:appgroup app/ ./app/
COPY --chown=appuser:appgroup pyproject.toml .

# Drop to non-root
USER appuser

# Health check — matches EKS readiness probe path
HEALTHCHECK \
    --interval=15s \
    --timeout=5s \
    --start-period=30s \
    --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/v1/health')" || exit 1

EXPOSE 8000

# ddtrace-run instruments the app transparently
# DD_* env vars injected by Helm values → EKS → from AWS Secrets Manager
CMD ["ddtrace-run", "uvicorn", "app.main:app", \
     "--host", "0.0.0.0", \
     "--port", "8000", \
     "--workers", "2", \
     "--log-level", "info"]
