# evaluator-tools (optional slim image)

**Superseded** by the all-in-one [`interchouette/evaluator`](https://hub.docker.com/r/interchouette/evaluator) image (web + Chromium + Rust CLI + MCP). Live: [evaluator.interchouette.net](https://evaluator.interchouette.net).

Prefer:

```bash
docker pull interchouette/evaluator:dev
docker run -d -p 4000:4000 -p 8788:8788 interchouette/evaluator:dev
docker run --rm -i --network host -e EVALUATOR_URL=http://127.0.0.1:4000 \
  interchouette/evaluator:dev mcp
```

This repo still ships `docker/Dockerfile.tools` for a Chromium-free CLI/MCP-only build if you need it locally (`make docker-build-tools`); CI no longer publishes it as the primary story.
