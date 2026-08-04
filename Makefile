.PHONY: help \
	build build-release check install clean run \
	docker-build docker-build-fast docker-build-no-cache docker-build-dev \
	docker-build-tools docker-build-tools-dev \
	docker-push-dev docker-push-dev-hub docker-push-dev-ghcr-personal docker-push-dev-ghcr-itc \
	docker-push-tools-dev-hub docker-push-tools-dev-ghcr-personal docker-push-tools-dev-ghcr-itc \
	docker-push-release docker-push-release-hub \
	docker-push-release-ghcr-personal docker-push-release-ghcr-itc \
	docker-pull-dev docker-run docker-run-detached docker-run-dev docker-stop docker-inspect \
	docker-run-cli docker-run-mcp docker-run-mcp-http \
	version-show

# evaluator - developer targets

APP_NAME ?= evaluator
HUB_IMAGE ?= interchouette/evaluator
GHCR_PERSONAL_IMAGE ?= ghcr.io/groussac/evaluator
GHCR_ORG_IMAGE ?= ghcr.io/interchouette-itc/evaluator
TAG ?= latest
APP_VERSION ?= $(shell node -p "require('./package.json').version")
DOCKERFILE ?= docker/Dockerfile
DOCKERFILE_RUNTIME ?= docker/Dockerfile.runtime
DOCKERFILE_TOOLS ?= docker/Dockerfile.tools
DOCKER_BUILDKIT ?= 1
CI ?= 0
COMPOSE_PROD ?= docker/docker-compose.yml

# Optional Chromium-free slim image (not published by CI)
TOOLS_HUB_IMAGE ?= interchouette/evaluator-tools
TOOLS_GHCR_PERSONAL ?= ghcr.io/groussac/evaluator-tools
TOOLS_GHCR_ORG ?= ghcr.io/interchouette-itc/evaluator-tools

# Host Rust CLI (./evaluator) — same shape as tvscreener-rs / kms
unexport CARGO_TARGET_DIR
CARGO_BIN ?= cargo
CARGO = env -u CARGO_TARGET_DIR $(CARGO_BIN)
CLI_MANIFEST ?= evaluator/Cargo.toml
CLI_BIN ?= evaluator

.DEFAULT_GOAL := help

help:
	@echo "evaluator targets"
	@echo ""
	@echo "Host CLI (no Docker):"
	@echo "  make build             cargo build −> evaluator/target/debug/evaluator"
	@echo "  make build-release     cargo build --release"
	@echo "  make install           cargo install --path evaluator (puts evaluator on PATH)"
	@echo "  make run ARGS='…'      cargo run -- …  (default: --help)"
	@echo "                         e.g. make run ARGS='batch -p archive/test.csv -f window.eval -n 1 --legacy'"
	@echo "  make check / clean"
	@echo "  (--legacy needs: npm ci at repo root + Chromium / PUPPETEER_EXECUTABLE_PATH)"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-pull-dev       Pull Hub :dev (preferred local test)"
	@echo "  make docker-run            Web :4000 + MCP HTTP :8788 (ENABLE_MCP=1)"
	@echo "  make docker-run-detached   Same, detached"
	@echo "  make docker-build-dev      All-in-one build + :dev + :latest tags (CI)"
	@echo "  make docker-build          All-in-one :$(TAG) + :$(APP_VERSION)"
	@echo "  make docker-build-fast     Optional: host npm run build + package (web-only)"
	@echo "  make docker-run-cli        ARGS='-p /data/archive/test.csv -n 1' (needs gateway up)"
	@echo "  make docker-run-mcp        MCP stdio against local :4000"
	@echo "  make docker-stop"
	@echo "  make version-show"
	@echo ""
	@echo "Images: $(HUB_IMAGE) | $(GHCR_ORG_IMAGE)"
	@echo "Overrides: HUB_IMAGE=... APP_VERSION=... CI=0|1 TAG=... ARGS=..."

# --- Host Rust CLI ---

build:
	$(CARGO) build --manifest-path $(CLI_MANIFEST)

build-release:
	$(CARGO) build --manifest-path $(CLI_MANIFEST) --release

check:
	$(CARGO) check --manifest-path $(CLI_MANIFEST)

install:
	$(CARGO) install --path evaluator --force

