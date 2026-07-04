---
title: Job T2.0 — Reviewer — Scan orchestrator
description: Verify conformance of the tester+coder output for scanUrl before the CTO commits and closes the T2.0 gate.
type: job
status: current
job_ref: T2.0_scan-orchestrator
last_update: 2026-07-03
---

# JOB T2.0_scan-orchestrator — rôle: reviewer

Sprint: T2. JobName: `scan-upgrade`. Branche : `job/T2.0-scan-orchestrator`.
Dépend de : `T2.0_scan-orchestrator_coder` VERIFIED.

## Objectif

Vérifier la conformité avant que le CTO ne commit et ne clôture le gate.

## Skills à invoquer explicitement

`shokunin-review` (chasse `any`, duplication, sur-ingénierie — en
particulier : pas de redéclaration des types/erreurs de T1.1, pas de
try/catch qui avale les erreurs transport), `code-review` (bugs de
correction).

## Checklist bloquante

- [ ] `packages/validator/src/scan.test.ts` non modifié par le Coder (diff
      vérifié contre le commit du job tester).
- [ ] `@filemeta` présent/à jour sur `scan.ts` (règle d'or : un `.ts` livré
      sans `@filemeta` = job incomplet).
- [ ] Aucun `any`.
- [ ] `submitScan` déjà terminal (`done`/`failed`) → `pollScan` **jamais
      appelé** (vérifier le test correspondant et l'implémentation).
- [ ] État `done` → `ScanOutcome.status` **strictement identique** à ce
      qu'a renvoyé `submitScan`/`pollScan` (`meta.links.audit` avec
      `src=cli-json` intact, aucune mutation).
- [ ] `ScanOutcome.auditLinks.html`/`.terminal` dérivés via
      `rewriteAttributionSrc` (T1.2), jamais construits à la main.
- [ ] État `failed` → `ScanFailedError` levée (jamais un `ScanOutcome` qui
      prétendrait un succès), `code` porte le `failureReason` réel.
- [ ] `ScanFailedError` : message dev-friendly (cite le code, explique,
      suggère une action) — exigence produit permanente 2026-07-03, même
      niveau que `InvalidTargetUrlError`/`InvalidAuditUrlError`.
- [ ] Erreurs typées transport (`ScanRequestError`, `ScanTimeoutError`,
      etc.) traversent `scanUrl` sans être interceptées/remplacées — aucun
      `try/catch` qui les avale.
- [ ] `options.onProgress` transmis tel quel à `pollScan`, sans wrapper.
- [ ] `ScanOptions`/types importés depuis `client/scanner-client` (ex.
      `ScanProgressStep`), jamais redéclarés.
- [ ] Aucune dépendance ajoutée hors `LIBS_REGISTRY.md`.
- [ ] Aucun fichier hors scope touché (`client/scanner-client.ts`,
      `utils/attribution.ts`, `schemas.ts`, `cli.ts`, `utils/html-report.ts`,
      `validator.ts` intacts ; `types.ts` modifié uniquement pour ajouter
      `ScanOptions`, types existants de `validate` inchangés).
- [ ] Tous les 8 cas de test du job tester sont couverts et VERTS.

## Rapport à produire

`.shokunin/jobs/scan-upgrade/T2.0_scan-orchestrator_reviewer_report.md`

## Handoff

Une fois VERIFIED → le CTO commit, met à jour
`.shokunin/dashboard/project-dashboard.json` (`tasks[T2.0]` →
`status: done`, `evidenceStatus: verified`) et débloque
`T2.1_cli-scan-subcommand`.
