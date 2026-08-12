/**
 * @filemeta
 * type: script
 * title: Command-line interface entrypoint
 * description: Defines Commander CLI commands, runs validation/scanner checks, renders the branded banner/spinner, and composes level-aware --json fields.
 * job_ref: T5.34_scan-coming-soon-flag
 * functions: [runCli, main, createProgram, buildLevelAwareJson, buildScanJsonError, buildScanComingSoonJson, withScanComingSoonSuffix, buildBanner, createTerminalSpinner]
 * classes: []
 * inputs: [process.argv]
 * outputs: [CliRunResult]
 * relations:
 *   - imports: packages/validator/src/utils/format.ts
 *   - imports: packages/validator/src/utils/html-report.ts
 *   - imports: packages/validator/src/utils/target-level.ts
 *   - imports: packages/validator/src/validator.ts
 *   - imports: packages/validator/src/scan.ts
 *   - imports: packages/validator/src/constants.ts
 *   - imports: packages/validator/src/client/scanner-client.ts
 *   - tested_by: packages/validator/src/cli.test.ts
 * last_update: 2026-08-12
 */

import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Command, CommanderError, InvalidArgumentError } from 'commander'
import { bold, cyan, dim, gray, green, yellow } from 'kleur/colors'

import { ScanServerError, type ScanProgressStep } from './client/scanner-client'
import {
  CLI_NAME,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_SCAN_HTML_PATH,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_VALIDATE_HTML_PATH,
} from './constants'
import { scanUrl, type ScanOutcome } from './scan'
import type {
  LevelResult,
  ScanOptions,
  TargetLevel,
  TargetLevelResultJson,
  ValidationCheck,
  ValidationResult,
  ValidatorOptions,
} from './types'
import { formatHumanResult } from './utils/format'
import { formatHtmlReport, formatScanHtmlReport } from './utils/html-report'
import { computeLevelResults, LEVEL_LABEL } from './utils/target-level'
import { validateIndexAi } from './validator'

/**
 * Target levels the CLI accepts. T5.29 shipped real Level 2b DAG structural
 * validation (`validateGraphRelations` / `L2B_GRAPH_*` checks in
 * checks/graph.ts), and ADR_007 D3 made Level 2b a mandatory launch surface
 * across validate/HTML/JSON — so `l2b` is a first-class `CliTargetLevel`,
 * same as `l1`/`l2a`.
 */
type CliTargetLevel = 'l1' | 'l2a' | 'l2b'

type CliOptions = {
  readonly json?: boolean
  readonly verbose?: boolean
  readonly strict?: boolean
  readonly strictSecurity?: boolean
  readonly failOnWarn?: boolean
  readonly allowPrivateHosts?: boolean
  readonly exitCode?: boolean
  readonly html?: string | true
  readonly timeout: number
  readonly maxConcurrency: number
  readonly targetLevel: CliTargetLevel
}

type ScanCliOptions = {
  readonly json?: boolean
  readonly html?: string | true
  readonly apiKey?: string
  readonly timeout: number
}

export type CliValidationRunner = (options: ValidatorOptions) => Promise<ValidationResult>

export type CliScanRunner = (options: ScanOptions) => Promise<ScanOutcome>

/**
 * Injectable driver for the scan human-mode terminal spinner. `start`/`stop`
 * bracket the scan call; `step` is invoked once per `onProgress` event, in
 * order, while the scan is in flight (see `runScan`).
 */
export type CliScanSpinner = {
  readonly start: () => void
  readonly step: (currentStep: ScanProgressStep) => void
  readonly stop: () => void
}

export type CliRunDependencies = {
  readonly validate?: CliValidationRunner
  readonly scan?: CliScanRunner
  readonly isTTY?: boolean
  readonly spinner?: CliScanSpinner
  /**
   * ADR_003: `scan` is neutralized by this runtime flag while
   * `agent-view.com` (D-003) is not launched — the code and its tests stay,
   * only the network call is gated. Defaults to `false` (see `runCli`); the
   * single flip point to reactivate `scan` is that default, not this field
   * itself (see the "Comment reprendre" section of ADR_003).
   */
  readonly scanEnabled?: boolean
}

