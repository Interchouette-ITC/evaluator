# Obfuscated → deobfuscated

| Demo | Packer | Cleartext file |
| --- | --- | --- |
| 1 | `_0xd419` hex table → `eval` (historical Blogspot sample) | [`demo1shop.deobfuscated.js`](./demo1shop.deobfuscated.js) |
| 2 | decimal char-code array → `String.fromCharCode` → `eval` (teaching only) | [`demo2grelos.deobfuscated.js`](./demo2grelos.deobfuscated.js) |
| 3 | `_0x3f2a` hex-escape string table → `eval` (same Magento-era surface form as demo 1) | [`demo3grelos.deobfuscated.js`](./demo3grelos.deobfuscated.js) |

- **Demo 1** — neutral shop/template JS after unpack.
- **Demo 2** — same Grelos-shaped marker; packer is intentionally simple (not historical).
- **Demo 3** — same marker; packing matches the `_0x…=["\x.."]` → `eval` style used in Magento-era frontend injections (what demo 1’s packer belongs to).

## What demo 3 is / is not

**Is:** historical packing *style* + the hunting marker `var grelos_v` (Segura / Willem).

**Is not:** a vendored copy of a published full Grelos skimmer. We do not ship Affable Kraut’s [observed gist](https://gist.github.com/krautface/2c017f220f2a24141bdeb70f76e7e745) or RiskIQ’s multi-`base64` loader bodies — those are live skimmer code (forms / WebSockets / gates). Malpedia: [js.grelos](https://malpedia.caad.fkie.fraunhofer.de/details/js.grelos).

Static `grep grelos_v` on the `<script>` bodies of demos 2–3 should miss; the string appears after `eval` and in the `.deobfuscated.js` files.
