# Magecart, Grelos, and evaluator

## Warnings

- **Authorized research only.** Use evaluator against sites you own or have explicit permission to test.
- The Blogspot fixture under [`archive/fixtures/`](./archive/fixtures/) is a **historical malware research sample** (obfuscated skimmer-style JavaScript). Serve it only on **localhost** with a simple static server. Do **not** expose it through Nest, Express, the Docker public image, or any internet-facing route.
- Antivirus / GitHub secret and malware scanners may flag raw skimmer blobs. That is expected for this class of sample.
- Fetching live research pages over Tor is for list/source retrieval when needed; scanning shops themselves stays on clearnet unless you have a deliberate reason not to.
- If you confirm a live compromise, report it responsibly to the merchant / hoster (see also Segura VB2021 on raising awareness).

## What is Magecart?

**Magecart** is the umbrella name (coined by RiskIQ; a play on *Magento* + shopping cart) for **JavaScript credit-card skimmers** injected into online stores. Jérôme Segura describes them as the digital equivalent of ATM skimming: malicious JS on a checkout page steals payment data as the shopper types it, then exfiltrates it to a criminal-controlled **gate**.

Primary reference for this write-up:

- Jérôme Segura (Malwarebytes), *Hunting web skimmers with VirusTotal and YARA*, Virus Bulletin VB2021, 7–8 October 2021.  
  PDF: [https://vblocalhost.com/uploads/VB2021-Segura.pdf](https://vblocalhost.com/uploads/VB2021-Segura.pdf)

Typical skimmer behaviour (from that paper):

1. Decide whether the current page is checkout (`onepage`, `checkout`, cart flows, …).
2. Avoid or detect debugging (devtools checks are common heuristics).
3. Poll or hook payment form fields.
4. Send captured data to a gate URL.

HTTPS does not stop this: the theft happens **in the browser** while data sits in form fields, before it is submitted to the merchant.

Families are often named after cleartext markers that appear once obfuscation is peeled back. Segura notes that the **Grelos** skimmer was named after `var grelos_v`. Keywords such as `checkout`, `onepage`, `cart`, and `grelos_v` therefore show up both in hunting literature and in signature packs.

## Willem’s signatures and this product

Willem de Groot’s [magento-malware-scanner](https://github.com/gwillem/magento-malware-scanner) ships frontend rules that match known skimmer strings and regexes, including a `grelos_v` block:

- [rules/frontend.txt](https://github.com/gwillem/magento-malware-scanner/blob/master/rules/frontend.txt)
- Local cited snapshot: [`rules/frontend.txt`](./rules/frontend.txt) (see [`rules/README.md`](./rules/README.md))

Those rules are excellent for **static** content (files on disk, CMS dumps, VT samples). Segura’s VB2021 pipeline is another static/hunt path: VirusTotal labels + YARA + gate extraction.

**Evaluator** is the complementary **runtime** tool: it drives a real browser, hooks a chosen JS function (`-f`, often `window.eval`), and prints the **arguments** that pass through that hook. After obfuscators call `eval`, those arguments are frequently **cleartext** — exactly where `grelos_v` and checkout markers become visible.

```text
compromised page → obfuscated JS → window.eval(cleartext) → evaluator hook → filter (-s / --regex / --rules)
```

## Mini tutorial: canary vs demo

### Canary = W3Schools (hook smoke test)

```bash
evaluator evaluate \
  --url 'https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval' \
  --fn window.eval
# expect a payload like: x * y
```

### Demos (`archive/fixtures/`)

| # | Obfuscated | Deobfuscated | Role |
| --- | --- | --- | --- |
| 1 | `demo1shop.html` | `demo1shop.deobfuscated.js` | Neutral shop JS; historical `_0xd419` hex packer |
| 2 | `demo2grelos.html` | `demo2grelos.deobfuscated.js` | Grelos marker; light teaching packer |
| 3 | `demo3grelos.html` | `demo3grelos.deobfuscated.js` | Grelos marker; Magento-era `_0x` hex-table → `eval` |

```bash
cd evaluator/archive/fixtures && python3 -m http.server 8765
# or: ./smoke-demos.sh
```

```bash
evaluator evaluate --url http://127.0.0.1:8765/demo1shop.html --fn window.eval -s checkout,cart --excerpt
evaluator evaluate --url http://127.0.0.1:8765/demo2grelos.html --fn window.eval -s grelos_v --excerpt
evaluator evaluate --url http://127.0.0.1:8765/demo3grelos.html --fn window.eval -s grelos_v --excerpt
```

See [`archive/fixtures/README.md`](./archive/fixtures/README.md) and [`archive/fixtures/DEOBFUSCATED.md`](./archive/fixtures/DEOBFUSCATED.md).

### Batch

```bash
evaluator batch -p evaluator/archive/test.csv -f window.eval -n 1
```

```bash
evaluator batch -p evaluator/archive/All-Live-Magento-Sites.csv \
  -f window.eval -n 2 \
  --rules evaluator/rules/frontend.txt
```

## How this fits together

| Approach | What it sees | Strength |
| --- | --- | --- |
| Willem frontend/backend rules | File / CMS / static JS | Fast signature match on disk |
| Segura VB2021 (VT + YARA) | Submitted HTML/JS corpus, gates | Hunt infrastructure at scale |
| **Evaluator** | Live hooked call arguments | Sees post-`eval` cleartext in a real browser |

Same threat story: Magecart-style skimmers hide behind obfuscation; evaluator is built to **chase the deobfuscated moment** and optionally filter with Willem’s markers (`grelos_v`, checkout literals, …).
