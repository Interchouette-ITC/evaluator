#!/usr/bin/env bash
# Smoke-test demo1shop + demo2grelos + demo3grelos against a local static server.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
PORT="${FIXTURE_PORT:-8765}"
BASE="http://127.0.0.1:${PORT}"
STARTED_SERVER=0

need_evaluator() {
  command -v evaluator >/dev/null || {
    echo "evaluator not on PATH (cargo install --path rust/)" >&2
    exit 1
  }
}

ensure_server() {
  if curl -sf -o /dev/null "${BASE}/demo1shop.html"; then
    return 0
  fi
  python3 -m http.server "$PORT" --directory "$ROOT" >/tmp/evaluator-fixture-server.log 2>&1 &
  echo $! >/tmp/evaluator-fixture-server.pid
  STARTED_SERVER=1
  for _ in $(seq 1 30); do
    curl -sf -o /dev/null "${BASE}/demo1shop.html" && return 0
    sleep 0.1
  done
  echo "fixture server failed to start on :${PORT}" >&2
  exit 1
}

stop_server() {
  if [[ "$STARTED_SERVER" -eq 1 && -f /tmp/evaluator-fixture-server.pid ]]; then
    kill "$(cat /tmp/evaluator-fixture-server.pid)" 2>/dev/null || true
    rm -f /tmp/evaluator-fixture-server.pid
  fi
}
trap stop_server EXIT

export PUPPETEER_EXECUTABLE_PATH="${PUPPETEER_EXECUTABLE_PATH:-/usr/bin/chromium}"
unset PUPPETEER_CACHE_DIR || true

need_evaluator
ensure_server

echo "== demo1shop (expect checkout and/or cart; not grelos_v) =="
OUT_SHOP="$(evaluator evaluate \
  --url "${BASE}/demo1shop.html" \
  --fn window.eval \
  -s checkout,onepage,cart,grelos_v \
  --excerpt 40)"
echo "$OUT_SHOP"
echo "$OUT_SHOP" | grep -q 'match: keyword:checkout\|match: keyword:cart' || {
  echo "FAIL: demo1shop expected checkout or cart match" >&2
  exit 1
}
if echo "$OUT_SHOP" | grep -q 'match: keyword:grelos_v'; then
  echo "FAIL: demo1shop should not match grelos_v" >&2
  exit 1
fi

echo "== demo2grelos (expect grelos_v) =="
OUT_G="$(evaluator evaluate \
  --url "${BASE}/demo2grelos.html" \
  --fn window.eval \
  -s grelos_v \
  --excerpt)"
echo "$OUT_G"
echo "$OUT_G" | grep -q 'match: keyword:grelos_v' || {
  echo "FAIL: demo2grelos expected grelos_v match" >&2
  exit 1
}

echo "== demo3grelos (expect grelos_v; hex-table packer) =="
OUT_G3="$(evaluator evaluate \
  --url "${BASE}/demo3grelos.html" \
  --fn window.eval \
  -s grelos_v \
  --excerpt)"
echo "$OUT_G3"
echo "$OUT_G3" | grep -q 'match: keyword:grelos_v' || {
  echo "FAIL: demo3grelos expected grelos_v match" >&2
  exit 1
}

echo "OK: demo fixtures smoke passed"