export type CliRunResult = {
  readonly exitCode: number
  readonly stdout: string
  readonly stderr: string
}

export async function runCli(
  argv: readonly string[],
  dependencies: CliRunDependencies = {},
): Promise<CliRunResult> {
  let stdout = ''
  let stderr = ''
  let exitCode = 0
  const validate = dependencies.validate ?? validateIndexAi
  const scan = dependencies.scan ?? scanUrl
  const scanEnabled = dependencies.scanEnabled ?? false
  // The testable default is `false` — no live TTY detection inside `runCli`,
  // which keeps it a pure function of its arguments. Real detection happens
  // once, in `main()`, which passes `process.stdout.isTTY === true` in.
  const isTTY = dependencies.isTTY ?? false
  const program = createProgram({
    writeOut: (value) => {
      stdout += value
    },
    writeErr: (value) => {
      stderr += value
    },
    isTTY,
    scanEnabled,
    runValidation: async (target, options) => {
      if (!options.json && isTTY) {
        stdout += `${buildBanner()}\n\n`
      }

      const validatorOptions = buildValidatorOptions(target, options)
      if (typeof options.html === 'string') {
        validateHtmlPath(options.html)
      }

      const result = await validate(validatorOptions)

      if (options.html !== undefined) {
        const htmlPath = options.html === true ? DEFAULT_VALIDATE_HTML_PATH : options.html
        await writeHtmlReport(htmlPath, result, options.targetLevel)
        if (!options.json) {
          stdout += `HTML report written to ${resolve(htmlPath)}\n`
        }
      }

      if (options.json) {
        const levelResults = computeLevelResultsForCliTargetLevel(result.checks, options.targetLevel)
        stdout += `${JSON.stringify(
          { ...result, ...buildLevelAwareJson(levelResults, options.targetLevel) },
          null,
          2,
        )}\n`
      }
      else {
        stdout += `${formatHumanResult(result, {
          verbose: validatorOptions.verbose,
          targetLevel: options.targetLevel,
        })}\n`
      }

      exitCode = result.passed || options.exitCode === false ? 0 : 1
    },
    runScan: async (target, options) => {
      if (!scanEnabled) {
        if (options.json) {
          stdout += `${JSON.stringify(buildScanComingSoonJson(), null, 2)}\n`
        }
        else {
          if (isTTY) {
            stdout += `${buildBanner()}\n\n`
          }
          stdout += `${SCAN_COMING_SOON_MESSAGE}\n`
        }

        exitCode = 0
        return
      }

      if (!options.json && isTTY) {
        stdout += `${buildBanner()}\n\n`
      }

      if (typeof options.html === 'string') {
        validateHtmlPath(options.html)
      }

      // Resolved at the point of use, not as a `CliRunDependencies` default:
      // an injected spinner is only actually driven while a live spinner
      // would be shown (TTY + human mode) — see the "never drives the
      // injected spinner in --json or non-TTY scan runs" test. Outside that
      // case the spinner is always the no-op, regardless of what's injected.
      const useLiveSpinner = isTTY && !options.json
      const spinner: CliScanSpinner = useLiveSpinner
        ? dependencies.spinner ?? createTerminalSpinner()
        : noopSpinner

      const scanOptions: ScanOptions = {
        target,
        timeoutMs: options.timeout,
        onProgress: (progress) => {
          if (useLiveSpinner) {
            spinner.step(progress.currentStep)
          }
          else {
            // Legacy, unchanged: --json and non-TTY runs keep the exact
            // accumulated "Scan progress: <step>\n" stderr lines.
            stderr += `Scan progress: ${progress.currentStep}\n`
          }
        },
      }

      spinner.start()
      try {
        let outcome: ScanOutcome

        try {
          outcome = await scan(scanOptions)
        }
        catch (error: unknown) {
          // Non-`--json` runs keep today's behavior unchanged: rethrow so
          // the error reaches `runCli`'s generic top-level catch below,
          // which formats it to `stderr` via `formatCliError` — never
          // duplicated here (T5.15_scan-json-error-shape point 3).
          if (!options.json) {
            throw error
          }

          // `--json` runs get a parseable JSON error object on `stdout`
          // instead of empty stdout (V2_BUG.md §BUG-2) — `stderr` keeps
          // carrying the same human-readable text the generic catch would
          // have produced, so only stdout's contract changes for `--json`.
          if (!stderr) {
            stderr += formatCliError(error)
          }
          stdout += `${JSON.stringify(buildScanJsonError(error), null, 2)}\n`
          exitCode = 2
          return
        }

        stdout += options.json
          ? `${JSON.stringify(outcome.status, null, 2)}\n`
          : `${formatScanSummary(target, outcome)}\n`

        stderr += formatScanStderrMessage(outcome)

        if (options.html !== undefined) {
          const htmlPath = options.html === true ? DEFAULT_SCAN_HTML_PATH : options.html
          await writeScanHtmlReport(htmlPath, target, outcome)
          if (!options.json) {
            stdout += `HTML report written to ${resolve(htmlPath)}\n`
          }
        }
      }
      finally {
        spinner.stop()
      }
    },
  })

  try {
    await program.parseAsync([...argv], { from: 'user' })
  }
  catch (error: unknown) {
    if (isCommanderHelp(error)) {
      return {
        exitCode: 0,
        stdout,
        stderr,
      }
    }

    if (!stderr) {
      stderr = formatCliError(error)
    }

    return {
      exitCode: 2,
      stdout,
      stderr,
    }
  }

  return {
    exitCode,
    stdout,
    stderr,
  }
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  const result = await runCli(argv, { isTTY: process.stdout.isTTY === true })

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  process.exitCode = result.exitCode
}

