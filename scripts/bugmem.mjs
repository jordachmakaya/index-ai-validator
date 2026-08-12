#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.cwd();
const BUG_MEMORY_DIR = join(ROOT, '.shokunin', 'bug-memory');
const BUGS_DIR = BUG_MEMORY_DIR;
const PENDING_DIR = join(BUGS_DIR, 'pending');
const SOLVED_DIR = join(BUGS_DIR, 'solved');
const CONCEPTS_DIR = join(BUG_MEMORY_DIR, 'concepts');
const TEMPLATES_DIR = join(BUG_MEMORY_DIR, 'templates');
const RULES_DIR = join(BUG_MEMORY_DIR, 'rules');
const SCRIPT_PATH = fileURLToPath(import.meta.url);

const REQUIRED_FRONTMATTER_FIELDS = [
  'type',
  'title',
  'status',
  'severity',
  'language',
  'frameworks',
  'libraries',
  'tags',
  'error_signature',
  'created_at',
  'updated_at',
];

const REQUIRED_PENDING_SECTIONS = [
  '# Context',
  '# Error',
  '# Failed Attempts',
  '# Current Hypothesis',
  '# Investigation Notes',
];

const REQUIRED_SOLVED_SECTIONS = [
  '# Root Cause',
  '# Verified Fix',
  '# Validation',
  '# Reuse Conditions',
];

const VALID_STATUSES = ['pending', 'solved', 'obsolete', 'duplicate'];

