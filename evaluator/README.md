# Rust CLI — terrain notes

## Status

`cargo build` works on host Rust 1.97+. Default path is now an **HTTP client** of the web gateway (`EVALUATOR_URL`, default `http://127.0.0.1:4000`).

## Gaps closed / remaining

| Topic | Before | Now |
| --- | --- | --- |
| Evaluate | Spawns `node pupet.js` (local Chromium) | `GET {EVALUATOR_URL}/evaluate?url=&function=` |
| CWD / Docker | `pupet.js` path broke outside `./evaluator` | No Node sibling required for default mode |
| URL | Always prefixed `http://` | Keeps `http(s)://`; otherwise prefixes `https://` |
| Concurrency | Process batch via `async-process` | Concurrent HTTP with semaphore (`nb_threads`) |
| Legacy | Only pupet | `--legacy-pupet` still spawns `pupet.js` (deprecated) |
| Timeout / search | Passed to pupet | HTTP path: server-owned timeout; `-s` only filters printed body text client-side |
| Dep pins | `*` in Cargo.toml | Pinned to Cargo.lock versions |

## Smoke

```shell
# web must be up on :4000
cd evaluator
cargo run -- -p test.csv -f window.eval -n 1
```

HTTP client: `ureq` (blocking GET in `spawn_blocking`). Legacy (needs Node + Puppeteer on host, CWD = `evaluator/`):

```shell
cargo run -- --legacy-pupet -p test.csv -n 1
```
