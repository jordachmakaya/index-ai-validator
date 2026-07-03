#!/usr/bin/env node
/**
 * check-error-registry.mjs
 *
 * Validates that every `static readonly CODE = 'SECTOR-NNN'` declared in
 * source files is registered in .shokunin/errors/ERRORS.md, and vice-versa.
 *
 * Exit 0 = registry is clean
 * Exit 1 = unregistered codes, stale entries, or duplicates found
 *
 * Usage:
 *   node scripts/check-error-registry.mjs
 *   node scripts/check-error-registry.mjs --strict   # warnings become errors
 *   node scripts/check-error-registry.mjs --json      # machine-readable output
 *
 * See: .shokunin/rules/RULE_ErrorRegistry.md
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname, dirname } from 'path';
import { fileURLToPath } from 'url';

// Config
const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const SRC    = join(ROOT, 'src');
const ERRORS = join(ROOT, '.shokunin', 'errors', 'ERRORS.md');

const STRICT      = process.argv.includes('--strict');
const JSON_OUTPUT = process.argv.includes('--json');

const SCAN_EXTS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const CODE_DECL_RE  = /static\s+readonly\s+CODE\s*=\s*['"]([A-Z]{2,8}-\d{3})['"]/g;
const CODE_FORMAT_RE = /^[A-Z]{2,8}-\d{3}$/;
const ERRORS_ROW_RE  = /^\|\s*([A-Z]{2,8}-\d{3})\s*\|/gm;

// ANSI
const R    = '\x1b[0m';
const RED  = '\x1b[31m';
const YEL  = '\x1b[33m';
const GRN  = '\x1b[32m';
const BOLD = '\x1b[1m';
const DIM  = '\x1b[2m';
const CYN  = '\x1b[36m';

function walkSrc(dir) {
  const SKIP = new Set(['node_modules', 'dist', 'coverage', '.turbo', '.git', '.cache']);
  const results = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return results; }
  for (const entry of entries) {
    if (SKIP.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) {
      results.push(...walkSrc(full));
    } else if (SCAN_EXTS.has(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

function scanSourceCodes() {
  const map = new Map();
  const files = walkSrc(SRC);
  for (const file of files) {
    let content;
    try { content = readFileSync(file, 'utf8'); } catch { continue; }
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let match;
    CODE_DECL_RE.lastIndex = 0;
    while ((match = CODE_DECL_RE.exec(normalized)) !== null) {
      const code = match[1];
      const upTo = normalized.slice(0, match.index);
      const lineNumber = upTo.split('\n').length;
      if (!map.has(code)) map.set(code, []);
      map.get(code).push({ file: relative(ROOT, file), line: lineNumber });
    }
  }
  return map;
}

function parseErrorsRegistry() {
  let content;
  try { content = readFileSync(ERRORS, 'utf8'); } catch { return null; }
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const registered = new Set();
  let match;
  ERRORS_ROW_RE.lastIndex = 0;
  while ((match = ERRORS_ROW_RE.exec(normalized)) !== null) {
    registered.add(match[1]);
  }
  return registered;
}

function validate() {
  const findings = [];
  const error = (code, msg, detail) =>
    findings.push({ level: 'error', code, message: msg, detail: detail ?? null });
  const warn = (code, msg, detail) =>
    findings.push({ level: 'warn', code, message: msg, detail: detail ?? null });

  const sourceMap = scanSourceCodes();
  const registry  = parseErrorsRegistry();

  if (registry === null) {
    if (sourceMap.size === 0) {
      warn('NO_REGISTRY',
        '.shokunin/errors/ERRORS.md not found and no SECTOR-NNN codes in src/',
        'Create ERRORS.md when adding the first error class');
      return findings;
    }
    error('NO_REGISTRY',
      '.shokunin/errors/ERRORS.md not found but SECTOR-NNN codes exist in source',
      'Create .shokunin/errors/ERRORS.md and register the ' + sourceMap.size + ' code(s) found');
  }

  const registeredCodes = registry ?? new Set();

  for (const [code, locations] of sourceMap.entries()) {
    if (locations.length > 1) {
      const detail = locations.map((l) => '  ' + l.file + ':' + l.line).join('\n');
      error('DUPLICATE_CODE', 'Code "' + code + '" is declared in ' + locations.length + ' files', detail);
    }
  }

  for (const code of sourceMap.keys()) {
    if (!registeredCodes.has(code)) {
      const loc = sourceMap.get(code)[0];
      error('UNREGISTERED',
        'Code "' + code + '" is not registered in .shokunin/errors/ERRORS.md',
        'Declared at ' + loc.file + ':' + loc.line);
    }
  }

  for (const code of registeredCodes) {
    if (!CODE_FORMAT_RE.test(code)) continue;
    if (!sourceMap.has(code)) {
      warn('STALE_ENTRY',
        'Code "' + code + '" is in ERRORS.md but has no matching class in source',
        'Remove the row or restore the error class');
    }
  }

  return findings;
}

function reportHuman(findings) {
  const errors   = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warn');
  console.log();
  console.log(BOLD + CYN + 'Error Registry Validator' + R);
  console.log(DIM + 'Source: src/  |  Registry: .shokunin/errors/ERRORS.md' + R);
  console.log();
  if (findings.length === 0) {
    console.log(GRN + BOLD + '✓ Registry is clean.' + R);
    console.log();
    return;
  }
  for (const f of findings) {
    const color  = f.level === 'error' ? RED : YEL;
    const icon   = f.level === 'error' ? '✗' : '⚠';
    const prefix = f.level === 'error' ? 'ERR' : 'WRN';
    console.log('  ' + color + icon + ' [' + prefix + ':' + f.code + ']' + R + ' ' + f.message);
    if (f.detail) {
      for (const line of f.detail.split('\n')) {
        console.log('         ' + DIM + line + R);
      }
    }
  }
  console.log();
  console.log(BOLD + 'Summary' + R);
  console.log('  ' + RED + '✗ Errors' + R + '  : ' + errors.length);
  console.log('  ' + YEL + '⚠ Warnings' + R + ': ' + warnings.length);
  console.log();
  if (errors.length > 0 || (STRICT && warnings.length > 0)) {
    console.log(RED + BOLD + 'Fix the issues above before committing.' + R);
  } else {
    console.log(YEL + BOLD + 'Warnings found — registry is functional but not clean.' + R);
  }
  console.log();
}

function reportJson(findings) {
  const errors   = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.filter((f) => f.level === 'warn').length;
  console.log(JSON.stringify({ errors, warnings, findings }, null, 2));
}

// Main
let findings = validate();

if (STRICT) {
  findings = findings.map((f) => f.level === 'warn' ? Object.assign({}, f, { level: 'error' }) : f);
}

if (JSON_OUTPUT) {
  reportJson(findings);
} else {
  reportHuman(findings);
}

const hasErrors = findings.some((f) => f.level === 'error');
process.exit(hasErrors ? 1 : 0);