function main() {
  const [command, ...args] = process.argv.slice(2);

  try {
    switch (command) {
      case 'init':
        init();
        break;
      case 'new':
        createNewBug(args);
        break;
      case 'search':
        search(args);
        break;
      case 'validate':
        validateCommand(args);
        break;
      case 'solved':
        markSolved(args);
        break;
      case 'help':
      case undefined:
        printHelp();
        break;
      default:
        fail(`Unknown command: ${command}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`bugmem error: ${message}`);
    process.exit(1);
  }
}

function init() {
  ensureDir(BUG_MEMORY_DIR);
  ensureDir(BUGS_DIR);
  ensureDir(PENDING_DIR);
  ensureDir(SOLVED_DIR);
  ensureDir(CONCEPTS_DIR);
  ensureDir(TEMPLATES_DIR);
  ensureDir(RULES_DIR);

  writeIfMissing(join(BUG_MEMORY_DIR, 'index.md'), `# Bug Memory

This folder stores local debugging knowledge for AI coding agents.

Source of truth:

- pending bugs: \`.shokunin/bug-memory/pending/\`
- solved bugs: \`.shokunin/bug-memory/solved/\`
- concepts: \`.shokunin/bug-memory/concepts/\`
- rules: \`.shokunin/bug-memory/rules/\`

Core rule:

> If an agent fails twice to fix the same error, it must create or update a pending bug case before continuing.
`);

  writeIfMissing(join(BUG_MEMORY_DIR, 'log.md'), `# Bug Memory Log

`);

  writeIfMissing(join(CONCEPTS_DIR, 'index.md'), `# Concepts

Use this folder for reusable project knowledge that helps explain recurring bugs.

Examples:

- framework runtime notes
- deployment constraints
- package manager behavior
- API integration notes
`);

  writeIfMissing(join(TEMPLATES_DIR, 'bug-case.md'), bugTemplate('Example bug title', 'example-bug-title'));

  writeIfMissing(join(TEMPLATES_DIR, 'concept.md'), `---
type: concept
title: ""
tags: []
created_at: ""
updated_at: ""
---

# Summary

# Notes

# Related Bugs
`);

  writeIfMissing(join(RULES_DIR, 'agent-debugging-protocol.md'), `# Agent Debugging Protocol

If you fail twice to fix the same error:

1. Create or update a pending bug case in \`.shokunin/bug-memory/pending/\`.
2. Search existing solved bug cases and concepts.
3. Apply old fixes only when reuse conditions match.
4. When solved, document root cause, verified fix, validation, and reuse conditions.
5. Move the case to \`.shokunin/bug-memory/solved/\`.
6. Append an entry to \`.shokunin/bug-memory/log.md\`.

Never write secrets, tokens, passwords, cookies, customer data, or full .env content.
`);

  console.log('Bug Memory initialized.');
  console.log(`Root: ${relative(ROOT, BUG_MEMORY_DIR)}`);
}

function createNewBug(args) {
  const title = args.join(' ').trim();

  if (!title) {
    fail('Usage: node scripts/bugmem.mjs new "Bug title"');
  }

  ensureInitialized();

  const slug = slugify(title);
  const filePath = uniquePath(join(PENDING_DIR, `${slug}.md`));
  writeFileSync(filePath, bugTemplate(title, slug), 'utf8');

  appendLog(`Created pending bug case: \`${relative(ROOT, filePath)}\``);

  console.log(`Created: ${relative(ROOT, filePath)}`);
}

function search(args) {
  const query = args.join(' ').trim();

  if (!query) {
    fail('Usage: node scripts/bugmem.mjs search "query"');
  }

  ensureInitialized();

  const searchableDirs = [
    SOLVED_DIR,
    CONCEPTS_DIR,
    RULES_DIR,
  ].filter(existsSync);

  const files = searchableDirs.flatMap((dir) => listMarkdownFiles(dir));
  const tokens = tokenize(query);

  const results = files
    .map((filePath) => scoreFile(filePath, tokens))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 10);

  if (results.length === 0) {
    console.log('No matching Bug Memory files found.');
    return;
  }

  console.log(`Found ${results.length} possible match(es):\n`);

  for (const [index, result] of results.entries()) {
    console.log(`${index + 1}. ${relative(ROOT, result.filePath)}`);
    console.log(`   score: ${result.score}`);
    if (result.title) console.log(`   title: ${result.title}`);
    if (result.status) console.log(`   status: ${result.status}`);
    if (result.errorSignature) console.log(`   error_signature: ${result.errorSignature}`);
    console.log('');
  }
}

function validateCommand(args) {
  ensureInitialized();

  const target = args[0];
  const files = target
    ? [join(ROOT, target)]
    : [
        ...listMarkdownFiles(PENDING_DIR),
        ...listMarkdownFiles(SOLVED_DIR),
      ];

  if (files.length === 0) {
    console.log('No bug files to validate.');
    return;
  }

  let hasError = false;

  for (const filePath of files) {
    const result = validateBugFile(filePath);

    if (result.errors.length === 0) {
      console.log(`PASS ${relative(ROOT, filePath)}`);
      continue;
    }

    hasError = true;
    console.log(`FAIL ${relative(ROOT, filePath)}`);

    for (const error of result.errors) {
      console.log(`  - ${error}`);
    }
  }

  if (hasError) {
    process.exit(1);
  }
}

function markSolved(args) {
  const inputPath = args[0];

  if (!inputPath) {
    fail('Usage: node scripts/bugmem.mjs solved ".shokunin/bug-memory/pending/file.md"');
  }

  ensureInitialized();

  const sourcePath = join(ROOT, inputPath);

  if (!existsSync(sourcePath)) {
    fail(`File does not exist: ${inputPath}`);
  }

  const content = readFileSync(sourcePath, 'utf8');
  const updatedContent = setFrontmatterField(content, 'status', 'solved');

  writeFileSync(sourcePath, updatedContent, 'utf8');

  const validation = validateBugFile(sourcePath);

  if (validation.errors.length > 0) {
    console.log(`Cannot mark as solved: ${relative(ROOT, sourcePath)}`);
    for (const error of validation.errors) {
      console.log(`  - ${error}`);
    }
    process.exit(1);
  }

  const destinationPath = uniquePath(join(SOLVED_DIR, sourcePath.split(/[\\/]/).at(-1) ?? 'solved-bug.md'));
  ensureDir(dirname(destinationPath));
  renameSync(sourcePath, destinationPath);

  appendLog(`Solved bug case: \`${relative(ROOT, destinationPath)}\``);

  console.log(`Solved: ${relative(ROOT, destinationPath)}`);
}

function bugTemplate(title, slug) {
  const now = new Date().toISOString();

  return `---
type: bug_case
title: "${escapeYamlString(title)}"
status: pending
severity: unknown
language: typescript
frameworks: []
libraries: []
tags: []
error_signature: ""
created_at: "${now}"
updated_at: "${now}"
---

# Context

Describe what the code was trying to do.

# Error

\`\`\`txt
Paste the stable error message or relevant log excerpt here.
\`\`\`

# Failed Attempts

## Attempt 1

What changed:

Result:

Why it failed or what remained unclear:

## Attempt 2

What changed:

Result:

Why it failed or what remained unclear:

# Current Hypothesis

Describe the current likely cause. Mark uncertainty explicitly.

# Investigation Notes

Add observations, file paths, commands, and relevant constraints.

# Root Cause

Required when status is solved.

# Verified Fix

Required when status is solved.

# Validation

Required when status is solved.

- \`pnpm typecheck\`: not run
- \`pnpm test\`: not run
- \`pnpm build\`: not run

# Reuse Conditions

Required when status is solved.

Use this fix when:

- ...

Do not use this fix when:

- ...
`;
}

function validateBugFile(filePath) {
  const errors = [];

  if (!existsSync(filePath)) {
    return { errors: [`File does not exist: ${filePath}`] };
  }

  const content = readFileSync(filePath, 'utf8');
  const frontmatter = parseFrontmatter(content);

  if (!frontmatter) {
    return { errors: ['Missing YAML frontmatter block.'] };
  }

  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (!(field in frontmatter.fields)) {
      errors.push(`Missing frontmatter field: ${field}`);
    }
  }

  const type = frontmatter.fields.type;
  if (type !== 'bug_case') {
    errors.push(`Invalid type: expected "bug_case", got "${type || '<empty>'}"`);
  }

  const status = frontmatter.fields.status;

  if (!status) {
    errors.push('Missing status.');
  } else if (!VALID_STATUSES.includes(status)) {
    errors.push(`Invalid status "${status}". Expected one of: ${VALID_STATUSES.join(', ')}`);
  }

  for (const section of REQUIRED_PENDING_SECTIONS) {
    if (!content.includes(section)) {
      errors.push(`Missing required section: ${section}`);
    }
  }

  if (status === 'solved') {
    for (const section of REQUIRED_SOLVED_SECTIONS) {
      if (!content.includes(section)) {
        errors.push(`Missing solved section: ${section}`);
      }
    }

    for (const section of REQUIRED_SOLVED_SECTIONS) {
      if (isSectionEmpty(content, section)) {
        errors.push(`Solved section is empty: ${section}`);
      }
    }
  }

  if (containsLikelySecret(content)) {
    errors.push('Possible secret detected. Redact tokens, keys, passwords, cookies, or .env values before storing.');
  }

  return { errors };
}

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    return null;
  }

  const raw = match[1];
  const fields = {};

  for (const line of raw.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('- ')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();

    fields[key] = unquoteYamlValue(rawValue);
  }

  return { raw, fields };
}

