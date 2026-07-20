#!/bin/bash
# =============================================================================
# deploy.sh — Production VPS deployment for Obinwanne Farms Server
# =============================================================================
#
# DEFAULT: pull prebuilt image from GHCR and restart (see .github/workflows/ci.yml).
# FALLBACK: DEPLOY_BUILD_LOCAL=1 ./deploy.sh
#
# Prerequisites: .env on VPS, docker compose, GHCR access for pull mode.
# CI path: push main → Actions builds image → SSH → git pull → this script.
# =============================================================================

set -euo pipefail

echo "Starting VPS deployment of Obinwanne Farms Server..."

if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    echo "Neither docker-compose nor docker compose found"
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    if sudo docker info >/dev/null 2>&1; then
        echo "Using sudo for Docker"
        DOCKER_COMPOSE="sudo $DOCKER_COMPOSE"
    else
        echo "Cannot access Docker"
        exit 1
    fi
fi

if [ ! -f ".env" ]; then
    echo "No .env file found. Create one from .env.example before deploying."
    exit 1
fi

read_env_var() {
    local key="$1"
    if [ -n "${!key:-}" ]; then
        return
    fi
    local line
    line="$(grep -E "^${key}=" .env 2>/dev/null | tail -1 || true)"
    if [ -z "$line" ]; then
        return
    fi
    local val="${line#*=}"
    val="${val%\"}"
    val="${val#\"}"
    val="${val%\'}"
    val="${val#\'}"
    if [ -n "$val" ]; then
        export "${key}=${val}"
    fi
}

read_env_var GHCR_PULL_TOKEN
read_env_var GHCR_USERNAME
read_env_var OBINWANNE_SERVER_IMAGE
read_env_var PORT

COMPOSE_FILE="docker-compose.vps.yml"
PROJECT="obinwanne-farms-server-vps"
DEPLOY_LOCK="${TMPDIR:-/tmp}/obinwanne-farms-server-deploy.lock"
DEFAULT_IMAGE="ghcr.io/somadina94/obinwanne_farms_server:latest"
OBINWANNE_SERVER_IMAGE="${OBINWANNE_SERVER_IMAGE:-$DEFAULT_IMAGE}"
DEPLOY_BUILD_LOCAL="${DEPLOY_BUILD_LOCAL:-0}"
export OBINWANNE_SERVER_IMAGE
export COMPOSE_BAKE=false

exec 9>"$DEPLOY_LOCK"
if ! flock -n 9; then
    echo "Another deploy is already running (lock: $DEPLOY_LOCK). Try again shortly."
    exit 1
fi

echo "Disk before deploy:"
df -h / /var/lib/docker 2>/dev/null || df -h /

stop_own_stack() {
    echo "Stopping Obinwanne Farms Server stack (if running)..."
    $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env stop 2>/dev/null || true
    $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env rm -f 2>/dev/null || true
}

login_ghcr() {
    local token="${GHCR_PULL_TOKEN:-}"
    local user="${GHCR_USERNAME:-somadina94}"
    if [ -n "$token" ]; then
        echo "Logging in to ghcr.io as ${user}..."
        echo "$token" | docker login ghcr.io -u "$user" --password-stdin
        return
    fi
    if grep -q '"ghcr.io"' ~/.docker/config.json 2>/dev/null; then
        echo "Using existing ghcr.io credentials from docker config."
        return
    fi
    echo "ERROR: GHCR_PULL_TOKEN not set and not logged in to ghcr.io."
    echo "Add to .env: GHCR_PULL_TOKEN=<GitHub PAT with read:packages>"
    exit 1
}

pull_image() {
    echo "Pulling prebuilt image: ${OBINWANNE_SERVER_IMAGE}"
    login_ghcr
    local attempt
    for attempt in 1 2 3; do
        if docker pull "${OBINWANNE_SERVER_IMAGE}"; then
            return 0
        fi
        echo "Pull failed (attempt ${attempt}/3), retrying in 15s..."
        sleep 15
    done
    echo "Failed to pull ${OBINWANNE_SERVER_IMAGE}"
    echo "Fallback: DEPLOY_BUILD_LOCAL=1 ./deploy.sh"
    return 1
}

build_image_local() {
    echo "Building on VPS (DEPLOY_BUILD_LOCAL=1)..."
    $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env build
    OBINWANNE_SERVER_IMAGE="${PROJECT}-api:latest"
    export OBINWANNE_SERVER_IMAGE
}

mkdir -p logs
stop_own_stack

if [ "$DEPLOY_BUILD_LOCAL" = "1" ]; then
    build_image_local || exit 1
else
    echo "Deploy mode: pull prebuilt image (set DEPLOY_BUILD_LOCAL=1 to build on VPS)"
    pull_image || exit 1
fi

echo "Starting VPS stack..."
$DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" --env-file .env up -d --no-build --force-recreate

echo "Checking container status..."
sleep 5
$DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" ps

if ! $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" ps --status running | grep -q "server"; then
    echo "Deployment failed: server container is not running"
    $DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" logs --tail=50
    exit 1
fi

echo "Recent logs:"
$DOCKER_COMPOSE -p "$PROJECT" -f "$COMPOSE_FILE" logs --tail=20

PORT="${PORT:-6600}"
echo "VPS deployment completed."
echo "API: http://localhost:${PORT}"
