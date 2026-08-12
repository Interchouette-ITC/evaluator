# Evaluator CLI (Rust)

Host binary under this directory. Build with `make build` / `make install` from the repo root (`--features apps`), or `cargo build --features apps` here.

**One engine:** CLI/MCP always spawn the shared Node entry (`dist/evaluator/server/server.js`) with `evaluate` or `batch`. No gateway HTTP, no `--legacy`. Needs `npm run build` in `www/` + Chromium (`PUPPETEER_EXECUTABLE_PATH`).

Override the Node entry with `EVALUATOR_NODE_ENTRY`.

Hook any JS function with `-f` / `--function` (e.g. `window.eval`, `JSON.stringify`). Filtering (`-s` / `--regex` / `--rules`) runs in Rust on hook payloads.

## Modes

| Invocation | Behavior |
| --- | --- |
| `evaluator` | Interactive prompt; type `help` |
| `evaluator evaluate --url URL …` | One-shot → Node `evaluate` → exit |
| `evaluator batch -p PATH …` | CSV → **one** Node process / one Chromium |
| `evaluator -p PATH …` | Same as `batch` (shorthand) |

### Interactive

```shell
evaluator
# evaluator> evaluate --url https://example.com --fn window.eval
# evaluator> batch -p archive/test.csv -f window.eval -n 1
# evaluator> quit
```

### One-shot

```shell
evaluator evaluate --url https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval --fn window.eval
```

### Batch CSV

```shell
evaluator batch -p archive/test.csv -f window.eval -n 1
evaluator -p archive/test.csv -f window.eval -n 1
```

### Payload filters

Keep only hooked-function payloads that match keywords, a regex, or malware rules (OR across sources). Empty filters print all hits.

Malware rule files use **Willem de Groot**’s [magento-malware-scanner](https://github.com/gwillem/magento-malware-scanner) format. See [`rules/README.md`](./rules/README.md).

| Flag | Meaning |
| --- | --- |
| `-s` / `--search` / `--search_pattern` | Comma-separated keywords (any substring match) |
| `--regex` | Rust regex against each payload |
| `--rules PATH` | Willem’s rule-file format |

Vendored frontend snapshot: [`rules/frontend.txt`](./rules/frontend.txt).

```shell
evaluator batch -p archive/All-Live-Magento-Sites.csv \
  -f window.eval -n 1 \
  --rules rules/frontend.txt

evaluator evaluate --url https://example.com --fn window.eval \
  --regex 'grelos_v|gate\.php'
```

Use `--excerpt` (or `--excerpt 120`) to print only a short snippet around each match.

Also: **`evaluator-mcp`** (`make run-mcp` / `make run-mcp-http`) - same Node path via rmcp tools `evaluate`, `batch`, `list_functions`.
