#!/usr/bin/env node
/**
 * @filemeta
 * type: script
 * title: Shokunin structure validator
 * description: Validates a project's .shokunin/ tree, report naming, ID spine, view slices, and legacy paths against PATHS_REGISTRY.md; exits non-zero on violations.
 * job_ref: setup
 * functions: [main, checkDirectoryTree, checkJobsStructure, checkViewSlice, checkLegacyPaths, checkDashboardDiscipline, checkSessions, report]
 * classes: []
 * inputs: [projectRoot (argv), --strict flag]
 * outputs: [console report, process exit code]
 * relations:
 *   - documents: coding-skills/RULES/PATHS_REGISTRY.md
 * last_update: 2026-07-01
 */

import { existsSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const REQUIRED_DIRS = [
  '.shokunin',
  '.shokunin/brief',
  '.shokunin/planning',
  '.shokunin/jobs',
  '.shokunin/dashboard',
  '.shokunin/sessions',
  '.shokunin/rules',
  '.shokunin/ai',
  '.shokunin/errors',
  '.shokunin/traceability',
  '.shokunin/debt',
  '.shokunin/acceptance',
  '.shokunin/security',
  '.shokunin/release',
  '.shokunin/incidents',
  '.shokunin/business',
  '.shokunin/lessons',
  '.shokunin/ship',
  '.shokunin/bug-memory',
  '.shokunin/bug-memory/pending',
  '.shokunin/bug-memory/solved',
];

/** Task ID: T{S}.{N}_{kebab} - e.g. T1.2_render-gate-honesty */
const TASK_ID_RE = /^T\d+\.\d+(?:_[a-z0-9]+(?:-[a-z0-9]+)*)?$/;

/** View Slice ID: V{NN}_{kebab} - e.g. V01_dashboard */
const VIEW_ID_RE = /^V\d{2}_[a-z0-9]+(?:-[a-z0-9]+)*$/;

const JOB_ROLES = [
  'coder',
  'tester',
  'reviewer',
  'ui_tester',
  'designer',
  'ui_reviewer',
  'backend_tester',
  'backend_coder',
  'integration',
];

/** Legacy paths/names forbidden by PATHS_REGISTRY.md */
const LEGACY_PATTERNS = [
  { path: '.shokunin/architecture/ARCHITECTURE.md', fix: 'move to .shokunin/brief/ARCHITECTURE.md' },
  { path: '.shokunin/brief/EVAL_DATASET.md', fix: 'move to .shokunin/ai/EVAL_DATASET.md' },
  { path: '.shokunin/brief/OBSERVABILITY_PLAN.md', fix: 'move to .shokunin/ai/OBSERVABILITY_PLAN.md' },
  { path: '.bug-memory', fix: 'move to .shokunin/bug-memory/{pending|solved}/' },
  { path: 'BRANDING.md', fix: 'move to .shokunin/brief/BRANDING.md' },
];

const LEGACY_REPORT_NAMES = /^REPORT_(codeur|coder|testeur|tester|reviewer)\.md$/;
const CANONICAL_REPORT_RE = /^(T\d+\.\d+(?:_[a-z0-9-]+)*)_(coder|tester|reviewer|ui_tester|designer|ui_reviewer|backend_tester|backend_coder|integration)_report\.md$/;

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

/** @param {string} root */
function checkDirectoryTree(root) {
  for (const dir of REQUIRED_DIRS) {
    if (!existsSync(join(root, dir))) {
      add('ERROR', 'MISSING_DIR', `${dir}/ is missing (required by PATHS_REGISTRY - run start-new-project bootstrap)`);
    }
  }
  if (!existsSync(join(root, '.shokunin', 'README.md'))) {
    add('WARN', 'MISSING_INDEX', '.shokunin/README.md index is missing');
  }
  if (!existsSync(join(root, '.shokunin', 'brief', 'PROJECT_PROFILE.md'))) {
    add('WARN', 'MISSING_PROFILE', '.shokunin/brief/PROJECT_PROFILE.md is missing - the S/M/L profile must be locked at bootstrap (PROFILES.md)');
  }
}

/** @param {string} root */
function checkJobsStructure(root) {
  const jobsRoot = join(root, '.shokunin', 'jobs');
  if (!existsSync(jobsRoot)) return;

  for (const jobName of listDirs(jobsRoot)) {
    const jobDir = join(jobsRoot, jobName);

    if (TASK_ID_RE.test(jobName)) {
      const hasRoleDirs = listDirs(jobDir).some((d) => JOB_ROLES.some((r) => d.endsWith(`_${r}`)));
      if (!hasRoleDirs) {
        add('WARN', 'LEGACY_JOB_LAYOUT', `.shokunin/jobs/${jobName}/ uses task-id as top folder - canonical layout is jobs/[JobName]/[TaskID]_{role}/ (PATHS_REGISTRY)`);
      }
    }

    for (const entry of readdirSync(jobDir)) {
      const full = join(jobDir, entry);

      if (statSync(full).isFile() && entry.endsWith('.md')) {
        if (LEGACY_REPORT_NAMES.test(entry)) {
          add('ERROR', 'LEGACY_REPORT_NAME', `jobs/${jobName}/${entry} - rename to [TaskID]_{role}_report.md`);
        } else if (entry.endsWith('_report.md') && !CANONICAL_REPORT_RE.test(entry)) {
          add('ERROR', 'BAD_REPORT_NAME', `jobs/${jobName}/${entry} does not match [TaskID]_{role}_report.md`);
        }
      }

      if (statSync(full).isDirectory()) {
        const roleMatch = JOB_ROLES.find((r) => entry.endsWith(`_${r}`));
        if (roleMatch) {
          const taskPart = entry.slice(0, entry.length - roleMatch.length - 1);
          if (!TASK_ID_RE.test(taskPart)) {
            add('ERROR', 'BAD_TASK_ID', `jobs/${jobName}/${entry}/ - task id "${taskPart}" does not match T{S}.{N}_{kebab}`);
          }
          if (!existsSync(join(full, 'JOB.md'))) {
            add('ERROR', 'MISSING_JOB_MD', `jobs/${jobName}/${entry}/JOB.md is missing`);
          }
          for (const f of readdirSync(full)) {
            if (LEGACY_REPORT_NAMES.test(f)) {
              add('ERROR', 'LEGACY_REPORT_NAME', `jobs/${jobName}/${entry}/${f} - reports live at jobs/[JobName]/[TaskID]_{role}_report.md`);
            }
          }
        } else if (VIEW_ID_RE.test(entry)) {
          checkViewSlice(full, `jobs/${jobName}/${entry}`);
        } else {
          add('WARN', 'UNKNOWN_JOB_DIR', `jobs/${jobName}/${entry}/ - neither [TaskID]_{role} nor V{NN}_{kebab} slice (PATHS_REGISTRY)`);
        }
      }
    }

    const hasSlices = listDirs(jobDir).some((d) => VIEW_ID_RE.test(d));
    if (hasSlices && !existsSync(join(jobDir, 'MOCK_REGISTER.md'))) {
      add('ERROR', 'MISSING_MOCK_REGISTER', `jobs/${jobName}/MOCK_REGISTER.md is missing while view slices exist (owner: view-slice-splitter)`);
    }
  }
}

/**
 * @param {string} sliceDir
 * @param {string} rel
 */
function checkViewSlice(sliceDir, rel) {
  const hasDraft = existsSync(join(sliceDir, 'BACKEND_CONTRACT_DRAFT.md'));
  const hasApproved = existsSync(join(sliceDir, 'BACKEND_CONTRACT_APPROVED.md'));
  if (hasApproved && !hasDraft) {
    add('ERROR', 'APPROVED_WITHOUT_DRAFT', `${rel}/BACKEND_CONTRACT_APPROVED.md exists without BACKEND_CONTRACT_DRAFT.md - the gate promotes a draft, it never invents a contract`);
  }
  if (!existsSync(join(sliceDir, 'UI_TEST_CONTRACT.md'))) {
    add('WARN', 'SLICE_NO_TEST_CONTRACT', `${rel}/UI_TEST_CONTRACT.md is missing (owner: view-slice-splitter)`);
  }
  if (!existsSync(join(sliceDir, 'UI_MOCK_CONTRACT.md'))) {
    add('WARN', 'SLICE_NO_MOCK_CONTRACT', `${rel}/UI_MOCK_CONTRACT.md is missing (owner: view-slice-splitter)`);
  }
}

/** @param {string} root */
function checkLegacyPaths(root) {
  for (const { path, fix } of LEGACY_PATTERNS) {
    if (existsSync(join(root, path))) {
      add('ERROR', 'LEGACY_PATH', `${path} exists - ${fix}`);
    }
  }
  const bugRoot = join(root, '.shokunin', 'bug-memory');
  if (existsSync(bugRoot)) {
    for (const f of readdirSync(bugRoot)) {
      if (f.endsWith('.md') && f.startsWith('BUG_')) {
        add('WARN', 'FLAT_BUG_MEMORY', `.shokunin/bug-memory/${f} - move into pending/ or solved/`);
      }
    }
    if (existsSync(join(bugRoot, 'codeur'))) {
      add('ERROR', 'LEGACY_PATH', '.shokunin/bug-memory/codeur/ exists - use pending/ and solved/');
    }
  }
}

/** @param {string} root */
function checkDashboardDiscipline(root) {
  const dash = join(root, '.shokunin', 'dashboard');
  if (!existsSync(dash)) return;
  const hasJson = existsSync(join(dash, 'project-dashboard.json'));
  const hasHtml = existsSync(join(dash, 'project-dashboard.html'));
  if (!hasJson && hasHtml) {
    add('ERROR', 'DASHBOARD_JSON_MISSING', 'project-dashboard.html exists without project-dashboard.json - agents write the JSON only (PATHS_REGISTRY)');
  }
  if (!hasJson && !hasHtml) {
    add('WARN', 'DASHBOARD_EMPTY', 'dashboard/ has neither JSON state nor HTML template');
  }
}

/** @param {string} root */
function checkSessions(root) {
  const sessions = join(root, '.shokunin', 'sessions');
  if (!existsSync(sessions)) return;
  const re = /^SESSION_\d{3}_\d{4}-\d{2}-\d{2}$/;
  for (const d of listDirs(sessions)) {
    if (!re.test(d)) {
      add('ERROR', 'BAD_SESSION_NAME', `sessions/${d}/ does not match SESSION_{NNN}_{YYYY-MM-DD}`);
    } else if (!existsSync(join(sessions, d, 'HANDOFF.md'))) {
      add('WARN', 'SESSION_NO_HANDOFF', `sessions/${d}/ has no HANDOFF.md`);
    }
  }
  if (existsSync(join(root, '.shokunin', 'HANDOFF_tmp.md'))) {
    add('WARN', 'HANDOFF_TMP_LEFTOVER', '.shokunin/HANDOFF_tmp.md left behind - handoff-close (Phase 3) was not completed');
  }
}

/** @param {string} dir @returns {string[]} */
function listDirs(dir) {
  return readdirSync(dir).filter((e) => statSync(join(dir, e)).isDirectory());
}

/** @param {boolean} strict @returns {number} */
function report(strict) {
  const errors = findings.filter((f) => f.level === 'ERROR');
  const warns = findings.filter((f) => f.level === 'WARN');
  for (const f of findings) {
    console.log(`[${f.level}] ${f.code}: ${f.message}`);
  }
  console.log('---');
  console.log(`check-shokunin-structure: ${errors.length} error(s), ${warns.length} warning(s)${strict ? ' [strict]' : ''}`);
  if (errors.length > 0) return 1;
  if (strict && warns.length > 0) return 1;
  console.log('Structure conforms to PATHS_REGISTRY.md - OK');
  return 0;
}

function main() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const rootArg = args.find((a) => !a.startsWith('--'));
  const root = resolve(rootArg ?? process.cwd());

  if (!existsSync(join(root, '.shokunin'))) {
    console.error(`[ERROR] NO_SHOKUNIN: no .shokunin/ directory under ${relative(process.cwd(), root) || '.'} - run start-new-project first`);
    process.exit(1);
  }

  checkDirectoryTree(root);
  checkJobsStructure(root);
  checkLegacyPaths(root);
  checkDashboardDiscipline(root);
  checkSessions(root);

  process.exit(report(strict));
}

main();
