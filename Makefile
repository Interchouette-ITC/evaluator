# evaluator - developer targets

APP_NAME ?= evaluator
HUB_IMAGE ?= interchouette/evaluator
GHCR_PERSONAL_IMAGE ?= ghcr.io/groussac/evaluator
GHCR_ORG_IMAGE ?= ghcr.io/interchouette-itc/evaluator
TAG ?= latest
APP_VERSION ?= $(shell node -p "require('./package.json').version")
DOCKERFILE ?= docker/Dockerfile
DOCKERFILE_RUNTIME ?= docker/Dockerfile.runtime
DOCKERFILE_BASE ?= docker/Dockerfile.base
DOCKERFILE_TOOLS ?= docker/Dockerfile.tools
DOCKER_BUILDKIT ?= 1
CI ?= 0
COMPOSE_PROD ?= docker/docker-compose.yml

BASE_TAG ?= node26-trixie
BASE_HUB_IMAGE ?= interchouette/evaluator-base
BASE_GHCR_PERSONAL ?= ghcr.io/groussac/evaluator-base
BASE_GHCR_ORG ?= ghcr.io/interchouette-itc/evaluator-base
BASE_IMAGE ?= $(BASE_HUB_IMAGE):$(BASE_TAG)

TOOLS_HUB_IMAGE ?= interchouette/evaluator-tools
TOOLS_GHCR_PERSONAL ?= ghcr.io/groussac/evaluator-tools
TOOLS_GHCR_ORG ?= ghcr.io/interchouette-itc/evaluator-tools

.DEFAULT_GOAL := help

.PHONY: help \
	docker-build-base docker-push-base-hub docker-push-base-ghcr-personal docker-push-base-ghcr-itc \
	docker-build docker-build-fast docker-build-no-cache docker-build-dev \
	docker-build-tools \
	docker-push-dev docker-push-dev-hub docker-push-dev-ghcr-personal docker-push-dev-ghcr-itc \
	docker-push-release docker-push-release-hub \
	docker-push-release-ghcr-personal docker-push-release-ghcr-itc \
	docker-run docker-run-detached docker-run-dev docker-stop docker-inspect \
	docker-run-cli docker-run-mcp docker-run-mcp-http \
	version-show ensure-base

help:
	@echo "evaluator targets"
	@echo ""
	@echo "  make docker-build-base     Build Chromium base $(BASE_IMAGE) (infrequent)"
	@echo "  make docker-build-fast     Host npm run build + package image (minutes, not 30)"
	@echo "  make docker-build          Full in-Docker build (slow; CI/repro)"
	@echo "  make docker-build-dev      Build and tag :dev (Hub + GHCR names)"
	@echo "  make docker-build-tools    Build $(TOOLS_HUB_IMAGE):$(TAG) (CLI + MCP)"
	@echo "  make docker-push-dev       Push :dev (local interactive logins)"
	@echo "  make docker-push-release   Tag/push release images (CI uses split targets)"
	@echo "  make docker-run            Web stack foreground (profile web; no rebuild)"
	@echo "  make docker-run-detached   Web stack detached"
	@echo "  make docker-run-dev        Web foreground with compose --build"
	@echo "  make docker-run-cli ARGS='...'   One-shot CLI against web (needs web up)"
	@echo "  make docker-run-mcp        MCP stdio (docker -i)"
	@echo "  make docker-run-mcp-http   MCP HTTP on :8788"
	@echo "  make docker-stop"
	@echo "  make version-show"
	@echo ""
	@echo "Images: $(HUB_IMAGE) | $(BASE_IMAGE) | $(TOOLS_HUB_IMAGE)"
	@echo "Overrides: HUB_IMAGE=... BASE_IMAGE=... APP_VERSION=... CI=0|1 TAG=... ARGS=..."

version-show:
	@echo "package.json version: $(APP_VERSION)"
	@echo "suggested tags: $(HUB_IMAGE):$(APP_VERSION) $(HUB_IMAGE):latest $(HUB_IMAGE):dev"
	@echo "base: $(BASE_IMAGE)"

ensure-base:
	@docker image inspect $(BASE_IMAGE) >/dev/null 2>&1 || $(MAKE) docker-build-base

docker-build-base:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull \
		-t $(BASE_HUB_IMAGE):$(BASE_TAG) \
		-t $(BASE_GHCR_PERSONAL):$(BASE_TAG) \
		-t $(BASE_GHCR_ORG):$(BASE_TAG) \
		-f $(DOCKERFILE_BASE) \
		.

docker-push-base-hub:
	docker push $(BASE_HUB_IMAGE):$(BASE_TAG)

docker-push-base-ghcr-personal:
	docker push $(BASE_GHCR_PERSONAL):$(BASE_TAG)

