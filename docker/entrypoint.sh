#!/bin/sh
# tvscreener-style entrypoint for the all-in-one evaluator image.
# Default: web :4000 + MCP HTTP :8788 (ENABLE_MCP=1). Set ENABLE_MCP=0 for web only.
set -eu

ENABLE_MCP="${ENABLE_MCP:-1}"
export EVALUATOR_URL="${EVALUATOR_URL:-http://127.0.0.1:4000}"
export EVALUATOR_MCP_ADDR="${EVALUATOR_MCP_ADDR:-0.0.0.0:8788}"

mcp_http() {
  echo "[entrypoint] MCP HTTP on ${EVALUATOR_MCP_ADDR} (gateway=${EVALUATOR_URL})" >&2
  exec node /app/mcp/server.mjs --http
}

start_mcp_http_sidecar() {
  (
    i=0
    while [ "$i" -lt 120 ]; do
      if node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||4000)+'/',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))" \
        >/dev/null 2>&1; then
        break
      fi
      i=$((i + 1))
      sleep 0.5
    done
    echo "[entrypoint] starting MCP HTTP sidecar on ${EVALUATOR_MCP_ADDR}" >&2
    exec node /app/mcp/server.mjs --http
  ) &
}

cmd="${1:-web}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$cmd" in
  web)
    if [ "$ENABLE_MCP" = "1" ] || [ "$ENABLE_MCP" = "true" ]; then
      start_mcp_http_sidecar
    else
      echo "[entrypoint] ENABLE_MCP=0 — web only" >&2
    fi
    exec node /app/docker/serve.mjs
    ;;
  mcp)
    # mcp | mcp --http | mcp with EVALUATOR_MCP_HTTP=1
    for a in "$@"; do
      if [ "$a" = "--http" ]; then
        mcp_http
      fi
    done
    if [ "${EVALUATOR_MCP_HTTP:-}" = "1" ] || [ "${EVALUATOR_MCP_HTTP:-}" = "true" ]; then
      mcp_http
    fi
    echo "[entrypoint] MCP stdio (EVALUATOR_URL=${EVALUATOR_URL})" >&2
    exec node /app/mcp/server.mjs "$@"
    ;;
  cli | evaluator)
    exec evaluator "$@"
    ;;
  *)
    # Treat unknown first token as Rust CLI args (e.g. -p file.csv)
    exec evaluator "$cmd" "$@"
    ;;
esac
