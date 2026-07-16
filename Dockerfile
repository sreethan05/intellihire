# Frontend build stage
FROM node:22-alpine AS frontend-builder

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm ci
RUN npm --prefix client ci

COPY client ./client
COPY server ./server

RUN npm --prefix client run build

# Production Python backend
FROM python:3.11.15-slim AS production

WORKDIR /app

ENV NODE_ENV=production
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*

COPY server_py/requirements.txt ./server_py/requirements.txt
RUN pip install --no-cache-dir -r server_py/requirements.txt

COPY server_py ./server_py
COPY database ./database
COPY package.json ./
COPY --from=frontend-builder /app/server/dist ./server/dist

RUN useradd --create-home --uid 1001 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 5000

CMD ["gunicorn", "-w", "4", "-k", "uvicorn.workers.UvicornWorker", "server_py.app.main:app", "--bind", "0.0.0.0:5000"]
