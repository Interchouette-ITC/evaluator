# evaluator

Evaluate JavaScript function calls on live web pages (e.g. `window.eval`, `String.fromCharCode`) with Puppeteer/Chromium. Useful for inspecting obfuscated front-end malware patterns.

## Quick start

```bash
docker pull interchouette/evaluator:dev
docker run --rm -p 4000:4000 interchouette/evaluator:dev
```

Open http://localhost:4000/

API example:

```
http://localhost:4000/evaluate/?url=https://www.w3schools.com/jsref/tryit.asp?filename=tryjsref_eval&function=window.eval
```

## Tags

| Tag | Meaning |
| --- | --- |
| `dev` | Latest successful CI build from the `dev` branch |
| `latest` / `X.Y.Z` | Release images (GitHub Release) |

## Also on GHCR

- `ghcr.io/interchouette-itc/evaluator`
- `ghcr.io/groussac/evaluator` (optional mirror)

Source: https://github.com/Interchouette-ITC/evaluator
