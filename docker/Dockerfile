# syntax=docker/dockerfile:1

# Build from repo root: docker build -f docker/Dockerfile .
# Or: make docker-build
#
# Multi-stage, non-root, minimal COPY, exec-form node entry.
# Distroless is not used here because Puppeteer needs Chromium at runtime.

ARG NODE_IMAGE=node:26-trixie-slim

FROM ${NODE_IMAGE} AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer browser fetch in the builder; runtime uses distro Chromium.
# Also set executablePath so puppeteer treats skipDownload as default.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NX_NO_CLOUD=true

COPY package.json package-lock.json ./
# sqlite3 ships Node-26 prebuilds that need glibc >= 2.38; rebuild on-image so
# the .node matches this base even if a stale prebuild is cached.
RUN npm ci \
  && npm rebuild sqlite3 --build-from-source

COPY . .
RUN npm run build \
  && npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst-one \
    fonts-freefont-ttf \
    libxss1 \
    ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app --create-home --home-dir /home/app app

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PORT=4000 \
    NODE_ENV=production

COPY --from=builder --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --chown=app:app docker/serve.mjs ./docker/serve.mjs

USER app
EXPOSE 4000

CMD ["node", "docker/serve.mjs"]
