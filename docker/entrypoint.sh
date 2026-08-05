#!/bin/sh
# All-in-one evaluator image entrypoint.
# Default: web :4000 + MCP HTTP :9790 (ENABLE_MCP=1). Set ENABLE_MCP=0 for web only.
# CLI: interactive (long-lived + optional MCP) vs one-shot evaluate/batch (no MCP).
set -eu

ENABLE_MCP="${ENABLE_MCP:-1}"
export EVALUATOR_MCP_ADDR="${EVALUATOR_MCP_ADDR:-0.0.0.0:9790}"
export EVALUATOR_NODE_ENTRY="${EVALUATOR_NODE_ENTRY:-/app/dist/evaluator/server/server.js}"

mcp_http() {
  echo "[entrypoint] MCP HTTP on ${EVALUATOR_MCP_ADDR}" >&2
  exec evaluator-mcp --http --listen "${EVALUATOR_MCP_ADDR}"
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
    exec evaluator-mcp --http --listen "${EVALUATOR_MCP_ADDR}"
  ) &
}

start_mcp_http_sidecar_nowait() {
  echo "[entrypoint] starting MCP HTTP sidecar on ${EVALUATOR_MCP_ADDR}" >&2
  (
    exec evaluator-mcp --http --listen "${EVALUATOR_MCP_ADDR}"
  ) &
}

mcp_enabled() {
  [ "${ENABLE_MCP}" = "1" ] || [ "${ENABLE_MCP}" = "true" ]
}

# True when CLI should keep the container alive (interactive prompt).
cli_is_long_lived() {
  if [ "$#" -eq 0 ]; then
    return 0
  fi
  case "$1" in
    evaluate|batch|--help|-h|-p|--path)
      return 1
      ;;
    --path=*|-p*)
      return 1
      ;;
    *)
      return 1
      ;;
  esac
}

run_cli() {
  if cli_is_long_lived "$@"; then
    if mcp_enabled; then
      echo "[entrypoint] interactive CLI" >&2
      start_mcp_http_sidecar_nowait
    else
      echo "[entrypoint] interactive CLI (ENABLE_MCP=0)" >&2
    fi
  else
    echo "[entrypoint] one-shot CLI (no MCP sidecar)" >&2
  fi
  exec evaluator "$@"
}

cmd="${1:-web}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$cmd" in
  web)
    if mcp_enabled; then
      start_mcp_http_sidecar
    else
      echo "[entrypoint] ENABLE_MCP=0 — web only" >&2
    fi
    exec node /app/docker/serve.mjs
    ;;
  mcp)
    for a in "$@"; do
      if [ "$a" = "--http" ]; then
        mcp_http
      fi
    done
    if [ "${MCP_HTTP:-}" = "1" ] || [ "${MCP_HTTP:-}" = "true" ]; then
      mcp_http
    fi
    echo "[entrypoint] MCP stdio" >&2
    exec evaluator-mcp "$@"
    ;;
  cli | evaluator)
    run_cli "$@"
    ;;
  evaluate | batch | -p | --path | --help | -h)
    run_cli "$cmd" "$@"
    ;;
  *)
    run_cli "$cmd" "$@"
    ;;
esac
