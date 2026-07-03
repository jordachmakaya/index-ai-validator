import { writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Command, CommanderError, InvalidArgumentError } from 'commander'
import { bold, cyan, green } from 'kleur/colors'

import {
  CLI_NAME,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
} from './constants'
import { scanUrl, type ScanOutcome } from './scan'
import type { ScanOptions, ValidationResult, ValidatorOptions } from './types'
import { formatHumanResult } from './utils/format'
import { formatHtmlReport } from './utils/html-report'
import { validateIndexAi } from './validator'

type CliOptions = {
  readonly json?: boolean
  readonly verbose?: boolean
  readonly strict?: boolean
  readonly strictSecurity?: boolean
  readonly failOnWarn?: boolean
  readonly allowPrivateHosts?: boolean
  readonly exitCode?: boolean
  readonly html?: string
  readonly timeout: number
  readonly maxConcurrency: number
}

type ScanCliOptions = {
  readonly json?: boolean
  readonly html?: string
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
      if (options.html !== undefined) {
        validateHtmlPath(options.html)
      }

      const result = await validate(validatorOptions)

      if (options.html !== undefined) {
        await writeHtmlReport(options.html, result)
      }

      stdout += options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `${formatHumanResult(result, { verbose: validatorOptions.verbose })}\n`

      exitCode = result.passed || options.exitCode === false ? 0 : 1
    },
    runScan: async (target, options) => {
      if (options.html !== undefined) {
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
        await writeScanHtmlReport(options.html, target, outcome)
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
    .description('Validate index-ai Level 1 and Level 2a agent-facing content layers.')
    .enablePositionalOptions()
    .argument('<url>', 'Site URL to validate, for example https://example.com')
    .option('--json', 'Print stable JSON output')
    .option('--verbose', 'Print all checks, including passed checks')
    .option('--strict', 'Treat should-level warnings as a failed validation result')
    .option('--strict-security', 'Fail on private infra patterns such as IPs or internal hostnames')
    .option('--fail-on-warn', 'Treat any warning as a failed validation result')
    .option('--allow-private-hosts', 'Allow private/internal hosts in target and llm_url fetches')
    .option('--no-exit-code', 'Return exit code 0 for validation failures')
    .option('--html <path>', 'Write a standalone HTML report to the provided .html path')
    .option('--timeout <ms>', 'Request timeout in milliseconds', parsePositiveInteger, DEFAULT_TIMEOUT_MS)
    .option(
      '--max-concurrency <n>',
      'Maximum concurrent llm_url fetches',
      parsePositiveInteger,
      DEFAULT_MAX_CONCURRENCY,
    )
    .configureOutput({
      writeOut: options.writeOut,
      writeErr: options.writeErr,
    })
    .exitOverride()
    .action(options.runValidation)

  // `.command()` snapshots the parent's configureOutput/exitOverride at call
  // time (Commander's copyInheritedSettings), so this must come after the
  // chain above configured them on `program`.
  program
    .command('scan')
    .description('Scan a site via the Agent View scanner service and print the scan result.')
    .argument('<url>', 'Site URL to scan, for example https://example.com')
    .option('--json', 'Print the raw scanner status as JSON')
    .option('--html <path>', 'Write a minimal HTML report to the provided .html path')
    .option('--api-key <key>', 'Reserved for future scanner authentication (currently has no effect)')
    .option('--timeout <ms>', 'Scan request timeout in milliseconds', parsePositiveInteger, DEFAULT_TIMEOUT_MS)
    .action(options.runScan)

  return program
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
    await writeFile(path, formatScanHtmlReport(target, outcome), 'utf8')
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Failed to write HTML report: ${message}`)
  }
}

// Minimal placeholder report — replaced by the branded scan report built in
// T3.1_scan-html-report; intentionally unstyled, just a functional flag.
function formatScanHtmlReport(target: string, outcome: ScanOutcome): string {
  const result = outcome.status.result
  const scoreLine = result
    ? `<p>Score: ${escapeHtml(result.score)} — Verdict: ${escapeHtml(result.verdict)}</p>`
    : `<p>Status: ${escapeHtml(outcome.status.status)}</p>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Scan report — ${escapeHtml(target)}</title>
</head>
<body>
<h1>Scan report</h1>
<p>URL: ${escapeHtml(target)}</p>
${scoreLine}
<p><a href="${escapeHtml(outcome.auditLinks.html)}">Full audit report</a></p>
</body>
</html>
`
}

function escapeHtml(value: string | number): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