clean:
	$(CARGO) clean --manifest-path $(CLI_MANIFEST)

run:
	cd evaluator && $(CARGO) run -- $(if $(strip $(ARGS)),$(ARGS),--help)
version-show:
	@echo "package.json version: $(APP_VERSION)"
	@echo "suggested tags: $(HUB_IMAGE):$(APP_VERSION) $(HUB_IMAGE):latest $(HUB_IMAGE):dev"

docker-build:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull \
		-t $(APP_NAME):$(TAG) \
		-t $(HUB_IMAGE):$(TAG) \
		-t $(HUB_IMAGE):$(APP_VERSION) \
		-f $(DOCKERFILE) \
		.

docker-build-fast:
	@test -d dist/evaluator/browser -a -f dist/evaluator/server/server.js -a -f dist/apps/evaluator-backend/main.js \
		|| { echo "Missing dist — run: npm run build"; exit 1; }
	@rm -rf .docker-fast-context
	@mkdir -p .docker-fast-context/docker
	@cp package.json package-lock.json .docker-fast-context/
	@cp -a dist .docker-fast-context/
	@cp docker/serve.mjs .docker-fast-context/docker/serve.mjs
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build \
		-t $(APP_NAME):$(TAG) \
		-t $(HUB_IMAGE):$(TAG) \
		-t $(HUB_IMAGE):$(APP_VERSION) \
		-f $(DOCKERFILE_RUNTIME) \
		.docker-fast-context
	@rm -rf .docker-fast-context

docker-build-no-cache:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull --no-cache \
		-t $(APP_NAME):$(TAG) \
		-t $(HUB_IMAGE):$(TAG) \
		-t $(HUB_IMAGE):$(APP_VERSION) \
		-f $(DOCKERFILE) \
		.

docker-build-dev:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull \
		-t $(APP_NAME):dev \
		-t $(APP_NAME):latest \
		-t $(HUB_IMAGE):dev \
		-t $(HUB_IMAGE):latest \
		-t $(GHCR_PERSONAL_IMAGE):dev \
		-t $(GHCR_PERSONAL_IMAGE):latest \
		-t $(GHCR_ORG_IMAGE):dev \
		-t $(GHCR_ORG_IMAGE):latest \
		-f $(DOCKERFILE) \
		.

# Optional slim CLI+MCP (no Chromium) — not published by CI
docker-build-tools:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull \
		-t $(APP_NAME)-tools:$(TAG) \
		-t $(TOOLS_HUB_IMAGE):$(TAG) \
		-t $(TOOLS_GHCR_PERSONAL):$(TAG) \
		-t $(TOOLS_GHCR_ORG):$(TAG) \
		-f $(DOCKERFILE_TOOLS) \
		.

docker-build-tools-dev:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull \
		-t $(APP_NAME)-tools:dev \
		-t $(APP_NAME)-tools:latest \
		-t $(TOOLS_HUB_IMAGE):dev \
		-t $(TOOLS_HUB_IMAGE):latest \
		-t $(TOOLS_GHCR_PERSONAL):dev \
		-t $(TOOLS_GHCR_PERSONAL):latest \
		-t $(TOOLS_GHCR_ORG):dev \
		-t $(TOOLS_GHCR_ORG):latest \
		-f $(DOCKERFILE_TOOLS) \
		.

docker-push-tools-dev-hub:
	docker push $(TOOLS_HUB_IMAGE):dev
	docker push $(TOOLS_HUB_IMAGE):latest

docker-push-tools-dev-ghcr-personal:
	docker push $(TOOLS_GHCR_PERSONAL):dev
	docker push $(TOOLS_GHCR_PERSONAL):latest

docker-push-tools-dev-ghcr-itc:
	docker push $(TOOLS_GHCR_ORG):dev
	docker push $(TOOLS_GHCR_ORG):latest

docker-push-dev-hub:
	docker push $(HUB_IMAGE):dev
	docker push $(HUB_IMAGE):latest

docker-push-dev-ghcr-personal:
	docker push $(GHCR_PERSONAL_IMAGE):dev
	docker push $(GHCR_PERSONAL_IMAGE):latest

docker-push-dev-ghcr-itc:
	docker push $(GHCR_ORG_IMAGE):dev
	docker push $(GHCR_ORG_IMAGE):latest

