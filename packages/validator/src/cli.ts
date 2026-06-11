import { Command, InvalidArgumentError } from 'commander'
import {
  CLI_NAME,
  DEFAULT_MAX_CONCURRENCY,
  DEFAULT_TIMEOUT_MS,
  PACKAGE_NAME,
} from './constants'
import type { ValidatorOptions } from './types'

type CliOptions = {
  json?: boolean
  verbose?: boolean
  strict?: boolean
  strictSecurity?: boolean
  failOnWarn?: boolean
  allowPrivateHosts?: boolean
  exitCode?: boolean
  timeout: number
  maxConcurrency: number
}

const program = new Command()

program
  .name(CLI_NAME)
  .description('Validate index-ai Level 1 and Level 2a agent-facing content layers.')
  .argument('<url>', 'Site URL to validate, for example https://example.com')
  .option('--json', 'Print stable JSON output')
  .option('--verbose', 'Print all checks, including passed checks')
  .option('--strict', 'Require strict Level 1 and Level 2a conformance checks')
  .option('--strict-security', 'Fail on private infra patterns such as IPs or internal hostnames')
  .option('--fail-on-warn', 'Exit with code 1 when warnings are present')
  .option('--allow-private-hosts', 'Allow private/internal hosts in target and llm_url fetches')
  .option('--no-exit-code', 'Never exit with code 1')
  .option('--timeout <ms>', 'Request timeout in milliseconds', parsePositiveInteger, DEFAULT_TIMEOUT_MS)
  .option(
    '--max-concurrency <n>',
    'Maximum concurrent llm_url fetches',
    parsePositiveInteger,
    DEFAULT_MAX_CONCURRENCY,
  )
  .action((url: string, options: CliOptions) => {
    const parsedOptions = buildValidatorOptions(url, options)

    if (options.json) {
      console.log(JSON.stringify(createShellOutput(parsedOptions), null, 2))
      return
    }

    console.log(`${PACKAGE_NAME} CLI shell`)
    console.log(`Target: ${parsedOptions.target}`)
    console.log('Validation is not implemented in Sprint 1. Sprint 3 adds the validator orchestrator.')
  })

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error
    ? error.message
    : `Unexpected CLI error: ${String(error)}`

  console.error(message)
  process.exitCode = 2
})

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

function createShellOutput(options: ValidatorOptions): {
  status: 'not_implemented'
  message: string
  options: ValidatorOptions
} {
  return {
    status: 'not_implemented',
    message: 'Validation is not implemented in Sprint 1. Sprint 3 adds the validator orchestrator.',
    options,
  }
}
