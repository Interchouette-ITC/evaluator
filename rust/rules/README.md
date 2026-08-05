# Malware signature rules

Payload filtering (`evaluator … --rules PATH`) uses the same text format as **Willem de Groot**’s [magento-malware-scanner](https://github.com/gwillem/magento-malware-scanner).

## Attribution

Rules in this directory are copied from Willem’s project for offline use. Credit and upstream sources:

| Local file | Upstream |
| --- | --- |
| [`frontend.txt`](./frontend.txt) | [rules/frontend.txt](https://github.com/gwillem/magento-malware-scanner/blob/master/rules/frontend.txt) |
| (not vendored here) | [rules/backend.txt](https://github.com/gwillem/magento-malware-scanner/blob/master/rules/backend.txt) — PHP/server filesystem signatures; not used by the hooked-function CLI filter |

Project: [gwillem/magento-malware-scanner](https://github.com/gwillem/magento-malware-scanner) © Willem de Groot.

If you refresh or edit a copied rule file, keep the citation header at the top of that file and note the date / what changed.

## How the CLI applies `frontend.txt`

The Rust filter parses `# rule_name` blocks, then literal lines and `/regex/` lines. Small runtime adaptations (not silent rewrites of Willem’s intent):

- `\xHH` in literals is decoded to the corresponding byte/char (as in the scanner’s literal form).
- YARA-style `{,N}` quantifiers are rewritten to Rust `{0,N}`.
- Regexes the `regex` crate cannot compile are **skipped with a warning** (e.g. `md5_mage_storage_pw_js`); they need a deliberate rework before they fire.

Some upstream literals are intentionally broad (e.g. hex for `querySelectorAll`) and will false-positive on benign modern JS. Prefer tighter `-s` / `--regex` when scanning live stores, or trim rules when you rework a local copy.

`backend.txt` targets Magento PHP malware on disk — out of scope for browser hook payloads.