/**
 * Single source of truth for the `(coming soon)` annotation applied to the
 * `scan` command's description text (ADR_003) — used for both the top-level
 * program description's scan line and the `scan` subcommand's own
 * `.description(...)`, so the two texts never drift out of sync.
 */
function withScanComingSoonSuffix(description: string, scanEnabled: boolean): string {
  return scanEnabled ? description : `${description} (coming soon)`
}

function createProgram(options: {
  readonly writeOut: (value: string) => void
  readonly writeErr: (value: string) => void
  readonly runValidation: (target: string, options: CliOptions) => Promise<void>
  readonly runScan: (target: string, options: ScanCliOptions) => Promise<void>
  readonly isTTY: boolean
  readonly scanEnabled: boolean
}): Command {
  const program = new Command()
  // Captured by closure from the `isTTY` resolved once in `runCli` — never
  // re-derived here, so help output and human-mode output agree on the same
  // value for a given run.
  const helpBanner = (): string => (options.isTTY ? `${buildBanner()}\n` : '')

  program
    .name(CLI_NAME)
    .usage('[options] <url>')
    .description(
      [
        'Validate index-ai Level 1 and Level 2a agent-facing content layers.',
        '',
        'Two modes:',
        `  ${CLI_NAME} validate <url>  Run full validation checks (also the default when no subcommand is given).`,
        `  ${CLI_NAME} scan <url>      ${withScanComingSoonSuffix(
          'Run the Agent View scanner service against a site and print its findings.',
          options.scanEnabled,
        )}`,
      ].join('\n'),
    )
    .enablePositionalOptions()
    .version(readPackageVersion())
    .configureOutput({
      writeOut: options.writeOut,
      writeErr: options.writeErr,
    })
    .exitOverride()
    .addHelpText('beforeAll', helpBanner)

  addValidationOptions(program).action(options.runValidation)

  // `.command()` snapshots the parent's configureOutput/exitOverride at call
  // time (Commander's copyInheritedSettings), so this must come after the
  // chain above configured them on `program`.
  addValidationOptions(program.command('validate'))
    .description('Validate index-ai Level 1 and Level 2a agent-facing content layers (same as the default mode).')
    .action(options.runValidation)

  program
    .command('scan')
    .description(
      withScanComingSoonSuffix(
        'Scan a site via the Agent View scanner service and print the scan result.',
        options.scanEnabled,
      ),
    )
    // No `addHelpText('beforeAll', ...)` here: Commander's `beforeAll` help
    // text on the parent program IS shown for a subcommand's own `--help`
    // (verified empirically — registering it here too produced a duplicated
    // banner). Registering it once on `program` covers both.
    .argument('<url>', 'Site URL to scan, for example https://example.com')
    .option('--json', 'Print the raw scanner status as JSON')
    .option(
      '--html [path]',
      `Write a minimal HTML report to the provided .html path, or to ${DEFAULT_SCAN_HTML_PATH} if no path is given`,
    )
    .option('--api-key <key>', 'Reserved for future scanner authentication (currently has no effect)')
    .option('--timeout <ms>', 'Scan request timeout in milliseconds', parsePositiveInteger, DEFAULT_TIMEOUT_MS)
    .action(options.runScan)

  return program
}

