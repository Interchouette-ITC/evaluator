# Evaluator

**Catch the cleartext the moment obfuscated JavaScript unpacks in a real browser.**

Evaluator drives Chromium, hooks a JS function you choose (`window.eval`, `String.fromCharCode`, `JSON.stringify`, …), and prints the **arguments** that pass through that hook — often the deobfuscated payload Magecart-style skimmers hide until runtime.

```text
compromised / demo page
        │
        ▼
  obfuscated JS  ──packs──▶  window.eval(cleartext)
        │                              │
        │                              ▼
        │                    evaluator hook + optional filter
        │                    (-s / --regex / --rules)
        ▼
   screenshots + payloads you can read
```

| You get | It solves |
| --- | --- |
| Live **web UI** + screenshot stream | “What did this page actually `eval`?” |
| **Rust CLI** (spawns Node evaluate/batch) | Batch / interactive hunts without guessing at packed source |
| **Rust MCP** tools for agents | Same evaluate path from Cursor / automation |
| Local **demo fixtures** + Willem rules | Reproduce the VB2021 story on localhost before you touch live shops |

**Live:** [https://evaluator.interchouette.net](https://evaluator.interchouette.net)

Typically helps with deobfuscating patterns like [this Stack Overflow case](https://stackoverflow.com/questions/32977908/how-can-i-deobfuscate-this-javascript) using `String.fromCharCode`, `window.eval`, or other functions like `JSON.stringify`.

---

## The story (why this exists)

Static scanners (Willem’s rules, VT + YARA) see files on disk. Skimmers often stay opaque until the browser runs them. **Evaluator is the complementary runtime tool:** after the packer calls `eval`, you see `grelos_v`, `checkout`, gate URLs, and friends in the hook output.

Full product notes (warnings, canary vs demos, batch): **[`evaluator/MAGECART.md`](evaluator/MAGECART.md)** — start there for Magecart / Grelos context.

### References

- Jérôme Segura (Malwarebytes), *Hunting web skimmers with VirusTotal and YARA*, VB2021 — [PDF](https://vblocalhost.com/uploads/VB2021-Segura.pdf)
- Product notes (Magecart / Grelos / Blogspot demo fixtures): [`evaluator/MAGECART.md`](evaluator/MAGECART.md)
- Astra — signs of hacked OpenCart / Magento / PrestaShop stores (malicious JS): [getastra.com article](https://www.getastra.com/e/malware/infections/the-presence-of-these-malicious-javascript-are-the-sign-of-hacked-opencart-magento-or-prestashop-store)
- Willem de Groot — magento-malware-scanner frontend rules: [`rules/frontend.txt`](https://github.com/gwillem/magento-malware-scanner/blob/master/rules/frontend.txt) (local snapshot: [`evaluator/rules/frontend.txt`](evaluator/rules/frontend.txt))

<details open>
<summary><strong>Screenshots</strong> — web UI in action</summary>

![Evaluator (18)](https://user-images.githubusercontent.com/3099551/200139269-a50b8a15-dbcd-4414-9848-7331cb0dd3c5.png)

![Evaluator (17)](https://user-images.githubusercontent.com/3099551/200139284-676f2ac4-042d-4de4-8b06-7f3345232996.png)

</details>

---

## Try it in 30 seconds

**Canary** (hook smoke test — W3Schools `eval`):

```bash
evaluator evaluate \
  --url 'https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval' \
  --fn window.eval
# expect a payload like: x * y
```

**Same idea in the browser** (production gateway):

```text
https://evaluator.interchouette.net/evaluate/?url=https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval&function=window.eval
```

---

## Demos — illustrate the PDF story on localhost

Research fixtures under [`evaluator/archive/fixtures/`](evaluator/archive/fixtures/). **Serve only on localhost.** Do **not** expose them through Nest, Express, the Docker public image, or any internet-facing route. Details: [`DEOBFUSCATED.md`](evaluator/archive/fixtures/DEOBFUSCATED.md), [`MAGECART.md`](evaluator/MAGECART.md).

| # | Obfuscated | Deobfuscated | What you learn |
| --- | --- | --- | --- |
| **1** | [`demo1shop.html`](evaluator/archive/fixtures/demo1shop.html) | [`demo1shop.deobfuscated.js`](evaluator/archive/fixtures/demo1shop.deobfuscated.js) | Neutral shop JS; historical `_0xd419` hex packer → `eval` → `checkout` / `cart` |
| **2** | [`demo2grelos.html`](evaluator/archive/fixtures/demo2grelos.html) | [`demo2grelos.deobfuscated.js`](evaluator/archive/fixtures/demo2grelos.deobfuscated.js) | Grelos-shaped marker; light teaching packer |
| **3** | [`demo3grelos.html`](evaluator/archive/fixtures/demo3grelos.html) | [`demo3grelos.deobfuscated.js`](evaluator/archive/fixtures/demo3grelos.deobfuscated.js) | Same marker; Magento-era `_0x` hex-table → `eval` (demo‑1 packing family) |

```bash
cd evaluator/archive/fixtures && python3 -m http.server 8765
# or: ./smoke-demos.sh
```

```bash
evaluator evaluate --url http://127.0.0.1:8765/demo1shop.html --fn window.eval -s checkout,cart --excerpt
evaluator evaluate --url http://127.0.0.1:8765/demo2grelos.html --fn window.eval -s grelos_v --excerpt
evaluator evaluate --url http://127.0.0.1:8765/demo3grelos.html --fn window.eval -s grelos_v --excerpt
```

Filter live/batch hits with keywords, regex, or Willem’s rules:

```bash
evaluator batch -p evaluator/archive/All-Live-Magento-Sites.csv \
  -f window.eval -n 1 \
  --rules evaluator/rules/frontend.txt
```

**Authorized research only.** If you confirm a live compromise, report it responsibly to the merchant / hoster.

---

<details>
<summary><strong>Architecture</strong></summary>

```text
Browser (Angular SPA)
    → Node serve :4000  (Express: static, WS evaluate, GET /evaluate)
        → Nest API :3333     (/api/functions)
        → Chromium via libs/util/puppeteer

Rust CLI / Rust MCP
    → spawn Node evaluate | batch  (same entry as serve; no :4000 required)
```

Image: `interchouette/evaluator` — web + Chromium + Rust CLI + Rust MCP.

Compose profile: `web` (ports `4000` + `8788`).

| Mode | Behavior |
| --- | --- |
| `web` / default | Nest + Node `serve` `:4000`; MCP HTTP sidecar if `ENABLE_MCP=1` |
| `ENABLE_MCP=0` | Web only |
| `mcp` | `evaluator-mcp` stdio |
| `mcp --http` | MCP HTTP only |
| `evaluator` / interactive | Rust prompt; spawn Node evaluate/batch |
| `evaluate` / `batch` | Rust → one Node child; no MCP sidecar |

How the pieces fit the hunt:

| Approach | What it sees | Strength |
| --- | --- | --- |
| Willem frontend/backend rules | File / CMS / static JS | Fast signature match on disk |
| Segura VB2021 (VT + YARA) | Submitted HTML/JS corpus, gates | Hunt infrastructure at scale |
| **Evaluator** | Live hooked call arguments | Sees post-`eval` cleartext in a real browser |

</details>

<details>
<summary><strong>API</strong> — Quick Start</summary>

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

</details>

<details>
<summary><strong>Docker</strong> — pull, run, build, CI/CD</summary>

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

Optional local packaging after `npm run build`: `make docker-build`.

CLI / MCP (built into the all-in-one image; CLI does **not** need web up):

```shell
# One-shot evaluate
make docker-run-cli ARGS='evaluate --url https://example.com --fn window.eval'
# CSV batch
make docker-run-cli ARGS='batch -p /data/archive/test.csv -n 1 -f window.eval'
# Interactive: docker run -it --rm --network host interchouette/evaluator:dev evaluator
make docker-run-mcp          # stdio (evaluator-mcp)
# MCP HTTP is published on :8788 with make docker-run (ENABLE_MCP=1)
```

### CI / CD

| Workflow | Trigger | What |
| --- | --- | --- |
| `ci.yml` | PR / push to `dev` | `npm ci` + `npm run build` |
| `docker-build-push-dev.yml` | manual | monolith `:dev` + `:latest` → Hub + GHCR; then Render via `RENDER_DEPLOY_HOOK` |
| `release.yml` | GitHub Release `vX.Y.Z` | attach host `evaluator` + `evaluator-mcp` binaries; push monolith `:X.Y.Z` + `:latest` → Hub + GHCR; Render redeploy |

Secret `RENDER_DEPLOY_HOOK` = full Render Deploy Hook URL (repo secret, not an app env). Without it, Hub still updates; Render stays on the old digests until a manual redeploy.

To publish a release: bump **both** `package.json` and `evaluator/Cargo.toml` to the same `X.Y.Z`, tag `vX.Y.Z`, create the GitHub Release. Workflow validates the tag against both versions.

</details>

<details>
<summary><strong>Development</strong> — host Node, build, test</summary>

## Prerequisites

- Node.js `>=24` on the host (CI/Docker use Node 26; agents must not install another)
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

</details>

<details>
<summary><strong>Rust CLI</strong> — host, no Docker required</summary>

Same shape as sibling ITC crates (`make build` / `make run` / `make install`):

```shell
make build              # → evaluator/target/debug/evaluator (+ evaluator-mcp)
make install            # → ~/.cargo/bin (features apps)
make run ARGS='evaluate --url http://127.0.0.1:8765/demo1shop.html --fn window.eval'
```

Needs `npm run build` (Node entry at `dist/evaluator/server/server.js`) + Chromium.

| Mode | Command |
| --- | --- |
| Interactive | `make run` or `evaluator` |
| One-shot | `evaluator evaluate --url … [--fn …]` |
| CSV batch | `evaluator batch -p archive/test.csv -f window.eval -n 1` |

See [evaluator/README.md](evaluator/README.md) for details.

</details>

<details open>
<summary><strong>MCP</strong> — agent tools + engine advice</summary>

Rust MCP (`evaluator-mcp`, mcpkit): tools `evaluate`, `list_functions`, and `batch` (`urls[]` and/or local CSV `path` with a `Domain` column; max 50 URLs). Tools spawn the shared Node entry — **no** `:4000` required. Large CSVs stay on the Rust CLI (`evaluator batch -p …`).

**Prefer MCP HTTP** over stdio (stdio pays a Docker spawn cost on cold start).

| Endpoint | Auth | When |
| --- | --- | --- |
| `http://127.0.0.1:8788/mcp` | none | Local sidecar (Docker `-p 8788:8788`) |
| `http://mcp:mcp@127.0.0.1:4000/mcp` | basic `MCP_USER`/`MCP_PWD` (defaults `mcp`/`mcp`) | Via Express proxy on the web port |
| `https://mcp:mcp@evaluator.interchouette.net/mcp` | same boat defaults | Public demo (Render: only web `PORT` is public; use `/mcp`, not `:8788`) |

Defaults are public by design for the shared demo. Override `MCP_USER`/`MCP_PWD` only for a **private** deploy and share creds out-of-band — do not reuse `DB_*`. Set `ENABLE_MCP_PROXY=0` to disable the gateway route.

Cursor HTTP example:

```json
{ "url": "https://mcp:mcp@evaluator.interchouette.net/mcp" }
```

```shell
make run-mcp-http          # host: evaluator-mcp --http (:8788)
make run-mcp               # host: stdio
make docker-run-mcp        # image stdio
```

### Engine and MCP advice (local bench)

Same page and hook: `JSON.stringify` on `https://cursor.com`. Warmup discarded; wall times to gateway `/evaluate` (what both MCP transports call). Stdio numbers below include a cold `docker run --rm` per call.

| Combo | Median | Notes |
| --- | ---: | --- |
| MCP HTTP + Playwright | ~9.5 s | **Recommended default** |
| MCP HTTP + Puppeteer | ~11.3 s | Opt in with `USE_PUPPETEER=1` |
| MCP stdio + Playwright | ~13.6 s | ~+4 s Docker spawn vs HTTP |
| MCP stdio + Puppeteer | ~15.6 s | Slowest of the four |

Takeaways:

1. Prefer **Playwright** (default; unset or `USE_PUPPETEER=0`).
2. Prefer **MCP HTTP** over stdio when available — same evaluate work, no spawn tax. Local `:8788` or proxied `https://mcp:mcp@host/mcp`.
3. Hit counts and screenshots were comparable across engines (~75–84 console hits).

</details>

---

## License

[GPL-3.0-or-later](https://www.gnu.org/licenses/gpl-3.0.html) — see [`LICENSE`](LICENSE).

### Security

### Errors

If you see typos or errors, open a pull request on the default working branch. Thanks.