function setFrontmatterField(content, field, value) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    fail('Cannot update status: missing YAML frontmatter.');
  }

  const raw = match[1];
  const lines = raw.split('\n');
  let replaced = false;

  const updatedLines = lines.map((line) => {
    if (line.trim().startsWith(`${field}:`)) {
      replaced = true;
      return `${field}: ${value}`;
    }

    return line;
  });

  if (!replaced) {
    updatedLines.push(`${field}: ${value}`);
  }

  const updatedFrontmatter = `---\n${updatedLines.join('\n')}\n---`;
  return content.replace(/^---\n[\s\S]*?\n---/, updatedFrontmatter);
}

function scoreFile(filePath, tokens) {
  const content = readFileSync(filePath, 'utf8');
  const lowerContent = content.toLowerCase();
  const frontmatter = parseFrontmatter(content);

  let score = 0;

  for (const token of tokens) {
    const occurrences = countOccurrences(lowerContent, token);
    score += Math.min(occurrences, 5);
  }

  const title = frontmatter?.fields.title ?? '';
  const status = frontmatter?.fields.status ?? '';
  const errorSignature = frontmatter?.fields.error_signature ?? '';

  const lowerTitle = title.toLowerCase();
  const lowerErrorSignature = errorSignature.toLowerCase();

  for (const token of tokens) {
    if (lowerTitle.includes(token)) score += 3;
    if (lowerErrorSignature.includes(token)) score += 5;
  }

  return {
    filePath,
    score,
    title,
    status,
    errorSignature,
  };
}

