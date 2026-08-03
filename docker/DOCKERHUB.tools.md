# evaluator-tools

Rust batch CLI + thin MCP for [interchouette/evaluator](https://hub.docker.com/r/interchouette/evaluator). No Chromium — calls the web gateway over HTTP (`EVALUATOR_URL`).

## CLI

```bash
docker pull interchouette/evaluator-tools:dev

docker run --rm --network host \
  -e EVALUATOR_URL=http://127.0.0.1:4000 \
  -v "$PWD/evaluator:/data:ro" \
  interchouette/evaluator-tools:dev \
  evaluator -p /data/test.csv -f window.eval -n 1
```

## MCP

```bash
# stdio (Cursor / agents)
docker run --rm -i \
  -e EVALUATOR_URL=http://127.0.0.1:4000 \
  interchouette/evaluator-tools:dev \
  node /app/mcp/server.mjs

# HTTP
docker run --rm -p 8788:8788 \
  -e EVALUATOR_URL=http://host.docker.internal:4000 \
  -e EVALUATOR_MCP_HTTP=1 \
  interchouette/evaluator-tools:dev \
  node /app/mcp/server.mjs --http
```

Source: https://github.com/Interchouette-ITC/evaluator
