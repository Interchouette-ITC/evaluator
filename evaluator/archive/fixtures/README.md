# Demos

| # | Obfuscated (run this) | Deobfuscated (read this) | Role |
| --- | --- | --- | --- |
| **1** | [`demo1shop.html`](./demo1shop.html) | [`demo1shop.deobfuscated.js`](./demo1shop.deobfuscated.js) | Neutral shop JS; historical `_0xd419` hex packer |
| **2** | [`demo2grelos.html`](./demo2grelos.html) | [`demo2grelos.deobfuscated.js`](./demo2grelos.deobfuscated.js) | Grelos marker; light teaching packer (`fromCharCode`) |
| **3** | [`demo3grelos.html`](./demo3grelos.html) | [`demo3grelos.deobfuscated.js`](./demo3grelos.deobfuscated.js) | Grelos marker; Magento-era `_0x` hex-table → `eval` (same family as demo 1) |

All three hide the payload until `eval`. The `.deobfuscated.js` files are that payload.

Canary (elsewhere): W3Schools `tryjsref_eval`.  
Raw Blogspot dump (do not scan): [`demo1shop-blogspot-raw.html`](./demo1shop-blogspot-raw.html).

## Run

```bash
cd evaluator/archive/fixtures
python3 -m http.server 8765
```

```bash
evaluator evaluate --url http://127.0.0.1:8765/demo1shop.html --fn window.eval -s checkout,cart --excerpt
evaluator evaluate --url http://127.0.0.1:8765/demo2grelos.html --fn window.eval -s grelos_v --excerpt
evaluator evaluate --url http://127.0.0.1:8765/demo3grelos.html --fn window.eval -s grelos_v --excerpt
```

```bash
./smoke-demos.sh
```

More detail: [`DEOBFUSCATED.md`](./DEOBFUSCATED.md).
