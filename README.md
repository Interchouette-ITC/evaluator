# **_Evaluator_**

This project aims to ease evaluating the parameters of javascript functions on a website.

Typically helps with deobfuscating https://stackoverflow.com/questions/32977908/how-can-i-deobfuscate-this-javascript using `String.fromCharCode` or `window.eval` or other functions like `JSON.stringify`

## Live

Production: [https://evaluator.interchouette.net](https://evaluator.interchouette.net)

## Architecture

```text
Browser (Angular SPA)
    → Express gateway :4000  (static, WS evaluate, GET /evaluate)
        → Nest API :3333     (/api/functions)
        → Chromium via Playwright (default) or Puppeteer (`USE_PUPPETEER=1`)

Same image also ships Rust CLI + MCP (prefer HTTP :8788; stdio optional)
    → HTTP to EVALUATOR_URL  (same /evaluate and /api/functions)
```

| Image | Role |
| --- | --- |
| `interchouette/evaluator` | All-in-one: web + Chromium + Rust CLI + MCP |
| `interchouette/evaluator-tools` | Legacy slim CLI/MCP only (optional local build) |

Compose profile: `web` (ports `4000` + `8788`).

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

Example (production)

```
https://evaluator.interchouette.net/evaluate/?url=https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval&function=window.eval
```

Production / Docker Node gateway listens on port **4000**. A screenshot of the website is included in the response stream.

# Docker

Images (primary):

- Docker Hub: `interchouette/evaluator` (web + CLI + MCP; Playwright default, or `USE_PUPPETEER=1`)
- GHCR: `ghcr.io/interchouette-itc/evaluator`
- Personal GHCR (optional): `ghcr.io/groussac/evaluator`

The former Hub mirror `gregoshop/evaluator` is **deprecated**. No separate `evaluator-base`. MCP HTTP is on by default (`ENABLE_MCP=0` to disable).

### Run CI-built `:dev` (preferred locally)

```shell
make docker-pull-dev
make docker-run
```

Visit http://localhost:4000/

### Build (CI / repro)

```shell
make docker-build-dev   # or make docker-build
```

Optional local packaging after `npm run build`: `make docker-build-fast`.

CLI / MCP (against a running gateway, or built into the all-in-one image):

```shell
# One-shot evaluate
make docker-run-cli ARGS='evaluate --url https://example.com --fn window.eval'
# CSV batch
make docker-run-cli ARGS='batch -p /data/test.csv -n 1 -f window.eval'
# Interactive: docker run -it --rm --network host -e EVALUATOR_URL=http://127.0.0.1:4000 interchouette/evaluator:dev evaluator
make docker-run-mcp          # stdio
# MCP HTTP is published on :8788 with make docker-run (ENABLE_MCP=1)
```

### CI / CD

| Workflow | Trigger | What |
| --- | --- | --- |
| `ci.yml` | PR / push to `dev` | `npm ci` + `npm run build` |
| `docker-build-push-dev.yml` | manual | monolith `:dev` + `:latest` → Hub + GHCR |
| `release.yml` | GitHub Release `vX.Y.Z` | `:X.Y.Z` + `:latest` |

To publish a release image: bump `package.json` version, tag `vX.Y.Z`, create the GitHub Release.

# Development

## Prerequisites

- Node.js `>=22` on the host (you already have a current Node; agents must not install another)
- npm `>=11`
- Docker web image: single `node:26-trixie-slim` multi-stage build with distro Chromium
- Evaluate engine: **Playwright by default** on distro Chromium (`PUPPETEER_EXECUTABLE_PATH`); set `USE_PUPPETEER=1` for Puppeteer

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

Gateway HTTP client under `./evaluator`:

| Mode | Command |
| --- | --- |
| Interactive | `cargo run` (prompt until `quit`) |
| One-shot | `cargo run -- evaluate --url … [--fn …]` |
| CSV batch | `cargo run -- batch -p file.csv …` (legacy: `-p` without `batch`) |

```shell
cd ./evaluator
cargo build
# web on :4000
cargo run -- evaluate --url https://example.com --fn window.eval
cargo run -- batch -p test.csv -f window.eval -n 1
```

Global: `--gateway` / `EVALUATOR_URL` (default `http://127.0.0.1:4000`). Batch: `-p`, `-f`, `-n`, `-s`, `--legacy-pupet`, `-t`.

See [evaluator/README.md](evaluator/README.md) for details.

# MCP

Thin server in [`tools/mcp`](tools/mcp): tools `evaluate`, `list_functions`, and `batch` (`urls[]` and/or local CSV `path`; max 50 URLs) against `EVALUATOR_URL`. Large CSVs stay on the Rust CLI (`evaluator batch -p …`).

**Prefer MCP HTTP** when the all-in-one container exposes `:8788` (Cursor: `evaluator-http` → `http://127.0.0.1:8788/mcp`). Stdio (`… mcp` / Cursor `evaluator`) works but pays a Docker spawn cost on cold start.

```shell
cd tools/mcp && npm ci
EVALUATOR_URL=http://127.0.0.1:4000 node server.mjs --http    # :8788/mcp (recommended)
EVALUATOR_URL=http://127.0.0.1:4000 node server.mjs           # stdio fallback
```

## Engine and MCP advice (local bench)

Same page and hook: `JSON.stringify` on `https://cursor.com`. Warmup discarded; wall times to gateway `/evaluate` (what both MCP transports call). Stdio numbers below include a cold `docker run --rm` per call.

| Combo | Median | Notes |
| --- | ---: | --- |
| MCP HTTP + Playwright | ~9.5 s | **Recommended default** |
| MCP HTTP + Puppeteer | ~11.3 s | Opt in with `USE_PUPPETEER=1` |
| MCP stdio + Playwright | ~13.6 s | ~+4 s Docker spawn vs HTTP |
| MCP stdio + Puppeteer | ~15.6 s | Slowest of the four |

Takeaways:

1. Prefer **Playwright** (default; unset or `USE_PUPPETEER=0`).
2. Prefer **MCP HTTP** over stdio when `:8788` is up — same evaluate work, no spawn tax.
3. Hit counts and screenshots were comparable across engines (~75–84 console hits).

# License

GNU General Public License v3.0 or later (see `LICENSE` / GitHub).

### Security

### Errors

If you see typos or errors, open a pull request on the default working branch. Thanks.
