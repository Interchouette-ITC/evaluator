# syntax=docker/dockerfile:1

# Build from repo root: docker build -f docker/Dockerfile .
# Or: make docker-build
#
# Security baseline: multi-stage, non-root, minimal COPY, exec-form node entry
# (kms-secp256k1-api style). Distroless is not used here because Puppeteer needs Chromium.

ARG NODE_IMAGE=node:26-bookworm-slim

FROM ${NODE_IMAGE} AS builder
WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer browser fetch in the builder; runtime uses distro Chromium.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_SKIP_DOWNLOAD=true

COPY package.json package-lock.json ./
RUN npm ci

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
    fonts-kacst \
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
