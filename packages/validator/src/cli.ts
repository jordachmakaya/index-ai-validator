/**
 * @filemeta
 * type: script
 * title: Command-line interface entrypoint
 * description: Defines Commander CLI commands and runs validation/scanner checks to write terminal, JSON, or HTML reports.
 * job_ref: T5.6_target-level-cli-wiring
 * functions: [runCli, main, createProgram]
 * classes: []
 * inputs: [process.argv]
 * outputs: [CliRunResult]
 * relations:
 *   - imports: packages/validator/src/utils/html-report.ts
 *   - imports: packages/validator/src/utils/target-level.ts
 *   - imports: packages/validator/src/validator.ts
 *   - imports: packages/validator/src/scan.ts
 *   - imports: packages/validator/src/constants.ts
 *   - tested_by: packages/validator/src/cli.test.ts
 * last_update: 2026-07-05
 */

import { readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Command, CommanderError, InvalidArgumentError } from 'commander'
import { bold, cyan, green } from 'kleur/colors'

import {
  CLI_NAME,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_SCAN_HTML_PATH,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_VALIDATE_HTML_PATH,
} from './constants'
import { scanUrl, type ScanOutcome } from './scan'
import type { LevelResult, ScanOptions, ValidationResult, ValidatorOptions } from './types'
import { formatHumanResult } from './utils/format'
import { formatHtmlReport, formatScanHtmlReport } from './utils/html-report'
import { computeLevelResults } from './utils/target-level'
import { validateIndexAi } from './validator'

/**
 * Target levels the CLI currently accepts. Level 2B is a real `TargetLevel`
 * in the type system (and in `computeLevelResults`), but is not yet
 * validator-complete, so the CLI rejects it explicitly with a dev-friendly
 * message instead of silently accepting a level it can't actually check.
 */
type CliTargetLevel = 'l1' | 'l2a'

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

export type CliRunDependencies = {
  readonly validate?: CliValidationRunner
  readonly scan?: CliScanRunner
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
  const program = createProgram({
    writeOut: (value) => {
      stdout += value
    },
    writeErr: (value) => {
      stderr += value
    },
    runValidation: async (target, options) => {
      const validatorOptions = buildValidatorOptions(target, options)
      if (typeof options.html === 'string') {
        validateHtmlPath(options.html)
      }

      const result = await validate(validatorOptions)

      if (options.html !== undefined) {
        const htmlPath = options.html === true ? DEFAULT_VALIDATE_HTML_PATH : options.html
        await writeHtmlReport(htmlPath, result)
        if (!options.json) {
          stdout += `HTML report written to ${resolve(htmlPath)}\n`
        }
      }

      stdout += options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `${formatHumanResult(result, { verbose: validatorOptions.verbose })}\n`

      if (!options.json) {
        stdout += `${formatTargetLevelSummary(result, options.targetLevel)}\n`
      }

      exitCode = result.passed || options.exitCode === false ? 0 : 1
    },
    runScan: async (target, options) => {
      if (typeof options.html === 'string') {
        validateHtmlPath(options.html)
      }

      const scanOptions: ScanOptions = {
        target,
        timeoutMs: options.timeout,
        onProgress: (progress) => {
          stderr += `Scan progress: ${progress.currentStep}\n`
        },
      }

      const outcome = await scan(scanOptions)

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
  const result = await runCli(argv)

  if (result.stdout) {
    process.stdout.write(result.stdout)
  }

  if (result.stderr) {
    process.stderr.write(result.stderr)
  }

  process.exitCode = result.exitCode
}

function createProgram(options: {
  readonly writeOut: (value: string) => void
  readonly writeErr: (value: string) => void
  readonly runValidation: (target: string, options: CliOptions) => Promise<void>
  readonly runScan: (target: string, options: ScanCliOptions) => Promise<void>
}): Command {
  const program = new Command()

  program
    .name(CLI_NAME)
    .usage('[options] <url>')
    .description(
      [
        'Validate index-ai Level 1 and Level 2a agent-facing content layers.',
        '',
        'Two modes:',
        `  ${CLI_NAME} validate <url>  Run full validation checks (also the default when no subcommand is given).`,
        `  ${CLI_NAME} scan <url>      Run the Agent View scanner service against a site and print its findings.`,
      ].join('\n'),
    )
    .enablePositionalOptions()
    .version(readPackageVersion())
    .configureOutput({
      writeOut: options.writeOut,
      writeErr: options.writeErr,
    })
    .exitOverride()

  addValidationOptions(program).action(options.runValidation)

  // `.command()` snapshots the parent's configureOutput/exitOverride at call
  // time (Commander's copyInheritedSettings), so this must come after the
  // chain above configured them on `program`.
  addValidationOptions(program.command('validate'))
    .description('Validate index-ai Level 1 and Level 2a agent-facing content layers (same as the default mode).')
    .action(options.runValidation)

  program
    .command('scan')
    .description('Scan a site via the Agent View scanner service and print the scan result.')
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
      "Target conformance level to validate against ('l1' or 'l2a'; 'l2b' is not yet available)",
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
  if (value === 'l1' || value === 'l2a') {
    return value
  }

  if (value === 'l2b') {
    throw new InvalidArgumentError(
      'Level 2B validation is not yet available. Use --target-level l1 or --target-level l2a instead.',
    )
  }

  throw new InvalidArgumentError(
    `Invalid --target-level value: "${value}". Accepted values are 'l1' or 'l2a'.`,
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

async function writeHtmlReport(path: string, result: ValidationResult): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, formatHtmlReport(result), 'utf8')
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

/**
 * Builds the two-line human-mode target-level summary appended after the
 * regular validation report. Derives "Achieved level" from the
 * `LevelResult[]` cascade produced by `computeLevelResults` (T5.5) rather
 * than from `result.conformance`, so this stays consistent with the
 * cascade-skip semantics already verified there. This is a minimal inline
 * summary; T5.7 will replace it with a full grouped report in format.ts.
 */
function formatTargetLevelSummary(result: ValidationResult, targetLevel: CliTargetLevel): string {
  const levelResults = targetLevel === 'l1'
    ? computeLevelResults(result.checks, 'l1')
    : computeLevelResults(result.checks, 'l2a')

  return [
    `Requested target level: ${targetLevel}`,
    `Achieved level: ${deriveAchievedLevel(levelResults)}`,
  ].join('\n')
}

/**
 * Walks the cascade from l1 upward and returns the highest level that was
 * actually tested with zero failures, stopping at the first level that
 * either was never tested (skipped) or failed — matching computeLevelResults'
 * cascade-skip semantics. Returns 'none' if even l1 failed.
 */
function deriveAchievedLevel(levelResults: readonly LevelResult[]): string {
  let achieved: string | undefined

  for (const levelResult of levelResults) {
    if (levelResult.status !== 'tested' || levelResult.fail > 0) {
      break
    }

    achieved = levelResult.level
  }

  return achieved ?? 'none'
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
    await writeFile(path, formatScanHtmlReport(result, outcome.auditLinks.html), 'utf8')
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
