---
title: Job T2.1 — Reviewer — CLI scan subcommand
description: Verify conformance of the tester+coder output for the `scan` subcommand before the CTO commits and closes the T2.1 gate.
type: job
status: current
job_ref: T2.1_cli-scan-subcommand
last_update: 2026-07-03
---

# JOB T2.1_cli-scan-subcommand — rôle: reviewer

Sprint: T2. JobName: `scan-upgrade`. Branche : `job/T2.1-cli-scan-subcommand`.
Dépend de : `T2.1_cli-scan-subcommand_coder` VERIFIED.

## Objectif

Vérifier la conformité avant que le CTO ne commit et ne clôture le gate.

## Skills à invoquer explicitement

`shokunin-review` (chasse `any`, duplication, sur-ingénierie — en
particulier : pas de nouveau système de rendu HTML complexe alors que T3.1
n'existe pas encore, pas de logique d'erreur dupliquée avec le mécanisme
existant de `runCli`), `code-review` (bugs de correction).

## Checklist bloquante

- [ ] `packages/validator/src/cli.test.ts` non modifié par le Coder au-delà
      de ce que le job tester a déjà commité (diff vérifié).
- [ ] Tests `validate` existants toujours VERTS (aucune régression).
- [ ] **Aucun `@ts-expect-error`, `@ts-ignore`, `eslint-disable`, `any`/`as
      any` dans `cli.ts`** (règle produit permanente 2026-07-03 — grep
      explicite sur le fichier, pas une lecture superficielle).
- [ ] `scan --json` → stdout = `ScanStatus` brut intégral (`JSON.stringify(outcome.status,
      null, 2)`), jamais enrichi, zéro texte promo mêlé aux données.
- [ ] `scan` sans `--json` → résumé humain sur stdout, pas de JSON brut.
- [ ] Message stderr (kleur) toujours présent après un `done`, cite
      `outcome.auditLinks.terminal` (jamais `auditLinks.html`, jamais une
      URL reconstruite à la main) — **jamais mêlé à stdout**.
- [ ] Progression (`onProgress`) écrite uniquement sur stderr, jamais
      stdout.
- [ ] `--html <path>` : écrit un HTML minimal (titre, url, score/verdict,
      `auditLinks.html`) directement dans `cli.ts` — **aucune extension de
      `utils/html-report.ts`** (hors scope, réservé à T3.1). Chemin
      invalide → erreur avant tout appel à `scan`.
- [ ] Échec (`ScanFailedError`/erreurs transport T1.1) → aucun `try/catch`
      local qui les intercepte dans l'action `scan` ; elles remontent au
      mécanisme d'erreur déjà existant de `runCli`. Aucun fichier HTML
      écrit sur échec.
- [ ] `--api-key` accepté sans effet observable.
- [ ] `--timeout` transmis à `ScanOptions.timeoutMs` via le même
      `parsePositiveInteger` que `validate`.
- [ ] `ScanOptions`/`ScanOutcome`/`ScanFailedError` importés, jamais
      redéclarés.
- [ ] Aucune dépendance ajoutée hors `LIBS_REGISTRY.md` (`kleur` déjà
      présent, première utilisation réelle ici).
- [ ] Aucun fichier hors scope touché (`scan.ts`, `types.ts`,
      `client/scanner-client.ts`, `utils/attribution.ts`,
      `utils/html-report.ts`, `utils/format.ts` intacts).
- [ ] Les 10 cas de test du job tester sont couverts et VERTS.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T2.1_cli-scan-subcommand_reviewer_report.md`

## Handoff

Une fois VERIFIED → le CTO commit, met à jour
`.shokunin/dashboard/project-dashboard.json` (`tasks[T2.1]` →
`status: done`, `evidenceStatus: verified`) — **clôture le Sprint T2**
(T2.0 + T2.1 tous deux VERIFIED). Débloque `T5.0_resilience-hardening`
(sprint T5) ; `T3.0_html-brand-tokens`/`T3.1_scan-html-report` (sprint T3)
restent indépendants, non bloqués par T2.1.
