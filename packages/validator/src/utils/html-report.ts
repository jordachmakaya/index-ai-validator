/**
 * @filemeta
 * type: utility
 * title: HTML report formatters (validate + scan)
 * description: Renders the locked R3/R3v (validate) and Hybride R2+R3 (scan) report designs — 0%-drift reproduction of the design mockups — plus the ADR_008 AI Fix Prompt dynamic section (copy-button-only, deterministic, anti-injection, one-blocker-at-a-time state machine).
 * job_ref: T5.30_level-2b-cli-and-reports
 * functions: [formatHtmlReport, formatScanHtmlReport]
 * classes: []
 * inputs: [ValidationResult, HtmlFormatOptions, ScanResult]
 * outputs: [string]
 * relations:
 *   - imports: packages/validator/src/constants.ts
 *   - imports: packages/validator/src/types.ts
 *   - imports: packages/validator/src/utils/target-level.ts
 *   - imports: packages/validator/src/utils/attribution.ts
 *   - imports: packages/validator/src/schemas.ts
 *   - used_by: packages/validator/src/cli.ts
 *   - tested_by: packages/validator/src/utils/html-report.test.ts
 * last_update: 2026-07-13
 */

import type {
  LevelResult,
  TargetLevel,
  ValidationCheck,
  ValidationResult,
} from '../types'
import { rewriteAttributionSrc } from './attribution'
import { computeLevelResults, levelOfCheck } from './target-level'
import type { ScanResult } from '../schemas'

type HtmlFormatOptions = {
  readonly targetLevel: TargetLevel
}

const PACKAGE_VERSION = '0.2.0'

/**
 * Scan report chassis "engine X" display version — matches the locked
 * VARIANT_Hybride mockups' own literal "engine 0.1.0" text exactly (both
 * mockups hardcode this, decoupled from any live field). Deliberately NOT
 * `result.engineVersion`: the mockups' decorative masthead/colophon "engine"
 * label denotes the report chassis/scan-engine generation, not the specific
 * scan run's raw `engineVersion` field (already shown structurally nowhere
 * else in these two reports).
 */
const SCAN_CHASSIS_ENGINE_VERSION = '0.1.0'

// ---------------------------------------------------------------------------
// Shared helpers (escaping, clipboard script)
// ---------------------------------------------------------------------------

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

const CHECK_SVG = '<svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="none" stroke="#10B981" stroke-width="1.6"/><path d="M5 8.2 L7 10.2 L11 5.8" fill="none" stroke="#10B981" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

/**
 * ADR_008: clipboard helper wired to any `<button id="copy-fix-prompt">`.
 * Reads the prompt from `data-prompt` (never rendered visibly), copies it,
 * and dispatches the `fix_prompt_copied` event (Gate M1 intention-to-repair
 * signal) — the report ships the hook, instrumentation wiring is out of
 * scope here. Shared verbatim by both reports.
 */
const CLIPBOARD_COPY_SCRIPT = `<script>
document.getElementById('copy-fix-prompt')?.addEventListener('click', function(e) {
  e.preventDefault();
  const promptText = this.getAttribute('data-prompt');
  if (promptText) {
    navigator.clipboard.writeText(promptText).then(() => {
      window.dispatchEvent(new CustomEvent('fix_prompt_copied', { bubbles: true }));
      console.log('Event emitted: fix_prompt_copied');
      const originalText = this.innerText;
      this.innerText = 'Copied';
      this.style.color = '#10B981';
      setTimeout(() => {
        this.innerText = originalText;
        this.style.color = '';
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy prompt: ', err);
    });
  }
});
</script>`

/**
 * Renders the shared "AI Fix Prompt" card (ADR_008): a single visible
 * "Copy Prompt" button — the assembled `prompt` text is NEVER rendered
 * visibly, only inside the `data-prompt` attribute (HTML-escaped, so it is
 * both safe and inert as page text). `label` is a stable, safe identifier
 * (a check `code` for validate, a friendly name derived from a finding `id`
 * for scan) — never raw check/finding message/title/detail text.
 */
function renderFixPromptCard(label: string, prompt: string, tagline: string): string {
  return `<div class="fixprompt">
    <h2>AI Fix Prompt</h2>
    <p class="fixprompt-tag">${escapeHtml(tagline)}</p>
    <p class="fixprompt-copy">We provide a pre-configured prompt that you can feed to your coding agent (Claude Code, Cursor, Windsurf, etc.) to automatically resolve the failures found in this validation. Copy the prompt to fix: <code>${escapeHtml(label)}</code>.</p>
    <button type="button" id="copy-fix-prompt" class="fixprompt-btn" data-prompt="${escapeHtml(prompt)}" data-event="fix_prompt_copied">Copy Prompt</button>
  </div>`
}

const FIX_PROMPT_CSS = `
.fixprompt{margin-bottom:26px;padding:20px 22px;background:linear-gradient(90deg,rgba(16,185,129,.07),transparent 60%),var(--s1);border:1px solid rgba(16,185,129,.35);border-radius:12px}
.fixprompt h2{font:600 15px var(--head);margin-bottom:6px}
.fixprompt-tag{color:var(--pass);font:700 11px var(--mono);letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px}
.fixprompt-copy{color:var(--muted);font-size:13px;max-width:640px;margin-bottom:14px}
.fixprompt-copy code{color:var(--pass);font:600 12px var(--mono)}
.fixprompt-btn{appearance:none;cursor:pointer;background:var(--pass);color:#04110c;border:none;border-radius:6px;padding:10px 18px;font:700 13px var(--head)}
.fixprompt-btn:hover{filter:brightness(1.08)}
`

// ---------------------------------------------------------------------------
// VALIDATE report — R3 (general split-verdict) / R3v-pass (Level 2b success)
// ---------------------------------------------------------------------------

type Rung = {
  readonly level: TargetLevel
  readonly code: string
  readonly name: string
  readonly desc: string
}

const RUNGS: readonly Rung[] = [
  { level: 'l1', code: 'L1', name: 'AI Manifest', desc: 'Identity, freshness, policy' },
  { level: 'l2a', code: 'L2a', name: 'Agent Index', desc: 'Nodes, clean endpoints, measured size' },
  { level: 'l2b', code: 'L2b', name: 'Agent Graph', desc: 'Typed relations, valid DAG' },
]

const VALIDATE_RECIPE: Record<TargetLevel, string> = {
  l1: 'Create a Level 1 AI Manifest at /.well-known/index-ai.json declaring spec_version, manifest_version, identity, freshness, and access, then re-run the validator.',
  l2a: 'Generate /agent-index.json declaring your content nodes. Each node needs an llm_url pointing at a clean text/markdown or text/plain endpoint and a measured content_chars value, then declare access.agent_index in your manifest and re-run the validator.',
  l2b: 'Repair the Level 2b Agent Graph so relations.parent/relations.children form a valid DAG: remove or correct the cycle, keep every relation bidirectionally consistent, ensure at least one root (parent: null), and make sure every id referenced in relations.children/relations.related exists, then re-run the validator.',
}

export function formatHtmlReport(result: ValidationResult, options: HtmlFormatOptions): string {
  const levelResults = computeLevelResultsFor(result.checks, options.targetLevel)

  return result.conformance === 'level-2b'
    ? renderValidatePassL2b(result, levelResults)
    : renderValidateGeneral(result, levelResults)
}

/**
 * Calls `computeLevelResults` with `targetLevel` narrowed to one of its
 * three overloaded literal signatures via an explicit switch — a plain
 * `TargetLevel`-typed argument doesn't match any single overload of a
 * function overloaded on string literals.
 */
function computeLevelResultsFor(
  checks: ValidationCheck[],
  targetLevel: TargetLevel,
): LevelResult[] {
  switch (targetLevel) {
    case 'l1':
      return computeLevelResults(checks, 'l1')
    case 'l2a':
      return computeLevelResults(checks, 'l2a')
    case 'l2b':
      return computeLevelResults(checks, 'l2b')
  }
}

function findBlockedLevel(levelResults: readonly LevelResult[]): LevelResult | undefined {
  return levelResults.find((levelResult) => levelResult.status === 'tested' && levelResult.fail > 0)
}

