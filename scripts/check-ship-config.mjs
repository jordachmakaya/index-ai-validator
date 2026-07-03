#!/usr/bin/env node
/**
 * @filemeta
 * type: script
 * title: Ship manifest validator
 * description: Validates .shokunin/ship/ship.config.json against the locked ship decisions (D1-D6): schema shape, service paths existence, gate coherence with the profile.
 * job_ref: setup
 * functions: [main, validateSchema, validateServices, validateGates, report]
 * classes: []
 * inputs: [projectRoot (argv), --strict flag]
 * outputs: [console report, process exit code]
 * relations:
 *   - documents: ci/ship.config.schema.json
 *   - reads: .shokunin/ship/ship.config.json, .shokunin/brief/PROJECT_PROFILE.md
 * last_update: 2026-07-01
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** @type {{ level: 'ERROR' | 'WARN'; code: string; message: string }[]} */
const findings = [];

/**
 * @param {'ERROR' | 'WARN'} level
 * @param {string} code
 * @param {string} message
 */
function add(level, code, message) {
  findings.push({ level, code, message });
}

const SHAPES = ['monolith', 'monorepo'];
const CONFIGS = ['frontend', 'backend', 'fullstack'];
const FORGES = ['github', 'gitlab'];
const FRAMEWORKS = ['nest', 'nuxt', 'mastra', 'astro', 'node-lib'];
const SERVICE_TYPES = ['api', 'web', 'worker', 'docs'];
const E2E_MODES = ['on_mr', 'nightly', 'off'];
const REGISTRY_PROVIDERS = ['ghcr', 'gitlab', 'custom'];
const SERVICE_NAME_RE = /^[a-z][a-z0-9-]*$/;

/**
 * @param {Record<string, unknown>} cfg
 */
function validateSchema(cfg) {
  if (cfg.schemaVersion !== '1.0') add('ERROR', 'BAD_SCHEMA_VERSION', `schemaVersion must be "1.0", got "${cfg.schemaVersion}"`);
  if (!SHAPES.includes(String(cfg.shape))) add('ERROR', 'BAD_SHAPE', `shape must be one of ${SHAPES.join('|')}`);
  if (!CONFIGS.includes(String(cfg.config))) add('ERROR', 'BAD_CONFIG', `config must be one of ${CONFIGS.join('|')}`);
  if (!FORGES.includes(String(cfg.forge))) add('ERROR', 'BAD_FORGE', `forge must be one of ${FORGES.join('|')}`);
  if (cfg.packageManager !== 'pnpm') add('ERROR', 'BAD_PM', 'packageManager must be "pnpm" (locked)');
  if (cfg.versioning !== 'changesets') add('ERROR', 'BAD_VERSIONING', 'versioning must be "changesets" for every shape (locked decision D1)');

  const registry = /** @type {Record<string, unknown> | undefined} */ (cfg.registry);
  if (registry === undefined || typeof registry !== 'object') {
    add('ERROR', 'NO_REGISTRY', 'registry is required per project (locked decision D3)');
  } else {
    if (!REGISTRY_PROVIDERS.includes(String(registry.provider))) add('ERROR', 'BAD_REGISTRY_PROVIDER', `registry.provider must be one of ${REGISTRY_PROVIDERS.join('|')}`);
    if (!['public', 'private'].includes(String(registry.visibility))) add('ERROR', 'NO_REGISTRY_VISIBILITY', 'registry.visibility (public|private) is required — no implicit default (D3)');
    if (registry.provider === 'custom' && !registry.url) add('ERROR', 'CUSTOM_NO_URL', 'registry.provider=custom requires registry.url');
  }
}

/**
 * @param {Record<string, unknown>} cfg
 * @param {string} root
 */
