# syntax=docker/dockerfile:1

# Build from repo root: docker build -f docker/Dockerfile .
# Or: make docker-build
#
# Runtime FROM evaluator-base (Chromium). Builder stays plain Node (no Chromium).
# Prefers BuildKit cache mounts for npm. DOCKER_BUILDKIT=1 (Makefile default).

ARG NODE_IMAGE=node:26-trixie-slim
ARG BASE_IMAGE=interchouette/evaluator-base:node26-trixie

FROM ${NODE_IMAGE} AS builder
WORKDIR /app

# Skip Puppeteer browser fetch in the builder; runtime uses distro Chromium.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NX_NO_CLOUD=true

COPY package.json package-lock.json ./
# sqlite3 N-API prebuilds work on trixie (glibc 2.41); no rebuild / g++ needed.
# Reintroduce npm rebuild --build-from-source only if require('sqlite3') fails.
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm run build \
  && npm prune --omit=dev

FROM ${BASE_IMAGE} AS runtime
WORKDIR /app

RUN mkdir -p /app/data \
  && chown -R app:app /app/data

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=4000 \
    NODE_ENV=production \
    SQLITE_PATH=/app/data/database.db \
    FUNCTIONS_PATH=/app/data/functions.json

COPY --from=builder --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --chown=app:app docker/serve.mjs ./docker/serve.mjs

USER app
EXPOSE 4000

CMD ["node", "docker/serve.mjs"]
