# Evaluator CLI (Rust)

Host binary under this directory. Build with `make build` / `make install` from the repo root, or `cargo build` here.

**Default = HTTP gateway** (`GET /evaluate` on `--gateway` / `EVALUATOR_URL`, usually `:4000`). Browser work lives in the Nest stack (Playwright by default; `USE_PUPPETEER=1` for Puppeteer).

**`--legacy`** = local teaching Puppeteer under [`legacy/`](./legacy/README.md) — no gateway. Works as a **global** flag (interactive shell + `evaluate` + `batch`) or on `batch` alone.

## Modes

| Invocation | Behavior |
| --- | --- |
| `evaluator` | Interactive **gateway** prompt; type `help` |
| `evaluator --legacy` | Interactive **legacy** prompt (`evaluator[legacy]>`) |
| `evaluator evaluate --url URL …` | One-shot via gateway → exit |
| `evaluator --legacy evaluate --url URL …` | One-shot via `legacy/evaluate.js` |
| `evaluator batch -p PATH …` | CSV batch via gateway |
| `evaluator batch -p PATH … --legacy` | Same (global `--legacy` after subcommand) |
| `evaluator --legacy batch -p PATH …` | CSV via local Puppeteer |
| `evaluator -p PATH …` | Same as `batch` (shorthand) |

In the interactive shell: type `legacy` / `gateway` to switch session mode (evaluate/batch follow the session). Global: `--gateway` / `EVALUATOR_URL` (default `http://127.0.0.1:4000`).

### Interactive

```shell
evaluator --legacy
# evaluator[legacy]> evaluate --url https://example.com --fn window.eval
# evaluator[legacy]> batch -p archive/test.csv -f window.eval -n 1
# evaluator[legacy]> gateway          # switch to gateway session
# evaluator> legacy                   # switch back
# evaluator> quit
```

### One-shot

```shell
evaluator evaluate --url https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval --fn window.eval
evaluator --legacy evaluate --url https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval --fn window.eval
```

### Batch CSV

```shell
evaluator batch -p archive/test.csv -f window.eval -n 1
evaluator -p archive/test.csv -f window.eval -n 1
evaluator batch -p archive/test.csv -f window.eval -n 1 --legacy
```

Batch flags: `-p`/`--path`, `-f`/`--function`, `-n`/`--nb_threads`, `-s`/`--search_pattern`, `-t`/`--timeout` (legacy only), `--legacy`.

## Notes

- `--legacy`: needs Node + `puppeteer` from the monorepo root + Chromium.
- Large CSVs: prefer modest `-n`; the gateway serializes browser work.
- Docker: `make docker-run-cli ARGS='…'`. Interactive needs `docker run -it … evaluator`.