/**
 * Applies the validation command's argument and option chain to `command`.
 * Shared between the root program (default `index-ai <url>` mode) and the
 * `validate` subcommand so the two never drift out of sync (shokunin: DRY).
 */
function addValidationOptions(command: Command): Command {
  return command
    .argument('<url>', 'Site URL to validate, for example https://example.com')
    .option('--json', 'Print stable JSON output')
    .option('--verbose', 'Print all checks, including passed checks')
    .option('--strict', 'Treat should-level warnings as a failed validation result')
    .option('--strict-security', 'Fail on private infra patterns such as IPs or internal hostnames')
    .option('--fail-on-warn', 'Treat any warning as a failed validation result')
    .option('--allow-private-hosts', 'Allow private/internal hosts in target and llm_url fetches')
    .option('--no-exit-code', 'Return exit code 0 for validation failures')
    .option(
      '--html [path]',
      `Write a standalone HTML report to the provided .html path, or to ${DEFAULT_VALIDATE_HTML_PATH} if no path is given`,
    )
    .option('--timeout <ms>', 'Request timeout in milliseconds', parsePositiveInteger, DEFAULT_TIMEOUT_MS)
    .option(
      '--max-concurrency <n>',
      'Maximum concurrent llm_url fetches',
      parsePositiveInteger,
      DEFAULT_MAX_CONCURRENCY,
    )
    .option(
      '--target-level <level>',
      "Target conformance level to validate against ('l1', 'l2a', or 'l2b')",
      parseTargetLevel,
      'l2a',
    )
}

/**
 * Reads the CLI's own version from package.json at runtime, so `--version`
 * always reflects the real release version instead of a hardcoded string
 * that would drift on the next release.
 */
function readPackageVersion(): string {
  const packageJsonPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json')
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version: string }

  return packageJson.version
}

/**
 * Compact "Agent View CLI" brand banner for human-facing help text and
 * default (non-JSON) TTY output — never printed in `--json` output or
 * non-TTY runs (see `isTTY` gating at each call site). Colored via
 * `kleur/colors`, whose 16-color ANSI palette has no true amber: `yellow` +
 * `bold` is the closest available approximation of the brand accent
 * (`--vp-c-brand-1: #f59e0b` in `docs/.vitepress/theme/custom.css`); `gray` +
 * `dim` renders the secondary tagline.
 */
function buildBanner(): string {
  const title = bold(yellow('Agent View CLI'))
  const tagline = dim(gray('AI-readable website validation for the Agent Web.'))

  return ['  ╭─╮', `  │▲│  ${title}`, `  ╰─╯  ${tagline}`].join('\n')
}

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] as const
const SPINNER_INTERVAL_MS = 80

/**
 * Shared no-op `CliScanSpinner`: used whenever a live spinner would not
 * actually be shown (non-TTY or `--json`), regardless of whether a spinner
 * dependency was injected — driving an injected spinner outside the live
 * case would be an observable side effect the caller never asked for.
 */
