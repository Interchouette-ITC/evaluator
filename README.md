# **_Evaluator_**

This project aims to ease evaluating the parameters of javascript functions on a website.

Typically helps with deobfuscating https://stackoverflow.com/questions/32977908/how-can-i-deobfuscate-this-javascript using `String.fromCharCode` or `window.eval` or other functions like `JSON.stringify`

## Deployed on [Render](https://render.com/) at [evaluator.onlyeum.io](https://evaluator.onlyeum.io/) (beta)

Render will be redeployed from the Interchouette Docker image in a later pass.

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

- Docker Hub: `interchouette/evaluator`
- GHCR: `ghcr.io/interchouette-itc/evaluator`
- Personal GHCR (optional): `ghcr.io/groussac/evaluator`

The former Hub mirror `gregoshop/evaluator` is **deprecated**.

Build and run from the repo root:

```shell
make docker-build
make docker-run
```

Or:

```shell
docker build -f docker/Dockerfile -t interchouette/evaluator:latest .
docker compose -f docker/docker-compose.yml up
```

Visit http://localhost:4000/

Push `:dev` (after Hub/GHCR login):

```shell
make docker-build-dev
make docker-push-dev
```

CI: `.github/workflows/docker-build-push-dev.yml` (`workflow_dispatch`).

# Development

## Prerequisites

- Node.js `>=22` on the host (you already have a current Node; agents must not install another)
- npm `>=11`
- Docker image build uses `node:26-bookworm-slim` (matches `engines.node`; non-root runtime, see `docker/Dockerfile`)

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

Batch evaluation helper under `./evaluator`:

```shell
cd ./evaluator
cargo build
cargo run -- -p All-Live-Magento-Sites.csv -f window.eval -n 5 -s checkout
```

Parameters:

- `-path` / `-p` CSV file (first column is website domain)
- `-function` / `-f` function to evaluate
- `-nb_threads` / `-n` thread count
- `-timeout` / `-t` navigation timeout
- `-search_pattern` / `-s` pattern to search

# License

GNU General Public License v3.0 or later (see `LICENSE` / GitHub).

### Security

### Errors

If you see typos or errors, open a pull request on the default working branch. Thanks.
