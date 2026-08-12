#!/usr/bin/env bash
# ci-env.sh - Forge env adapter (the ONLY forge-aware shared script).
# Normalizes GitHub Actions / GitLab CI variables into SHIP_* so every other
# script stays forge-agnostic. Source it, never execute it:
#   source scripts/ship/ci-env.sh
set -euo pipefail

if [[ -n "${GITLAB_CI:-}" ]]; then
  export SHIP_FORGE="gitlab"
  export SHIP_SHA="${CI_COMMIT_SHA}"
  export SHIP_BEFORE_SHA="${CI_COMMIT_BEFORE_SHA:-}"
  export SHIP_BRANCH="${CI_COMMIT_BRANCH:-${CI_MERGE_REQUEST_SOURCE_BRANCH_NAME:-}}"
  export SHIP_DEFAULT_BRANCH="${CI_DEFAULT_BRANCH:-main}"
  export SHIP_IS_MR="$([[ "${CI_PIPELINE_SOURCE:-}" == "merge_request_event" ]] && echo true || echo false)"
  export SHIP_RUN_URL="${CI_PIPELINE_URL:-}"
  export SHIP_REPO_SLUG="${CI_PROJECT_PATH}"
  # Registry (provider=gitlab)
  export SHIP_REGISTRY_DEFAULT="${CI_REGISTRY_IMAGE:-}"
  export SHIP_REGISTRY_USER_DEFAULT="${CI_REGISTRY_USER:-}"
  export SHIP_REGISTRY_HOST_DEFAULT="${CI_REGISTRY:-}"
  # Push URL for the version bot (SHIP_BOT_TOKEN required, provided as CI secret)
  if [[ -n "${SHIP_BOT_TOKEN:-}" ]]; then
    export SHIP_PUSH_URL="https://oauth2:${SHIP_BOT_TOKEN}@${CI_SERVER_HOST}/${CI_PROJECT_PATH}.git"
  fi
elif [[ -n "${GITHUB_ACTIONS:-}" ]]; then
  export SHIP_FORGE="github"
  export SHIP_SHA="${GITHUB_SHA}"
  export SHIP_BEFORE_SHA="${SHIP_BEFORE_SHA:-}"   # set by the workflow from github.event.before
  export SHIP_BRANCH="${GITHUB_HEAD_REF:-${GITHUB_REF_NAME:-}}"
  export SHIP_DEFAULT_BRANCH="${SHIP_DEFAULT_BRANCH:-main}"
  export SHIP_IS_MR="$([[ "${GITHUB_EVENT_NAME:-}" == "pull_request" ]] && echo true || echo false)"
  export SHIP_RUN_URL="${GITHUB_SERVER_URL:-https://github.com}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID:-}"
  export SHIP_REPO_SLUG="${GITHUB_REPOSITORY}"
  # Registry (provider=ghcr)
  export SHIP_REGISTRY_DEFAULT="ghcr.io/${GITHUB_REPOSITORY,,}"
  export SHIP_REGISTRY_USER_DEFAULT="${GITHUB_ACTOR:-}"
  export SHIP_REGISTRY_HOST_DEFAULT="ghcr.io"
  if [[ -n "${SHIP_BOT_TOKEN:-}" ]]; then
    export SHIP_PUSH_URL="https://x-access-token:${SHIP_BOT_TOKEN}@github.com/${GITHUB_REPOSITORY}.git"
  fi
else
  echo "ci-env: unknown forge (neither GITLAB_CI nor GITHUB_ACTIONS set)" >&2
  exit 1
fi

# ---- Manifest resolution (shared by all consumers) ----
export SHIP_CONFIG="${SHIP_CONFIG:-.shokunin/ship/ship.config.json}"
if [[ ! -f "$SHIP_CONFIG" ]]; then
  echo "ci-env: manifest not found at $SHIP_CONFIG (owner: ship-gateway)" >&2
  exit 1
fi

ship_cfg() { node -p "JSON.stringify(require('./${SHIP_CONFIG}').$1 ?? null)" | sed 's/^"//; s/"$//'; }
export -f ship_cfg

export SHIP_SHAPE="$(ship_cfg shape)"
export SHIP_PROJECT_CONFIG="$(ship_cfg config)"

# Registry resolution: manifest wins, forge default as fallback (D3)
REGISTRY_PROVIDER="$(ship_cfg registry.provider)"
REGISTRY_URL="$(ship_cfg registry.url)"
if [[ "$REGISTRY_PROVIDER" == "custom" ]]; then
  [[ -z "$REGISTRY_URL" || "$REGISTRY_URL" == "null" ]] && { echo "ci-env: registry.provider=custom requires registry.url" >&2; exit 1; }
  export SHIP_REGISTRY="$REGISTRY_URL"
else
  export SHIP_REGISTRY="${REGISTRY_URL:-$SHIP_REGISTRY_DEFAULT}"
  [[ "$SHIP_REGISTRY" == "null" || -z "$SHIP_REGISTRY" ]] && export SHIP_REGISTRY="$SHIP_REGISTRY_DEFAULT"
fi

echo "ci-env: forge=$SHIP_FORGE shape=$SHIP_SHAPE sha=${SHIP_SHA:0:8} registry=$SHIP_REGISTRY"