const noopSpinner: CliScanSpinner = {
  start() {},
  step() {},
  stop() {},
}

/**
 * Hand-rolled terminal spinner (no `ora`/`cli-spinner` dependency — `kleur`
 * is enough) for `runScan`'s human-mode TTY output. Writes directly to
 * `process.stderr` on a timer, bypassing the `runCli` stderr accumulator —
 * the one deliberate exception in this file, since an animated spinner only
 * makes sense as live terminal output, never buffered and replayed once the
 * run has finished. `step()` only updates the label; `stop()` clears the
 * timer and the line so no orphan frame is left on screen.
 */
function createTerminalSpinner(): CliScanSpinner {
  let frameIndex = 0
  let currentStep: ScanProgressStep | undefined
  let timer: NodeJS.Timeout | undefined

  const render = (): void => {
    const frame = yellow(SPINNER_FRAMES[frameIndex % SPINNER_FRAMES.length] ?? SPINNER_FRAMES[0])
    frameIndex += 1
    const label = gray(currentStep ? `Scanning: ${currentStep}` : 'Scanning...')
    process.stderr.write(`\r${frame} ${label}`)
  }

  return {
    start() {
      render()
      timer = setInterval(render, SPINNER_INTERVAL_MS)
    },
    step(nextStep) {
      currentStep = nextStep
    },
    stop() {
      if (timer !== undefined) {
        clearInterval(timer)
        timer = undefined
      }
      process.stderr.write('\r\x1B[K')
    },
  }
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value)

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new InvalidArgumentError(
      `Invalid numeric CLI option value: "${value}". Provide a positive integer.`,
    )
  }

  return parsed
}

function parseTargetLevel(value: string): CliTargetLevel {
  if (value === 'l1' || value === 'l2a' || value === 'l2b') {
    return value
  }

  throw new InvalidArgumentError(
    `Invalid --target-level value: "${value}". Accepted values are 'l1', 'l2a', or 'l2b'.`,
  )
}

function buildValidatorOptions(target: string, options: CliOptions): ValidatorOptions {
  return {
    target,
    strict: options.strict ?? false,
    strictSecurity: options.strictSecurity ?? false,
    failOnWarn: options.failOnWarn ?? false,
    verbose: options.verbose ?? false,
    timeoutMs: options.timeout,
    maxConcurrency: options.maxConcurrency,
    allowPrivateHosts: options.allowPrivateHosts ?? false,
  }
}

/**
 * Calls `computeLevelResults` with `targetLevel` narrowed to one of its
 * overloaded literal signatures via an explicit switch, since a plain
 * `CliTargetLevel`-typed argument doesn't match any single overload of a
 * function overloaded on string literals. Mirrors format.ts's
 * `computeLevelResultsFor`.
 */
