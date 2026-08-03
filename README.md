# **_Evaluator_**

This project aims to ease evaluating the parameters of javascript functions on a website.

Typically helps with deobfuscating https://stackoverflow.com/questions/32977908/how-can-i-deobfuscate-this-javascript using `String.fromCharCode` or `window.eval` or other functions like `JSON.stringify`

## Deployed on [Render](https://render.com/) at [evaluator.onlyeum.io](https://evaluator.onlyeum.io/) (beta)

Render will be redeployed from the Interchouette Docker image in a later pass.

## Architecture

```text
Browser (Angular SPA)
    → Express gateway :4000  (static, WS evaluate, GET /evaluate, Puppeteer)
        → Nest API :3333     (/api/functions)
        → Chromium           (distro binary in evaluator-base)

Rust CLI / MCP (evaluator-tools image, no Chromium)
    → HTTP to EVALUATOR_URL  (same /evaluate and /api/functions)
```

| Image | Role |
| --- | --- |
| `interchouette/evaluator-base:node26-trixie` | Node 26 + apt Chromium/fonts (rebuild rarely) |
| `interchouette/evaluator` | Web stack runtime `FROM` the base |
| `interchouette/evaluator-tools` | Rust CLI + thin MCP (stdio / HTTP `:8788`) |

Compose profiles: `web` | `tools` | both.

## References

- https://www.getastra.com/e/malware/infections/the-presence-of-these-malicious-javascript-are-the-sign-of-hacked-opencart-magento-or-prestashop-store
- https://github.com/gwillem/magento-malware-scanner/blob/master/rules/frontend.txt

![Evaluator (18)](https://user-images.githubusercontent.com/3099551/200139269-a50b8a15-dbcd-4414-9848-7331cb0dd3c5.png)

![Evaluator (17)](https://user-images.githubusercontent.com/3099551/200139284-676f2ac4-042d-4de4-8b06-7f3345232996.png)

# Quick Start and Documentation

## API

Use

```
evaluate/?url=[site url]&function=[function to evaluate]
```

Example (dev FE on port 4200)

```
http://localhost:4200/evaluate/?url=https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval&function=window.eval
```

Production / Docker Node gateway listens on port **4000**. A screenshot of the website is included in the response stream.

# Docker

Images (primary):

- Docker Hub: `interchouette/evaluator` (+ `evaluator-base`, `evaluator-tools`)
- GHCR: `ghcr.io/interchouette-itc/evaluator`
- Personal GHCR (optional): `ghcr.io/groussac/evaluator`

The former Hub mirror `gregoshop/evaluator` is **deprecated**.

### Faster builds

1. **`evaluator-base`** — Chromium + fonts once (`make docker-build-base`). App image does not re-apt Chromium.
2. **BuildKit** — `DOCKER_BUILDKIT=1` (Makefile default); npm cache mount on `npm ci` / build; apt cache on the base Dockerfile.
3. **sqlite3** — N-API prebuilds work on `node:26-trixie-slim` (glibc 2.41). No `npm rebuild` / g++ in the builder. Reintroduce rebuild only if `require('sqlite3')` fails in the image.

Build and run from the repo root:

```shell
# Fast (preferred): build on the host, package in Docker
npm run build
make docker-build-fast
make docker-run

# Slow full in-Docker build (CI / clean repro only)
make docker-build-base   # first time / when Dockerfile.base changes
make docker-build
make docker-run
```

Or:

```shell
docker build -f docker/Dockerfile.base -t interchouette/evaluator-base:node26-trixie .
docker build -f docker/Dockerfile --build-arg BASE_IMAGE=interchouette/evaluator-base:node26-trixie -t interchouette/evaluator:latest .
docker compose -f docker/docker-compose.yml --profile web up
```

Visit http://localhost:4000/

CLI / MCP (web must be reachable via `EVALUATOR_URL`):

```shell
make docker-build-tools
make docker-run-cli ARGS='-p /data/test.csv -n 1 -f window.eval'
# CSV dir is mounted at /data. Host-only web:
# EVALUATOR_URL=http://host.docker.internal:4000 make docker-run-cli ARGS='-p /data/test.csv -n 1'
make docker-run-mcp          # stdio
make docker-run-mcp-http     # http://localhost:8788/mcp
```

Push `:dev` (after Hub/GHCR login):

```shell
make docker-build-dev
make docker-push-dev
```

### CI / CD

| Workflow | Trigger | What |
| --- | --- | --- |
| `ci.yml` | PR / push to `dev` | install dependencies and run `npm run build` |
| `docker-build-push-base.yml` | manual / Dockerfile.base change | build and push Chromium base |
| `docker-build-push-dev.yml` | manual | build base + push `:dev` app image |
| `release.yml` | GitHub Release `vX.Y.Z` | publish `:X.Y.Z` and `:latest` (tag must match `package.json` version) |

To publish a release image: bump `package.json` version, tag `vX.Y.Z`, create the GitHub Release.

# Development

## Prerequisites

- Node.js `>=22` on the host (you already have a current Node; agents must not install another)
- npm `>=11`
- Docker web image: builder `node:26-trixie-slim`, runtime `FROM` `evaluator-base` (Chromium)

```shell
npm install
```

## Development server

```shell
npm start
```

Dev UI: http://localhost:4200/ (API proxied; Nest backend on 3333).

## Build

```shell
npm run build
```

Artifacts land in `dist/`. Serve production Node gateway + Nest:

```shell
npm run serve
```

Then open http://localhost:4000/

## Test

```shell
npm test
```

# Rust CLI

Batch evaluation helper under `./evaluator` — default mode calls the web gateway:

```shell
cd ./evaluator
cargo build
# web on :4000
cargo run -- -p test.csv -f window.eval -n 1
# or: EVALUATOR_URL=http://127.0.0.1:4000 cargo run -- -p All-Live-Magento-Sites.csv -f window.eval -n 5
```

Parameters:

- `-path` / `-p` CSV file (first column is website domain)
- `-function` / `-f` function to evaluate
- `-nb_threads` / `-n` concurrency
- `--gateway` / `EVALUATOR_URL` gateway base (default `http://127.0.0.1:4000`)
- `--legacy-pupet` deprecated local `node pupet.js` path
- `-timeout` / `-t`, `-search_pattern` / `-s` — legacy pupet (HTTP mode only filters printed body for `-s`)

See [evaluator/README.md](evaluator/README.md) for terrain notes.

# MCP

Thin server in [`tools/mcp`](tools/mcp): tools `evaluate` and `list_functions` against `EVALUATOR_URL`.

```shell
cd tools/mcp && npm ci
EVALUATOR_URL=http://127.0.0.1:4000 node server.mjs           # stdio
EVALUATOR_URL=http://127.0.0.1:4000 node server.mjs --http    # :8788/mcp
```

# License

GNU General Public License v3.0 or later (see `LICENSE` / GitHub).

### Security

### Errors

If you see typos or errors, open a pull request on the default working branch. Thanks.
