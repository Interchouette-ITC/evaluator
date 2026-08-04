# Evaluator CLI (Rust)

HTTP client for the evaluator gateway (`GET /evaluate`). Build with `cargo build` in this directory.

## Modes

| Invocation | Behavior |
| --- | --- |
| `evaluator` (no subcommand) | Interactive prompt until `quit` / `exit` / `q` / EOF |
| `evaluator evaluate --url URL [--fn F] [--search S]` | One-shot evaluate → print body → exit |
| `evaluator batch -p PATH …` | CSV batch (first column = domain) |
| `evaluator -p PATH …` | Same as `batch` (compat for older scripts) |

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
# legacy:
cargo run -- -p test.csv -f window.eval -n 1
```

Batch flags: `-p`/`--path`, `-f`/`--function`, `-n`/`--nb_threads`, `-s`/`--search_pattern`, `--legacy-pupet`, `-t`/`--timeout`.

## Notes

- Default path is **HTTP to the Nest gateway**, not local Chromium. Point `--gateway` / `EVALUATOR_URL` at a running stack (`npm run serve` or Docker web on `:4000`).
- `--legacy-pupet` runs `node pupet.js` (deprecated). Prefer gateway + Docker Chromium.
- Large CSVs: prefer modest `-n`; the gateway serializes browser work.
- Docker: `make docker-run-cli ARGS='evaluate --url https://example.com --fn window.eval'` or `ARGS='batch -p /data/test.csv -n 1'`. Interactive needs `docker run -it … evaluator`.