function isSectionEmpty(content, heading) {
  const escaped = escapeRegExp(heading);
  const pattern = new RegExp(`${escaped}\\n+([\\s\\S]*?)(\\n# |$)`);
  const match = content.match(pattern);

  if (!match) {
    return true;
  }

  const body = match[1]
    .replace(/```[\s\S]*?```/g, '')
    .trim();

  if (!body) {
    return true;
  }

  const placeholders = [
    'required when status is solved.',
    '...',
    '- ...',
    'not run',
  ];

  const normalized = body.toLowerCase();
  return placeholders.some((placeholder) => normalized === placeholder || normalized.includes(placeholder));
}

function containsLikelySecret(content) {
  const suspiciousPatterns = [
    /api[_-]?key\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
    /token\s*[:=]\s*["']?[A-Za-z0-9_\-.]{24,}/i,
    /password\s*[:=]\s*["']?.{6,}/i,
    /secret\s*[:=]\s*["']?[A-Za-z0-9_\-]{16,}/i,
    /cookie\s*[:=]\s*["']?.{20,}/i,
    /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(content));
}

function listMarkdownFiles(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir).map((entry) => join(dir, entry));
  const files = [];

  for (const entry of entries) {
    const stats = statSync(entry);

    if (stats.isDirectory()) {
      files.push(...listMarkdownFiles(entry));
      continue;
    }

    if (stats.isFile() && entry.endsWith('.md')) {
      files.push(entry);
    }
  }

  return files;
}

function ensureInitialized() {
  if (!existsSync(BUG_MEMORY_DIR)) {
    fail('Bug Memory is not initialized. Run: node scripts/bugmem.mjs init');
  }
}

function ensureDir(path) {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function writeIfMissing(path, content) {
  if (!existsSync(path)) {
    ensureDir(dirname(path));
    writeFileSync(path, content, 'utf8');
  }
}

function uniquePath(path) {
  if (!existsSync(path)) {
    return path;
  }

  const extension = path.endsWith('.md') ? '.md' : '';
  const base = extension ? path.slice(0, -extension.length) : path;

  for (let index = 2; index < 1000; index += 1) {
    const candidate = `${base}-${index}${extension}`;
    if (!existsSync(candidate)) {
      return candidate;
    }
  }

  fail(`Could not generate unique path for: ${path}`);
}

function appendLog(message) {
  const date = new Date().toISOString().slice(0, 10);
  const logPath = join(BUG_MEMORY_DIR, 'log.md');

  if (!existsSync(logPath)) {
    writeFileSync(logPath, '# Bug Memory Log\n\n', 'utf8');
  }

  const existing = readFileSync(logPath, 'utf8');
  writeFileSync(logPath, `${existing.trimEnd()}\n- ${date}: ${message}\n`, 'utf8');
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'bug-case';
}

function tokenize(value) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9_.@/-]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function countOccurrences(content, token) {
  if (!token) {
    return 0;
  }

  let count = 0;
  let index = content.indexOf(token);

  while (index !== -1) {
    count += 1;
    index = content.indexOf(token, index + token.length);
  }

  return count;
}

function escapeYamlString(value) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function unquoteYamlValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function printHelp() {
  console.log(`Bug Memory V1

Usage:
  node scripts/bugmem.mjs init
  node scripts/bugmem.mjs new "Bug title"
  node scripts/bugmem.mjs search "query"
  node scripts/bugmem.mjs validate
  node scripts/bugmem.mjs validate ".shokunin/bug-memory/pending/file.md"
  node scripts/bugmem.mjs solved ".shokunin/bug-memory/pending/file.md"

Recommended package.json:
  {
    "scripts": {
      "bugmem": "node scripts/bugmem.mjs"
    }
  }

Then:
  pnpm bugmem init
  pnpm bugmem new "Cannot find package ai-v5 from @mastra/core"
  pnpm bugmem search "ai-v5 mastra nitro"
  pnpm bugmem validate
  pnpm bugmem solved ".shokunin/bug-memory/pending/file.md"

Script:
  ${SCRIPT_PATH}
`);
}

main();