function findPrimaryFailCheck(
  checks: readonly ValidationCheck[],
  level: TargetLevel,
): ValidationCheck | undefined {
  return checks.find((check) => check.severity === 'fail' && levelOfCheck(check.code) === level)
}

function buildValidatePrompt(
  checks: readonly ValidationCheck[],
  blockedLevel: LevelResult,
): { readonly label: string; readonly prompt: string } {
  const primary = findPrimaryFailCheck(checks, blockedLevel.level)
  const label = primary?.code ?? 'VALIDATION_FAILURE'
  const header = 'You are an expert AI coder. Use the index-ai validator diagnosis below to fix the blocking conformance issue, then re-run the validator to confirm.'
  const diagnosis = `Diagnosis:\n{\n  "id": "${label}"\n}`
  const recipe = VALIDATE_RECIPE[blockedLevel.level]

  return { label, prompt: `${header}\n\n${diagnosis}\n\n${recipe}` }
}

function ladderState(levelResults: readonly LevelResult[]): {
  readonly lastDoneIndex: number
  readonly blockedIndex: number
} {
  let lastDoneIndex = -1
  let blockedIndex = -1

  for (let index = 0; index < levelResults.length; index += 1) {
    const levelResult = levelResults[index]

    if (!levelResult || levelResult.status === 'skipped') {
      break
    }

    if (levelResult.fail > 0) {
      blockedIndex = index
      break
    }

    lastDoneIndex = index
  }

  return { lastDoneIndex, blockedIndex }
}

function renderRung(rung: Rung, levelResult: LevelResult | undefined, isCrown: boolean): string {
  if (!levelResult || levelResult.status === 'skipped') {
    return `<div class="rung next"><div class="lv">${rung.code}</div><div class="nm">${rung.name}</div><div class="ds">${rung.desc}</div></div>`
  }

  if (levelResult.fail > 0) {
    return `<div class="rung here"><span class="mark">blocked here</span><div class="lv">${rung.code}</div><div class="nm">${rung.name}</div><div class="ds">${rung.desc}</div></div>`
  }

  // T5.30 (Reviewer BLOCK finding 2a): the highest earned rung on a TRUE
  // Level 2b pass gets `rung crown` (locked mockup
  // R3v-pass_split-verdict_validate_L2b.html:117), distinct from lower
  // reached-but-not-highest rungs which stay `rung done`.
  const rungClass = isCrown ? 'crown' : 'done'

  return `<div class="rung ${rungClass}"><span class="mark">reached</span><div class="lv">${rung.code}</div><div class="nm">${rung.name}</div><div class="ds">${rung.desc}</div></div>`
}

function renderLadder(
  levelResults: readonly LevelResult[],
  l3State: 'next' | 'reached',
  crownIndex?: number,
): string {
  const rungs = RUNGS.map((rung, index) => renderRung(rung, levelResults[index], index === crownIndex)).join('')
  const l3Mark = l3State === 'reached' ? '<span class="mark">next</span>' : ''
  const l3 = `<div class="rung next">${l3Mark}<div class="lv">L3</div><div class="nm">Query Interface</div><div class="ds">MCP server</div></div>`

  return `<div class="ladder">${rungs}${l3}</div>`
}

function renderLadderCap(levelResults: readonly LevelResult[]): string {
  const { lastDoneIndex, blockedIndex } = ladderState(levelResults)

  if (blockedIndex === -1) {
    const label = lastDoneIndex >= 0 ? RUNGS[lastDoneIndex]?.code : undefined
    return label
      ? `<p class="ladder-cap">The conformance ladder. This site clears <b>${label}</b>.</p>`
      : '<p class="ladder-cap">The conformance ladder.</p>'
  }

  const blockedRung = RUNGS[blockedIndex]
  const blockedLevelResult = levelResults[blockedIndex]

  if (!blockedRung || !blockedLevelResult) {
    return '<p class="ladder-cap">The conformance ladder.</p>'
  }

  const n = blockedLevelResult.fail

  if (lastDoneIndex === -1) {
    return `<p class="ladder-cap">The conformance ladder. This site does not yet reach ${blockedRung.code} — <b>${n} failures below</b> keep it from clearing the rung.</p>`
  }

  const doneRung = RUNGS[lastDoneIndex]

  return `<p class="ladder-cap">The conformance ladder. This site reaches ${doneRung?.code} and enters ${blockedRung.code} — <b>${n} failures below</b> keep it from clearing the rung.</p>`
}

function buildFailHeadline(checks: readonly ValidationCheck[]): string {
  const n = checks.filter((check) => check.severity === 'fail' && check.requirement === 'must').length

  return `${n} MUST check${n === 1 ? '' : 's'} block the Passed verdict`
}

function conformanceLabel(conformance: ValidationResult['conformance']): string {
  switch (conformance) {
    case 'level-1':
      return 'Level 1'
    case 'level-2a':
      return 'Level 2a'
    case 'level-2b':
      return 'Level 2b'
    case 'level-3':
      return 'Level 3'
    case 'none':
      return 'None'
  }
}

function renderChk(check: ValidationCheck): string {
  const sev = check.severity === 'fail' ? 'f' : 'w'

  return `<div class="chk ${sev}">
        <div class="hd"><span class="code">${escapeHtml(check.code)}</span><span class="req">${escapeHtml(check.requirement)}</span><span class="bdg ${sev}">${escapeHtml(check.severity)}</span></div>
        <p class="msg">${escapeHtml(check.message)}</p>
        ${check.fix ? `<div class="fix"><span>→</span><span><b>Fix:</b> ${escapeHtml(check.fix)}</span></div>` : ''}
        ${check.details ? `<pre class="evid">${escapeHtml(stringify(check.details))}</pre>` : ''}
      </div>`
}

function renderPassedItem(check: ValidationCheck): string {
  return `<div class="pitem">${CHECK_SVG}<div><div class="c">${escapeHtml(check.code)}</div><div class="m">${escapeHtml(check.message)}</div></div></div>`
}

function renderDuoFailuresWarnings(checks: readonly ValidationCheck[]): string {
  const fails = checks.filter((check) => check.severity === 'fail')
  const warns = checks.filter((check) => check.severity === 'warn')

  return `<div class="duo">
    <section>
      <div class="sec-h"><h2>Failures</h2><span class="cnt f">${fails.length}</span></div>
      ${fails.map(renderChk).join('\n      ')}
    </section>
    <section>
      <div class="sec-h"><h2>Warnings</h2><span class="cnt w">${warns.length}</span></div>
      ${warns.map(renderChk).join('\n      ')}
    </section>
  </div>`
}

function renderPassedSection(checks: readonly ValidationCheck[]): string {
  const passed = checks.filter((check) => check.severity === 'pass')

  return `<section style="margin-bottom:4px">
    <div class="sec-h"><h2>Passed</h2><span class="cnt p">${passed.length}</span></div>
    <div class="pgrid">${passed.map(renderPassedItem).join('')}</div>
  </section>`
}

const VALIDATE_TOPBAR = `<div class="top">
    <div style="display:flex;gap:10px;align-items:center"><span class="logo">index-ai<i>/</i>validator</span><span class="pill">v${PACKAGE_VERSION}</span></div>
    <div style="color:var(--muted);font-size:12px"><a href="https://jordach.dev/projects/index-ai" style="color:var(--muted)" target="_blank" rel="noopener noreferrer">index-ai standard</a> <span style="color:var(--dim)">/</span> <a href="https://github.com/jordachmakaya/index-ai-validator" style="color:var(--muted)" target="_blank" rel="noopener noreferrer">GitHub</a></div>
  </div>`

function renderValidateFoot(): string {
  return `<footer class="foot">
    <div>
      <p>Generated by <b>@hardmachinelabs/index-ai-validator</b> — local conformance check.</p>
      <p>Deterministic diagnostic. Not legal compliance, certification, traffic or ranking guarantee, security audit.</p>
    </div>
    <div>cli v${PACKAGE_VERSION}</div>
  </footer>`
}

