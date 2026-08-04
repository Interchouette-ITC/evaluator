# Legacy single-process evaluate (teaching sample)

**Not the production core.** The live stack uses Nest + `libs/util/puppeteer` (Playwright by default, or Puppeteer with `USE_PUPPETEER=1`) behind `GET /evaluate`.

This folder is a **small, readable Puppeteer script** that shows the same basic idea:

1. Launch Chromium
2. Inject an `eval` hook (`eval.template.js`) so page JS is visible via `console`
3. Abort top-level navigations that leave the target host
4. Print matching console hits

Use it to learn the flow, or for offline one-offs without the gateway.

## Run directly

From the **repo root** (needs `npm install` / `puppeteer` + a Chromium, e.g. `PUPPETEER_EXECUTABLE_PATH`):

```bash
node evaluator/legacy/evaluate.js
# default URL = w3schools tryjsref_eval; or pass args:
# node evaluator/legacy/evaluate.js '<url>' 'window.eval' 150000 ''
# args: URL  function  timeout_ms  search_pattern
```

## Via Rust CLI

```bash
cd evaluator
cargo run -- batch -p test.csv -f window.eval -n 1 --legacy
```

HTTP batch (default, no `--legacy`) still talks to `EVALUATOR_URL` / `--gateway`.

## Relation to production

| Piece         | Here (`legacy/`)   | Production                                 |
| ------------- | ------------------ | ------------------------------------------ |
| Browser API   | Puppeteer only     | Playwright default / Puppeteer optional    |
| Entry         | `evaluate.js`      | `PlaywrightEngine` / `PuppeteerEngine`     |
| Hook template | `eval.template.js` | `libs/util/puppeteer/.../eval.template.ts` |
| Orchestration | one Node process   | Nest gateway + optional Rust/MCP clients   |
