#!/usr/bin/env bash
# ci-build.sh - Builds impacted services (manifest-driven, forge-agnostic).
# Consumes: SERVICES (from ci-detect via services.env / GITHUB_OUTPUT).
# Shared libs (manifest.sharedPaths) are built first - dependency order matters.
set -euo pipefail
source "$(dirname "$0")/ci-env.sh"

if [[ -z "${SERVICES:-}" ]]; then
  echo "ci-build: no services to build"
  exit 0
fi

export HUSKY=0
pnpm install --frozen-lockfile

# ---- Shared libs first (their build output feeds the services) ----
SHARED_FILTERS="$(node --input-type=module -e "
import { readFileSync, existsSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(process.env.SHIP_CONFIG, 'utf8'));
const filters = [];
for (const p of cfg.sharedPaths ?? []) {
  const pkgJson = p.replace(/\/\$/, '') + '/package.json';
  // sharedPaths may be a folder of packages (workspace glob) - use path filter
  filters.push('--filter=./' + p.replace(/\/\$/, '') + '...');
}
process.stdout.write(filters.join(' '));
")"
if [[ -n "$SHARED_FILTERS" ]]; then
  echo "ci-build: building shared libs first ($SHARED_FILTERS)"
  # shellcheck disable=SC2086
  pnpm $SHARED_FILTERS build || pnpm -r --filter "./packages/shared/**" build
fi

# ---- Impacted services ----
FAILED=0
for SERVICE in $SERVICES; do
  SERVICE_PATH="$(node -p "require('./${SHIP_CONFIG}').services['$SERVICE']?.path ?? ''")"
  if [[ -z "$SERVICE_PATH" ]]; then
    echo "ci-build: unknown service '$SERVICE' (not in manifest)" >&2
    FAILED=1
    continue
  fi

  if [[ "$SERVICE_PATH" == "." ]]; then
    echo "ci-build: monolith build"
    pnpm build
  else
    PACKAGE_NAME="$(node -p "require('./$SERVICE_PATH/package.json').name")"
    echo "ci-build: building $SERVICE ($PACKAGE_NAME)"
    pnpm --filter "$PACKAGE_NAME" build
  fi
done

[[ $FAILED -eq 0 ]] || exit 1
echo "ci-build: all impacted services built"
