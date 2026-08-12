#!/usr/bin/env bash
# ci-version.sh - Changesets versioning bot (decision D1: changesets for EVERY
# project shape, monolith included).
# The version bot is the ONLY actor allowed to push to the default branch
# (documented exception in git-discipline), always with [skip ci].
# Requires: SHIP_BOT_TOKEN secret (forge write token, repo scope only).
set -euo pipefail
source "$(dirname "$0")/ci-env.sh"

if [[ -z "${SERVICES:-}" ]]; then
  echo "ci-version: no services to version"
  exit 0
fi
if [[ -z "${SHIP_PUSH_URL:-}" ]]; then
  echo "ci-version: missing SHIP_BOT_TOKEN (cannot build push URL)" >&2
  exit 1
fi

git config --global user.email "ship-bot@${SHIP_REPO_SLUG//\//.}"
git config --global user.name "Shokunin Ship Bot"
git remote set-url origin "$SHIP_PUSH_URL"

export HUSKY=0
pnpm install --frozen-lockfile
pnpm changeset version

if [[ -n "$(git status --porcelain)" ]]; then
  git add .
  git commit -m "chore(release): versioning packages [skip ci]"
  # Rebase-retry: protects against concurrent pushes (kept from the proven pipeline)
  git pull --rebase origin "$SHIP_DEFAULT_BRANCH" || {
    echo "ci-version: rebase retry..." >&2
    git pull --rebase origin "$SHIP_DEFAULT_BRANCH"
  }
  git push origin "HEAD:$SHIP_DEFAULT_BRANCH" --follow-tags
  echo "ci-version: versions bumped and pushed [skip ci]"
else
  echo "ci-version: no version bump needed"
fi