function validateServices(cfg, root) {
  const services = /** @type {Record<string, Record<string, unknown>>} */ (cfg.services ?? {});
  const names = Object.keys(services);
  if (names.length === 0) {
    add('ERROR', 'NO_SERVICES', 'services must have at least one entry');
    return;
  }
  if (cfg.shape === 'monolith' && names.length !== 1) {
    add('ERROR', 'MONOLITH_MULTI', `monolith shape requires exactly one service, got ${names.length}`);
  }
  for (const [name, svc] of Object.entries(services)) {
    if (!SERVICE_NAME_RE.test(name)) add('ERROR', 'BAD_SERVICE_NAME', `service "${name}" must match ${SERVICE_NAME_RE}`);
    if (!svc.path) {
      add('ERROR', 'SERVICE_NO_PATH', `service "${name}" has no path`);
    } else if (!existsSync(join(root, String(svc.path)))) {
      add('ERROR', 'SERVICE_PATH_MISSING', `service "${name}" path "${svc.path}" does not exist on disk`);
    } else if (String(svc.path) !== '.' && !existsSync(join(root, String(svc.path), 'package.json'))) {
      add('WARN', 'SERVICE_NO_PACKAGE_JSON', `service "${name}" path has no package.json (ci-build/ci-package will fail)`);
    }
    if (!FRAMEWORKS.includes(String(svc.framework))) add('ERROR', 'BAD_FRAMEWORK', `service "${name}" framework must be one of ${FRAMEWORKS.join('|')}`);
    if (!SERVICE_TYPES.includes(String(svc.type))) add('ERROR', 'BAD_SERVICE_TYPE', `service "${name}" type must be one of ${SERVICE_TYPES.join('|')}`);
  }
  for (const shared of /** @type {string[]} */ (cfg.sharedPaths ?? [])) {
    if (!existsSync(join(root, shared))) add('WARN', 'SHARED_PATH_MISSING', `sharedPaths entry "${shared}" does not exist on disk`);
  }
}

/**
 * @param {Record<string, unknown>} cfg
 * @param {string} root
 */
function validateGates(cfg, root) {
  const gates = /** @type {Record<string, unknown>} */ (cfg.gates ?? {});
  for (const g of ['structure', 'lint', 'typecheck', 'unit']) {
    if (gates[g] !== true) add('ERROR', 'GATE_DISABLED', `gates.${g} must be true — guard/test gates are never disabled (D5)`);
  }
  if (!E2E_MODES.includes(String(gates.e2e))) add('ERROR', 'BAD_E2E', `gates.e2e must be one of ${E2E_MODES.join('|')} (D2)`);
  const cov = /** @type {Record<string, unknown> | undefined} */ (gates.coverageMin);
  if (cov === undefined || typeof cov.lines !== 'number') {
    add('ERROR', 'NO_COVERAGE_MIN', 'gates.coverageMin.lines (number) is required — no hardcoded thresholds');
  }
  if (typeof gates.package !== 'boolean') add('ERROR', 'NO_PACKAGE_GATE', 'gates.package (boolean) is required');

  // Coherence with the locked S/M/L profile
  const profilePath = join(root, '.shokunin', 'brief', 'PROJECT_PROFILE.md');
  if (existsSync(profilePath)) {
    const profile = readFileSync(profilePath, 'utf8').match(/^Profile\s*:\s*([SML])/m)?.[1];
    if (profile === 'L' && gates.e2e !== 'on_mr') add('WARN', 'PROFILE_E2E', 'profile L expects gates.e2e=on_mr (D2)');
    if (profile === 'M' && gates.e2e === 'off') add('WARN', 'PROFILE_E2E', 'profile M expects gates.e2e=nightly (D2)');
    if (profile !== 'S' && gates.package !== true) add('WARN', 'PROFILE_PACKAGE', `profile ${profile} expects gates.package=true (docker stage)`);
  } else {
    add('WARN', 'NO_PROFILE', 'PROJECT_PROFILE.md not found — cannot check gates/profile coherence');
  }
}

/** @param {boolean} strict @returns {number} */
function report(strict) {
  const errors = findings.filter((f) => f.level === 'ERROR');
  const warns = findings.filter((f) => f.level === 'WARN');
  for (const f of findings) console.log(`[${f.level}] ${f.code}: ${f.message}`);
  console.log('---');
  console.log(`check-ship-config: ${errors.length} error(s), ${warns.length} warning(s)${strict ? ' [strict]' : ''}`);
  if (errors.length > 0) return 1;
  if (strict && warns.length > 0) return 1;
  console.log('Ship manifest conforms to the locked decisions - OK');
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const root = resolve(args.find((a) => !a.startsWith('--')) ?? process.cwd());
  const manifestPath = join(root, '.shokunin', 'ship', 'ship.config.json');

  if (!existsSync(manifestPath)) {
    console.error('[ERROR] NO_MANIFEST: .shokunin/ship/ship.config.json not found (owner: ship-gateway)');
    process.exit(1);
  }

  /** @type {Record<string, unknown>} */
  let cfg;
  try {
    cfg = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`[ERROR] BAD_JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  validateSchema(cfg);
  validateServices(cfg, root);
  validateGates(cfg, root);

  process.exit(report(strict));
}

main();
