# Contributing

Thanks for helping improve `index-ai-validator`.

This project is an experimental CLI validator for the `index-ai` Level 1 and Level 2a specification. Contributions should stay practical, testable, and honest about what the validator currently supports.

## Before you start

- Open an issue for larger changes before investing significant time.
- Keep pull requests focused on one concern.
- Do not include real secrets, private URLs, credentials, internal IPs, or customer data in issues, tests, fixtures, logs, or documentation.
- Do not change validator behavior unless the pull request clearly explains the intended behavior change.
- Do not include generated reports, build output, coverage output, or local cache files.

## Local setup

Use Node.js 20 and pnpm.

```bash
pnpm install
pnpm check
pnpm build
```

For validator changes, also run:

```bash
pnpm --filter @index-ai/validator test
pnpm --filter @index-ai/validator test:coverage
pnpm --filter @index-ai/validator check
pnpm --filter @index-ai/validator build
```

For documentation changes, also run:

```bash
pnpm --filter docs build
```

## Pull request checklist

Before opening a pull request, confirm:

- Tests pass.
- Docs build if docs changed.
- Validator behavior is unchanged unless intended.
- No generated reports are committed.
- No publish, tag, or version bump is included unless intended.
- No real secrets or private data are included.

## Release policy

Do not publish from a pull request.

The npm release workflow is manual. A maintainer must intentionally bump the package version and run the release workflow.

## Security reports

Do not open public issues for vulnerabilities, leaked secrets, or private data exposure. Use GitHub's private vulnerability reporting or repository security advisory flow when available.
