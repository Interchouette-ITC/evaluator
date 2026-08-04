# Evaluator CLI (Rust)

Host binary under this directory. Build with `make build` / `make install` from the repo root, or `cargo build` here.

**Default = HTTP gateway** (`GET /evaluate` on `--gateway` / `EVALUATOR_URL`, usually `:4000`). Browser work lives in the Nest stack (Playwright by default; `USE_PUPPETEER=1` for Puppeteer).

**`--legacy`** = local teaching Puppeteer under [`legacy/`](./legacy/README.md) — no gateway. Works as a **global** flag (interactive shell + `evaluate` + `batch`) or on `batch` alone.

Hook any JS function with `-f` / `--function` (e.g. `window.eval`, `JSON.stringify`). The inject wraps that callable and logs its arguments; filtering applies to those payloads.

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

### Payload filters

Keep only hooked-function payloads that match keywords, a regex, or malware rules (OR across sources). Empty filters print all hits.

Malware rule files use **Willem de Groot**’s [magento-malware-scanner](https://github.com/gwillem/magento-malware-scanner) format. See [`rules/README.md`](./rules/README.md) for citation and parser notes.

| Flag | Meaning |
| --- | --- |
| `-s` / `--search` / `--search_pattern` | Comma-separated keywords (any substring match) |
| `--regex` | Rust regex against each payload |
| `--rules PATH` | Willem’s rule-file format ([frontend.txt](https://github.com/gwillem/magento-malware-scanner/blob/master/rules/frontend.txt); [backend.txt](https://github.com/gwillem/magento-malware-scanner/blob/master/rules/backend.txt) is PHP/server-side and not used for hook payloads) |

Vendored frontend snapshot (cited in-file): [`rules/frontend.txt`](./rules/frontend.txt).

```shell
evaluator batch -p archive/All-Live-Magento-Sites.csv \
  -f window.eval -n 2 -t 10000 --legacy \
  --rules rules/frontend.txt

evaluator batch -p archive/All-Live-Magento-Sites.csv \
  -f window.eval -n 2 --legacy -s checkout,onepage,cart,grelos_v

evaluator --legacy evaluate --url https://example.com --fn window.eval \
  --regex 'grelos_v|gate\.php'
```

Matching lines print as `match: <rule-or-keyword>` then the payload.

Use `--excerpt` (or `--excerpt 120`) to print only a short snippet around the first hit instead of dumping multi‑KB payloads.

**Magecart / Grelos:** product notes, Segura VB2021, Willem rules, and the Blogspot **demo fixture** (vs W3Schools canary) — see [`MAGECART.md`](./MAGECART.md) and [`archive/fixtures/`](./archive/fixtures/).

Batch flags: `-p`/`--path`, `-f`/`--function`, `-n`/`--nb_threads`, `-s`/`--search_pattern`, `--regex`, `--rules`, `-t`/`--timeout` (legacy only), `--legacy`.

## Notes

- `--legacy`: needs Node + `puppeteer` from the monorepo root + Chromium.
- Large CSVs: prefer modest `-n`; the gateway serializes browser work.
- Docker: `make docker-run-cli ARGS='…'`. Interactive needs `docker run -it … evaluator`.
