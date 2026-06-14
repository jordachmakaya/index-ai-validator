import { CHECK } from '../constants'
import type { Severity, ValidationCheck, ValidationMetrics, ValidationResult } from '../types'

type RecommendedStep = {
  readonly title: string
  readonly description: string
  readonly priority: number
  readonly severity: Severity
}

const PACKAGE_VERSION = '0.1.0'

const SEVERITY_PRIORITY: Record<Severity, number> = {
  fail: 0,
  warn: 1,
  pass: 2,
}

export function formatHtmlReport(result: ValidationResult): string {
  const readiness = getReadiness(result)
  const verdict = result.passed ? 'Passed' : 'Failed'
  const verdictWord = result.passed ? 'PASSED' : 'FAILED'
  const verdictClass = result.passed ? 'pass' : 'fail'

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>index-ai validation report</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #080b11;
      --surface-1: #0d1320;
      --surface-2: #121c2e;
      --surface-3: #1a2640;
      --border: #1e2d44;
      --border-2: #253552;
      --text: #e8edf5;
      --muted: #7a8ba3;
      --dim: #4a5a72;
      --blue: #3b82f6;
      --pass: #10b981;
      --warn: #f59e0b;
      --fail: #ef4444;
      --pass-bg: rgba(16, 185, 129, 0.08);
      --warn-bg: rgba(245, 158, 11, 0.08);
      --fail-bg: rgba(239, 68, 68, 0.08);
      --pass-border: rgba(16, 185, 129, 0.25);
      --warn-border: rgba(245, 158, 11, 0.25);
      --fail-border: rgba(239, 68, 68, 0.25);
      --sans: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --mono: ui-monospace, "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      --r-sm: 6px;
      --r-md: 10px;
      --r-lg: 14px;
    }
    *, *::before, *::after { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.6;
    }
    a { color: var(--blue); text-decoration: none; }
    a:hover { text-decoration: underline; }
    p { margin: 0; }
    code {
      color: #fbbf24;
      background: rgba(251, 191, 36, 0.1);
      border: 1px solid rgba(251, 191, 36, 0.2);
      border-radius: 4px;
      padding: 1px 5px;
      font-family: var(--mono);
      font-size: 0.9em;
    }
    .layout {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 280px;
      grid-template-areas:
        "topbar topbar"
        "main sidebar"
        "footer footer";
      max-width: 1280px;
      min-height: 100vh;
      margin: 0 auto;
      padding: 0 24px;
      gap: 0 32px;
    }
    .topbar {
      grid-area: topbar;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 16px 0;
      border-bottom: 1px solid var(--border);
    }
    .topbar-left, .topbar-right, .footer-links {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .logo {
      color: var(--text);
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .logo-sep, .topbar-divider { color: var(--dim); }
    .topbar-pill {
      color: var(--muted);
      background: var(--surface-1);
      border: 1px solid var(--border-2);
      border-radius: 999px;
      padding: 3px 8px;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 600;
    }
    .topbar-right {
      color: var(--muted);
      font-size: 12px;
    }
    .topbar-right a { color: var(--muted); }
    .topbar-right a:hover { color: var(--text); }
    .main {
      grid-area: main;
      padding: 32px 0 48px;
    }
    .hero { margin-bottom: 38px; }
    .hero-eyebrow {
      color: var(--muted);
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.12em;
      margin-bottom: 12px;
      text-transform: uppercase;
    }
    .hero-title {
      max-width: 700px;
      margin: 0 0 10px;
      color: var(--text);
      font-size: clamp(2rem, 5vw, 3.6rem);
      line-height: 1.02;
      letter-spacing: -0.03em;
    }
    .hero-copy {
      max-width: 680px;
      margin-bottom: 18px;
      color: var(--muted);
      font-size: 15px;
    }
    .hero-target {
      margin-bottom: 20px;
      color: var(--dim);
      font-family: var(--mono);
      font-size: 13px;
      overflow-wrap: anywhere;
    }
    .hero-target span { color: var(--blue); }
    .verdict-display {
      display: flex;
      align-items: baseline;
      flex-wrap: wrap;
      gap: 20px;
      margin-bottom: 22px;
    }
    .verdict-word {
      font-family: var(--mono);
      font-size: clamp(48px, 8vw, 80px);
      font-weight: 700;
      line-height: 1;
      letter-spacing: -0.04em;
    }
    .verdict-word.pass { color: var(--pass); }
    .verdict-word.fail { color: var(--fail); }
    .verdict-sub {
      max-width: 500px;
      color: var(--muted);
      font-size: 15px;
      line-height: 1.5;
    }
    .readiness-row {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 22px;
    }
    .readiness-label {
      min-width: 84px;
      color: var(--muted);
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .readiness-track {
      flex: 1;
      height: 5px;
      overflow: hidden;
      background: var(--surface-3);
      border-radius: 999px;
    }
    .readiness-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--fail), var(--warn));
    }
    .readiness-fill.mid { background: linear-gradient(90deg, var(--warn), #84cc16); }
    .readiness-fill.high { background: linear-gradient(90deg, #84cc16, var(--pass)); }
    .readiness-pct {
      min-width: 40px;
      color: var(--text);
      font-family: var(--mono);
      font-size: 13px;
      font-weight: 700;
      text-align: right;
    }
    .score-note {
      margin-bottom: 22px;
      color: var(--muted);
      font-size: 12px;
    }
    .conformance-strip {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 28px;
      padding: 12px 16px;
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .conf-label {
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .conf-value {
      padding: 3px 10px;
      border-radius: 999px;
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
    }
    .conf-value.none { color: var(--fail); background: var(--fail-bg); border: 1px solid var(--fail-border); }
    .conf-value.level-1 { color: var(--warn); background: var(--warn-bg); border: 1px solid var(--warn-border); }
    .conf-value.level-2a { color: var(--pass); background: var(--pass-bg); border: 1px solid var(--pass-border); }
    .conf-hint { color: var(--muted); font-size: 12px; }
    .section { margin-bottom: 32px; }
    .section-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 16px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--border);
    }
    .section-title {
      color: var(--text);
      font-size: 13px;
      font-weight: 700;
      letter-spacing: -0.01em;
    }
    .section-count {
      color: var(--muted);
      background: var(--surface-3);
      border-radius: 999px;
      padding: 2px 7px;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 700;
    }
    .section-count.fail { color: var(--fail); background: var(--fail-bg); }
    .section-count.warn { color: var(--warn); background: var(--warn-bg); }
    .section-count.pass { color: var(--pass); background: var(--pass-bg); }
    .steps-list, .checks-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .step-item {
      display: grid;
      grid-template-columns: 104px minmax(0, 1fr);
      gap: 12px 16px;
      align-items: start;
      padding: 14px 16px;
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .step-priority {
      padding: 3px 8px;
      border-radius: 999px;
      font-family: var(--mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-align: center;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .step-priority.p0 { color: var(--fail); background: var(--fail-bg); border: 1px solid var(--fail-border); }
    .step-priority.p1 { color: var(--warn); background: var(--warn-bg); border: 1px solid var(--warn-border); }
    .step-priority.p2 { color: var(--muted); background: var(--surface-3); border: 1px solid var(--border-2); }
    .step-title {
      margin-bottom: 4px;
      color: var(--text);
      font-size: 13px;
      font-weight: 700;
    }
    .step-desc {
      color: var(--muted);
      font-size: 12px;
      line-height: 1.5;
    }
    details.check-item {
      overflow: hidden;
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    details.check-item.fail { border-left: 3px solid var(--fail); }
    details.check-item.warn { border-left: 3px solid var(--warn); }
    details.check-item.pass { border-left: 3px solid var(--pass); }
    details.check-item[open] { border-color: var(--border-2); }
    summary.check-summary {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      cursor: pointer;
      list-style: none;
    }
    summary.check-summary::-webkit-details-marker { display: none; }
    summary.check-summary:hover { background: var(--surface-2); }
    .check-chevron {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
      color: var(--dim);
      transition: transform 0.2s;
    }
    details[open] .check-chevron { transform: rotate(90deg); }
    .check-sev {
      width: 6px;
      height: 6px;
      flex-shrink: 0;
      border-radius: 50%;
    }
    .check-sev.fail { background: var(--fail); box-shadow: 0 0 6px var(--fail); }
    .check-sev.warn { background: var(--warn); box-shadow: 0 0 6px var(--warn); }
    .check-sev.pass { background: var(--pass); }
    .check-code {
      flex: 1;
      color: var(--text);
      font-family: var(--mono);
      font-size: 12px;
      font-weight: 700;
      overflow-wrap: anywhere;
    }
    .check-req {
      color: var(--dim);
      font-family: var(--mono);
      font-size: 11px;
    }
    .check-badge {
      flex-shrink: 0;
      padding: 2px 8px;
      border-radius: 999px;
      font-family: var(--mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .check-badge.fail { color: var(--fail); background: var(--fail-bg); border: 1px solid var(--fail-border); }
    .check-badge.warn { color: var(--warn); background: var(--warn-bg); border: 1px solid var(--warn-border); }
    .check-badge.pass { color: var(--pass); background: var(--pass-bg); border: 1px solid var(--pass-border); }
    .check-body {
      padding: 0 16px 16px 44px;
    }
    .check-message {
      margin-bottom: 8px;
      color: var(--text);
      font-size: 13px;
    }
    .check-meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin-bottom: 10px;
    }
    .check-meta-item {
      color: var(--muted);
      font-family: var(--mono);
      font-size: 11px;
    }
    .check-meta-item span { color: var(--dim); }
    .check-fix {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-bottom: 10px;
      padding: 10px 12px;
      background: var(--surface-2);
      border: 1px solid var(--border-2);
      border-radius: var(--r-sm);
    }
    .check-fix-icon {
      flex-shrink: 0;
      color: var(--blue);
      font-size: 12px;
    }
    .check-fix-text {
      color: var(--text);
      font-size: 12px;
    }
    pre.check-evidence {
      margin: 0;
      padding: 10px 12px;
      overflow-x: auto;
      color: var(--muted);
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      font-family: var(--mono);
      font-size: 11px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .empty-state {
      padding: 20px 16px;
      color: var(--dim);
      border: 1px dashed var(--border);
      border-radius: var(--r-md);
      font-size: 12px;
      text-align: center;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
      gap: 8px;
    }
    .metric-card {
      padding: 12px 14px;
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .metric-label {
      margin-bottom: 6px;
      color: var(--muted);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .metric-value {
      color: var(--text);
      font-family: var(--mono);
      font-size: 18px;
      font-weight: 700;
      line-height: 1;
    }
    .metric-value.is-false { color: var(--fail); }
    .metric-value.is-true { color: var(--pass); }
    .metric-value.is-zero { color: var(--dim); }
    .sidebar {
      grid-area: sidebar;
      padding-top: 32px;
    }
    .sidebar-sticky {
      position: sticky;
      top: 24px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .sidebar-card {
      overflow: hidden;
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
    }
    .sidebar-card-head {
      padding: 12px 16px;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    .sidebar-card-body { padding: 14px 16px; }
    .sidebar-verdict {
      font-family: var(--mono);
      font-size: 24px;
      font-weight: 700;
      letter-spacing: -0.04em;
    }
    .sidebar-verdict.pass { color: var(--pass); }
    .sidebar-verdict.fail { color: var(--fail); }
    .sidebar-sub {
      margin-top: 3px;
      color: var(--dim);
      font-family: var(--mono);
      font-size: 11px;
    }
    .summary-counts {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 8px;
    }
    .count-tile {
      padding: 10px;
      background: var(--surface-2);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      text-align: center;
    }
    .count-n {
      display: block;
      font-family: var(--mono);
      font-size: 20px;
      font-weight: 700;
      line-height: 1;
    }
    .count-n.fail { color: var(--fail); }
    .count-n.warn { color: var(--warn); }
    .count-n.pass { color: var(--pass); }
    .count-n.neutral { color: var(--text); }
    .count-lbl {
      display: block;
      margin-top: 4px;
      color: var(--dim);
      font-size: 10px;
      text-transform: uppercase;
    }
    .meta-pairs {
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    .meta-pair {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      font-family: var(--mono);
      font-size: 11px;
    }
    .meta-key { color: var(--dim); }
    .meta-val {
      color: var(--muted);
      text-align: right;
      overflow-wrap: anywhere;
    }
    .sidebar-links {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .sidebar-link {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
    }
    .sidebar-link:hover { color: var(--text); }
    .learn-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 10px;
    }
    .learn-card {
      padding: 14px;
      background: var(--surface-1);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .learn-card strong {
      display: block;
      margin-bottom: 6px;
    }
    .learn-card p {
      color: var(--muted);
      font-size: 12px;
    }
    .footer {
      grid-area: footer;
      display: flex;
      justify-content: space-between;
      gap: 24px;
      padding: 24px 0 32px;
      color: var(--muted);
      border-top: 1px solid var(--border);
      font-size: 12px;
    }
    .footer-left { max-width: 720px; }
    .footer strong { color: var(--text); }
    .footer-links a { color: var(--muted); }
    @media (max-width: 900px) {
      .layout {
        grid-template-columns: 1fr;
        grid-template-areas:
          "topbar"
          "main"
          "sidebar"
          "footer";
      }
      .sidebar { padding: 0 0 32px; }
      .sidebar-sticky { position: static; }
      .topbar, .footer { align-items: flex-start; flex-direction: column; }
    }
    @media (max-width: 640px) {
      .layout { padding: 0 16px; }
      .step-item { grid-template-columns: 1fr; }
      .verdict-word { font-size: 46px; }
      .readiness-row { align-items: flex-start; flex-direction: column; }
      .readiness-track { width: 100%; }
      summary.check-summary { align-items: flex-start; flex-wrap: wrap; }
      .check-body { padding-left: 16px; }
    }
  </style>
</head>
<body>
  <div class="layout">
    ${renderTopbar()}
    <main class="main">
      ${renderHero(result, readiness, verdictWord, verdictClass)}
      ${renderRecommendedNextSteps(result.checks)}
      ${renderCheckSections(result.checks)}
      ${renderMetrics(result.metrics)}
      ${renderLearnMore()}
    </main>
    ${renderSidebar(result, readiness, verdict, verdictWord, verdictClass)}
    ${renderFooter()}
  </div>
</body>
</html>
`
}

function renderTopbar(): string {
  return `<div class="topbar">
  <div class="topbar-left">
    <span class="logo">index-ai<span class="logo-sep">/</span>validator</span>
    <span class="topbar-pill">v${escapeHtml(PACKAGE_VERSION)}</span>
  </div>
  <div class="topbar-right">
    ${renderTextLink('jordach.dev', 'https://jordach.dev')}
    <span class="topbar-divider">/</span>
    ${renderTextLink('index-ai project', 'https://jordach.dev/projects/index-ai')}
    <span class="topbar-divider">/</span>
    ${renderTextLink('GitHub', 'https://github.com/jordachmakaya/index-ai-validator')}
  </div>
</div>`
}

function renderHero(
  result: ValidationResult,
  readiness: number,
  verdictWord: string,
  verdictClass: string,
): string {
  return `<section class="hero">
  <div class="hero-eyebrow">AI-readiness report</div>
  <h1 class="hero-title">Is this website readable by AI agents?</h1>
  <p class="hero-copy">${escapeHtml('Most websites are readable by browsers. This report checks whether yours is readable by AI agents.')}</p>
  <p class="hero-target">Target <span>${escapeHtml(result.target)}</span></p>
  <div class="verdict-display">
    <div class="verdict-word ${escapeHtml(verdictClass)}">${escapeHtml(verdictWord)}</div>
    <p class="verdict-sub">${escapeHtml(getInterpretation(result))}</p>
  </div>
  <div class="readiness-row">
    <span class="readiness-label">Readiness</span>
    <div class="readiness-track">
      <div class="readiness-fill ${escapeHtml(getReadinessClass(readiness))}" style="width: ${escapeHtml(`${readiness}%`)}"></div>
    </div>
    <span class="readiness-pct">${escapeHtml(`${readiness}%`)}</span>
  </div>
  <p class="score-note">${escapeHtml('The readiness score is a human-readable progress indicator based on passed checks. The CI verdict remains Passed/Failed.')}</p>
  <div class="conformance-strip">
    <span class="conf-label">Conformance</span>
    <span class="conf-value ${escapeHtml(result.conformance)}">${escapeHtml(result.conformance)}</span>
    <span class="conf-hint">${escapeHtml(getConformanceHint(result.conformance))}</span>
  </div>
</section>`
}

function getReadiness(result: ValidationResult): number {
  return result.summary.total === 0
    ? 0
    : Math.round((result.summary.pass / result.summary.total) * 100)
}

function getReadinessClass(readiness: number): string {
  if (readiness >= 80) {
    return 'high'
  }

  if (readiness >= 50) {
    return 'mid'
  }

  return 'low'
}

function renderRecommendedNextSteps(checks: readonly ValidationCheck[]): string {
  const steps = getRecommendedSteps(checks)

  return `<section class="section">
  <div class="section-header">
    <span class="section-title">Recommended next steps</span>
    <span class="section-count ${steps.length > 0 ? 'warn' : ''}">${escapeHtml(steps.length > 0 ? `${steps.length} actions` : '0 actions')}</span>
  </div>
  ${steps.length > 0
    ? `<div class="steps-list">
    ${steps.map(renderRecommendedStep).join('\n    ')}
  </div>`
    : '<p class="empty-state">No recommended next steps from the current check set.</p>'}
</section>`
}

function renderRecommendedStep(step: RecommendedStep, index: number): string {
  return `<div class="step-item">
  <span class="step-priority ${escapeHtml(getStepPriorityClass(index))}">${escapeHtml(getStepLabel(index))}</span>
  <div>
    <div class="step-title">${escapeHtml(step.title)}</div>
    <div class="step-desc">${escapeHtml(step.description)}</div>
  </div>
</div>`
}

function getStepLabel(index: number): string {
  if (index === 0) {
    return 'Priority fix'
  }

  if (index === 1) {
    return 'Then improve'
  }

  return 'Later'
}

function getStepPriorityClass(index: number): string {
  if (index === 0) {
    return 'p0'
  }

  if (index === 1) {
    return 'p1'
  }

  return 'p2'
}

function getRecommendedSteps(checks: readonly ValidationCheck[]): RecommendedStep[] {
  const stepsByTitle = new Map<string, RecommendedStep>()

  for (const check of checks) {
    if (check.severity === 'pass') {
      continue
    }

    const step = getRecommendedStep(check)

    if (!step) {
      continue
    }

    const existingStep = stepsByTitle.get(step.title)

    if (
      !existingStep
      || SEVERITY_PRIORITY[step.severity] < SEVERITY_PRIORITY[existingStep.severity]
      || (
        SEVERITY_PRIORITY[step.severity] === SEVERITY_PRIORITY[existingStep.severity]
        && step.priority < existingStep.priority
      )
    ) {
      stepsByTitle.set(step.title, step)
    }
  }

  return Array.from(stepsByTitle.values())
    .sort((left, right) => {
      const severityDifference = SEVERITY_PRIORITY[left.severity] - SEVERITY_PRIORITY[right.severity]

      return severityDifference === 0
        ? left.priority - right.priority
        : severityDifference
    })
    .slice(0, 5)
}

function getRecommendedStep(check: ValidationCheck): RecommendedStep | null {
  switch (check.code) {
    case CHECK.SEC_SECRET_PATTERN:
    case CHECK.SEC_PRIVATE_INFRA_PATTERN:
      return step(
        check,
        0,
        'Remove sensitive public AI-facing content',
        'Remove secrets, tokens, private infrastructure references, or sensitive data from clean endpoints.',
      )

    case CHECK.L1_MANIFEST_FOUND:
      return step(
        check,
        10,
        'Add the AI Manifest',
        'Publish a valid index-ai manifest at /.well-known/index-ai.json.',
      )

    case CHECK.L2A_SHADOW_DECLARED:
    case CHECK.L2A_SHADOW_FOUND:
    case CHECK.L2A_SHADOW_CONTENT_TYPE:
    case CHECK.L2A_SHADOW_JSON_VALID:
    case CHECK.L2A_SHADOW_SCHEMA_VALID:
      return step(
        check,
        30,
        'Add the Shadow Index',
        'Publish /ai-graph.json and declare it in access.shadow_layer.',
      )

    case CHECK.L2A_LLM_URL_PROTOCOL:
    case CHECK.L2A_LLM_URL_FETCH:
    case CHECK.L2A_LLM_URL_CONTENT_TYPE:
    case CHECK.HTTP_NETWORK_ERROR:
    case CHECK.HTTP_PRIVATE_HOST_BLOCKED:
      return step(
        check,
        40,
        'Fix clean endpoint content types',
        'Serve llm_url endpoints as text/markdown or text/plain.',
      )

    case CHECK.L2A_CONTENT_CHARS_EXACT_MATCH:
    case CHECK.L2A_CONTENT_CHARS_MAX_VALID:
    case CHECK.L2A_NODE_CONTENT_CHARS_REQUIRED:
    case CHECK.L2A_NODE_CONTENT_CHARS_MODE_REQUIRED:
      return step(
        check,
        50,
        'Recompute content_chars',
        'Measure content_chars from the exact clean endpoint body after Unicode NFC normalization.',
      )

    case CHECK.DISCOVERY_HTML_LINK:
      return step(
        check,
        20,
        'Add the HTML discovery link',
        'Add <link rel="ai-index" href="/.well-known/index-ai.json" type="application/json"> to the homepage head.',
      )

    case CHECK.DISCOVERY_HTTP_LINK_HEADER:
      return step(
        check,
        21,
        'Add the HTTP Link discovery header',
        'Add Link: </.well-known/index-ai.json>; rel="ai-index"; type="application/json".',
      )

    case CHECK.DISCOVERY_ROBOTS_AI_INDEX:
      return step(
        check,
        22,
        'Add the robots.txt AI-Index hint',
        'Add AI-Index: /.well-known/index-ai.json to robots.txt.',
      )

    case CHECK.DISCOVERY_LLMS_TXT_CONTENT_TYPE:
      return step(
        check,
        23,
        'Add or fix llms.txt',
        'Serve /llms.txt as text/plain; charset=utf-8.',
      )

    case CHECK.DISCOVERY_LLMS_TXT_BRIDGE:
      return step(
        check,
        24,
        'Link llms.txt to the AI Manifest',
        'Reference /.well-known/index-ai.json from /llms.txt.',
      )

    default:
      return null
  }
}

function step(
  check: ValidationCheck,
  priority: number,
  title: string,
  description: string,
): RecommendedStep {
  return {
    title,
    description,
    priority,
    severity: check.severity,
  }
}

function renderCheckSections(checks: readonly ValidationCheck[]): string {
  return `${renderSeveritySection('Failures', 'fail', checks)}
${renderSeveritySection('Warnings', 'warn', checks)}
${renderSeveritySection('Passed checks', 'pass', checks)}`
}

function renderSeveritySection(
  title: string,
  severity: Severity,
  checks: readonly ValidationCheck[],
): string {
  const matchingChecks = checks.filter((check) => check.severity === severity)

  return `<section class="section">
  <div class="section-header">
    <span class="section-title">${escapeHtml(title)}</span>
    <span class="section-count ${escapeHtml(severity)}">${escapeHtml(matchingChecks.length)}</span>
  </div>
  ${matchingChecks.length > 0
    ? `<div class="checks-list">
    ${matchingChecks.map((check, index) => renderCheck(check, index === 0 && severity === 'fail')).join('\n    ')}
  </div>`
    : `<p class="empty-state">No ${escapeHtml(title.toLowerCase())}.</p>`}
</section>`
}

function renderCheck(check: ValidationCheck, open: boolean): string {
  return `<details class="check-item ${escapeHtml(check.severity)}"${open ? ' open' : ''}>
  <summary class="check-summary">
    ${renderChevron()}
    <span class="check-sev ${escapeHtml(check.severity)}"></span>
    <span class="check-code">${escapeHtml(check.code)}</span>
    <span class="check-req">${escapeHtml(check.requirement)}</span>
    <span class="check-badge ${escapeHtml(check.severity)}">${escapeHtml(check.severity)}</span>
  </summary>
  <div class="check-body">
    <p class="check-message">${escapeHtml(check.message)}</p>
    <div class="check-meta-row">
      <span class="check-meta-item"><span>Requirement</span> ${escapeHtml(check.requirement)}</span>
      ${check.url ? `<span class="check-meta-item"><span>URL</span> ${escapeHtml(check.url)}</span>` : ''}
      ${check.docs_url ? `<span class="check-meta-item"><span>Docs</span> ${escapeHtml(check.docs_url)}</span>` : ''}
    </div>
    ${check.fix ? `<div class="check-fix"><span class="check-fix-icon">-&gt;</span><span class="check-fix-text"><strong>Fix:</strong> ${escapeHtml(check.fix)}</span></div>` : ''}
    ${check.details ? `<pre class="check-evidence">${escapeHtml(check.details)}</pre>` : ''}
  </div>
</details>`
}

function renderChevron(): string {
  return `<svg class="check-chevron" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
  <polyline points="6 4 10 8 6 12"></polyline>
</svg>`
}

function renderMetrics(metrics: ValidationMetrics): string {
  return `<section class="section">
  <div class="section-header">
    <span class="section-title">Metrics</span>
  </div>
  <div class="metrics-grid">
    ${renderMetric('Manifest found', metrics.manifest_found)}
    ${renderMetric('Manifest schema valid', metrics.manifest_schema_valid)}
    ${renderMetric('Shadow layer found', metrics.shadow_layer_found)}
    ${renderMetric('Shadow schema valid', metrics.shadow_layer_schema_valid)}
    ${renderMetric('Total nodes', metrics.total_nodes)}
    ${renderMetric('Nodes with llm_url', metrics.nodes_with_llm_url)}
    ${renderMetric('Nodes with content_chars', metrics.nodes_with_content_chars)}
    ${renderMetric('Clean endpoints', metrics.valid_clean_endpoints)}
    ${renderMetric('Valid content_chars', metrics.valid_content_chars)}
    ${renderMetric('HTML leaks', metrics.html_leaks)}
    ${renderMetric('Secret findings', metrics.secret_findings)}
    ${renderMetric('llm_url coverage', `${metrics.coverage.llm_url_percent}%`)}
    ${renderMetric('content_chars coverage', `${metrics.coverage.content_chars_percent}%`)}
  </div>
</section>`
}

function renderMetric(label: string, value: unknown): string {
  return `<div class="metric-card">
  <div class="metric-label">${escapeHtml(label)}</div>
  <div class="metric-value ${escapeHtml(getMetricClass(value))}">${escapeHtml(value)}</div>
</div>`
}

function getMetricClass(value: unknown): string {
  if (value === true) {
    return 'is-true'
  }

  if (value === false) {
    return 'is-false'
  }

  if (value === 0 || value === '0%') {
    return 'is-zero'
  }

  return ''
}

function renderSidebar(
  result: ValidationResult,
  readiness: number,
  verdict: string,
  verdictWord: string,
  verdictClass: string,
): string {
  return `<aside class="sidebar">
  <div class="sidebar-sticky">
    <div class="sidebar-card">
      <div class="sidebar-card-head">CI Verdict</div>
      <div class="sidebar-card-body">
        <div class="sidebar-verdict ${escapeHtml(verdictClass)}">${escapeHtml(verdictWord)}</div>
        <div class="sidebar-sub">${escapeHtml(`passed: ${String(result.passed)} / ${verdict}`)}</div>
      </div>
    </div>
    <div class="sidebar-card">
      <div class="sidebar-card-head">Checks Summary</div>
      <div class="sidebar-card-body">
        <div class="summary-counts">
          ${renderCountTile('Fail', result.summary.fail, 'fail')}
          ${renderCountTile('Warn', result.summary.warn, 'warn')}
          ${renderCountTile('Pass', result.summary.pass, 'pass')}
          ${renderCountTile('Total', result.summary.total, 'neutral')}
        </div>
      </div>
    </div>
    <div class="sidebar-card">
      <div class="sidebar-card-head">Run metadata</div>
      <div class="sidebar-card-body">
        <div class="meta-pairs">
          ${renderMetaPair('Generated', result.generated_at)}
          ${renderMetaPair('Duration', `${result.duration_ms} ms`)}
          ${renderMetaPair('Schema', result.schema_version)}
          ${renderMetaPair('Readiness', `${readiness}%`)}
          ${renderMetaPair('Target', result.target)}
        </div>
      </div>
    </div>
    <div class="sidebar-card">
      <div class="sidebar-card-head">Resources</div>
      <div class="sidebar-card-body">
        <div class="sidebar-links">
          ${renderSidebarLink('index-ai project', 'https://jordach.dev/projects/index-ai')}
          ${renderSidebarLink('Validator tool', 'https://jordach.dev/tools/index-ai-validator')}
          ${renderSidebarLink('AI-readable audit service', 'https://jordach.dev/services/ai-readable-website-audit')}
          ${renderSidebarLink('GitHub repository', 'https://github.com/jordachmakaya/index-ai-validator')}
          ${renderSidebarLink('Contact Jordach Makaya', 'https://jordach.dev/contact')}
        </div>
      </div>
    </div>
  </div>
</aside>`
}

function renderCountTile(label: string, value: number, className: string): string {
  return `<div class="count-tile"><span class="count-n ${escapeHtml(className)}">${escapeHtml(value)}</span><span class="count-lbl">${escapeHtml(label)}</span></div>`
}

function renderMetaPair(label: string, value: unknown): string {
  return `<div class="meta-pair"><span class="meta-key">${escapeHtml(label)}</span><span class="meta-val">${escapeHtml(value)}</span></div>`
}

function renderSidebarLink(label: string, url: string): string {
  return `<a class="sidebar-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer"><span>${escapeHtml(label)}</span><span aria-hidden="true">-&gt;</span></a>`
}

function renderLearnMore(): string {
  return `<section class="section">
  <div class="section-header">
    <span class="section-title">Learn more</span>
  </div>
  <div class="learn-grid">
    ${renderLearnCard('index-ai project', 'Read the project background and specification direction.', 'https://jordach.dev/projects/index-ai')}
    ${renderLearnCard('validator tool', 'Use the free CLI validator and share reports with your team.', 'https://jordach.dev/tools/index-ai-validator')}
    ${renderLearnCard('AI-readable website audit', 'Get help reviewing an agent-facing content layer.', 'https://jordach.dev/services/ai-readable-website-audit')}
    ${renderLearnCard('GitHub repository', 'Inspect the validator source and issue history.', 'https://github.com/jordachmakaya/index-ai-validator')}
    ${renderLearnCard('Contact', 'Reach Jordach Makaya about AI-readable website infrastructure.', 'https://jordach.dev/contact')}
  </div>
</section>`
}

function renderLearnCard(title: string, description: string, url: string): string {
  return `<article class="learn-card"><strong>${renderTextLink(title, url)}</strong><p>${escapeHtml(description)}</p></article>`
}

function renderFooter(): string {
  return `<footer class="footer">
  <div class="footer-left">
    <p>Generated by <strong>@hardmachinelabs/index-ai-validator</strong>. Part of the experimental index-ai project by Jordach Makaya.</p>
    <p>This report is generated by an experimental validator.</p>
    <p>index-ai is not a formal standard.</p>
    <p>This report is not legal compliance, production certification, a traffic guarantee, SEO ranking guarantee, security audit, or vulnerability scan.</p>
  </div>
  <div class="footer-links">
    ${renderTextLink('jordach.dev', 'https://jordach.dev')}
    ${renderTextLink('index-ai project', 'https://jordach.dev/projects/index-ai')}
    ${renderTextLink('contact', 'https://jordach.dev/contact')}
  </div>
</footer>`
}

function renderTextLink(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
}

function getInterpretation(result: ValidationResult): string {
  if (result.passed) {
    return 'The target passed the current validation policy. The automation verdict is passed, and the implemented index-ai checks did not find blocking issues.'
  }

  if (result.conformance === 'none') {
    return 'This site does not currently expose a valid Level 1 index-ai manifest. AI agents cannot reliably discover the public machine-readable layer yet.'
  }

  return 'The target exposes part of the expected index-ai layer, but one or more checks failed under the current validation policy.'
}

function getConformanceHint(conformance: ValidationResult['conformance']): string {
  if (conformance === 'level-2a') {
    return 'Manifest and Shadow Index structure reached the current implemented Level 2a checks.'
  }

  if (conformance === 'level-1') {
    return 'A Level 1 manifest is present; Shadow Index and endpoint readiness may still need work.'
  }

  return 'Level 1 required checks did not pass.'
}

function escapeHtml(value: unknown): string {
  return stringify(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function stringify(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value)
  }

  return JSON.stringify(value, null, 2) ?? ''
}
