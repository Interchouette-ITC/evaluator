# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Docs live under [`docs/`](.) (`README.md`, this changelog); Docker Hub Overview maintained privately in `.cursor/scripts/DOCKERHUB.md`
- Runtime SQLite default path is `db/database.db` (Docker: `/app/db/database.db`)

## [1.0.0] - 2026-08

First Interchouette / ITC packaging line for the modernized monorepo (`package.json` / `evaluator/Cargo.toml` `1.0.0`).

### Added

- All-in-one Docker image `interchouette/evaluator` (Angular SPA + Nest API + Node serve/evaluate/batch + Chromium + Rust CLI + Rust MCP)
- Rust CLI (`evaluator`): interactive prompt, one-shot `evaluate`, CSV `batch`
- Rust MCP (`evaluator-mcp`, mcpkit): tools `evaluate`, `list_functions`, `batch` (stdio / Streamable HTTP)
- Express `/mcp` proxy with dedicated basic auth (`MCP_USER` / `MCP_PWD`); public demo boat defaults
- Playwright as default evaluate engine; `USE_PUPPETEER=1` to opt into Puppeteer
- Magecart / Grelos teaching fixtures (`demo1`–`demo3`) and product notes
- Hooked-function payload filters: keywords, regex, Willem frontend rules; `--excerpt` snippets
- Host Make targets for Rust CLI/MCP (`make build` / `run` / `install` / `run-mcp` / `run-mcp-http`)
- CI: `ci.yml`, manual `docker-build-push-dev.yml`, GitHub Release `release.yml` (Hub + GHCR; attach CLI/MCP binaries; optional Render deploy hook)
- GPL-3.0-or-later `LICENSE`

### Changed

- Default MCP HTTP port **9790** (was 9788, earlier 8788)
- Dropped separate `evaluator-base` / `evaluator-tools` images; one monolith image
- Node 24+ / Actions majors refreshed; Docker Rust builder 1.88; Node image `node:26-trixie-slim`
- Live deployment pointed at [evaluator.interchouette.net](https://evaluator.interchouette.net)

### Removed

- Public repo `docker/DOCKERHUB.md` (Hub description synced from private `.cursor/scripts`)

[Unreleased]: https://github.com/Interchouette-ITC/evaluator/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Interchouette-ITC/evaluator/releases/tag/v1.0.0
