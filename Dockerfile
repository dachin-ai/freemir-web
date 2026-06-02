# Unified Cloud Run image: Vite frontend + FastAPI backend (single service).
# Build from repo root: docker build -t freemir-web .

# ── Frontend (static) ─────────────────────────────────────
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ── Backend (serves /api + static SPA) ─────────────────────
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY frontend/src/data/landingFeaturedSkus.json ./data/landingFeaturedSkus.json
COPY --from=frontend-build /app/frontend/dist ./static
EXPOSE 8080
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