docker-push-dev:
	@if [ "$(CI)" = "1" ]; then \
		echo "Use docker-push-dev-hub / docker-push-dev-ghcr-personal / docker-push-dev-ghcr-itc in CI"; \
		exit 1; \
	fi
	@echo "Logging in to Docker Hub..."; \
	docker login || { echo "Docker Hub login failed"; exit 1; }
	$(MAKE) docker-push-dev-hub
	@echo "Logging in to GHCR (personal)..."; \
	docker login ghcr.io || { echo "Skipping personal GHCR"; exit 0; }
	$(MAKE) docker-push-dev-ghcr-personal
	@echo "Logging in to GHCR (org)..."; \
	docker login ghcr.io || { echo "Skipping org GHCR"; exit 0; }
	$(MAKE) docker-push-dev-ghcr-itc

docker-push-release-hub:
	docker push $(HUB_IMAGE):$(APP_VERSION)
	docker push $(HUB_IMAGE):latest

docker-push-release-ghcr-personal:
	docker tag $(HUB_IMAGE):$(APP_VERSION) $(GHCR_PERSONAL_IMAGE):$(APP_VERSION)
	docker tag $(HUB_IMAGE):latest $(GHCR_PERSONAL_IMAGE):latest
	docker push $(GHCR_PERSONAL_IMAGE):$(APP_VERSION)
	docker push $(GHCR_PERSONAL_IMAGE):latest

docker-push-release-ghcr-itc:
	docker tag $(HUB_IMAGE):$(APP_VERSION) $(GHCR_ORG_IMAGE):$(APP_VERSION)
	docker tag $(HUB_IMAGE):latest $(GHCR_ORG_IMAGE):latest
	docker push $(GHCR_ORG_IMAGE):$(APP_VERSION)
	docker push $(GHCR_ORG_IMAGE):latest

docker-push-release: docker-push-release-hub docker-push-release-ghcr-personal docker-push-release-ghcr-itc

docker-pull-dev:
	docker pull $(HUB_IMAGE):dev
	docker tag $(HUB_IMAGE):dev $(APP_NAME):dev
	docker tag $(HUB_IMAGE):dev $(HUB_IMAGE):latest
	docker tag $(HUB_IMAGE):dev $(APP_NAME):latest

docker-run:
	docker compose -f $(COMPOSE_PROD) --profile web down --remove-orphans 2>/dev/null || true
	docker rm -f $(APP_NAME) 2>/dev/null || true
	docker compose -f $(COMPOSE_PROD) --profile web up --force-recreate --pull always

docker-run-detached:
	docker compose -f $(COMPOSE_PROD) --profile web down --remove-orphans 2>/dev/null || true
	docker rm -f $(APP_NAME) 2>/dev/null || true
	docker compose -f $(COMPOSE_PROD) --profile web up -d --force-recreate --pull always

docker-run-dev:
	@echo "Starting evaluator (foreground, compose --build). UI: http://localhost:4000 MCP: :8788"
	@echo "Prefer: make docker-pull-dev && make docker-run"
	docker compose -f $(COMPOSE_PROD) --profile web down --remove-orphans 2>/dev/null || true
	docker rm -f $(APP_NAME) 2>/dev/null || true
	docker compose -f $(COMPOSE_PROD) --profile web up --build --force-recreate

docker-run-cli:
	docker run --rm --network host \
		-e EVALUATOR_URL=http://127.0.0.1:4000 \
		-v $(CURDIR)/evaluator:/data:ro \
		$(HUB_IMAGE):dev evaluator $(ARGS)

docker-run-mcp:
	docker run --rm -i --network host \
		-e EVALUATOR_URL=http://127.0.0.1:4000 \
		$(HUB_IMAGE):dev mcp

docker-run-mcp-http:
	@echo "MCP HTTP is published on :8788 when ENABLE_MCP=1 (default with make docker-run)"
	@echo "Or: docker run --rm -p 8788:8788 -e EVALUATOR_URL=http://host.docker.internal:4000 $(HUB_IMAGE):dev mcp --http"

docker-stop:
	docker compose -f $(COMPOSE_PROD) --profile web down --remove-orphans
	docker rm -f $(APP_NAME) 2>/dev/null || true

docker-inspect:
	docker image inspect $(HUB_IMAGE):$(TAG)
