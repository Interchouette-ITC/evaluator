# Evaluator CLI (Rust)

HTTP client for the evaluator gateway (`GET /evaluate`). Build with `cargo build` in this directory.

The browser work itself lives in the Nest stack (`libs/util/puppeteer`: Playwright by default). A small local Puppeteer teaching sample is under [`legacy/`](./legacy/README.md).

## Modes

| Invocation | Behavior |
| --- | --- |
| `evaluator` (no subcommand) | Interactive prompt until `quit` / `exit` / `q` / EOF |
| `evaluator evaluate --url URL [--fn F] [--search S]` | One-shot evaluate → print body → exit |
| `evaluator batch -p PATH …` | CSV batch via gateway (first column = domain) |
| `evaluator batch -p PATH … --legacy` | Same CSV, but each row runs `legacy/evaluate.js` locally |
| `evaluator -p PATH …` | Same as `batch` (shorthand) |

Global: `--gateway URL` or `EVALUATOR_URL` (default `http://127.0.0.1:4000`).

### Interactive

```shell
cargo run
# evaluator> evaluate --url https://example.com --fn window.eval
# evaluator> batch -p test.csv -f window.eval -n 1
# evaluator> quit
```

### One-shot

```shell
cargo run -- evaluate --url https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval --fn window.eval
```

### Batch CSV

```shell
cargo run -- batch -p test.csv -f window.eval -n 1
# shorthand:
cargo run -- -p test.csv -f window.eval -n 1
# teaching sample (no gateway):
cargo run -- batch -p test.csv -f window.eval -n 1 --legacy
```

Batch flags: `-p`/`--path`, `-f`/`--function`, `-n`/`--nb_threads`, `-s`/`--search_pattern`, `-t`/`--timeout` (legacy only), `--legacy`.

## Notes

- Default path: **web gateway** (Playwright or Puppeteer). Point `--gateway` / `EVALUATOR_URL` at a running stack (`make docker-run` or `:4000`).
- `--legacy`: see [`legacy/README.md`](./legacy/README.md) — not production; needs Node + `puppeteer` from the monorepo root.
- Large CSVs: prefer modest `-n`; the gateway serializes browser work.
- Docker: `make docker-run-cli ARGS='evaluate --url https://example.com --fn window.eval'` or `ARGS='batch -p /data/test.csv -n 1'`. Interactive needs `docker run -it … evaluator`.
