# syntax=docker/dockerfile:1

# All-in-one: web (Chromium) + Rust CLI + Rust MCP (stdio / HTTP).
# Default: web :4000 + MCP HTTP :9790. ENABLE_MCP=0 → web only.
#   docker run … mcp              # stdio
#   docker run … mcp --http       # HTTP only
#   docker run … evaluator -p …   # Rust CLI → Node evaluate/batch

ARG NODE_IMAGE=node:26-trixie-slim
ARG RUST_IMAGE=rust:1.88-bookworm

FROM ${RUST_IMAGE} AS rust-builder
WORKDIR /src
COPY evaluator/ ./
RUN cargo build --release --features apps --bin evaluator --bin evaluator-mcp

FROM ${NODE_IMAGE} AS builder
WORKDIR /app

ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    USE_PUPPETEER=0 \
    NX_NO_CLOUD=true

COPY package.json package-lock.json ./
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
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    USE_PUPPETEER=0 \
    PORT=4000 \
    NODE_ENV=production \
    SQLITE_PATH=/app/data/database.db \
    FUNCTIONS_PATH=/app/data/functions.json \
    ENABLE_MCP=1 \
    EVALUATOR_MCP_ADDR=0.0.0.0:9790 \
    EVALUATOR_NODE_ENTRY=/app/dist/evaluator/server/server.js

COPY --from=builder --chown=app:app /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=app:app /app/node_modules ./node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=rust-builder /src/target/release/evaluator /usr/local/bin/evaluator
COPY --from=rust-builder /src/target/release/evaluator-mcp /usr/local/bin/evaluator-mcp
COPY --chown=app:app docker/serve.mjs ./docker/serve.mjs
COPY --chown=app:app docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x /app/docker/entrypoint.sh /usr/local/bin/evaluator /usr/local/bin/evaluator-mcp

USER app
EXPOSE 4000 9790

ENTRYPOINT ["/app/docker/entrypoint.sh"]
CMD ["web"]
