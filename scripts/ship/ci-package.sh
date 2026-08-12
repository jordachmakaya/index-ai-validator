#!/usr/bin/env bash
# ci-package.sh - Docker build+push of impacted services (manifest-driven).
# Runs only when gates.package=true (profile S may skip the docker stage entirely).
# Registry login is done by the wrapper (forge-specific secrets); this script
# assumes an authenticated docker client and a ready buildx builder.
# Tags: {version} (changesets) + {sha} + latest. Digests are captured for ci-record.
set -euo pipefail
source "$(dirname "$0")/ci-env.sh"

if [[ -z "${SERVICES:-}" ]]; then
  echo "ci-package: no services"
  exit 0
fi

PACKAGE_GATE="$(node -p "require('./${SHIP_CONFIG}').gates.package")"
if [[ "$PACKAGE_GATE" != "true" ]]; then
  echo "ci-package: gates.package=false (profile decision) - skipping docker stage"
  exit 0
fi

DIGESTS_FILE="ship-digests.env"
: > "$DIGESTS_FILE"

FAILED=0
for SERVICE in $SERVICES; do
  SVC_JSON="$(node -p "JSON.stringify(require('./${SHIP_CONFIG}').services['$SERVICE'] ?? null)")"
  if [[ "$SVC_JSON" == "null" ]]; then
    echo "ci-package: unknown service '$SERVICE'" >&2; FAILED=1; continue
  fi

  DO_PACKAGE="$(node -p "(${SVC_JSON}).package ?? true")"
  if [[ "$DO_PACKAGE" != "true" ]]; then
    echo "ci-package: $SERVICE has package=false - skipped"
    continue
  fi

  SERVICE_PATH="$(node -p "(${SVC_JSON}).path")"
  FRAMEWORK="$(node -p "(${SVC_JSON}).framework")"
  if [[ "$SERVICE_PATH" == "." ]]; then
    PACKAGE_NAME="$(node -p "require('./package.json').name")"
    VERSION="$(node -p "require('./package.json').version")"
  else
    PACKAGE_NAME="$(node -p "require('./$SERVICE_PATH/package.json').name")"
    VERSION="$(node -p "require('./$SERVICE_PATH/package.json').version")"
  fi

  IMAGE="$SHIP_REGISTRY/$SERVICE"
  echo "ci-package: building $IMAGE:$VERSION (framework=$FRAMEWORK, package=$PACKAGE_NAME)"

  docker pull "$IMAGE:latest" 2>/dev/null || true

  docker build \
    --cache-from "$IMAGE:latest" \
    --build-arg BUILDKIT_INLINE_CACHE=1 \
    --build-arg APP="$PACKAGE_NAME" \
    --build-arg FRAMEWORK="$FRAMEWORK" \
    -t "$IMAGE:$VERSION" \
    -t "$IMAGE:$SHIP_SHA" \
    -t "$IMAGE:latest" \
    -f docker/base.Dockerfile \
    . || { echo "ci-package: build failed for $SERVICE" >&2; FAILED=1; continue; }

  docker push "$IMAGE:$VERSION"
  docker push "$IMAGE:$SHIP_SHA"
  docker push "$IMAGE:latest"

  DIGEST="$(docker inspect --format='{{index .RepoDigests 0}}' "$IMAGE:$VERSION" | sed 's/.*@//')"
  echo "DIGEST_${SERVICE//-/_}=$DIGEST" >> "$DIGESTS_FILE"
  echo "VERSION_${SERVICE//-/_}=$VERSION" >> "$DIGESTS_FILE"
  echo "ci-package: $SERVICE -> $VERSION ($DIGEST)"
done

[[ $FAILED -eq 0 ]] || exit 1
echo "ci-package: all images pushed"
