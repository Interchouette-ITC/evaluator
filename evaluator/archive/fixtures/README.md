# Demo fixtures

| Demo | File | What it is | What you should see |
| --- | --- | --- | --- |
| **1** | [`demo1shop.html`](./demo1shop.html) | Blogspot packer → `eval` → **simpleCart** cleartext | `-s checkout,cart` on library keys (`checkout:{type:"PayPal"}`, `cart…`). Proves hook+filter. **Not** Grelos URL sniffing. |
| **2** | [`demo2grelos.html`](./demo2grelos.html) | Inert `eval` of `var grelos_v = {…}` | `-s grelos_v` → `match: keyword:grelos_v` |
| — | [`demo1shop-blogspot-raw.html`](./demo1shop-blogspot-raw.html) | Raw Blogspot dump (provenance) | Do not scan — `results: none` |

**Canary** (elsewhere): W3Schools `tryjsref_eval` → `x * y`.

## Warnings

Localhost only. No Nest/Express/Docker public routes. See [`../../MAGECART.md`](../../MAGECART.md).

## Serve + scan

```bash
cd evaluator/archive/fixtures
python3 -m http.server 8765
```

```bash
# Shop packer demo (simpleCart strings — not Magecart URL sniffing)
evaluator --legacy evaluate \
  --url http://127.0.0.1:8765/demo1shop.html \
  --fn window.eval \
  -s checkout,onepage,cart,grelos_v \
  --excerpt

# Grelos marker demo
evaluator --legacy evaluate \
  --url http://127.0.0.1:8765/demo2grelos.html \
  --fn window.eval \
  -s grelos_v \
  --excerpt
```

`--excerpt` prints **one snippet per matching keyword/rule** (not one giant dump). Omit it only if you want full payloads.

Smoke both demos (starts its own server if needed):

```bash
./smoke-demos.sh
```

## Matching: are we matching “all”?

With `-s checkout,onepage,cart,grelos_v`, **every** keyword that appears in a payload is listed (`match: keyword:…`). With `--excerpt`, each label gets its **own** short window around that needle — so `checkout` and `cart` no longer share one confusing snippet.

`grelos_v` will **not** hit on `demo1shop.html` (that cleartext is simpleCart, not Grelos). Use `demo2grelos.html` for that string.

## Why `demo1shop` looks “nasty” but isn’t skimmer logic

The Blogspot page hex-packs a normal old **simpleCart** script and feeds it to `eval`. Keywords match things like:

```text
m={checkout:{type:"PayPal",email:"you@yours.com"},…,cart…
```

That is shopping-cart library config, not `RegExp('onepage|checkout')` skimmer gating. Still a useful **demo of obfuscation → eval → filter**. For a Grelos-shaped marker, use `demo2grelos.html` (inert; cites [Zone.ee](https://www.zone.ee/blogi/tuntud-veebipoode-nakatanud-pahavara-luubi/) / [Willem](https://github.com/gwillem/magento-malware-scanner/blob/master/rules/frontend.txt) / [Malpedia](https://malpedia.caad.fkie.fraunhofer.de/details/js.grelos)).
