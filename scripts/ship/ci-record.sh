#!/usr/bin/env bash
# ci-record.sh - Assembles SHIP_RECORD.json, the pipeline's final artifact and
# the ONLY interface consumed by deploy adapters (frozen contract, decision D4).
# Consumes: SERVICES + ship-digests.env (from ci-package) + gate results (env).
# Validates the record against ci/SHIP_RECORD.schema.json before writing.
set -euo pipefail
source "$(dirname "$0")/ci-env.sh"

RELEASE_ID="${SHIP_RELEASE:-}"
if [[ -z "$RELEASE_ID" ]]; then
  # Derive from the latest release record on disk, fallback R_000 (pre-release ship)
  LAST="$(ls .shokunin/release/RELEASE_*.md 2>/dev/null | sort | tail -1 | grep -oE '[0-9]{3}' || true)"
  RELEASE_ID="R_${LAST:-000}"
fi

[[ -f ship-digests.env ]] && source ship-digests.env

SHIP_RELEASE_ID="$RELEASE_ID" node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs';
const cfg = JSON.parse(readFileSync(process.env.SHIP_CONFIG, 'utf8'));
const services = (process.env.SERVICES ?? '').split(' ').filter(Boolean);
const registry = process.env.SHIP_REGISTRY;

const images = [];
for (const service of services) {
  const svc = cfg.services[service];
  if (!svc || (svc.package ?? true) === false || cfg.gates.package !== true) continue;
  const key = service.replaceAll('-', '_');
  const digest = process.env['DIGEST_' + key];
  const version = process.env['VERSION_' + key];
  if (!digest || !version) {
    console.error('ci-record: missing digest/version for ' + service + ' (did ci-package run?)');
    process.exit(1);
  }
  images.push({ service, image: registry + '/' + service + ':' + version, digest, version });
}

const record = {
  schemaVersion: '1.0',
  release: process.env.SHIP_RELEASE_ID,
  sha: process.env.SHIP_SHA,
  pipelineUrl: process.env.SHIP_RUN_URL,
  gates: {
    structure: 'pass', lint: 'pass', typecheck: 'pass', test: 'pass',
    ...(process.env.SHIP_COVERAGE ? { coverage: Number(process.env.SHIP_COVERAGE) } : {}),
    e2e: cfg.gates.e2e === 'on_mr' ? 'pass' : cfg.gates.e2e,
  },
  images,
  shippedAt: new Date().toISOString(),
};

// Validate against the frozen schema (structural checks, zero deps)
const schema = JSON.parse(readFileSync('ci/SHIP_RECORD.schema.json', 'utf8'));
for (const req of schema.required) {
  if (record[req] === undefined) { console.error('ci-record: missing required field ' + req); process.exit(1); }
}
if (!/^R_\d{3}\$/.test(record.release)) { console.error('ci-record: bad release id ' + record.release); process.exit(1); }
if (!/^[0-9a-f]{7,40}\$/.test(record.sha)) { console.error('ci-record: bad sha'); process.exit(1); }
for (const img of record.images) {
  if (!/^sha256:[0-9a-f]{64}\$/.test(img.digest)) { console.error('ci-record: bad digest for ' + img.service); process.exit(1); }
}

writeFileSync('SHIP_RECORD.json', JSON.stringify(record, null, 2) + '\n');
console.log('ci-record: SHIP_RECORD.json written (' + images.length + ' image(s), release ' + record.release + ')');
"

# Note: the wrapper uploads SHIP_RECORD.json as the pipeline artifact.
