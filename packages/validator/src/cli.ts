import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { Command, CommanderError, InvalidArgumentError } from 'commander'

import {
  CLI_NAME,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
} from './constants'
import type { ValidationResult, ValidatorOptions } from './types'
import { formatHumanResult } from './utils/format'
import { validateIndexAi } from './validator'

type CliOptions = {
  readonly json?: boolean
  readonly verbose?: boolean
  readonly strict?: boolean
  readonly strictSecurity?: boolean
  readonly failOnWarn?: boolean
  readonly allowPrivateHosts?: boolean
  readonly exitCode?: boolean
  readonly timeout: number
  readonly maxConcurrency: number
}

export type CliValidationRunner = (options: ValidatorOptions) => Promise<ValidationResult>

export type CliRunDependencies = {
  readonly validate?: CliValidationRunner
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
  const program = createProgram({
    writeOut: (value) => {
      stdout += value
    },
    writeErr: (value) => {
      stderr += value
    },
    runValidation: async (target, options) => {
      const validatorOptions = buildValidatorOptions(target, options)
      const result = await validate(validatorOptions)

      stdout += options.json
        ? `${JSON.stringify(result, null, 2)}\n`
        : `${formatHumanResult(result, { verbose: validatorOptions.verbose })}\n`

      exitCode = result.passed || options.exitCode === false ? 0 : 1
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
}): Command {
  const program = new Command()

  program
    .name(CLI_NAME)
    .description('Validate index-ai Level 1 and Level 2a agent-facing content layers.')
    .argument('<url>', 'Site URL to validate, for example https://example.com')
    .option('--json', 'Print stable JSON output')
    .option('--verbose', 'Print all checks, including passed checks')
    .option('--strict', 'Treat should-level warnings as a failed validation result')
    .option('--strict-security', 'Fail on private infra patterns such as IPs or internal hostnames')
    .option('--fail-on-warn', 'Treat any warning as a failed validation result')
    .option('--allow-private-hosts', 'Allow private/internal hosts in target and llm_url fetches')
    .option('--no-exit-code', 'Return exit code 0 for validation failures')
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
