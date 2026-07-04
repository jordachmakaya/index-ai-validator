# Codebase Map — Directory of Key Components & HTML Design

This document serves as a guide for incoming developers or CTOs to quickly locate where the HTML report formatting, CLI commands, validation schemas, and test suites live.

## 🎨 HTML Report & Design Tokens
If you need to iterate on the HTML report design, layout, or color tokens, go to:

* **HTML Report Generator**: [html-report.ts](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/packages/validator/src/utils/html-report.ts)
  * This module exports `formatHtmlReport(result: ValidationResult): string`.
  * The top of this file contains the `:root` CSS variables (dark canvas, card surfaces, hairline borders, and status colors) and the embedded stylesheet.
  * *Important*: To prevent cross-site scripting (XSS), all dynamic data injected into the HTML templates must be wrapped in `escapeHtml()`.
* **Design Guidelines**:
  * Brand primitive tokens are documented in [BRANDING.md](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/BRANDING.md).
  * The UX layout structure and responsiveness guidelines are documented in [DESIGN.md](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/DESIGN.md).

## 🧪 HTML Report Test Suite
* **Unit Tests**: [html-report.test.ts](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/packages/validator/src/utils/html-report.test.ts)
  * Verifies visual tokens (CSS variables), Google Font configurations, and negative tracking (letter-spacing) on headings.
  * Verifies that semantic data and structure are preserved to prevent regressions.

## 🛠️ CLI Subcommands & Core Logic
* **CLI Entrypoint**: [cli.ts](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/packages/validator/src/cli.ts)
  * Defines the CLI commands and options using commander.
  * Handles printing outputs to `stdout`/`stderr` (JSON/Human outputs) and writing the HTML report via `--html`.
* **CLI Test Suite**: [cli.test.ts](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/packages/validator/src/cli.test.ts)
  * End-to-end tests for all CLI subcommands (`validate` and `scan`).
* **Scan Orchestrator**: [scan.ts](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/packages/validator/src/scan.ts)
  * Coordinates the async submit-and-poll sequence with the API scanner client.
* **API Scanner Client**: [scanner-client.ts](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/packages/validator/src/client/scanner-client.ts)
  * Fetches the manifest, parses the response, and handles network level retries.

## 🗂️ Validation Schemas & Types
* **AJV Schemas**: [schemas.ts](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/packages/validator/src/schemas.ts)
  * Validates JSON structures for `index-ai.json` manifests and `agent-index.json`.
* **TypeScript Types**: [types.ts](file:///c:/Meteosure_shared/ma-spec/index-ai-validator/packages/validator/src/types.ts)
  * Core interfaces for `ValidationResult`, `ValidationCheck`, `ValidationMetrics`, etc.

## 📐 Shokunin Metadata Requirements
* Every code file must maintain a clean `@filemeta` header block at the top detailing its exports, imports, inputs, outputs, and dependencies.
* Metadata skills (`shokunin-filemeta` and `shokunin-docmeta`) must always be used by subagents when modifying or creating files and documentation.
