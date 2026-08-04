# evaluator

Evaluate JavaScript on live pages with **Playwright** (default) or **Puppeteer** (`USE_PUPPETEER=1`), on distro Chromium.

**Live:** [https://evaluator.interchouette.net](https://evaluator.interchouette.net)

**One image:** web UI + Nest API + Rust CLI + MCP (stdio / Streamable HTTP).

```bash
docker pull interchouette/evaluator:dev
docker run --rm -p 4000:4000 -p 8788:8788 interchouette/evaluator:dev
```

Default: **web on :4000** + **MCP HTTP on :8788**. Opt out with `ENABLE_MCP=0`.

Prefer **MCP HTTP** (`http://localhost:8788/mcp` locally, or `https://mcp:mcp@host/mcp` via the web gateway). Stdio pays a Docker spawn cost on cold start.

Open http://localhost:4000/ (or production [evaluator.interchouette.net](https://evaluator.interchouette.net))

```
https://evaluator.interchouette.net/evaluate/?url=https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval&function=window.eval
```

## Modes

| Invocation | Behavior |
| --- | --- |
| *(default / `web`)* | Web UI + API on `:4000`; MCP HTTP sidecar on `:8788` if `ENABLE_MCP=1` |
| `mcp` / `mcp --http` | MCP only (stdio or Streamable HTTP) |
| `evaluator` / `cli` (no subcommand) | **Interactive** Rust prompt until `quit` / EOF; MCP sidecar if `ENABLE_MCP=1` |
| `evaluator evaluate --url …` | **One-shot** GET `/evaluate` → print body → exit (no MCP) |
| `evaluator batch -p file.csv …` | CSV batch (flat `-p` without `batch` also works) → exit (no MCP) |

```bash
IMAGE=interchouette/evaluator:dev

# Web + MCP HTTP (default; Playwright engine)
docker run -d -p 4000:4000 -p 8788:8788 "$IMAGE"

# Web only (no MCP sidecar)
docker run -d -p 4000:4000 -e ENABLE_MCP=0 "$IMAGE"

# Web + Puppeteer engine + MCP
docker run -d -p 4000:4000 -p 8788:8788 -e USE_PUPPETEER=1 "$IMAGE"

# MCP stdio (Rust evaluator-mcp; no web required)
docker run --rm -i --network host "$IMAGE" mcp

# MCP HTTP only
docker run --rm -p 8788:8788 "$IMAGE" mcp --http

# One-shot evaluate (spawns Node evaluate inside the image)
docker run --rm --network host \
  "$IMAGE" evaluator evaluate --url https://example.com --fn window.eval

# CSV batch
docker run --rm --network host \
  -v "$PWD/evaluator:/data:ro" \
  "$IMAGE" evaluator batch -p /data/archive/test.csv -f window.eval -n 1

# Interactive CLI (-it required)
docker run -it --rm --network host \
  "$IMAGE" evaluator
```

| Env | Default | Meaning |
| --- | --- | --- |
| `ENABLE_MCP` | `1` | Start MCP HTTP beside web / interactive CLI (`0` = off) |
| `ENABLE_MCP_PROXY` | `1` | Express proxies `/mcp` → sidecar `:8788` (basic auth) |
| `MCP_USER` / `MCP_PWD` | `mcp` / `mcp` | Basic auth for gateway `/mcp` (not `DB_*`) |
| `USE_PUPPETEER` | `0` | `1` / `true` → Puppeteer; else Playwright |
| `EVALUATOR_NODE_ENTRY` | `/app/dist/evaluator/server/server.js` | Shared Node entry (serve/evaluate/batch) |
| `EVALUATOR_MCP_ADDR` | `0.0.0.0:8788` | MCP HTTP bind |
| `FUNCTIONS_PATH` | `/app/data/functions.json` | Catalog for `list_functions` |
| `PUPPETEER_EXECUTABLE_PATH` | `/usr/bin/chromium` | Chromium binary for both engines |

## MCP over HTTPS (Render / single public port)

Platforms like Render expose only `PORT` (web). The sidecar still listens on `:8788` **inside** the container; it is **not** `https://host:8788/mcp`.

Use the Express proxy instead:

```text
https://mcp:mcp@evaluator.interchouette.net/mcp
```

Boat defaults `MCP_USER`/`MCP_PWD` = `mcp`/`mcp` are **public by design** for the shared demo (401 without creds; README documents the pair). Override only for a **private** deploy and share creds out-of-band. Do not reuse `DB_USER`/`DB_PWD`.

Render checklist: `ENABLE_MCP=1`, leave `MCP_*` at defaults on the public demo.

AI clients: Streamable HTTP at `http://localhost:8788/mcp` (local sidecar, no auth) or `https://mcp:mcp@<host>/mcp` (proxied). Stdio: spawn `… mcp`. Tools: `evaluate`, `list_functions`, `batch` (Rust `evaluator-mcp` → Node evaluate/batch).

## Tags

| Tag | Meaning |
| --- | --- |
| `dev` | Latest CI build |
| `latest` | Same image as current `:dev` (also updated on release) |
| `X.Y.Z` | Versioned release |

## Also on GHCR

- `ghcr.io/interchouette-itc/evaluator`
- `ghcr.io/groussac/evaluator` (optional mirror)

Source: https://github.com/Interchouette-ITC/evaluator
