# evaluator

Evaluate JavaScript on live pages (Puppeteer/Chromium). One image: web UI + Nest API + Rust CLI + MCP.

```bash
docker pull interchouette/evaluator:dev
docker run --rm -p 4000:4000 -p 8788:8788 interchouette/evaluator:dev
```

Default: **web on :4000** + **MCP HTTP on :8788**. Opt out with `ENABLE_MCP=0`.

Open http://localhost:4000/

```
http://localhost:4000/evaluate/?url=https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval&function=window.eval
```

## Modes

```bash
IMAGE=interchouette/evaluator:dev

# Web + MCP HTTP (default)
docker run -d -p 4000:4000 -p 8788:8788 "$IMAGE"

# Web only
docker run -d -p 4000:4000 -e ENABLE_MCP=0 "$IMAGE"

# MCP stdio (gateway must be reachable)
docker run --rm -i --network host -e EVALUATOR_URL=http://127.0.0.1:4000 "$IMAGE" mcp

# MCP HTTP only
docker run --rm -p 8788:8788 -e EVALUATOR_URL=http://host.docker.internal:4000 "$IMAGE" mcp --http

# Rust CLI
docker run --rm --network host \
  -e EVALUATOR_URL=http://127.0.0.1:4000 \
  -v "$PWD/evaluator:/data:ro" \
  "$IMAGE" evaluator -p /data/test.csv -f window.eval -n 1
```

| Env | Default | Meaning |
| --- | --- | --- |
| `ENABLE_MCP` | `1` | Start MCP HTTP beside web |
| `EVALUATOR_URL` | `http://127.0.0.1:4000` | Gateway for CLI / MCP |
| `EVALUATOR_MCP_ADDR` | `0.0.0.0:8788` | MCP HTTP bind |

AI clients: Streamable HTTP at `http://localhost:8788/mcp`, or spawn `… mcp` on stdio.

## Tags

| Tag | Meaning |
| --- | --- |
| `dev` | Latest CI build |
| `latest` / `X.Y.Z` | Release |

## Also on GHCR

- `ghcr.io/interchouette-itc/evaluator`
- `ghcr.io/groussac/evaluator` (optional mirror)

Source: https://github.com/Interchouette-ITC/evaluator

> Legacy slim image `interchouette/evaluator-tools` is superseded by this all-in-one image.
