.PHONY: help \
	build build-release check check-lib install clean run run-mcp run-mcp-http \
	docker-build docker-build-no-cache docker-build-dev \
	docker-push-dev docker-push-dev-hub docker-push-dev-ghcr-personal docker-push-dev-ghcr-itc \
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
DOCKER_BUILDKIT ?= 1
CI ?= 0
COMPOSE_PROD ?= docker/docker-compose.yml

# Host Rust CLI / MCP — same shape as tvscreener-rs
unexport CARGO_TARGET_DIR
CARGO_BIN ?= cargo
CARGO = env -u CARGO_TARGET_DIR $(CARGO_BIN)
CARGO_FLAGS ?= --features apps
CLI_MANIFEST ?= evaluator/Cargo.toml
CLI_BIN ?= evaluator

.DEFAULT_GOAL := help

help:
	@echo "evaluator targets"
	@echo ""
	@echo "Host CLI / MCP (no Docker):"
	@echo "  make build             cargo build $(CARGO_FLAGS) → evaluator + evaluator-mcp"
	@echo "  make build-release     cargo build --release $(CARGO_FLAGS)"
	@echo "  make check / check-lib cargo check (apps) / lean lib"
	@echo "  make install           cargo install --path evaluator --features apps"
	@echo "  make run ARGS='…'      cargo run --bin evaluator --features apps -- …"
	@echo "                         e.g. make run ARGS='evaluate --url http://127.0.0.1:8765/demo1shop.html --fn window.eval'"
	@echo "  make run-mcp           cargo run --bin evaluator-mcp (stdio)"
	@echo "  make run-mcp-http      cargo run --bin evaluator-mcp -- --http"
	@echo "  (needs: npm run build + Chromium / PUPPETEER_EXECUTABLE_PATH)"
	@echo ""
	@echo "Docker:"
	@echo "  make docker-pull-dev       Pull Hub :dev (preferred local test)"
	@echo "  make docker-run            Web :4000 + MCP HTTP :9788 (ENABLE_MCP=1)"
	@echo "  make docker-run-detached   Same, detached"
	@echo "  make docker-build-dev      All-in-one build + :dev + :latest tags (CI)"
	@echo "  make docker-build          All-in-one :$(TAG) + :$(APP_VERSION)"
	@echo "  make docker-run-cli        ARGS='evaluate --url …' or 'batch -p /data/…'"
	@echo "  make docker-run-mcp        MCP stdio (Rust evaluator-mcp)"
	@echo "  make docker-stop"
	@echo "  make version-show"
	@echo ""
	@echo "Images: $(HUB_IMAGE) | $(GHCR_ORG_IMAGE)"
	@echo "Overrides: HUB_IMAGE=... APP_VERSION=... CI=0|1 TAG=... ARGS=..."

# --- Host Rust CLI / MCP ---

build:
	$(CARGO) build --manifest-path $(CLI_MANIFEST) $(CARGO_FLAGS)

build-release:
	$(CARGO) build --manifest-path $(CLI_MANIFEST) --release $(CARGO_FLAGS)

check:
	$(CARGO) check --manifest-path $(CLI_MANIFEST) --all-targets $(CARGO_FLAGS)

check-lib:
	$(CARGO) check --manifest-path $(CLI_MANIFEST) --lib

install:
	$(CARGO) install --path evaluator --force --features apps

clean:
	$(CARGO) clean --manifest-path $(CLI_MANIFEST)

run:
	cd evaluator && $(CARGO) run $(CARGO_FLAGS) --bin $(CLI_BIN) -- $(if $(strip $(ARGS)),$(ARGS),--help)

run-mcp:
	cd evaluator && $(CARGO) run $(CARGO_FLAGS) --bin evaluator-mcp -- $(ARGS)

run-mcp-http:
	cd evaluator && $(CARGO) run $(CARGO_FLAGS) --bin evaluator-mcp -- --http $(ARGS)

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
	@echo "Starting evaluator (foreground, compose --build). UI: http://localhost:4000 MCP: :9788"
	@echo "Prefer: make docker-pull-dev && make docker-run"
	docker compose -f $(COMPOSE_PROD) --profile web down --remove-orphans 2>/dev/null || true
	docker rm -f $(APP_NAME) 2>/dev/null || true
	docker compose -f $(COMPOSE_PROD) --profile web up --build --force-recreate

docker-run-cli:
	docker run --rm --network host \
		-v $(CURDIR)/evaluator:/data:ro \
		$(HUB_IMAGE):dev evaluator $(ARGS)

docker-run-mcp:
	docker run --rm -i --network host \
		$(HUB_IMAGE):dev mcp

docker-run-mcp-http:
	@echo "MCP HTTP is published on :9788 when ENABLE_MCP=1 (default with make docker-run)"
	@echo "Or: docker run --rm -p 9788:9788 $(HUB_IMAGE):dev mcp --http"

docker-stop:
	docker compose -f $(COMPOSE_PROD) --profile web down --remove-orphans
	docker rm -f $(APP_NAME) 2>/dev/null || true

docker-inspect:
	docker image inspect $(HUB_IMAGE):$(TAG)
