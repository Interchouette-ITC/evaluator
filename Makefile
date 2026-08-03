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

.DEFAULT_GOAL := help

.PHONY: help \
	docker-build docker-build-no-cache docker-build-dev \
	docker-push-dev docker-push-dev-hub docker-push-dev-ghcr-personal docker-push-dev-ghcr-itc \
	docker-push-release docker-push-release-hub \
	docker-push-release-ghcr-personal docker-push-release-ghcr-itc \
	docker-run docker-stop docker-inspect \
	version-show

help:
	@echo "evaluator targets"
	@echo ""
	@echo "  make docker-build          Build $(HUB_IMAGE):$(TAG) (+ :$(APP_VERSION))"
	@echo "  make docker-build-dev      Build and tag :dev (Hub + GHCR names)"
	@echo "  make docker-push-dev       Push :dev (local interactive logins)"
	@echo "  make docker-push-release   Tag/push release images (CI uses split targets)"
	@echo "  make docker-run / docker-stop   Run existing image (no rebuild)"
	@echo "  make version-show"
	@echo ""
	@echo "Images: $(HUB_IMAGE) | $(GHCR_ORG_IMAGE) | $(GHCR_PERSONAL_IMAGE)"
	@echo "Overrides: HUB_IMAGE=... APP_VERSION=... CI=0|1 TAG=..."

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
		-t $(HUB_IMAGE):dev \
		-t $(GHCR_PERSONAL_IMAGE):dev \
		-t $(GHCR_ORG_IMAGE):dev \
		-f $(DOCKERFILE) \
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
	docker compose -f $(COMPOSE_PROD) up -d --force-recreate

docker-stop:
	docker compose -f $(COMPOSE_PROD) down --remove-orphans

docker-inspect:
	docker image inspect $(HUB_IMAGE):$(TAG)
