# Frontend build stage
# Minor-pinned Node base (22.14): bump deliberately after testing, never float.
FROM node:22.14-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm ci
RUN npm --prefix client ci

COPY client ./client

RUN npm --prefix client run build

# Production Python backend
# Minor-pinned Python base (3.11.15) — matches the version the app is tested
# with (server_py/.venv). Bump deliberately, never float.
FROM python:3.11.15-slim AS production

WORKDIR /app

ENV NODE_ENV=production \
    PYTHONUNBUFFERED=1 \
    # No .pyc writes: keeps a read-only container root filesystem clean.
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONPATH=server_py \
    PORT=5000

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

# Non-root user is created before any app COPY so every application file is
# owned by appuser directly (no root-owned layer, no post-hoc chown -R).
RUN useradd --create-home --uid 1001 appuser

# Dependencies install as root into site-packages the app user can only read.
COPY server_py/requirements.txt ./server_py/requirements.txt
RUN pip install --no-cache-dir -r server_py/requirements.txt

COPY --chown=appuser:appuser server_py ./server_py
COPY --chown=appuser:appuser database ./database
COPY --chown=appuser:appuser package.json ./
COPY --chown=appuser:appuser --from=frontend-builder /app/dist ./dist

# Runtime-writable storage (FILE_STORAGE_DIR). Pre-creating it owned by appuser
# means an attached named volume inherits that ownership on first mount —
# required for docker-compose.prod.yml's read-only root filesystem setup.
RUN mkdir -p /app/uploads && chown appuser:appuser /app/uploads

USER appuser

EXPOSE 5000

# Reports unhealthy (503) when Postgres is unreachable, so orchestrators can
# restart/reroute based on real dependency status rather than process liveness.
HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/api/health', timeout=5)"

CMD ["sh", "-c", "exec gunicorn -w 2 -k uvicorn.workers.UvicornWorker server_py.app.main:app --bind 0.0.0.0:${PORT:-5000}"]
