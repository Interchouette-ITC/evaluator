# syntax=docker/dockerfile:1

# Single image: Node build + runtime with distro Chromium.
# Build from repo root: docker build -f docker/Dockerfile .
# Or: make docker-build / make docker-build-dev

ARG NODE_IMAGE=node:26-trixie-slim

FROM ${NODE_IMAGE} AS builder
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NX_NO_CLOUD=true

COPY package.json package-lock.json ./
# sqlite3 N-API prebuilds work on trixie (glibc 2.41); no rebuild / g++ needed.
RUN --mount=type=cache,target=/root/.npm \
    npm ci

COPY . .
RUN --mount=type=cache,target=/root/.npm \
    npm run build \
  && npm prune --omit=dev

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    rm -f /etc/apt/apt.conf.d/docker-clean \
  && apt-get update \
  && apt-get install -y --no-install-recommends \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst-one \
    fonts-freefont-ttf \
    libxss1 \
    ca-certificates \
  && groupadd --system --gid 1001 app \
  && useradd --system --uid 1001 --gid app --create-home --home-dir /home/app app \
  && mkdir -p /app/data \
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
