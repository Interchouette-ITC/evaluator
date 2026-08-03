# evaluator

Evaluate JavaScript function calls on live web pages (e.g. `window.eval`, `String.fromCharCode`) with Puppeteer/Chromium. Useful for inspecting obfuscated front-end malware patterns.

## Web image (`interchouette/evaluator`)

Gateway + SPA + Nest API + Chromium in one container.

```bash
docker pull interchouette/evaluator:dev
docker run --rm -p 4000:4000 interchouette/evaluator:dev
```

Open http://localhost:4000/

API:

```
http://localhost:4000/evaluate/?url=https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval&function=window.eval
```

## Rust CLI + MCP (`interchouette/evaluator-tools`)

Companion image (no Chromium): batch CSV evaluation and a thin MCP server that call the web gateway over HTTP (`EVALUATOR_URL`).

```bash
docker pull interchouette/evaluator-tools:dev

# CLI (web must be reachable)
docker run --rm --network host \
  -e EVALUATOR_URL=http://127.0.0.1:4000 \
  -v "$PWD/evaluator:/data:ro" \
  interchouette/evaluator-tools:dev \
  evaluator -p /data/test.csv -f window.eval -n 1

# MCP stdio
docker run --rm -i \
  -e EVALUATOR_URL=http://127.0.0.1:4000 \
  interchouette/evaluator-tools:dev \
  node /app/mcp/server.mjs
```

## Tags

| Tag | Meaning |
| --- | --- |
| `dev` | Latest successful CI build from the `dev` branch |
| `latest` / `X.Y.Z` | Release images (GitHub Release) |

## Also on GHCR

- `ghcr.io/interchouette-itc/evaluator` (+ `evaluator-tools`)
- `ghcr.io/groussac/evaluator` (optional mirror)

Source: https://github.com/Interchouette-ITC/evaluator
