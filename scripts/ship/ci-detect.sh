#!/usr/bin/env bash
# ci-detect.sh - Impacted-services detection, manifest-driven (decision D6:
# manifest.services is the single source; this script and the generated
# rules:changes/paths filters are its two consumers).
# Output: services.env (SERVICES="a b c", SKIP_PIPELINE=true|false)
#   GitLab: consumed as dotenv artifact. GitHub: appended to $GITHUB_OUTPUT by the wrapper.
set -euo pipefail
source "$(dirname "$0")/ci-env.sh"

OUT="services.env"

# ---- Monolith: single service, always ships ----
if [[ "$SHIP_SHAPE" == "monolith" ]]; then
  SERVICE="$(node -p "Object.keys(require('./${SHIP_CONFIG}').services)[0]")"
  echo "SERVICES=$SERVICE" > "$OUT"
  echo "SKIP_PIPELINE=false" >> "$OUT"
  echo "ci-detect: monolith -> $SERVICE"
  exit 0
fi

# ---- Monorepo: diff-based detection with fallbacks ----
CHANGED_FILES=""

if [[ -n "$SHIP_BEFORE_SHA" && "$SHIP_BEFORE_SHA" != "0000000000000000000000000000000000000000" ]] \
   && git cat-file -e "$SHIP_BEFORE_SHA" 2>/dev/null; then
  CHANGED_FILES="$(git diff --name-only "$SHIP_BEFORE_SHA" "$SHIP_SHA")"
elif [[ "$SHIP_IS_MR" == "true" ]] && git rev-parse "origin/$SHIP_DEFAULT_BRANCH" >/dev/null 2>&1; then
  CHANGED_FILES="$(git diff --name-only "origin/$SHIP_DEFAULT_BRANCH"...HEAD)"
elif git rev-parse HEAD~1 >/dev/null 2>&1; then
  echo "ci-detect: fallback to HEAD~1 diff" >&2
  CHANGED_FILES="$(git diff --name-only HEAD~1 HEAD)"
else
  echo "ci-detect: no diff base available -> full rebuild" >&2
  CHANGED_FILES="$(git ls-files)"
fi

# ---- Map files -> services via the manifest ----
IMPACTED="$(node --input-type=module -e "
import { readFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(process.env.SHIP_CONFIG, 'utf8'));
const changed = readFileSync(0, 'utf8').split('\n').filter(Boolean);
const shared = cfg.sharedPaths ?? [];
const services = Object.entries(cfg.services);
const blastRadius = changed.some((f) => shared.some((p) => f.startsWith(p)));
const impacted = new Set();
if (blastRadius) {
  for (const [name] of services) impacted.add(name);
} else {
  for (const f of changed) {
    for (const [name, svc] of services) {
      const prefix = svc.path.endsWith('/') ? svc.path : svc.path + '/';
      if (f.startsWith(prefix) || f === svc.path) impacted.add(name);
    }
  }
}
process.stdout.write([...impacted].sort().join(' '));
" <<< "$CHANGED_FILES")"

if [[ -z "$IMPACTED" ]]; then
  echo "SERVICES=" > "$OUT"
  echo "SKIP_PIPELINE=true" >> "$OUT"
  echo "ci-detect: no impacted services"
else
  echo "SERVICES=$IMPACTED" > "$OUT"
  echo "SKIP_PIPELINE=false" >> "$OUT"
  echo "ci-detect: impacted -> $IMPACTED"
fi