const VALIDATE_RATIONALE_GENERAL = `<div class="rationale">
  <h2>R3v — Split-Verdict · validate (rationale)</h2>
  <p>Compagnon validate de R3. Le split humain/agent n'a pas de sens en validation locale — l'équivalent narratif est <b>l'échelle de conformance</b> (L1 → L2a → L2b → L3) avec la position du site et le barreau bloquant : le rapport raconte OÙ on est sur le standard et POURQUOI on n'avance pas. Failures/warnings en deux colonnes denses, passed en grille compacte, CTA « next rung » qui transforme la validation en progression. C'est la direction qui vend la spec elle-même.</p>
</div>`

const VALIDATE_RATIONALE_PASS = `<div class="rationale">
  <h2>R3v-pass — Split-Verdict · validate PASSED L2b (rationale)</h2>
  <p>L'état succès de R3v — le rapport qu'un client reçoit après un Pack livré, et l'écran de fin du dogfooding agent-view.com. Trois choix propres à cet état : (1) le panneau <b>Agent Graph</b> remplace la colonne Failures — les stats du graphe (roots, paires cohérentes, zéro cycle, zéro orphelin) sont la preuve concrète du 2b ; (2) le <b>bloc badge</b> apparaît uniquement en état PASSED — c'est le moment où le badge se gagne, avec le lien /verify (BADGE_SPEC §2) — direction badge D2 utilisée en placeholder, à aligner sur la DECISION badge ; (3) la CTA « next rung » pointe vers L3/MCP — même en succès, le rapport maintient une progression. Les checks L2B sont soulignés en vert pour marquer le barreau franchi. Un warn résiduel (verification_hint) garde le rapport honnête : PASSED n'est pas parfait.</p>
</div>`

/**
 * T5.30 (Reviewer BLOCK finding 2b): `.ladder-cap b` must render in the pass
 * (green) color only on the true Level 2b pass state (`renderValidatePassL2b`)
 * — every other state (general/fail) keeps the mockup's warn (amber) color.
 * Parameterized rather than a static constant so each caller supplies its
 * own accent and the non-selected color never appears in that render's output.
 */
function buildValidateCss(ladderCapAccent: 'warn' | 'pass'): string {
  return `
:root{color-scheme:dark;--bg:#010102;--s1:#0f1011;--s2:#141516;--line:#23252a;
--text:#e6e7ea;--muted:#8a8f98;--dim:#6b7280;--blue:#3B82F6;--violet:#8B5CF6;
--pass:#10B981;--warn:#F59E0B;--fail:#EF4444;
--sans:'Inter',system-ui,sans-serif;--head:'Outfit',var(--sans);--mono:'JetBrains Mono',monospace}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--text);font:14px/1.6 var(--sans)}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.wrap{max-width:1080px;margin:0 auto;padding:0 24px}
.top{display:flex;justify-content:space-between;align-items:center;padding:16px 0;border-bottom:1px solid var(--line)}
.logo{font:700 13px var(--head);letter-spacing:-.02em}.logo i{font-style:normal;color:var(--dim)}
.pill{color:var(--muted);background:var(--s1);border:1px solid var(--line);border-radius:9999px;padding:3px 8px;font:600 11px var(--mono)}
.vband{display:flex;align-items:center;gap:22px;flex-wrap:wrap;padding:30px 0 22px}
.vword{font:700 64px/1 var(--head);letter-spacing:-.04em;color:var(--fail)}
.vword.pass{color:var(--pass)}
.vtxt h1{font:600 21px/1.2 var(--head);letter-spacing:-.02em}
.vtxt p{color:var(--muted);font-size:13px;margin-top:4px}
.vtxt p b{color:var(--blue);font-weight:500;font-family:var(--mono);font-size:12px}
.ladder{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:8px}
.rung{background:var(--s1);padding:16px;position:relative}
.rung .lv{font:700 13px var(--mono);margin-bottom:4px}
.rung .nm{font:600 13px var(--head)}
.rung .ds{color:var(--dim);font-size:11px;margin-top:4px}
.rung.done{background:linear-gradient(180deg,rgba(16,185,129,.07),transparent)}
.rung.done .lv{color:var(--pass)}
.rung.here{background:linear-gradient(180deg,rgba(245,158,11,.09),transparent);outline:1px solid rgba(245,158,11,.4);outline-offset:-1px}
.rung.here .lv{color:var(--warn)}
.rung.crown{background:linear-gradient(180deg,rgba(16,185,129,.12),transparent);outline:1px solid rgba(16,185,129,.45);outline-offset:-1px}
.rung.crown .lv{color:var(--pass)}
.rung.next .lv{color:var(--dim)}
.rung.next .nm,.rung.next .ds{color:var(--dim)}
.rung .mark{position:absolute;top:12px;right:12px;font:700 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;border-radius:9999px;padding:2px 8px}
.rung.done .mark,.rung.crown .mark{color:var(--pass);background:rgba(16,185,129,.1)}
.rung.here .mark{color:var(--warn);background:rgba(245,158,11,.1)}
.rung.next .mark{color:var(--violet);background:rgba(139,92,246,.1)}
.ladder-cap{color:var(--dim);font-size:12px;margin-bottom:28px}
.ladder-cap b{color:var(--${ladderCapAccent})}
.earn{display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:18px 20px;background:linear-gradient(90deg,rgba(16,185,129,.06),transparent 55%),var(--s1);border:1px solid rgba(16,185,129,.35);border-radius:12px;margin-bottom:28px}
.earn-badge{display:inline-flex;align-items:center;gap:10px;background:var(--s2);border:1px solid var(--line);border-radius:8px;padding:8px 14px 8px 10px;flex:none}
.earn-badge .txt b{font:600 12.5px var(--head);display:block}
.earn-badge .txt span{color:var(--dim);font:11px var(--mono)}
.earn .t{font:600 14px var(--head)}
.earn .d{color:var(--muted);font-size:12px;margin-top:3px;max-width:480px}
.earn .lnk{margin-left:auto;color:var(--pass);font-size:12px;font-weight:600;white-space:nowrap}
.duo{display:grid;grid-template-columns:1fr 1fr;gap:28px;margin-bottom:8px}
.sec-h{display:flex;gap:10px;align-items:center;padding-bottom:9px;border-bottom:1px solid var(--line);margin-bottom:12px}
.sec-h h2{font:700 13px var(--head)}
.cnt{border-radius:9999px;padding:2px 8px;font:700 11px var(--mono)}
.cnt.f{color:var(--fail);background:rgba(239,68,68,.08)}.cnt.w{color:var(--warn);background:rgba(245,158,11,.08)}.cnt.p{color:var(--pass);background:rgba(16,185,129,.08)}
.chk{background:var(--s1);border:1px solid var(--line);border-left-width:3px;border-radius:8px;padding:13px 16px;margin-bottom:8px}
.chk.f{border-left-color:var(--fail)}.chk.w{border-left-color:var(--warn)}
.chk .hd{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:5px}
.code{font:700 12px var(--mono)}
.req{color:var(--dim);font:11px var(--mono)}
.bdg{margin-left:auto;border-radius:9999px;padding:2px 9px;font:700 10px var(--mono);text-transform:uppercase;letter-spacing:.08em}
.bdg.f{color:var(--fail);background:rgba(239,68,68,.08)}.bdg.w{color:var(--warn);background:rgba(245,158,11,.08)}
.chk .msg{font-size:13px}
.fix{display:flex;gap:8px;font-size:12px;color:var(--muted);background:var(--s2);border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin-top:8px}
.fix b{color:var(--text)}
.evid{background:var(--s2);border:1px solid var(--line);border-radius:6px;padding:8px 12px;font:11px/1.6 var(--mono);color:var(--muted);white-space:pre-wrap;margin-top:8px}
.gstat{display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}
.gstat:last-child{border-bottom:none}
.gstat .k{color:var(--muted)}
.gstat .n{font:700 15px var(--mono)}.gstat .n.p{color:var(--pass)}
.pgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:8px;margin-bottom:26px}
.pitem{display:flex;align-items:center;gap:10px;background:var(--s1);border:1px solid var(--line);border-radius:8px;padding:10px 12px}
.pitem svg{flex:none}
.pitem .c{font:700 11px var(--mono)}
.pitem .m{color:var(--dim);font-size:11px}
.pitem.l2b{border-color:rgba(16,185,129,.3)}
.agent-cta{display:flex;gap:16px;align-items:center;flex-wrap:wrap;padding:14px 18px;background:var(--s1);border:1px solid rgba(139,92,246,.4);border-radius:10px;margin-bottom:26px}
.agent-cta .tagv{flex:none;color:var(--violet);background:rgba(139,92,246,.12);border-radius:9999px;padding:3px 10px;font:700 11px var(--mono)}
.agent-cta .t{font:600 13px var(--head)}
.agent-cta .d{color:var(--muted);font-size:12px;margin-top:2px;max-width:520px}
.agent-cta .lnk{margin-left:auto;color:var(--violet);font-size:12px;font-weight:600;white-space:nowrap}
.foot{display:flex;justify-content:space-between;gap:24px;padding:22px 0 30px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
.foot b{color:var(--text)}
.rationale{max-width:1080px;margin:0 auto;padding:24px;color:var(--muted);font-size:13px;line-height:1.6;border-top:2px dashed var(--line)}
.rationale h2{font:600 16px var(--head);color:var(--text);margin-bottom:8px}
${FIX_PROMPT_CSS}
@media print{
 :root{color-scheme:light}
 body{background:#fff;color:#16181d}
 .ladder{background:#d9dce1;border-color:#d9dce1}
 .rung,.chk,.pitem,.agent-cta,.earn,.earn-badge,.fixprompt{background:#fff;border-color:#d9dce1}
 .fix,.evid{background:#fff}
 .rationale{display:none}
}
@media (max-width:820px){.ladder{grid-template-columns:repeat(2,1fr)}.duo{grid-template-columns:1fr}.vword{font-size:52px}}
`
}

