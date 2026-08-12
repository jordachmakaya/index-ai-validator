#!/usr/bin/env node
/**
 * check-logic.mjs
 *
 * Validates LOGIC.md files throughout the project:
 *   - covers: field is present and non-empty
 *   - every file in covers: exists on disk
 *   - LOGIC.md is not stale (no covered file has mtime newer than LOGIC.md)
 *
 * Exit 0 = all LOGIC.md files are clean
 * Exit 1 = errors found (or warnings in --strict mode)
 *
 * Usage:
 *   node scripts/check-logic.mjs
 *   node scripts/check-logic.mjs --strict   # STALE_CONTENT warnings become errors
 *   node scripts/check-logic.mjs --json      # machine-readable output
 *
 * See: .shokunin/rules/RULE_Logic.md
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';

// Config
const __dir  = dirname(fileURLToPath(import.meta.url));
const ROOT   = join(__dir, '..');
const SRC    = join(ROOT, 'src');

const STRICT      = process.argv.includes('--strict');
const JSON_OUTPUT = process.argv.includes('--json');

// ANSI
const R    = '\x1b[0m';
const RED  = '\x1b[31m';
const YEL  = '\x1b[33m';
const GRN  = '\x1b[32m';
const BOLD = '\x1b[1m';
const DIM  = '\x1b[2m';
const CYN  = '\x1b[36m';

// ─── Frontmatter parser ───────────────────────────────────────────────────────

/**
 * Parse YAML frontmatter from a markdown file.
 * Returns { covers: string[] | null, lastUpdate: string | null, hasFrontmatter: boolean }
 */
function parseFrontmatter(content) {
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return { covers: null, lastUpdate: null, hasFrontmatter: false };
  }
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) {
    return { covers: null, lastUpdate: null, hasFrontmatter: false };
  }
  const fm = normalized.slice(4, end);

  // Parse covers: (block list or inline)
  const covers = parseCovers(fm);

  // Parse last_update: YYYY-MM-DD
  const luMatch = fm.match(/^last_update:\s*(.+)$/m);
  const lastUpdate = luMatch ? luMatch[1].trim().replace(/['"]/g, '') : null;

  return { covers, lastUpdate, hasFrontmatter: true };
}

/**
 * Extract the covers: block list from a frontmatter string.
 * Supports:
 *   covers:
 *     - foo.ts
 *     - bar.ts
 * Returns string[] or null if absent/empty.
 */
function parseCovers(fm) {
  const lines = fm.split('\n');
  let inCovers = false;
  const items = [];

  for (const line of lines) {
    if (/^covers:\s*$/.test(line)) {
      inCovers = true;
      continue;
    }
    if (inCovers) {
      const itemMatch = line.match(/^\s+-\s+(.+)$/);
      if (itemMatch) {
        items.push(itemMatch[1].trim());
      } else if (line.match(/^\S/) && !line.startsWith('#')) {
        break; // new key — end of covers block
      }
    }
  }

  return items.length > 0 ? items : null;
}

// ─── File walker ──────────────────────────────────────────────────────────────

/**
 * Recursively find all LOGIC.md files under a directory.
 */
function findLogicFiles(dir) {
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
      results.push(...findLogicFiles(full));
    } else if (entry === 'LOGIC.md') {
      results.push(full);
    }
  }
  return results;
}

// ─── Validator ────────────────────────────────────────────────────────────────

function validate() {
  const findings = [];

  const error = (file, code, msg, detail) =>
    findings.push({ level: 'error', file, code, message: msg, detail: detail ?? null });
  const warn = (file, code, msg, detail) =>
    findings.push({ level: 'warn', file, code, message: msg, detail: detail ?? null });

  const logicFiles = findLogicFiles(SRC);

  if (logicFiles.length === 0) {
    // No LOGIC.md files — not an error, just nothing to validate
    return findings;
  }

  for (const logicPath of logicFiles) {
    const rel = relative(ROOT, logicPath);
    const logicDir = dirname(logicPath);

    let content;
    try { content = readFileSync(logicPath, 'utf8'); } catch {
      error(rel, 'UNREADABLE', 'Cannot read LOGIC.md', logicPath);
      continue;
    }

    const { covers, hasFrontmatter } = parseFrontmatter(content);
    let logicMtime;
    try { logicMtime = statSync(logicPath).mtimeMs; } catch { logicMtime = 0; }

    // Check frontmatter exists
    if (!hasFrontmatter) {
      error(rel, 'NO_FRONTMATTER',
        'LOGIC.md has no YAML frontmatter — run shokunin-docmeta to add it', null);
    }

    // Check covers: present
    if (!covers || covers.length === 0) {
      error(rel, 'NO_COVERS',
        'LOGIC.md has no covers: field — list the files this document covers', null);
      continue; // can't do mtime check without covers
    }

    // Check each covered file
    for (const coveredRelPath of covers) {
      const coveredAbs = resolve(logicDir, coveredRelPath);
      const coveredRel = relative(ROOT, coveredAbs);

      let coveredStat;
      try { coveredStat = statSync(coveredAbs); } catch {
        error(rel, 'MISSING_FILE',
          'Covered file does not exist: ' + coveredRel,
          'Remove from covers: or restore the file');
        continue;
      }

      // Freshness: covered file newer than LOGIC.md
      if (coveredStat.mtimeMs > logicMtime) {
        warn(rel, 'STALE_CONTENT',
          'Covered file is newer than LOGIC.md: ' + coveredRel,
          'Review LOGIC.md content and bump last_update: to today');
      }
    }
  }

  return findings;
}

// ─── Reporters ────────────────────────────────────────────────────────────────

function reportHuman(findings) {
  const errors   = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warn');

  console.log();
  console.log(BOLD + CYN + 'Logic Documentation Validator' + R);
  console.log(DIM + 'Scanning src/ for LOGIC.md files' + R);
  console.log();

  if (findings.length === 0) {
    console.log(GRN + BOLD + '✓ All LOGIC.md files are clean.' + R);
    console.log();
    return;
  }

  let lastFile = null;
  for (const f of findings) {
    if (f.file !== lastFile) {
      console.log(BOLD + f.file + R);
      lastFile = f.file;
    }
    const color  = f.level === 'error' ? RED : YEL;
    const icon   = f.level === 'error' ? '✗' : '⚠';
    const prefix = f.level === 'error' ? 'ERR' : 'WRN';
    console.log('  ' + color + icon + ' [' + prefix + ':' + f.code + ']' + R + ' ' + f.message);
    if (f.detail) {
      console.log('         ' + DIM + f.detail + R);
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
    console.log(YEL + BOLD + 'Warnings found — LOGIC.md files need review.' + R);
  }
  console.log();
}

function reportJson(findings) {
  const errors   = findings.filter((f) => f.level === 'error').length;
  const warnings = findings.filter((f) => f.level === 'warn').length;
  console.log(JSON.stringify({ errors, warnings, findings }, null, 2));
}

// ─── Main ─────────────────────────────────────────────────────────────────────

let findings = validate();

if (STRICT) {
  findings = findings.map((f) =>
    f.level === 'warn' ? Object.assign({}, f, { level: 'error' }) : f
  );
}

if (JSON_OUTPUT) {
  reportJson(findings);
} else {
  reportHuman(findings);
}

const hasErrors = findings.some((f) => f.level === 'error');
process.exit(hasErrors ? 1 : 0);
