#!/usr/bin/env node
/**
 * @filemeta
 * type: script
 * title: Docs site generator (mechanical, zero LLM tokens)
 * description: Compiles filemeta blocks, LOGIC.md, shokunin documents, openapi, ERRORS.md, AB test records and changelog into VitePress markdown pages under docs/.
 * job_ref: setup
 * functions: [main, collectFilemeta, parseFilemeta, buildReference, copyShokuninDocs, buildSidebar, write]
 * classes: []
 * inputs: [projectRoot, src tree, .shokunin tree, CHANGELOG.md]
 * outputs: [docs/reference/*.md, docs/architecture/*.md, docs/metrics/*.md, docs/errors.md, docs/changelog.md, docs/.vitepress/sidebar.generated.json]
 * relations:
 *   - documents: coding-skills/docs-publisher/SKILL.md
 * last_update: 2026-07-02
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

const ROOT = resolve(process.argv[2] ?? process.cwd());
const DOCS = join(ROOT, 'docs');
const IGNORED = new Set(['node_modules', '.git', 'dist', '.output', '.nuxt', 'coverage', 'docs', '.shokunin']);
const SRC_EXT = ['.ts', '.tsx', '.mts', '.cts', '.vue'];

/** @param {string} p @param {string} content */
function write(p, content) {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}

/** Extract the @filemeta block fields from a source file. @param {string} content */
function parseFilemeta(content) {
  const block = content.match(/@filemeta([\s\S]*?)\*\//)?.[1] ?? content.match(/@filemeta([\s\S]*?)-->/)?.[1];
  if (!block) return null;
  const clean = block.replace(/^\s*\*? ?/gm, '');
  const field = (name) => clean.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1]?.trim() ?? '';
  return {
    type: field('type'),
    title: field('title'),
    description: field('description'),
    functions: field('functions'),
    relations: clean.match(/^relations:\n((?:\s+-.+\n?)+)/m)?.[1]?.trim() ?? '',
  };
}

/** Walk src-like folders and collect filemeta + LOGIC.md per folder. @param {string} dir @param {Map<string, {files: any[], logic: string|null}>} acc */
function collectFilemeta(dir, acc) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED.has(entry) || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) { collectFilemeta(full, acc); continue; }
    const folder = relative(ROOT, dirname(full)) || '.';
    if (!acc.has(folder)) acc.set(folder, { files: [], logic: null });
    if (entry === 'LOGIC.md') {
      acc.get(folder).logic = readFileSync(full, 'utf8').replace(/^---[\s\S]*?---\n/, '');
    } else if (SRC_EXT.some((e) => entry.endsWith(e))) {
      const meta = parseFilemeta(readFileSync(full, 'utf8'));
      if (meta) acc.get(folder).files.push({ name: entry, ...meta });
    }
  }
}

/** @param {Map<string, {files: any[], logic: string|null}>} acc @returns {string[]} generated page paths */
function buildReference(acc) {
  const pages = [];
  for (const [folder, { files, logic }] of [...acc.entries()].sort()) {
    if (files.length === 0 && !logic) continue;
    const slug = folder.replaceAll(/[\\/]/g, '--');
    const lines = [`# \`${folder}\``, ''];
    if (logic) lines.push('## Cluster logic', '', logic.trim(), '');
    if (files.length > 0) {
      lines.push('## Files', '', '| File | Type | Description | Functions |', '|---|---|---|---|');
      for (const f of files.sort((a, b) => a.name.localeCompare(b.name))) {
        lines.push(`| \`${f.name}\` | ${f.type} | ${f.description} | ${f.functions.replace(/[\[\]]/g, '')} |`);
      }
      lines.push('');
    }
    write(join(DOCS, 'reference', `${slug}.md`), lines.join('\n'));
    pages.push(`reference/${slug}`);
  }
  return pages;
}