function computeLevelResultsForCliTargetLevel(
  checks: ValidationCheck[],
  targetLevel: CliTargetLevel,
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

type LevelAwareJson = {
  readonly requested_level: CliTargetLevel
  readonly tested_levels: readonly TargetLevel[]
  readonly achieved_level: TargetLevel | 'none'
  readonly failed_level: TargetLevel | null
  readonly level_results: Partial<Record<TargetLevel, TargetLevelResultJson>>
}

/**
 * Composes the 5 level-aware fields added to `--json` output by spread onto
 * `result` (see the `runValidation` json branch above). `ValidationResult`
 * itself stays unchanged — this is JSON-shape-only composition local to the
 * CLI, not a new field on the validator's public result type.
 */
function buildLevelAwareJson(
  levelResults: readonly LevelResult[],
  targetLevel: CliTargetLevel,
): LevelAwareJson {
  return {
    requested_level: targetLevel,
    tested_levels: levelResults.map((levelResult) => levelResult.level),
    achieved_level: deriveAchievedLevel(levelResults),
    failed_level: deriveFailedLevel(levelResults),
    level_results: Object.fromEntries(
      levelResults.map((levelResult) => [levelResult.level, toLevelResultJson(levelResult)]),
    ) as Partial<Record<TargetLevel, TargetLevelResultJson>>,
  }
}

/**
 * Walks the cascade from l1 upward and returns the level code of the highest
 * level that was actually tested with zero failures, stopping at the first
 * level that either was never tested (skipped) or failed itself — mirrors
 * computeLevelResults' cascade-skip semantics. Returns 'none' if even l1
 * failed. Same walk as format.ts's `formatAchievedLevel`, but returns the raw
 * level code for JSON instead of a human label.
 */
function deriveAchievedLevel(levelResults: readonly LevelResult[]): TargetLevel | 'none' {
  let achieved: TargetLevel | undefined

  for (const levelResult of levelResults) {
    if (levelResult.status !== 'tested' || levelResult.fail > 0) {
      break
    }

    achieved = levelResult.level
  }

  return achieved ?? 'none'
}

/**
 * Returns the level code of the first tested level with a blocking failure,
 * or `null` if every tested level passed.
 */
function deriveFailedLevel(levelResults: readonly LevelResult[]): TargetLevel | null {
  const failed = levelResults.find((levelResult) => levelResult.status === 'tested' && levelResult.fail > 0)

  return failed ? failed.level : null
}

/**
 * Renders one `LevelResult` as its `TargetLevelResultJson` shape, reusing
 * `LEVEL_LABEL` (imported from target-level.ts, not re-declared here) for the
 * label. Throws instead of silently defaulting if a skipped level is missing
 * its reason, since `computeLevelResults` always sets one — a missing reason
 * would mean that invariant broke.
 */
function toLevelResultJson(levelResult: LevelResult): TargetLevelResultJson {
  const label = LEVEL_LABEL[levelResult.level]

  if (levelResult.status === 'tested') {
    return { label, status: 'tested', pass: levelResult.pass, warn: levelResult.warn, fail: levelResult.fail }
  }

  if (levelResult.reason === undefined) {
    throw new Error(`Skipped level result for "${levelResult.level}" is missing a reason.`)
  }

  return { label, status: 'skipped', reason: levelResult.reason }
}

async function writeHtmlReport(
  path: string,
  result: ValidationResult,
  targetLevel: CliTargetLevel,
): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, formatHtmlReport(result, { targetLevel }), 'utf8')
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to write HTML report: ${message}`)
  }
}

function validateHtmlPath(path: string): void {
  if (path.trim().length === 0) {
    throw new InvalidArgumentError('HTML report path must not be empty.')
  }

  if (extname(path).toLowerCase() !== '.html') {
    throw new InvalidArgumentError('HTML report path must end with .html.')
  }
}

type ScanFindingSeverity = 'P0' | 'P1' | 'P2'

function formatScanSummary(target: string, outcome: ScanOutcome): string {
  const result = outcome.status.result

  if (!result) {
    return `URL: ${target}\nStatus: ${outcome.status.status}`
  }

  const counts = countFindingsBySeverity(result.findings)

  return [
    `URL: ${target}`,
    `Score: ${result.score}`,
    `Verdict: ${result.verdict}`,
    `P0: ${counts.P0}`,
    `P1: ${counts.P1}`,
    `P2: ${counts.P2}`,
  ].join('\n')
}

function countFindingsBySeverity(
  findings: readonly { readonly severity: ScanFindingSeverity }[],
): Record<ScanFindingSeverity, number> {
  const counts: Record<ScanFindingSeverity, number> = { P0: 0, P1: 0, P2: 0 }

  for (const finding of findings) {
    counts[finding.severity] += 1
  }

  return counts
}

// ADR_003: single source of truth for the coming-soon copy, shared between
// human mode and `--json` mode so the two never drift. Never uses the word
// "error"/an error tone (the code exists and is tested — only the external
// `agent-view.com` service is missing) and is never merged with
// `buildScanJsonError`'s shape, since this is not a failure.
const SCAN_DOCS_URL = 'https://jordachmakaya.github.io/index-ai-validator/guide/cli.html#scan'

const SCAN_COMING_SOON_MESSAGE = 'Scan is not yet publicly available. It depends on '
  + 'the agent-view.com service, which has not launched yet. '
  + `See ${SCAN_DOCS_URL} for updates.`

type ScanComingSoonJson = {
  readonly status: 'coming_soon'
  readonly message: string
  readonly docs_url: string
}

function buildScanComingSoonJson(): ScanComingSoonJson {
  return {
    status: 'coming_soon',
    message: SCAN_COMING_SOON_MESSAGE,
    docs_url: SCAN_DOCS_URL,
  }
}

type ScanJsonError = {
  readonly passed: false
  readonly status: 'error'
  readonly error_type: string
  readonly message: string
}

// Machine-readable `error_type` per scan error family (V2_BUG.md §BUG-2),
// keyed off each error class's own stable `.name` (scanner-client.ts's
// `override readonly name` fields, scan.ts's `ScanFailedError`).
// `ScanServerError` is deliberately absent from this map: its `.name` alone
// doesn't distinguish a raw network failure from a genuine HTTP 500 —
// `deriveScanErrorType` branches on its `.isNetworkError` field instead.
const SCAN_ERROR_TYPE_BY_NAME: Readonly<Record<string, string>> = {
  ScanRequestError: 'invalid_request',
  ScanNotFoundError: 'not_found',
  ScanExpiredError: 'expired',
  ScanRateLimitError: 'rate_limited',
  ScanTimeoutError: 'timeout_error',
  ScanResultSchemaError: 'result_schema_error',
  ScanResponseShapeError: 'response_shape_error',
  ScanFailedError: 'scan_failed',
}

function deriveScanErrorType(error: unknown): string {
  if (error instanceof ScanServerError) {
    return error.isNetworkError ? 'network_error' : 'server_error'
  }

  if (error instanceof Error) {
    return SCAN_ERROR_TYPE_BY_NAME[error.name] ?? 'unknown_error'
  }

  return 'unknown_error'
}

/**
 * Builds the JSON error object written to `stdout` when `scan --json` fails
 * (V2_BUG.md §BUG-2). `message` reuses the thrown error's own curated
 * message — every scan error class already produces a factual, displayable
 * message (never a raw stack trace), same source `formatCliError` uses for
 * `stderr`. `scanner_url` is intentionally omitted: no thrown error here
 * carries a known scanner URL distinct from the target already on the
 * command line, and inventing one from message text would not be factual.
 */
function buildScanJsonError(error: unknown): ScanJsonError {
  return {
    passed: false,
    status: 'error',
    error_type: deriveScanErrorType(error),
    message: error instanceof Error ? error.message : String(error),
  }
}

function formatScanStderrMessage(outcome: ScanOutcome): string {
  const result = outcome.status.result
  const headline = result
    ? `${bold(green('Scan done'))} — score ${result.score}, verdict ${result.verdict}.`
    : `${bold('Scan done')} — status ${outcome.status.status}.`

  return `${headline} Full audit: ${cyan(outcome.auditLinks.terminal)}\n`
}

async function writeScanHtmlReport(path: string, target: string, outcome: ScanOutcome): Promise<void> {
  try {
    const result = outcome.status.result
    if (!result) {
      throw new Error('No scan result available to format')
    }
    await mkdir(dirname(path), { recursive: true })
    const generatedAt = outcome.status.completedAt ?? outcome.status.submittedAt
    await writeFile(path, formatScanHtmlReport(result, outcome.auditLinks.html, generatedAt), 'utf8')
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to write HTML report: ${message}`)
  }
}

function formatCliError(error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : `Unexpected CLI error: ${String(error)}`

  return message.endsWith('\n') ? message : `${message}\n`
}

function isCommanderHelp(error: unknown): boolean {
  return error instanceof CommanderError && error.exitCode === 0
}

function isCliEntrypoint(): boolean {
  const scriptPath = process.argv[1]

  return Boolean(scriptPath && resolve(scriptPath) === fileURLToPath(import.meta.url))
}

if (isCliEntrypoint()) {
  void main()
}