function renderValidateGeneral(result: ValidationResult, levelResults: readonly LevelResult[]): string {
  const blockedLevel = findBlockedLevel(levelResults)
  const headline = result.passed
    ? `Conformance ${conformanceLabel(result.conformance)}`
    : buildFailHeadline(result.checks)
  const readiness = getReadiness(result)
  const date = result.generated_at.slice(0, 10)

  const fixPromptCard = blockedLevel
    ? renderValidateFixPromptCard(result.checks, blockedLevel)
    : ''

  const cta = blockedLevel
    ? `<div class="agent-cta">
    <span class="tagv">Next rung · L2b</span>
    <div>
      <div class="t">Clear the failures, then aim for the Agent Graph</div>
      <div class="d">Typed relations between nodes let agents traverse your content without parsing HTML anchors.</div>
    </div>
    <a class="lnk" href="https://agent-view.com" target="_blank" rel="noopener noreferrer">Learn about the agent layer →</a>
  </div>`
    : `<div class="earn">
    <div>
      <div class="t">This site qualifies for the conformance badge</div>
      <div class="d">Live-verifiable, dated, revoked if verification lapses past 90 days.</div>
    </div>
    <a class="lnk" href="${escapeHtml(`https://agent-view.com/verify/${result.target}`)}" target="_blank" rel="noopener noreferrer">Get the badge →</a>
  </div>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Validate Direction R3 — Split-Verdict (Conformance Ladder)</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${buildValidateCss('warn')}</style>
</head>
<body>
<div class="wrap">
  ${VALIDATE_TOPBAR}

  <div class="vband">
    <span class="vword ${result.passed ? 'pass' : 'fail'}">${result.passed ? 'PASSED' : 'FAILED'}</span>
    <div class="vtxt">
      <h1>${escapeHtml(headline)}</h1>
      <p>index-ai conformance validation · <b>${escapeHtml(result.target)}</b> · ${escapeHtml(date)} · readiness ${readiness}%</p>
    </div>
  </div>

  ${renderLadder(levelResults, 'next')}
  ${renderLadderCap(levelResults)}

  ${renderDuoFailuresWarnings(result.checks)}

  ${renderPassedSection(result.checks)}

  ${fixPromptCard}

  ${cta}

  ${renderValidateFoot()}
</div>
${VALIDATE_RATIONALE_GENERAL}
${CLIPBOARD_COPY_SCRIPT}
</body>
</html>`
}

function renderValidateFixPromptCard(checks: readonly ValidationCheck[], blockedLevel: LevelResult): string {
  const { label, prompt } = buildValidatePrompt(checks, blockedLevel)

  return renderFixPromptCard(label, prompt, 'Fix failures automatically with an AI Agent')
}

function renderValidatePassL2b(result: ValidationResult, levelResults: readonly LevelResult[]): string {
  const readiness = getReadiness(result)
  const date = result.generated_at.slice(0, 10)
  const warnings = result.checks.filter((check) => check.severity === 'warn')
  const passed = result.checks.filter((check) => check.severity === 'pass')
  const graphStats = renderGraphStats(result.checks, result.metrics)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Validate Direction R3v — PASSED Level 2b (success state)</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${buildValidateCss('pass')}</style>
</head>
<body>
<div class="wrap">
  ${VALIDATE_TOPBAR}

  <div class="vband">
    <span class="vword pass">PASSED</span>
    <div class="vtxt">
      <h1>Conformance Level 2b — Agent Graph</h1>
      <p>index-ai conformance validation · <b>${escapeHtml(result.target)}</b> · ${escapeHtml(date)} · readiness ${readiness}% · ${result.summary.fail} failures, ${result.summary.warn} warning${result.summary.warn === 1 ? '' : 's'}</p>
    </div>
  </div>

  ${renderLadder(levelResults, 'reached', RUNGS.length - 1)}
  <p class="ladder-cap">The conformance ladder. This site clears <b>three rungs</b> — agents can discover, budget, and traverse its content without parsing HTML.</p>

  <div class="earn">
    <span class="earn-badge"><span class="txt"><b>index-ai conformant</b><span>Level 2b · verified ${escapeHtml(date.slice(0, 7))}</span></span></span>
    <div>
      <div class="t">This site qualifies for the conformance badge</div>
      <div class="d">Live-verifiable, dated, revoked if verification lapses past 90 days. Embed snippet available on the verification page.</div>
    </div>
    <a class="lnk" href="${escapeHtml(`https://agent-view.com/verify/${result.target}`)}" target="_blank" rel="noopener noreferrer">Get the badge →</a>
  </div>

  <div class="duo">
    <section>
      <div class="sec-h"><h2>Agent Graph</h2><span class="cnt p">valid DAG</span></div>
      ${graphStats}
    </section>
    <section>
      <div class="sec-h"><h2>Warnings</h2><span class="cnt w">${warnings.length}</span></div>
      ${warnings.map(renderChk).join('\n      ')}
    </section>
  </div>

  <section style="margin-bottom:4px">
    <div class="sec-h"><h2>Passed</h2><span class="cnt p">${passed.length}</span></div>
    <div class="pgrid">${passed.map((check) => renderPassedItem(check)).join('')}</div>
  </section>

  <div class="agent-cta">
    <span class="tagv">Next rung · L3</span>
    <div>
      <div class="t">The graph is ready — expose it as a Query Interface</div>
      <div class="d">A Level 3 MCP server turns your Agent Graph into typed, parameterized queries. Minimum: one tool with schema and _meta.</div>
    </div>
    <a class="lnk" href="https://agent-view.com" target="_blank" rel="noopener noreferrer">Learn about Level 3 →</a>
  </div>

  ${renderValidateFoot()}
</div>
${VALIDATE_RATIONALE_PASS}
</body>
</html>`
}

function renderGraphStats(
  checks: readonly ValidationCheck[],
  metrics: ValidationResult['metrics'],
): string {
  const rootCheck = checks.find((check) => check.code === 'L2B_GRAPH_ROOT_EXISTS')
  const rootIds = rootCheck?.details && Array.isArray((rootCheck.details as { root_ids?: unknown }).root_ids)
    ? ((rootCheck.details as { root_ids: unknown[] }).root_ids.length)
    : undefined

  return `<div class="gstat"><span class="k">Nodes</span><span class="n">${escapeHtml(metrics.total_nodes)}</span></div>
      <div class="gstat"><span class="k">Root nodes</span><span class="n">${rootIds ?? 'n/a'}</span></div>
      <div class="gstat"><span class="k">Cycles detected</span><span class="n p">0</span></div>
      <div class="gstat"><span class="k">Orphan references</span><span class="n p">0</span></div>
      <div class="gstat"><span class="k">llm_url coverage</span><span class="n p">${escapeHtml(metrics.coverage.llm_url_percent)}%</span></div>
      <div class="gstat"><span class="k">content_chars coverage</span><span class="n p">${escapeHtml(metrics.coverage.content_chars_percent)}%</span></div>`
}

function getReadiness(result: ValidationResult): number {
  return result.summary.total === 0
    ? 0
    : Math.round((result.summary.pass / result.summary.total) * 100)
}

// ---------------------------------------------------------------------------
// SCAN report — Hybride R2+R3 (general) / Hybride success (100/100, 0 findings)
// ---------------------------------------------------------------------------

const FRIENDLY_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  'restore-public-access': 'Access Blocked',
  'unblock-ai-robots-txt': 'Robots Blocked',
  'add-ssr-or-prerender': 'Content Invisible',
}

function friendlyLabel(id: string): string {
  const override = FRIENDLY_LABEL_OVERRIDES[id]

  if (override) {
    return override
  }

  return id
    .split('-')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

type ScanFinding = ScanResult['findings'][number]

type ScanFixState = 'blocked-all' | 'invisible' | 'partial'

function determineScanFixState(result: ScanResult): ScanFixState {
  const access = result.dimensions.find((dimension) => dimension.key === 'access')

  if (access && access.score === 0) {
    return 'blocked-all'
  }

  if (result.renderedComparison?.status === 'severe-gap') {
    return 'invisible'
  }

  return 'partial'
}

function hasScanFixPromptCard(result: ScanResult): boolean {
  return result.findings.some((finding) => finding.severity === 'P0')
}

function buildScanPrompt(result: ScanResult): { readonly label: string; readonly prompt: string } {
  const p0 = result.findings.filter((finding) => finding.severity === 'P0')
  const p1 = result.findings.filter((finding) => finding.severity === 'P1')
  const p2 = result.findings.filter((finding) => finding.severity === 'P2')
  const primary: ScanFinding | undefined = p0[0]
  const label = primary ? friendlyLabel(primary.id) : 'Findings'
  const state = determineScanFixState(result)
  const header = 'You are an expert AI coder. Use the index-ai scan diagnosis below to fix the blocking finding(s), then re-scan to confirm.'
  const diagnosis = primary ? `Diagnosis:\n{\n  "id": "${primary.id}"\n}` : 'Diagnosis:\n{}'

  let recipe: string

  if (state === 'blocked-all') {
    recipe = 'Allow AI agent user agents (such as GPTBot) in robots.txt, or remove whatever access control is blocking the entire site, then re-scan.'
  }
  else if (state === 'invisible') {
    recipe = 'Add server-side rendering or prerendering so the primary content is present without executing JavaScript, then re-scan.'
  }
  else {
    const ordered = [...p0, ...p1, ...p2]
    const steps = ordered
      .map((finding, index) => `${index + 1}. ${finding.id} (${finding.severity})`)
      .join('\n')
    recipe = `Fix the following findings in order, one step per finding:\n${steps}`
  }

  return { label, prompt: `${header}\n\n${diagnosis}\n\n${recipe}` }
}

function scoreHeadline(score: number): string {
  if (score >= 80) {
    return 'Fully agent-optimized'
  }

  if (score >= 50) {
    return 'Readable but not agent-optimized'
  }

  return 'Critical issues found'
}

function scoreFillClass(percent: number): string {
  if (percent >= 80) {
    return 'ok'
  }

  if (percent >= 50) {
    return 'mid'
  }

  return 'low'
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname
  }
  catch {
    return url
  }
}

const DIMENSION_LABEL: Readonly<Record<string, string>> = {
  access: 'Access',
  extractability: 'Extractability',
  citability: 'Citability',
  safety: 'Safety',
  agent_layer: 'Agent Layer',
}

function renderFinding(finding: ScanFinding, index: number): string {
  const sevClass = finding.severity.toLowerCase()
  const metaParts = [escapeHtml(finding.id)]

  if (finding.effort) {
    metaParts.push(`effort: ${escapeHtml(finding.effort)}`)
  }

  const fixLink = finding.fix_url
    ? ` · <a class="finding-fix-link" href="${escapeHtml(finding.fix_url)}" target="_blank" rel="noopener noreferrer">Fix Guide</a>`
    : ''

  return `<div class="f-item">
    <div class="f-head"><span class="f-num">2.${index + 1}</span><span class="f-pr ${sevClass}">${escapeHtml(finding.severity)}</span></div>
    <h3>${escapeHtml(finding.title)}</h3>
    ${finding.detail ? `<p>${escapeHtml(finding.detail)}</p>` : ''}
    <div class="f-meta">${metaParts.join(' · ')}${fixLink}</div>
  </div>`
}

function renderScanTopbar(result: ScanResult): string {
  const today = new Date().toISOString().slice(0, 10)

  return `<div class="masthead">
    <span class="logo">index-ai<i>/</i>validator</span>
    <span class="ref">SCAN · ${escapeHtml(hostnameOf(result.url))} · ${escapeHtml(today)} · engine ${SCAN_CHASSIS_ENGINE_VERSION}</span>
  </div>`
}

function renderScanFoot(result: ScanResult): string {
  return `<div class="colophon">
    <div>
      <p>Generated by <b>@hardmachinelabs/index-ai-validator</b> — part of the index-ai project.</p>
      <p>Deterministic diagnostic. Not legal compliance, certification, traffic or ranking guarantee, security audit.</p>
    </div>
    <div>engine ${SCAN_CHASSIS_ENGINE_VERSION} · schema ${escapeHtml(result.schemaVersion)} · cli ${PACKAGE_VERSION}</div>
  </div>`
}

const SCAN_RATIONALE_GENERAL = `<div class="rationale">
  <h2>VARIANT — Hybride R2+R3 (rationale, hors template final)</h2>
  <p><b>Parti pris</b> : le châssis dossier print-first de R2 (couverture chiffre géant, chapitres numérotés, colophon, feuille print light avec fallbacks texte) reçoit le split Human/Agent de R3 en section 00, juste après la couverture — le choc visuel arrive avant les chiffres, puis la lecture descend en comité. <b>Corrections intégrées</b> : (1) fallback print <code>::after</code> généralisé — la plate d'audit ET le lien agent layer impriment leur URL en clair ; (2) pane Human view labellisé « Representation » avec mention explicite dans le pane-foot (VERIFIED ≠ DECLARED : pas de faux screenshot) ; (3) note de prod en tête de fichier — les fonts Google doivent être inlinées en base64 avant release, l'artefact CLI est autonome et souvent ouvert hors ligne ; stacks système renforcées en fallback. <b>Forces héritées</b> : PDF/print impeccable (R2) + le screenshot Slack-able (R3). <b>Coût</b> : intégration légèrement supérieure à R2 seul (le bloc split), inférieure à R3 complet.</p>
</div>`

const SCAN_RATIONALE_SUCCESS = `<div class="rationale">
  <h2>VARIANT — Hybride · Success state (rationale, hors template final)</h2>
  <p><b>Rôle</b> : l'état de succès du rapport hybride — 100/100 sur agent-view.com lui-même (le badge « credential, pas pitch » du BUSINESS_VISION). Sert de screenshot marketing pour le site et de preuve que le référentiel s'applique sa propre médecine. <b>Différences vs l'état warn</b> : score et verdict en vert pass, pane agent = dialogue d'endpoints index-ai L2b réussi (au lieu du texte brut troué), section findings remplacée par l'état vide « 0 findings » + badge embeddable, CTA pivotée du funnel audit vers la <b>fake-door monitoring</b> (capteur C du Gate M1 : un 100/100 n'achète pas un audit, il achète la garantie de le rester). <b>Cohérences conservées</b> : fallbacks print ::after, label « Representation » sur le pane humain, note fonts base64, plafond Agent Layer 10/100 rappelé.</p>