/** Copy a .shokunin document into docs (frontmatter stripped), returns page id or null. */
function copyDoc(srcRel, destRel) {
  const src = join(ROOT, srcRel);
  if (!existsSync(src)) return null;
  const body = readFileSync(src, 'utf8').replace(/^---[\s\S]*?---\n/, '');
  write(join(DOCS, destRel), body);
  return destRel.replace(/\.md$/, '');
}

function main() {
  const sidebar = {};

  // 1. Code reference (filemeta + LOGIC)
  const acc = new Map();
  collectFilemeta(ROOT, acc);
  const refPages = buildReference(acc);
  if (refPages.length > 0) sidebar['Code Reference'] = refPages;

  // 2. Architecture + ADRs
  const arch = [];
  const a = copyDoc('.shokunin/brief/ARCHITECTURE.md', 'architecture/index.md');
  if (a) arch.push('architecture/index');
  const adrDir = join(ROOT, '.shokunin/brief/decisions');
  if (existsSync(adrDir)) {
    for (const f of readdirSync(adrDir).filter((f) => f.startsWith('ADR_')).sort()) {
      const id = copyDoc(`.shokunin/brief/decisions/${f}`, `architecture/${f}`);
      if (id) arch.push(id);
    }
  }
  if (arch.length > 0) sidebar['Architecture'] = arch;

  // 3. API spec (raw copy — rendered by the api-documenter narrative pass or a viewer plugin)
  if (existsSync(join(ROOT, '.shokunin/brief/openapi.yaml'))) {
    mkdirSync(join(DOCS, 'api'), { recursive: true });
    copyFileSync(join(ROOT, '.shokunin/brief/openapi.yaml'), join(DOCS, 'api', 'openapi.yaml'));
    if (!existsSync(join(DOCS, 'api', 'index.md'))) {
      write(join(DOCS, 'api', 'index.md'), '# API\n\nSpec: [openapi.yaml](./openapi.yaml)\n\n<!-- narrative API guide written by docs-publisher (api-documenter expertise) -->\n');
    }
    sidebar['API'] = ['api/index'];
  }

  // 4. Metrics, journeys, post-release verdicts, A/B records
  const metrics = [];
  for (const [src, dest] of [
    ['.shokunin/release/METRICS_PLAN.md', 'metrics/plan.md'],
    ['.shokunin/brief/USER_JOURNEY.md', 'metrics/journeys.md'],
  ]) { const id = copyDoc(src, dest); if (id) metrics.push(id); }
  const relDir = join(ROOT, '.shokunin/release');
  if (existsSync(relDir)) {
    for (const f of readdirSync(relDir).filter((f) => f.startsWith('POST_RELEASE_')).sort()) {
      const id = copyDoc(`.shokunin/release/${f}`, `metrics/${f}`);
      if (id) metrics.push(id);
    }
  }
  const abDir = join(ROOT, '.shokunin/release/ab');
  if (existsSync(abDir)) {
    for (const f of readdirSync(abDir).filter((f) => f.endsWith('.md')).sort()) {
      const id = copyDoc(`.shokunin/release/ab/${f}`, `experiments/${f}`);
      if (id) (sidebar['Experiments'] ??= []).push(id);
    }
  }
  if (metrics.length > 0) sidebar['Metrics & Journeys'] = metrics;

  // 5. Errors registry + changelog
  const err = copyDoc('.shokunin/errors/ERRORS.md', 'errors.md');
  if (err) sidebar['Errors'] = ['errors'];
  const ch = copyDoc('CHANGELOG.md', 'changelog.md');
  if (ch) sidebar['Changelog'] = ['changelog'];

  // 6. Sidebar for VitePress (consumed by .vitepress/config.mts)
  write(join(DOCS, '.vitepress', 'sidebar.generated.json'), JSON.stringify(sidebar, null, 2) + '\n');

  const total = Object.values(sidebar).flat().length;
  console.log(`generate-docs: ${total} page(s) generated (${refPages.length} reference) — narrative pages (index.md, getting-started.md) are docs-publisher's job`);
}

main();