docker-push-base-ghcr-itc:
	docker push $(BASE_GHCR_ORG):$(BASE_TAG)

docker-build: ensure-base
	# Do not --pull: BASE_IMAGE is often local-only until first Hub push.
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build \
		--build-arg BASE_IMAGE=$(BASE_IMAGE) \
		-t $(APP_NAME):$(TAG) \
		-t $(HUB_IMAGE):$(TAG) \
		-t $(HUB_IMAGE):$(APP_VERSION) \
		-f $(DOCKERFILE) \
		.

# Preferred local path: compile on host, Docker only packs dist + prod deps.
docker-build-fast: ensure-base
	@test -d dist/evaluator/browser -a -f dist/evaluator/server/server.js -a -f dist/apps/evaluator-backend/main.js \
		|| { echo "Missing dist — run: npm run build"; exit 1; }
	@rm -rf .docker-fast-context
	@mkdir -p .docker-fast-context/docker
	@cp package.json package-lock.json .docker-fast-context/
	@cp -a dist .docker-fast-context/
	@cp docker/serve.mjs .docker-fast-context/docker/serve.mjs
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build \
		--build-arg BASE_IMAGE=$(BASE_IMAGE) \
		-t $(APP_NAME):$(TAG) \
		-t $(HUB_IMAGE):$(TAG) \
		-t $(HUB_IMAGE):$(APP_VERSION) \
		-f $(DOCKERFILE_RUNTIME) \
		.docker-fast-context
	@rm -rf .docker-fast-context

docker-build-no-cache: ensure-base
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --no-cache \
		--build-arg BASE_IMAGE=$(BASE_IMAGE) \
		-t $(APP_NAME):$(TAG) \
		-t $(HUB_IMAGE):$(TAG) \
		-t $(HUB_IMAGE):$(APP_VERSION) \
		-f $(DOCKERFILE) \
		.

docker-build-dev: ensure-base
	# Do not --pull: CI builds base in-job; Hub may not have evaluator-base yet.
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build \
		--build-arg BASE_IMAGE=$(BASE_IMAGE) \
		-t $(APP_NAME):dev \
		-t $(HUB_IMAGE):dev \
		-t $(GHCR_PERSONAL_IMAGE):dev \
		-t $(GHCR_ORG_IMAGE):dev \
		-f $(DOCKERFILE) \
		.

docker-build-tools:
	DOCKER_BUILDKIT=$(DOCKER_BUILDKIT) docker build --pull \
		-t $(APP_NAME)-tools:$(TAG) \
		-t $(TOOLS_HUB_IMAGE):$(TAG) \
		-t $(TOOLS_GHCR_PERSONAL):$(TAG) \
		-t $(TOOLS_GHCR_ORG):$(TAG) \
		-f $(DOCKERFILE_TOOLS) \
		.

docker-push-dev-hub:
	docker push $(HUB_IMAGE):dev

docker-push-dev-ghcr-personal:
	docker push $(GHCR_PERSONAL_IMAGE):dev

docker-push-dev-ghcr-itc:
	docker push $(GHCR_ORG_IMAGE):dev

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

docker-run:
	docker compose -f $(COMPOSE_PROD) --profile web down --remove-orphans 2>/dev/null || true
	docker rm -f $(APP_NAME) 2>/dev/null || true
	docker compose -f $(COMPOSE_PROD) --profile web up --force-recreate

docker-run-detached:
	docker compose -f $(COMPOSE_PROD) --profile web down --remove-orphans 2>/dev/null || true
	docker rm -f $(APP_NAME) 2>/dev/null || true
	docker compose -f $(COMPOSE_PROD) --profile web up -d --force-recreate

docker-run-dev:
	@echo "Starting evaluator (foreground, compose --build). UI: http://localhost:4000"
	@echo "For background without rebuild: make docker-run-detached"
	docker compose -f $(COMPOSE_PROD) --profile web down --remove-orphans 2>/dev/null || true
	docker rm -f $(APP_NAME) 2>/dev/null || true
	docker compose -f $(COMPOSE_PROD) --profile web up --build --force-recreate

docker-run-cli:
	docker compose -f $(COMPOSE_PROD) --profile tools run --rm --no-deps evaluator-tools \
		evaluator $(ARGS)

docker-run-mcp:
	docker compose -f $(COMPOSE_PROD) --profile tools run --rm -i --no-deps evaluator-tools \
		node /app/mcp/server.mjs

docker-run-mcp-http:
	docker compose -f $(COMPOSE_PROD) --profile tools up evaluator-mcp-http

docker-stop:
	docker compose -f $(COMPOSE_PROD) --profile web --profile tools down --remove-orphans
	docker rm -f $(APP_NAME) 2>/dev/null || true

docker-inspect:
	docker image inspect $(HUB_IMAGE):$(TAG)