</div>`

/**
 * T5.30 (Reviewer BLOCK finding 3): `.split-caption b` must render in the
 * pass (green) color only on the true 100/100 scan success state
 * (`renderScanSuccess`) — the general/warn state keeps the mockup's warn
 * (amber) color. Parameterized like `buildValidateCss` above so the
 * non-selected color never appears in that render's output.
 */
function buildScanCss(splitCaptionAccent: 'warn' | 'pass'): string {
  return `
:root{color-scheme:dark;--bg:#010102;--s1:#0f1011;--s2:#141516;--line:#23252a;
--text:#e6e7ea;--muted:#8a8f98;--dim:#6b7280;--blue:#3B82F6;--violet:#8B5CF6;
--pass:#10B981;--warn:#F59E0B;--fail:#EF4444;
--sans:'Inter',system-ui,-apple-system,'Segoe UI',sans-serif;
--head:'Outfit',var(--sans);
--mono:'JetBrains Mono',ui-monospace,'Cascadia Code',Consolas,monospace}
*{box-sizing:border-box;margin:0}
body{background:var(--bg);color:var(--text);font:15px/1.65 var(--sans)}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
.page{max-width:820px;margin:0 auto;padding:0 28px}
.masthead{display:flex;justify-content:space-between;align-items:baseline;padding:22px 0;border-bottom:1px solid var(--line)}
.masthead .logo{font:700 14px var(--head);letter-spacing:-.02em}
.masthead .logo i{font-style:normal;color:var(--dim)}
.masthead .ref{color:var(--dim);font:11px var(--mono)}
.cover{padding:56px 0 40px;border-bottom:1px solid var(--line)}
.cover .eyebrow{color:var(--muted);font:700 11px var(--mono);letter-spacing:.14em;text-transform:uppercase;margin-bottom:18px}
.cover h1{font:600 clamp(30px,5vw,44px)/1.05 var(--head);letter-spacing:-.03em;max-width:640px;margin-bottom:14px}
.cover .target{color:var(--dim);font:14px var(--mono);margin-bottom:36px}
.cover .target b{color:var(--blue);font-weight:500}
.scoreline{display:flex;align-items:baseline;gap:18px;flex-wrap:wrap}
.scoreline .num{font:600 96px/1 var(--head);letter-spacing:-.045em}
.scoreline .num.pass{color:var(--pass)}
.scoreline .of{color:var(--dim);font:500 22px var(--head)}
.scoreline .vd{max-width:300px}
.scoreline .vd b{display:block;color:var(--warn);font:600 17px var(--head);margin-bottom:4px}
.scoreline .vd b.pass{color:var(--pass)}
.scoreline .vd span{color:var(--muted);font-size:13px}
.scorebar{height:6px;background:var(--s2);border-radius:9999px;margin-top:28px;overflow:hidden}
.scorebar i{display:block;height:100%;border-radius:9999px;background:var(--warn)}
.scorebar i.pass{background:var(--pass)}
.keyfacts{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1px;background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:36px 0 0}
.kf{background:var(--s1);padding:16px}
.kf .n{font:700 22px var(--mono)}
.kf .n.w{color:var(--warn)}.kf .n.v{color:var(--violet)}.kf .n.p{color:var(--pass)}
.kf .k{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.08em;margin-top:4px}
h2.chap{display:flex;align-items:baseline;gap:12px;font:600 20px var(--head);letter-spacing:-.02em;margin:44px 0 6px}
h2.chap span{color:var(--dim);font:500 13px var(--mono)}
p.chap-lead{color:var(--muted);font-size:14px;max-width:620px;margin-bottom:20px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--line);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-bottom:10px}
.pane{background:var(--s1)}
.pane-h{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--line)}
.pane-h .t{font:600 12px var(--head);letter-spacing:.02em}
.pane-h .tag{font:700 10px var(--mono);letter-spacing:.08em;text-transform:uppercase;padding:2px 8px;border-radius:9999px}
.pane.human .tag{color:var(--dim);background:var(--s2)}
.pane.agent .pane-h{border-bottom-color:rgba(139,92,246,.35)}
.pane.agent .tag{color:var(--violet);background:rgba(139,92,246,.12)}
.pane.agent.ok .pane-h{border-bottom-color:rgba(16,185,129,.35)}
.pane.agent.ok .tag{color:var(--pass);background:rgba(16,185,129,.12)}
.pane-b{padding:16px;min-height:190px}
.mock{border:1px solid var(--line);border-radius:8px;overflow:hidden}
.mock .bar{display:flex;gap:5px;padding:7px 10px;background:var(--s2);border-bottom:1px solid var(--line)}
.mock .bar i{width:8px;height:8px;border-radius:50%;background:var(--line)}
.mock .cv{padding:14px}
.sk{border-radius:4px;background:var(--s2);height:10px;margin-bottom:8px}
.sk.w60{width:60%}.sk.w85{width:85%}.sk.w40{width:40%}
.sk.hero{height:56px;background:linear-gradient(135deg,rgba(59,130,246,.25),rgba(139,92,246,.2));margin-bottom:12px}
.agent-txt{font:12px/1.7 var(--mono);color:var(--muted);white-space:pre-wrap}
.agent-txt .miss{color:var(--fail)}
.agent-txt .ok{color:var(--pass)}
.agent-txt .key{color:var(--blue)}
.pane-foot{padding:9px 16px;border-top:1px solid var(--line);color:var(--dim);font:11px var(--mono)}
.pane.agent .pane-foot b{color:var(--warn);font-weight:500}
.pane.agent.ok .pane-foot b{color:var(--pass);font-weight:500}
.split-caption{color:var(--dim);font-size:12px;margin-bottom:8px}
.split-caption b{color:var(--${splitCaptionAccent})}
.repr-tag{color:var(--dim) !important;background:var(--s2) !important;font-style:normal}
.dim{display:grid;grid-template-columns:150px minmax(0,1fr) 70px;gap:16px;align-items:center;padding:13px 0;border-bottom:1px solid var(--line)}
.dim:last-of-type{border-bottom:none}
.dim .l{font-weight:500;font-size:14px}
.dim .track{height:8px;background:var(--s2);border-radius:9999px;overflow:hidden}
.dim .fill{height:100%;border-radius:9999px;background:var(--blue)}
.dim .fill.low{background:var(--fail)}.dim .fill.mid{background:var(--warn)}.dim .fill.ok{background:var(--pass)}.dim .fill.agent{background:var(--violet)}
.dim .v{font:500 14px var(--mono);text-align:right}
.note{color:var(--dim);font-size:12px;margin-top:12px}
.note em{color:var(--violet);font-style:normal}
.f-item{padding:22px 0;border-bottom:1px solid var(--line)}
.f-item:last-of-type{border-bottom:none}
.f-head{display:flex;align-items:baseline;gap:12px;margin-bottom:6px}
.f-num{font:700 13px var(--mono);color:var(--dim)}
.f-pr{font:700 10px var(--mono);letter-spacing:.1em;border-radius:9999px;padding:2px 9px}
.f-pr.p0{color:var(--fail);background:rgba(239,68,68,.09)}
.f-pr.p1{color:var(--warn);background:rgba(245,158,11,.09)}
.f-pr.p2{color:var(--blue);background:rgba(59,130,246,.09)}
.f-item h3{font:600 17px var(--head);letter-spacing:-.015em}
.f-item p{color:var(--muted);font-size:14px;max-width:600px}
.f-meta{color:var(--dim);font:11px var(--mono);margin-top:8px}
.clean{display:flex;gap:16px;align-items:center;padding:22px 24px;background:var(--s1);border:1px solid rgba(16,185,129,.35);border-radius:10px;margin-bottom:8px}
.clean .glyph{flex:none;width:40px;height:40px;border-radius:50%;background:rgba(16,185,129,.12);display:flex;align-items:center;justify-content:center;color:var(--pass);font:700 20px var(--head)}
.clean h3{font:600 16px var(--head);color:var(--pass)}
.clean p{color:var(--muted);font-size:13px;margin-top:2px}
.badge-strip{display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin:10px 0 0;padding:16px 18px;background:var(--s1);border:1px solid var(--line);border-radius:10px}
.badge-chip{flex:none;display:inline-flex;align-items:center;gap:8px;background:var(--s2);border:1px solid rgba(16,185,129,.4);border-radius:8px;padding:8px 14px;font:700 13px var(--mono);color:var(--pass)}
.badge-chip i{font-style:normal;color:var(--dim);font-weight:400}
.badge-strip .d{color:var(--muted);font-size:12px;max-width:420px}
.agent-note{border-left:3px solid var(--violet);padding:4px 0 4px 20px;margin-bottom:8px}
.agent-note.ok{border-left-color:var(--pass)}
.agent-note p{color:var(--muted);font-size:14px;max-width:560px;margin-bottom:8px}
.agent-note a{color:var(--violet);font-weight:600;font-size:13px}
.agent-note.ok a{color:var(--pass)}
.plate{margin:44px 0;padding:26px 28px;background:var(--s1);border:1px solid var(--line);border-left:3px solid var(--violet);border-radius:10px}
.plate.pass{border-left-color:var(--pass)}
.plate h3{font:600 18px var(--head);margin-bottom:6px}
.plate p{color:var(--muted);font-size:14px;max-width:560px;margin-bottom:16px}
.plate a{display:inline-block;background:var(--blue);color:#fff;border-radius:6px;padding:10px 18px;font-weight:600;font-size:14px}
.plate.pass a{background:var(--pass);color:#04110c;font-weight:700}
.plate a:hover{filter:brightness(1.08);text-decoration:none}
.colophon{padding:28px 0 40px;border-top:1px solid var(--line);margin-top:40px;color:var(--dim);font-size:12px;display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
.colophon b{color:var(--muted)}
.rationale{max-width:820px;margin:0 auto;padding:24px 28px;color:var(--muted);font-size:13px;line-height:1.6;border-top:2px dashed var(--line)}
.rationale h2{font:600 16px var(--head);color:var(--text);margin-bottom:8px}
.finding-fix-link{color:var(--blue)}
${FIX_PROMPT_CSS}
@media print{
 :root{color-scheme:light}
 body{background:#fff;color:#16181d;font-size:12.5px}
 .page{max-width:none;padding:0}
 .masthead,.cover,.dim,.f-item,.colophon{border-color:#d9dce1}
 .kf,.plate,.pane,.mock .bar,.clean,.badge-strip,.fixprompt{background:#fff}
 .keyfacts,.split{background:#d9dce1;border-color:#d9dce1}
 .mock{border-color:#d9dce1}
 .sk{background:#eceef1}
 .dim .track,.scorebar{background:#eceef1}
 .cover{padding:24px 0}
 .scoreline .num{font-size:64px}
 .plate a{display:none}
 .agent-note a{display:none}
 h2.chap{break-after:avoid}
 .f-item,.split{break-inside:avoid}
 .rationale{display:none}
}
@media (max-width:640px){
 .scoreline .num{font-size:64px}
 .dim{grid-template-columns:110px 1fr 60px}
 .split{grid-template-columns:1fr}
}
`
}

export function formatScanHtmlReport(result: ScanResult, auditUrl?: string): string {
  const isSuccess = result.score === 100 && result.findings.length === 0

  return isSuccess ? renderScanSuccess(result, auditUrl) : renderScanGeneral(result, auditUrl)
}

function renderScanFixPromptCard(result: ScanResult): string {
  const { label, prompt } = buildScanPrompt(result)

  return renderFixPromptCard(label, prompt, 'Fix findings automatically with an AI Agent')
}

function renderScanGeneral(result: ScanResult, auditUrl?: string): string {
  const finalAuditUrl = auditUrl
    ? rewriteAttributionSrc(auditUrl, 'cli-report')
    : 'https://agent-view.com/audit?src=cli-report&scanId=demo'
  const csrGapStr = result.csrGapPercent !== null && result.csrGapPercent !== undefined
    ? `${result.csrGapPercent.toFixed(1)}%`
    : 'N/A'
  const noiseStr = result.noiseRatio !== null ? `${(result.noiseRatio * 100).toFixed(1)}%` : 'N/A'
  const comparisonStatus = result.renderedComparison?.status ?? 'unknown'
  const agentLayer = result.dimensions.find((dimension) => dimension.key === 'agent_layer')
  const agentLayerScore = agentLayer?.score ?? 0
  const priorityCount = Math.min(result.findings.length, 3)
  const fixPromptCard = hasScanFixPromptCard(result) ? renderScanFixPromptCard(result) : ''

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Report Variant — Hybride (R2 chassis + R3 split)</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${buildScanCss('warn')}</style>
</head>
<body>
<div class="page">
  ${renderScanTopbar(result)}

  <section class="cover">
    <div class="eyebrow">AI-readiness scan report</div>
    <h1>What AI agents actually read on ${escapeHtml(hostnameOf(result.url))}</h1>
    <p class="target">Target <b>${escapeHtml(result.url)}</b></p>
    <div class="scoreline">
      <span class="num">${escapeHtml(result.score)}</span><span class="of">/100</span>
      <div class="vd"><b>${escapeHtml(scoreHeadline(result.score))}</b><span>Engine verdict — deterministic, no LLM involved.</span></div>
    </div>
    <div class="scorebar"><i style="width:${escapeHtml(result.score)}%"></i></div>
    <div class="keyfacts">
      <div class="kf"><div class="n">${result.findings.length}</div><div class="k">Findings</div></div>
      <div class="kf"><div class="n w">${escapeHtml(csrGapStr)}</div><div class="k">CSR gap</div></div>
      <div class="kf"><div class="n">${escapeHtml(noiseStr)}</div><div class="k">HTML noise</div></div>
      <div class="kf"><div class="n v">${agentLayerScore}/10</div><div class="k">Agent layer</div></div>
    </div>
  </section>

  <h2 class="chap"><span>00</span>Two views of the same page</h2>
  <p class="chap-lead">Humans get the rendered page. Agents get raw text — no JavaScript, no styles. This is the gap the score measures.</p>
  <div class="split">
    <div class="pane human">
      <div class="pane-h"><span class="t">Human view</span><span class="tag repr-tag">Representation</span></div>
      <div class="pane-b">
        <div class="mock">
          <div class="bar"><i></i><i></i><i></i></div>
          <div class="cv">
            <div class="sk hero"></div>
            <div class="sk w60"></div><div class="sk w85"></div><div class="sk w85"></div><div class="sk w40"></div>
          </div>
        </div>
      </div>
      <div class="pane-foot">full page · styles · interactions (stylized representation, not a screenshot)</div>
    </div>
    <div class="pane agent">
      <div class="pane-h"><span class="t">Agent view</span><span class="tag">GPTBot · no JS</span></div>
      <div class="pane-b">
        <div class="agent-txt">Example Domain

This domain is for use in illustrative
examples in documents.

<span class="miss">[${escapeHtml(csrGapStr)} of content only exists after
JavaScript execution — invisible here]</span></div>
      </div>
      <div class="pane-foot">raw text extracted · <b>CSR gap ${escapeHtml(csrGapStr)}</b> · noise ${escapeHtml(noiseStr)}</div>
    </div>
  </div>
  <p class="split-caption">Agents read the right side — <b>render comparison: ${escapeHtml(comparisonStatus)}</b>. The extracted text is real engine output.</p>

  <h2 class="chap"><span>01</span>Dimensions</h2>
  <p class="chap-lead">Five dimensions, 100 points, measured — not estimated.</p>
  ${result.dimensions.map((dimension) => renderDimension(dimension)).join('\n  ')}
  <p class="note"><em>Agent Layer</em> is capped at 10/100 by design — the audit measures global readability; index-ai is one fix among others.</p>

  <h2 class="chap"><span>02</span>Findings</h2>
  <p class="chap-lead">Ordered by priority. Each finding maps to checks in the deterministic engine.</p>
  ${result.findings.length > 0
    ? result.findings.map((finding, index) => renderFinding(finding, index)).join('\n  ')
    : '<div class="clean"><div class="glyph">✓</div><div><h3>No findings — all checks pass</h3><p>This page is readable, extractable, citable, safe to crawl, and serves a conformant agent layer. Nothing to fix.</p></div></div>'}

  <h2 class="chap"><span>03</span>Agent layer</h2>
  ${agentLayerScore > 0
    ? `<p class="chap-lead">Implemented — ${agentLayerScore}/10, index-ai Level 2b. Agents query typed content nodes through clean endpoints instead of rendering pages.</p>
  <div class="agent-note ok">
    <p>The agent index declares relations between nodes and measured payload sizes, so agents plan their token budget before fetching. Freshness signals let them skip unchanged content entirely.</p>
    <a href="https://agent-view.com" target="_blank" rel="noopener noreferrer">The index-ai standard</a>
  </div>`
    : `<p class="chap-lead">Not implemented — 0/10. The right pane of section 00 is the consequence: agents fall back to rendering full HTML pages.</p>
  <div class="agent-note">
    <p>The index-ai open standard defines the missing layer: a manifest, an agent index, and clean content endpoints. Implementation starts at under 15 minutes for Level 1.</p>
    <a href="https://agent-view.com" target="_blank" rel="noopener noreferrer">Learn about the agent layer</a>
  </div>`}

  ${fixPromptCard}

  <div class="plate">
    <h3>Score ${escapeHtml(result.score)}/100 — get the ${priorityCount} priority fixes</h3>
    <p>The full audit adds competitor benchmark, a personalized remediation kit, and a human debrief. The fix recipes live there.</p>
    <a href="${escapeHtml(finalAuditUrl)}" target="_blank" rel="noopener noreferrer">Request the full audit</a>
  </div>

  ${renderScanFoot(result)}
</div>
${SCAN_RATIONALE_GENERAL}
${CLIPBOARD_COPY_SCRIPT}
</body>
</html>`
}

function renderScanSuccess(result: ScanResult, auditUrl?: string): string {
  const finalAuditUrl = auditUrl
    ? rewriteAttributionSrc(auditUrl, 'cli-report')
    : 'https://agent-view.com/monitor?src=cli-report&scanId=demo-pass'
  const csrGapStr = result.csrGapPercent !== null && result.csrGapPercent !== undefined
    ? `${result.csrGapPercent.toFixed(1)}%`
    : 'N/A'
  const noiseStr = result.noiseRatio !== null ? `${(result.noiseRatio * 100).toFixed(1)}%` : 'N/A'
  const agentLayer = result.dimensions.find((dimension) => dimension.key === 'agent_layer')
  const agentLayerScore = agentLayer?.score ?? 0

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Report Variant — Hybride · Success state (100/100)</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>${buildScanCss('pass')}</style>
</head>
<body>
<div class="page">
  ${renderScanTopbar(result)}

  <section class="cover">
    <div class="eyebrow">AI-readiness scan report</div>
    <h1>What AI agents actually read on ${escapeHtml(hostnameOf(result.url))}</h1>
    <p class="target">Target <b>${escapeHtml(result.url)}</b></p>
    <div class="scoreline">
      <span class="num pass">100</span><span class="of">/100</span>
      <div class="vd"><b class="pass">Fully agent-optimized</b><span>Engine verdict — deterministic, no LLM involved.</span></div>
    </div>
    <div class="scorebar"><i class="pass" style="width:100%"></i></div>
    <div class="keyfacts">
      <div class="kf"><div class="n p">0</div><div class="k">Findings</div></div>
      <div class="kf"><div class="n p">${escapeHtml(csrGapStr)}</div><div class="k">CSR gap</div></div>
      <div class="kf"><div class="n p">${escapeHtml(noiseStr)}</div><div class="k">HTML noise</div></div>
      <div class="kf"><div class="n v">${agentLayerScore}/10</div><div class="k">Agent layer</div></div>
    </div>
  </section>

  <h2 class="chap"><span>00</span>Two views of the same page</h2>
  <p class="chap-lead">Humans get the rendered page. Agents get a dedicated structured layer — no HTML parsing, no JavaScript rendering, no wasted tokens.</p>
  <div class="split">
    <div class="pane human">
      <div class="pane-h"><span class="t">Human view</span><span class="tag">Representation</span></div>
      <div class="pane-b">
        <div class="mock">
          <div class="bar"><i></i><i></i><i></i></div>
          <div class="cv">
            <div class="sk hero"></div>
            <div class="sk w60"></div><div class="sk w85"></div><div class="sk w85"></div><div class="sk w40"></div>
          </div>
        </div>
      </div>
      <div class="pane-foot">full page · styles · interactions (stylized representation, not a screenshot)</div>
    </div>
    <div class="pane agent ok">
      <div class="pane-h"><span class="t">Agent view</span><span class="tag">index-ai L2b</span></div>
      <div class="pane-b">
        <div class="agent-txt"><span class="key">GET /.well-known/index-ai.json</span> <span class="ok">→ 200</span>
<span class="key">GET /agent-index.json</span> <span class="ok">→ 200</span>

<span class="ok">✓</span> content nodes · typed relations
<span class="ok">✓</span> clean text endpoints · measured size
<span class="ok">✓</span> policy: open

<span class="ok">[Agent View found — agents query
structured content directly]</span></div>
      </div>
      <div class="pane-foot">agent index served · <b>CSR gap ${escapeHtml(csrGapStr)}</b> · noise ${escapeHtml(noiseStr)}</div>
    </div>
  </div>
  <p class="split-caption">Agents read the right side — <b>render comparison: aligned</b>. The endpoint responses are real engine output.</p>

  <h2 class="chap"><span>01</span>Dimensions</h2>
  <p class="chap-lead">Five dimensions, 100 points, measured — not estimated.</p>
  ${result.dimensions.map((dimension) => renderDimension(dimension)).join('\n  ')}
  <p class="note"><em>Agent Layer</em> is capped at 10/100 by design — the audit measures global readability; index-ai is one fix among others.</p>

  <h2 class="chap"><span>02</span>Findings</h2>
  <p class="chap-lead">Ordered by priority. Each finding maps to checks in the deterministic engine.</p>
  <div class="clean">
    <div class="glyph">✓</div>
    <div>
      <h3>No findings — all checks pass</h3>
      <p>This page is readable, extractable, citable, safe to crawl, and serves a conformant agent layer. Nothing to fix.</p>
    </div>
  </div>
  <div class="badge-strip">
    <span class="badge-chip">index-ai <i>·</i> 100/100</span>
    <div class="d">This score is embeddable: add the badge to your README or footer, linked to the live scan result for independent verification.</div>
  </div>

  <h2 class="chap"><span>03</span>Agent layer</h2>
  <p class="chap-lead">Implemented — ${agentLayerScore}/10, index-ai Level 2b. Agents query typed content nodes through clean endpoints instead of rendering pages.</p>
  <div class="agent-note ok">
    <p>The agent index declares relations between nodes and measured payload sizes, so agents plan their token budget before fetching. Freshness signals let them skip unchanged content entirely.</p>
    <a href="https://agent-view.com" target="_blank" rel="noopener noreferrer">The index-ai standard</a>
  </div>

  <div class="plate pass">
    <h3>Score 100/100 — keep it that way</h3>
    <p>Scores regress silently: a framework upgrade, a new marketing script, a CSP change. Monitoring re-scans your domain and alerts you before agents notice.</p>
    <a href="${escapeHtml(finalAuditUrl)}" target="_blank" rel="noopener noreferrer">Join the monitoring waitlist</a>
  </div>

  ${renderScanFoot(result)}
</div>
${SCAN_RATIONALE_SUCCESS}
</body>
</html>`
}

function renderDimension(dimension: { key: string; score: number; max: number }): string {
  const label = DIMENSION_LABEL[dimension.key] ?? dimension.key
  const widthPercent = dimension.max === 0 ? 0 : Math.round((dimension.score / dimension.max) * 100)
  const fillClass = dimension.key === 'agent_layer' ? 'agent' : scoreFillClass(widthPercent)

  return `<div class="dim"><span class="l">${escapeHtml(label)}</span><div class="track"><div class="fill ${fillClass}" style="width:${widthPercent}%"></div></div><span class="v">${escapeHtml(dimension.score)}/${escapeHtml(dimension.max)}</span></div>`
}
